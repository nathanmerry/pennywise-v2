import { Router } from "express";
import { z } from "zod/v4";
import { prisma } from "../lib/prisma.js";
import { expandCategoryIds, setTransactionCategories } from "../services/rules.js";

const router = Router();

const transactionInclude = {
  categories: {
    include: { category: true },
  },
  account: {
    include: { connection: { select: { institutionName: true } } },
  },
} as const;

// GET /api/transactions — list with filters
router.get("/", async (req, res) => {
  const {
    accountId,
    categoryId,
    isIgnored,
    from,
    to,
    search,
    page = "1",
    limit = "50",
  } = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};

  if (accountId) where.accountId = accountId;
  if (categoryId) {
    if (categoryId === "uncategorised") {
      // Transactions with no category assignments
      where.categories = { none: {} };
    } else {
      // Transactions that have this category (includes parent-level filtering)
      where.categories = { some: { categoryId } };
    }
  }
  if (isIgnored !== undefined) {
    where.isIgnored = isIgnored === "true";
  }
  if (from || to) {
    where.transactionDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { merchantName: { contains: search, mode: "insensitive" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page || "1", 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit || "50", 10)));

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: { transactionDate: "desc" },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({
    data: transactions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// PATCH /api/transactions/:id — update note, categories, ignore
const updateSchema = z.object({
  note: z.string().nullable().optional(),
  categoryIds: z.array(z.string()).nullable().optional(),
  isIgnored: z.boolean().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const body = parsed.data;
  const txData: Record<string, unknown> = {};

  if (body.note !== undefined) {
    txData.note = body.note;
  }

  if (body.isIgnored !== undefined) {
    txData.isIgnored = body.isIgnored;
    txData.ignoreSource = "manual";
  }

  // Update categories via join table
  if (body.categoryIds !== undefined) {
    if (body.categoryIds === null || body.categoryIds.length === 0) {
      // Clear all categories
      await setTransactionCategories(req.params.id, []);
    } else {
      const expanded = await expandCategoryIds(body.categoryIds, "manual");
      await setTransactionCategories(req.params.id, expanded);
    }
    // Lock categories so rules don't overwrite
    txData.categoriesLockedByUser = true;
  }

  // Update scalar fields on the transaction
  if (Object.keys(txData).length > 0) {
    await prisma.transaction.update({
      where: { id: req.params.id },
      data: txData,
    });
  }

  // Return full transaction with categories
  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: req.params.id },
    include: transactionInclude,
  });

  res.json(transaction);
});

export default router;
