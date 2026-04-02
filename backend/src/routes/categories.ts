import { Router } from "express";
import { z } from "zod/v4";
import { prisma } from "../lib/prisma.js";

const router = Router();

// GET /api/categories
router.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { transactions: true } } },
  });
  res.json(categories);
});

// POST /api/categories
const createSchema = z.object({
  name: z.string().min(1),
  color: z.string().nullable().optional(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const category = await prisma.category.create({
    data: parsed.data,
  });
  res.status(201).json(category);
});

// PATCH /api/categories/:id
router.patch("/:id", async (req, res) => {
  const parsed = createSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(category);
});

// DELETE /api/categories/:id
router.delete("/:id", async (req, res) => {
  await prisma.category.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
