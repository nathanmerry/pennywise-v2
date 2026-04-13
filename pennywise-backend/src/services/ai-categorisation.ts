import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { expandCategoryIds, setTransactionCategories } from "./rules.js";
import { subMonths } from "date-fns";

// ============================================================================
// TYPES
// ============================================================================

export interface AiCategorisationOptions {
  limit?: number;
  includeIgnored?: boolean;
  dryRun?: boolean;
  minConfidence?: number;
  transactionIds?: string[];
}

interface CategoryTreeItem {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
}

interface TransactionPayload {
  transactionId: string;
  description: string;
  merchantName: string | null;
  normalizedMerchant: string | null;
  amount: number;
  currency: string;
  transactionDate: string;
}

interface AiDecision {
  transactionId: string;
  decision: "assign_existing" | "create_category" | "skip";
  directCategoryIds: string[];
  proposedCategory?: {
    name: string;
    parentCategoryId: string | null;
  };
  confidence: number;
  reason: string;
}

interface AiResponse {
  results: AiDecision[];
}

interface BackfillResult {
  runId: string;
  transactionsConsidered: number;
  transactionsCategorised: number;
  categoriesCreated: number;
  transactionsSkipped: number;
  dryRun: boolean;
  errors: string[];
}

// ============================================================================
// CATEGORY TREE
// ============================================================================

export async function getCategoryTree(): Promise<CategoryTreeItem[]> {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });

  const catMap = new Map(categories.map((c) => [c.id, c]));

  function buildPath(id: string): string {
    const parts: string[] = [];
    let current = catMap.get(id);
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? catMap.get(current.parentId) : undefined;
    }
    return parts.join(" > ");
  }

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    path: buildPath(c.id),
  }));
}

// ============================================================================
// UNCATEGORISED TRANSACTIONS QUERY
// ============================================================================

export async function getUncategorisedTransactions(options: {
  limit?: number;
  includeIgnored?: boolean;
  transactionIds?: string[];
}) {
  const { limit = 100, includeIgnored = false, transactionIds } = options;

  // Build where clause dynamically
  const baseWhere = {
    categories: { none: {} },
    categoriesLockedByUser: false,
    transactionDate: { gte: subMonths(new Date(), 4) },
    ...(includeIgnored ? {} : { isIgnored: false }),
    ...(transactionIds && transactionIds.length > 0 ? { id: { in: transactionIds } } : {}),
  };

  return prisma.transaction.findMany({
    where: baseWhere,
    // take: limit,
    orderBy: { transactionDate: "desc" },
    select: {
      id: true,
      description: true,
      merchantName: true,
      normalizedMerchant: true,
      amount: true,
      currency: true,
      transactionDate: true,
    },
  });
}

// ============================================================================
// AI PAYLOAD BUILDING
// ============================================================================

function buildTransactionPayloads(
  transactions: Awaited<ReturnType<typeof getUncategorisedTransactions>>
): TransactionPayload[] {
  return transactions.map((tx) => ({
    transactionId: tx.id,
    description: tx.description,
    merchantName: tx.merchantName,
    normalizedMerchant: tx.normalizedMerchant,
    amount: Number(tx.amount),
    currency: tx.currency,
    transactionDate: tx.transactionDate.toISOString().split("T")[0],
  }));
}

