import { Router } from "express";
import { z } from "zod/v4";
import { prisma } from "../lib/prisma.js";

const router = Router();

const categoryInclude = {
  parent: true,
  children: { orderBy: { name: "asc" as const } },
  _count: { select: { transactionCategories: true } },
};

// GET /api/categories
router.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: categoryInclude,
  });
  res.json(categories);
});

// POST /api/categories
const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  // Prevent self-parenting and circular references
  if (parsed.data.parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parsed.data.parentId } });
    if (!parent) {
      res.status(400).json({ error: "Parent category not found" });
      return;
    }
  }

  const category = await prisma.category.create({
    data: parsed.data,
    include: categoryInclude,
  });
  res.status(201).json(category);
});

// PATCH /api/categories/:id
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  // Prevent self-parenting
  if (parsed.data.parentId === req.params.id) {
    res.status(400).json({ error: "A category cannot be its own parent" });
    return;
  }

  // Prevent circular reference: walk up from proposed parent to make sure we don't hit this id
  if (parsed.data.parentId) {
    const allCategories = await prisma.category.findMany({ select: { id: true, parentId: true } });
    const catMap = new Map(allCategories.map((c) => [c.id, c.parentId]));
    let current: string | null = parsed.data.parentId;
    while (current) {
      if (current === req.params.id) {
        res.status(400).json({ error: "Circular parent reference detected" });
        return;
      }
      current = catMap.get(current) ?? null;
    }
  }

  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: categoryInclude,
  });
  res.json(category);
});

// DELETE /api/categories/:id
router.delete("/:id", async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
