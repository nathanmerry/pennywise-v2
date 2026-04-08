import { Router } from "express";
import { z } from "zod/v4";
import { prisma } from "../lib/prisma.js";
import { applyRuleToExistingTransactions } from "../services/rules.js";

const router = Router();

const ruleInclude = {
  categories: {
    include: { category: true },
  },
} as const;

// GET /api/rules
router.get("/", async (_req, res) => {
  const rules = await prisma.recurringRule.findMany({
    orderBy: { createdAt: "desc" },
    include: ruleInclude,
  });
  res.json(rules);
});

// POST /api/rules
const createSchema = z.object({
  matchType: z.enum(["merchant", "description"]),
  matchValue: z.string().min(1),
  categoryIds: z.array(z.string()).optional(),
  setIgnored: z.boolean().nullable().optional(),
  applyToExisting: z.boolean().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { applyToExisting, categoryIds, ...data } = parsed.data;

  const rule = await prisma.recurringRule.create({
    data: {
      ...data,
      categories: categoryIds && categoryIds.length > 0
        ? { create: categoryIds.map((id) => ({ categoryId: id })) }
        : undefined,
    },
    include: ruleInclude,
  });

  let applied = 0;
  if (applyToExisting) {
    applied = await applyRuleToExistingTransactions(rule.id);
  }

  res.status(201).json({ rule, applied });
});

// PATCH /api/rules/:id
const updateSchema = z.object({
  matchType: z.enum(["merchant", "description"]).optional(),
  matchValue: z.string().min(1).optional(),
  categoryIds: z.array(z.string()).nullable().optional(),
  setIgnored: z.boolean().nullable().optional(),
  active: z.boolean().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { categoryIds, ...scalarData } = parsed.data;

  // Update scalar fields
  const rule = await prisma.recurringRule.update({
    where: { id: req.params.id },
    data: scalarData,
  });

  // Update categories if provided
  if (categoryIds !== undefined) {
    // Delete all existing
    await prisma.recurringRuleCategory.deleteMany({
      where: { ruleId: rule.id },
    });

    // Insert new
    if (categoryIds && categoryIds.length > 0) {
      await prisma.recurringRuleCategory.createMany({
        data: categoryIds.map((id) => ({ ruleId: rule.id, categoryId: id })),
        skipDuplicates: true,
      });
    }
  }

  // Return with categories
  const updated = await prisma.recurringRule.findUniqueOrThrow({
    where: { id: rule.id },
    include: ruleInclude,
  });

  res.json(updated);
});

// DELETE /api/rules/:id
router.delete("/:id", async (req, res) => {
  await prisma.recurringRule.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// POST /api/rules/:id/apply — apply rule to existing transactions
router.post("/:id/apply", async (req, res) => {
  const applied = await applyRuleToExistingTransactions(req.params.id);
  res.json({ applied });
});

export default router;