function buildSystemPrompt(categoryTree: CategoryTreeItem[]): string {
  const categoryList = categoryTree
    .map((c) => `- ${c.id}: "${c.name}"${c.parentId ? ` (parent: ${c.parentId})` : ""} [${c.path}]`)
    .join("\n");

  return `You are a financial transaction categorisation assistant. Your job is to assign categories to bank transactions.

## Category Tree
The following categories exist in the system. Each has an ID, name, optional parent, and full path:

${categoryList}

## Rules

1. **Choose existing categories whenever possible.** Only propose a new category if no existing category is a reasonable fit.

2. **Return only direct categories.** The application will automatically expand to parent categories. For example, if you assign "Coffee", the app will also assign "Eating Out" if that's the parent.

3. **Return category IDs, not names** when assigning existing categories.

4. **New categories must be reusable.** Good: "Coffee", "Train", "Subscriptions", "Home Supplies". Bad: "Pret", "Uber Eats Tuesday", "Random Amazon Stuff", "LON 839201 CARD PAYMENT".

5. **Do not create merchant-specific categories.** Categories should describe the type of spending, not the specific merchant.

6. **Maximum 3 direct categories per transaction.** Most transactions need only 1.

7. **Skip when uncertain.** If you cannot confidently categorise a transaction, return decision "skip". Wrong categorisation is worse than no categorisation.

8. **Confidence is required.** Provide a confidence score between 0 and 1 for each decision.

## Output Format

Return JSON with this exact structure:
{
  "results": [
    {
      "transactionId": "txn_123",
      "decision": "assign_existing",
      "directCategoryIds": ["cat_coffee"],
      "confidence": 0.94,
      "reason": "Coffee purchase from cafe"
    },
    {
      "transactionId": "txn_124",
      "decision": "create_category",
      "directCategoryIds": [],
      "proposedCategory": {
        "name": "Home Supplies",
        "parentCategoryId": null
      },
      "confidence": 0.86,
      "reason": "Recurring household goods purchase"
    },
    {
      "transactionId": "txn_125",
      "decision": "skip",
      "directCategoryIds": [],
      "confidence": 0.41,
      "reason": "Too ambiguous from available data"
    }
  ]
}

Decision types:
- "assign_existing": Use existing category IDs in directCategoryIds
- "create_category": Propose a new category in proposedCategory (directCategoryIds should be empty)
- "skip": Cannot confidently categorise (directCategoryIds should be empty)`;
}

function buildUserPrompt(transactions: TransactionPayload[]): string {
  const txList = transactions
    .map(
      (tx) =>
        `- ID: ${tx.transactionId}
  Description: ${tx.description}
  Merchant: ${tx.merchantName || "N/A"}
  Normalized Merchant: ${tx.normalizedMerchant || "N/A"}
  Amount: ${tx.amount} ${tx.currency}
  Date: ${tx.transactionDate}`
    )
    .join("\n\n");

  return `Categorise the following transactions:

${txList}

Return your categorisation decisions as JSON.`;
}

// ============================================================================
// OPENAI INTEGRATION
// ============================================================================

