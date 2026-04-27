import { Router } from "express";
import { z } from "zod/v4";
import { prisma } from "../lib/prisma.js";
import { effectiveAmount } from "../lib/effective-amount.js";
import {
  runAiCategorisationBackfill,
  categoriseSingleTransaction,
  getCategoryTree,
  getUncategorisedTransactions,
} from "../services/ai-categorisation.js";
import { dedupPending } from "../services/dedup-pending.js";

const router = Router();

// ============================================================================
// AI CATEGORISATION BACKFILL
// ============================================================================

const backfillSchema = z.object({
  limit: z.number().int().min(1).max(500).optional().default(100),
  includeIgnored: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  minConfidence: z.number().min(0).max(1).optional().default(0.85),
});

// POST /api/admin/ai-categorisation/backfill
router.post("/ai-categorisation/backfill", async (req, res) => {
  const parsed = backfillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  try {
    const result = await runAiCategorisationBackfill(parsed.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// SINGLE TRANSACTION CATEGORISATION
// ============================================================================

const singleTxSchema = z.object({
  dryRun: z.boolean().optional().default(false),
  minConfidence: z.number().min(0).max(1).optional().default(0.85),
});

// POST /api/admin/ai-categorisation/transaction/:id
router.post("/ai-categorisation/transaction/:id", async (req, res) => {
  const parsed = singleTxSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  try {
    const result = await categoriseSingleTransaction(req.params.id, parsed.data);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// PREVIEW / DEBUG ENDPOINTS
// ============================================================================

// GET /api/admin/ai-categorisation/preview
// Preview which transactions would be categorised
router.get("/ai-categorisation/preview", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const includeIgnored = req.query.includeIgnored === "true";

  try {
    const transactions = await getUncategorisedTransactions({
      limit,
      includeIgnored,
    });

    const categoryTree = await getCategoryTree();

    res.json({
      transactionCount: transactions.length,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        description: tx.description,
        merchantName: tx.merchantName,
        normalizedMerchant: tx.normalizedMerchant,
        amount: effectiveAmount(tx),
        currency: tx.currency,
        transactionDate: tx.transactionDate.toISOString().split("T")[0],
      })),
      categoryCount: categoryTree.length,
      categories: categoryTree,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// RUN HISTORY
// ============================================================================

// GET /api/admin/ai-categorisation/runs
router.get("/ai-categorisation/runs", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

  try {
    const runs = await prisma.aiCategorisationRun.findMany({
      take: limit,
      orderBy: { startedAt: "desc" },
      include: {
        _count: { select: { decisions: true } },
      },
    });

    res.json(runs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// GET /api/admin/ai-categorisation/runs/:id
router.get("/ai-categorisation/runs/:id", async (req, res) => {
  try {
    const run = await prisma.aiCategorisationRun.findUnique({
      where: { id: req.params.id },
      include: {
        decisions: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    res.json(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// GET /api/admin/ai-categorisation/decisions/:transactionId
// Get all AI decisions for a specific transaction
router.get("/ai-categorisation/decisions/:transactionId", async (req, res) => {
  try {
    const decisions = await prisma.aiCategorisationDecision.findMany({
      where: { transactionId: req.params.transactionId },
      orderBy: { createdAt: "desc" },
      include: {
        run: {
          select: {
            id: true,
            startedAt: true,
            model: true,
            dryRun: true,
          },
        },
      },
    });

    res.json(decisions);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// PENDING/POSTED DUPLICATE CLEANUP
// ============================================================================

const dedupPendingSchema = z.object({
  dryRun: z.boolean().optional().default(false),
});

router.post("/dedup-pending", async (req, res) => {
  const parsed = dedupPendingSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  try {
    const result = await dedupPending(parsed.data.dryRun);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
