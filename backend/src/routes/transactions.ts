import { Router } from "express";
import { z } from "zod/v4";
import { prisma } from "../lib/prisma.js";

const router = Router();

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
    where.categoryId = categoryId === "uncategorised" ? null : categoryId;
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
      include: {
        category: true,
        account: {
          include: { connection: { select: { institutionName: true } } },
        },
      },
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

// PATCH /api/transactions/:id — update note, category, ignore
const updateSchema = z.object({
  note: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  isIgnored: z.boolean().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const data: Record<string, unknown> = {};
  const body = parsed.data;

  if (body.note !== undefined) {
    data.note = body.note;
  }

  if (body.categoryId !== undefined) {
    data.categoryId = body.categoryId;
    data.categorySource = body.categoryId === null ? null : "manual";
  }

  if (body.isIgnored !== undefined) {
    data.isIgnored = body.isIgnored;
    data.ignoreSource = "manual";
  }

  const transaction = await prisma.transaction.update({
    where: { id: req.params.id },
    data,
    include: {
      category: true,
      account: {
        include: { connection: { select: { institutionName: true } } },
      },
    },
  });

  res.json(transaction);
});

export default router;