async function callCategorisationModel(
  systemPrompt: string,
  userPrompt: string,
  model: string = "gpt-4o"
): Promise<AiResponse> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in OpenAI response");
  }

  try {
    return JSON.parse(content) as AiResponse;
  } catch {
    throw new Error(`Failed to parse OpenAI response as JSON: ${content}`);
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateAiDecision(
  decision: AiDecision,
  existingCategoryIds: Set<string>
): { valid: boolean; error?: string } {
  if (!decision.transactionId) {
    return { valid: false, error: "Missing transactionId" };
  }

  if (!["assign_existing", "create_category", "skip"].includes(decision.decision)) {
    return { valid: false, error: `Invalid decision type: ${decision.decision}` };
  }

  if (typeof decision.confidence !== "number" || decision.confidence < 0 || decision.confidence > 1) {
    return { valid: false, error: `Invalid confidence: ${decision.confidence}` };
  }

  if (decision.decision === "assign_existing") {
    if (!Array.isArray(decision.directCategoryIds) || decision.directCategoryIds.length === 0) {
      return { valid: false, error: "assign_existing requires directCategoryIds" };
    }
    if (decision.directCategoryIds.length > 3) {
      return { valid: false, error: "Maximum 3 direct categories allowed" };
    }
    for (const catId of decision.directCategoryIds) {
      if (!existingCategoryIds.has(catId)) {
        return { valid: false, error: `Category ID not found: ${catId}` };
      }
    }
  }

  if (decision.decision === "create_category") {
    if (!decision.proposedCategory?.name) {
      return { valid: false, error: "create_category requires proposedCategory.name" };
    }
    const name = decision.proposedCategory.name.trim();
    if (name.length === 0 || name.length > 40) {
      return { valid: false, error: "Category name must be 1-40 characters" };
    }
    if (decision.proposedCategory.parentCategoryId && !existingCategoryIds.has(decision.proposedCategory.parentCategoryId)) {
      return { valid: false, error: `Parent category ID not found: ${decision.proposedCategory.parentCategoryId}` };
    }
  }

  return { valid: true };
}

function normalizeForComparison(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

function looksLikeMerchantGarbage(name: string): boolean {
  const normalized = name.toLowerCase();
  const garbagePatterns = [
    /^[a-z]{2,4}\s*\d{4,}/i,
    /card\s*payment/i,
    /direct\s*debit/i,
    /\d{6,}/,
    /^[A-Z]{2,5}\s+[A-Z]{2,5}\s+\d+/,
    /ref[:.]?\s*\d+/i,
  ];
  return garbagePatterns.some((p) => p.test(normalized));
}

// ============================================================================
// CATEGORY CREATION
// ============================================================================

async function findOrCreateCategory(
  proposedName: string,
  parentCategoryId: string | null,
  existingCategories: CategoryTreeItem[]
): Promise<{ categoryId: string; created: boolean }> {
  const normalizedProposed = normalizeForComparison(proposedName);

  const existingMatch = existingCategories.find(
    (c) => normalizeForComparison(c.name) === normalizedProposed
  );

  if (existingMatch) {
    return { categoryId: existingMatch.id, created: false };
  }

  if (looksLikeMerchantGarbage(proposedName)) {
    throw new Error(`Proposed category looks like merchant garbage: ${proposedName}`);
  }

  const category = await prisma.category.create({
    data: {
      name: proposedName.trim(),
      parentId: parentCategoryId,
    },
  });

  return { categoryId: category.id, created: true };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function persistTransactionCategories(
  transactionId: string,
  directCategoryIds: string[]
): Promise<void> {
  const expanded = await expandCategoryIds(directCategoryIds, "ai");

  const expandedWithCorrectSource = expanded.map((e) => ({
    ...e,
    source: directCategoryIds.includes(e.categoryId) ? "ai" : "inherited",
  }));

  await setTransactionCategories(transactionId, expandedWithCorrectSource);
}

// ============================================================================
// MAIN BACKFILL FUNCTION
// ============================================================================

export async function runAiCategorisationBackfill(
  options: AiCategorisationOptions = {}
): Promise<BackfillResult> {
  const {
    limit = 100,
    includeIgnored = false,
    dryRun = false,
    minConfidence = 0.85,
    transactionIds,
  } = options;

  const model = "gpt-4o";
  const errors: string[] = [];

  const run = await prisma.aiCategorisationRun.create({
    data: {
      dryRun,
      model,
      minConfidence,
      includeIgnored,
    },
  });

  logger.info({ runId: run.id, options }, "Starting AI categorisation backfill");

  try {
    const categoryTree = await getCategoryTree();
    const existingCategoryIds = new Set(categoryTree.map((c) => c.id));

    const transactions = await getUncategorisedTransactions({
      limit,
      includeIgnored,
      transactionIds,
    });

    if (transactions.length === 0) {
      logger.info({ runId: run.id }, "No uncategorised transactions found");
      await prisma.aiCategorisationRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), transactionsConsidered: 0 },
      });
      return {
        runId: run.id,
        transactionsConsidered: 0,
        transactionsCategorised: 0,
        categoriesCreated: 0,
        transactionsSkipped: 0,
        dryRun,
        errors,
      };
    }

    const transactionPayloads = buildTransactionPayloads(transactions);
    const systemPrompt = buildSystemPrompt(categoryTree);
    const userPrompt = buildUserPrompt(transactionPayloads);

    logger.info(
      { runId: run.id, transactionCount: transactions.length },
      "Calling OpenAI for categorisation"
    );

    const aiResponse = await callCategorisationModel(systemPrompt, userPrompt, model);

    let transactionsCategorised = 0;
    let categoriesCreated = 0;
    let transactionsSkipped = 0;

    let currentCategoryTree = categoryTree;

    for (const decision of aiResponse.results) {
      const validation = validateAiDecision(decision, existingCategoryIds);

      if (!validation.valid) {
        logger.warn(
          { runId: run.id, transactionId: decision.transactionId, error: validation.error },
          "Invalid AI decision"
        );
        errors.push(`Transaction ${decision.transactionId}: ${validation.error}`);

        await prisma.aiCategorisationDecision.create({
          data: {
            runId: run.id,
            transactionId: decision.transactionId || "unknown",
            decision: "skip",
            confidence: 0,
            reason: `Validation failed: ${validation.error}`,
            directCategoryIds: [],
            applied: false,
          },
        });
        transactionsSkipped++;
        continue;
      }

      if (decision.confidence < minConfidence) {
        logger.info(
          { runId: run.id, transactionId: decision.transactionId, confidence: decision.confidence },
          "Skipping low confidence decision"
        );

        await prisma.aiCategorisationDecision.create({
          data: {
            runId: run.id,
            transactionId: decision.transactionId,
            decision: decision.decision,
            confidence: decision.confidence,
            reason: decision.reason || "Low confidence",
            directCategoryIds: decision.directCategoryIds || [],
            proposedCategoryName: decision.proposedCategory?.name,
            proposedParentId: decision.proposedCategory?.parentCategoryId,
            applied: false,
          },
        });
        transactionsSkipped++;
        continue;
      }

      if (decision.decision === "skip") {
        await prisma.aiCategorisationDecision.create({
          data: {
            runId: run.id,
            transactionId: decision.transactionId,
            decision: "skip",
            confidence: decision.confidence,
            reason: decision.reason || "AI chose to skip",
            directCategoryIds: [],
            applied: false,
          },
        });
        transactionsSkipped++;
        continue;
      }

      try {
        let finalCategoryIds: string[] = [];

        if (decision.decision === "assign_existing") {
          finalCategoryIds = decision.directCategoryIds;
        } else if (decision.decision === "create_category" && decision.proposedCategory) {
          const { categoryId, created } = await findOrCreateCategory(
            decision.proposedCategory.name,
            decision.proposedCategory.parentCategoryId,
            currentCategoryTree
          );

          if (created) {
            categoriesCreated++;
            existingCategoryIds.add(categoryId);
            currentCategoryTree = await getCategoryTree();
          }

          finalCategoryIds = [categoryId];
        }

        if (!dryRun && finalCategoryIds.length > 0) {
          await persistTransactionCategories(decision.transactionId, finalCategoryIds);
        }

        await prisma.aiCategorisationDecision.create({
          data: {
            runId: run.id,
            transactionId: decision.transactionId,
            decision: decision.decision,
            confidence: decision.confidence,
            reason: decision.reason,
            directCategoryIds: finalCategoryIds,
            proposedCategoryName: decision.proposedCategory?.name,
            proposedParentId: decision.proposedCategory?.parentCategoryId,
            applied: !dryRun,
          },
        });

        transactionsCategorised++;
        logger.info(
          {
            runId: run.id,
            transactionId: decision.transactionId,
            decision: decision.decision,
            categoryIds: finalCategoryIds,
            dryRun,
          },
          "Transaction categorised"
        );
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(
          { runId: run.id, transactionId: decision.transactionId, error: errorMessage },
          "Failed to process decision"
        );
        errors.push(`Transaction ${decision.transactionId}: ${errorMessage}`);

        await prisma.aiCategorisationDecision.create({
          data: {
            runId: run.id,
            transactionId: decision.transactionId,
            decision: decision.decision,
            confidence: decision.confidence,
            reason: `Error: ${errorMessage}`,
            directCategoryIds: [],
            applied: false,
          },
        });
        transactionsSkipped++;
      }
    }

    await prisma.aiCategorisationRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        transactionsConsidered: transactions.length,
        transactionsCategorised,
        categoriesCreated,
        transactionsSkipped,
      },
    });

    logger.info(
      {
        runId: run.id,
        transactionsConsidered: transactions.length,
        transactionsCategorised,
        categoriesCreated,
        transactionsSkipped,
        dryRun,
      },
      "AI categorisation backfill completed"
    );

    return {
      runId: run.id,
      transactionsConsidered: transactions.length,
      transactionsCategorised,
      categoriesCreated,
      transactionsSkipped,
      dryRun,
      errors,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ runId: run.id, error: errorMessage }, "AI categorisation backfill failed");

    await prisma.aiCategorisationRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        errorMessage,
      },
    });

    throw err;
  }
}

// ============================================================================
// SINGLE TRANSACTION CATEGORISATION
// ============================================================================

export async function categoriseSingleTransaction(
  transactionId: string,
  options: { dryRun?: boolean; minConfidence?: number } = {}
): Promise<BackfillResult> {
  return runAiCategorisationBackfill({
    transactionIds: [transactionId],
    limit: 1,
    ...options,
  });
}
