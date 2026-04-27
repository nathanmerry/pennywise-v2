import { Router } from "express";
import { z } from "zod/v4";
import { prisma } from "../lib/prisma.js";
import { getBudgetOverview, getEventsForMonth, getSpendingBreakdown, getCategoriesOverBudget, getMonthlyBudgetPace, getCategoryPressureDetail } from "../services/budget.js";
import { getSpendingHistoryAnalysis, getCategoryEvidenceBatch } from "../services/spending-history.js";
import { generateBudgetRecommendations, applyBudgetRecommendations } from "../services/budget-recommendations.js";
import { getCategoryDrilldown, getSpendingAnalysis } from "../services/spending-analysis.js";
import { getPayCycleFromBudgetMonth } from "../services/cycle.js";

const router = Router();

const analysisQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  compare: z.union([z.literal("true"), z.literal("false")]).optional(),
  preset: z
    .enum(["this_cycle", "last_cycle", "last_3_cycles", "last_6_cycles", "ytd", "custom"])
    .optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  includeIgnored: z.union([z.literal("true"), z.literal("false")]).optional(),
});

// ============================================================================
// BUDGET GROUPS
// ============================================================================

const budgetGroupInclude = {
  categoryMappings: { include: { category: true } },
} as const;

// GET /api/budget/groups
router.get("/groups", async (_req, res) => {
  const groups = await prisma.budgetGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: budgetGroupInclude,
  });
  res.json(groups);
});

// POST /api/budget/groups
const createGroupSchema = z.object({
  name: z.string().min(1),
  color: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  categoryIds: z.array(z.string()).optional(),
});

router.post("/groups", async (req, res) => {
  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { categoryIds, ...data } = parsed.data;

  const group = await prisma.budgetGroup.create({
    data: {
      ...data,
      categoryMappings: categoryIds
        ? { create: categoryIds.map((categoryId) => ({ categoryId })) }
        : undefined,
    },
    include: budgetGroupInclude,
  });

  res.status(201).json(group);
});

// PATCH /api/budget/groups/:id
const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  categoryIds: z.array(z.string()).optional(),
});

router.patch("/groups/:id", async (req, res) => {
  const parsed = updateGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { categoryIds, ...data } = parsed.data;

  // Update group and optionally replace category mappings
  if (categoryIds !== undefined) {
    await prisma.budgetGroupCategory.deleteMany({
      where: { budgetGroupId: req.params.id },
    });
    await prisma.budgetGroupCategory.createMany({
      data: categoryIds.map((categoryId) => ({
        budgetGroupId: req.params.id,
        categoryId,
      })),
    });
  }

  const group = await prisma.budgetGroup.update({
    where: { id: req.params.id },
    data,
    include: budgetGroupInclude,
  });

  res.json(group);
});

// DELETE /api/budget/groups/:id
router.delete("/groups/:id", async (req, res) => {
  await prisma.budgetGroup.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ============================================================================
// BUDGET MONTHS
// ============================================================================

const budgetMonthInclude = {
  fixedCommitments: { include: { category: true } },
  plannedSpends: { include: { budgetGroup: true, category: true } },
  categoryPlans: { include: { budgetGroup: true, category: true } },
  events: {
    include: {
      pots: {
        include: { category: true },
        orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
      },
    },
    orderBy: { startDate: "asc" as const },
  },
};

// GET /api/budget/months
router.get("/months", async (_req, res) => {
  const months = await prisma.budgetMonth.findMany({
    orderBy: { month: "desc" },
    include: budgetMonthInclude,
  });
  res.json(months);
});

// GET /api/budget/months/:month (e.g., 2026-04)
router.get("/months/:month", async (req, res) => {
  const month = await prisma.budgetMonth.findUnique({
    where: { month: req.params.month },
    include: budgetMonthInclude,
  });

  if (!month) {
    res.status(404).json({ error: "Budget month not found" });
    return;
  }

  res.json(month);
});

// POST /api/budget/months
const createMonthSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    expectedIncome: z.number().positive(),
    cycleStartDate: z.string().datetime(),
    cycleEndDate: z.string().datetime(),
    savingsTargetType: z.enum(["fixed", "percent"]).default("fixed"),
    savingsTargetValue: z.number().min(0),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (d) => new Date(d.cycleEndDate).getTime() >= new Date(d.cycleStartDate).getTime(),
    { message: "cycleEndDate must be on or after cycleStartDate" },
  );

router.post("/months", async (req, res) => {
  const parsed = createMonthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const cycleStartDate = new Date(parsed.data.cycleStartDate);
  const cycleEndDate = new Date(parsed.data.cycleEndDate);

  const month = await prisma.budgetMonth.upsert({
    where: { month: parsed.data.month },
    create: {
      month: parsed.data.month,
      expectedIncome: parsed.data.expectedIncome,
      cycleStartDate,
      cycleEndDate,
      savingsTargetType: parsed.data.savingsTargetType,
      savingsTargetValue: parsed.data.savingsTargetValue,
      notes: parsed.data.notes,
    },
    update: {
      expectedIncome: parsed.data.expectedIncome,
      cycleStartDate,
      cycleEndDate,
      savingsTargetType: parsed.data.savingsTargetType,
      savingsTargetValue: parsed.data.savingsTargetValue,
      notes: parsed.data.notes,
    },
    include: budgetMonthInclude,
  });

  res.status(200).json(month);
});

// PATCH /api/budget/months/:month
const updateMonthSchema = z
  .object({
    expectedIncome: z.number().positive().optional(),
    cycleStartDate: z.string().datetime().optional(),
    cycleEndDate: z.string().datetime().optional(),
    savingsTargetType: z.enum(["fixed", "percent"]).optional(),
    savingsTargetValue: z.number().min(0).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (d) =>
      d.cycleStartDate === undefined ||
      d.cycleEndDate === undefined ||
      new Date(d.cycleEndDate).getTime() >= new Date(d.cycleStartDate).getTime(),
    { message: "cycleEndDate must be on or after cycleStartDate" },
  );

router.patch("/months/:month", async (req, res) => {
  const parsed = updateMonthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.cycleStartDate) {
    data.cycleStartDate = new Date(parsed.data.cycleStartDate);
  }
  if (parsed.data.cycleEndDate) {
    data.cycleEndDate = new Date(parsed.data.cycleEndDate);
  }

  const month = await prisma.budgetMonth.update({
    where: { month: req.params.month },
    data,
    include: budgetMonthInclude,
  });

  res.json(month);
});

// DELETE /api/budget/months/:month
router.delete("/months/:month", async (req, res) => {
  await prisma.budgetMonth.delete({ where: { month: req.params.month } });
  res.json({ ok: true });
});

// ============================================================================
// FIXED COMMITMENTS
// ============================================================================

// POST /api/budget/months/:month/commitments
const createCommitmentSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  dueDate: z.string().datetime().nullable().optional(),
  categoryId: z.string().nullable().optional(),
});

router.post("/months/:month/commitments", async (req, res) => {
  const parsed = createCommitmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month: req.params.month },
  });

  if (!budgetMonth) {
    res.status(404).json({ error: "Budget month not found" });
    return;
  }

  const commitment = await prisma.budgetFixedCommitment.create({
    data: {
      budgetMonthId: budgetMonth.id,
      name: parsed.data.name,
      amount: parsed.data.amount,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      categoryId: parsed.data.categoryId,
    },
    include: { category: true },
  });

  res.status(201).json(commitment);
});

// PATCH /api/budget/commitments/:id
router.patch("/commitments/:id", async (req, res) => {
  const parsed = createCommitmentSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.dueDate) {
    data.dueDate = new Date(parsed.data.dueDate);
  }

  const commitment = await prisma.budgetFixedCommitment.update({
    where: { id: req.params.id },
    data,
    include: { category: true },
  });

  res.json(commitment);
});

// DELETE /api/budget/commitments/:id
router.delete("/commitments/:id", async (req, res) => {
  await prisma.budgetFixedCommitment.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ============================================================================
// PLANNED SPENDS
// ============================================================================

// POST /api/budget/months/:month/planned
const createPlannedSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  plannedDate: z.string().datetime().nullable().optional(),
  budgetGroupId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  isEssential: z.boolean().default(false),
});

router.post("/months/:month/planned", async (req, res) => {
  const parsed = createPlannedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month: req.params.month },
  });

  if (!budgetMonth) {
    res.status(404).json({ error: "Budget month not found" });
    return;
  }

  const planned = await prisma.budgetPlannedSpend.create({
    data: {
      budgetMonthId: budgetMonth.id,
      name: parsed.data.name,
      amount: parsed.data.amount,
      plannedDate: parsed.data.plannedDate ? new Date(parsed.data.plannedDate) : null,
      budgetGroupId: parsed.data.budgetGroupId,
      categoryId: parsed.data.categoryId,
      isEssential: parsed.data.isEssential,
    },
    include: { budgetGroup: true, category: true },
  });

  res.status(201).json(planned);
});

// PATCH /api/budget/planned/:id
router.patch("/planned/:id", async (req, res) => {
  const parsed = createPlannedSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.plannedDate) {
    data.plannedDate = new Date(parsed.data.plannedDate);
  }

  const planned = await prisma.budgetPlannedSpend.update({
    where: { id: req.params.id },
    data,
    include: { budgetGroup: true, category: true },
  });

  res.json(planned);
});

// DELETE /api/budget/planned/:id
router.delete("/planned/:id", async (req, res) => {
  await prisma.budgetPlannedSpend.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ============================================================================
// CATEGORY PLANS (BUDGETS)
// ============================================================================

// POST /api/budget/months/:month/plans
const createPlanSchema = z.object({
  budgetGroupId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  targetType: z.enum(["fixed", "percent"]).default("fixed"),
  targetValue: z.number().min(0),
});

router.post("/months/:month/plans", async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  if (!parsed.data.budgetGroupId && !parsed.data.categoryId) {
    res.status(400).json({ error: "Either budgetGroupId or categoryId is required" });
    return;
  }

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month: req.params.month },
  });

  if (!budgetMonth) {
    res.status(404).json({ error: "Budget month not found" });
    return;
  }

  const plan = await prisma.budgetCategoryPlan.create({
    data: {
      budgetMonthId: budgetMonth.id,
      budgetGroupId: parsed.data.budgetGroupId,
      categoryId: parsed.data.categoryId,
      targetType: parsed.data.targetType,
      targetValue: parsed.data.targetValue,
    },
    include: { budgetGroup: true, category: true },
  });

  res.status(201).json(plan);
});

// PATCH /api/budget/plans/:id
router.patch("/plans/:id", async (req, res) => {
  const parsed = createPlanSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const plan = await prisma.budgetCategoryPlan.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { budgetGroup: true, category: true },
  });

  res.json(plan);
});

// DELETE /api/budget/plans/:id
router.delete("/plans/:id", async (req, res) => {
  await prisma.budgetCategoryPlan.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ============================================================================
// EVENTS
// ============================================================================

const potInputSchema = z.object({
  name: z.string().min(1),
  amount: z.number().min(0),
  categoryId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

const createEventSchema = z
  .object({
    name: z.string().min(1),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    cap: z.number().min(0),
    fundingSource: z.enum(["flexible", "savings", "external"]).optional(),
    includeAllSpend: z.boolean().optional(),
    notes: z.string().nullable().optional(),
    pots: z.array(potInputSchema).optional(),
  })
  .refine(
    (d) => new Date(d.endDate).getTime() >= new Date(d.startDate).getTime(),
    { message: "endDate must be on or after startDate" },
  );

const updateEventSchema = z
  .object({
    name: z.string().min(1).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    cap: z.number().min(0).optional(),
    fundingSource: z.enum(["flexible", "savings", "external"]).optional(),
    includeAllSpend: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (d) =>
      d.startDate === undefined ||
      d.endDate === undefined ||
      new Date(d.endDate).getTime() >= new Date(d.startDate).getTime(),
    { message: "endDate must be on or after startDate" },
  );

const updatePotSchema = z.object({
  name: z.string().min(1).optional(),
  amount: z.number().min(0).optional(),
  categoryId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

// GET /api/budget/months/:month/events
router.get("/months/:month/events", async (req, res) => {
  const events = await getEventsForMonth(req.params.month);
  res.json(events);
});

// POST /api/budget/months/:month/events
router.post("/months/:month/events", async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const budgetMonth = await prisma.budgetMonth.findUnique({
    where: { month: req.params.month },
    select: { id: true },
  });
  if (!budgetMonth) {
    res.status(404).json({ error: "Budget month not found" });
    return;
  }

  const { pots, ...eventData } = parsed.data;
  const event = await prisma.budgetEvent.create({
    data: {
      budgetMonthId: budgetMonth.id,
      name: eventData.name,
      startDate: new Date(eventData.startDate),
      endDate: new Date(eventData.endDate),
      cap: eventData.cap,
      fundingSource: eventData.fundingSource ?? "flexible",
      includeAllSpend: eventData.includeAllSpend ?? true,
      notes: eventData.notes,
      pots: pots
        ? {
            create: pots.map((p, i) => ({
              name: p.name,
              amount: p.amount,
              categoryId: p.categoryId ?? null,
              sortOrder: p.sortOrder ?? i,
            })),
          }
        : undefined,
    },
    include: {
      pots: { include: { category: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  res.status(201).json(event);
});

// PATCH /api/budget/events/:id
router.patch("/events/:id", async (req, res) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.startDate) data.startDate = new Date(parsed.data.startDate);
  if (parsed.data.endDate) data.endDate = new Date(parsed.data.endDate);

  const event = await prisma.budgetEvent.update({
    where: { id: req.params.id },
    data,
    include: {
      pots: { include: { category: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  res.json(event);
});

// DELETE /api/budget/events/:id
router.delete("/events/:id", async (req, res) => {
  await prisma.budgetEvent.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// POST /api/budget/events/:id/pots
router.post("/events/:id/pots", async (req, res) => {
  const parsed = potInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const pot = await prisma.budgetEventPot.create({
    data: {
      eventId: req.params.id,
      name: parsed.data.name,
      amount: parsed.data.amount,
      categoryId: parsed.data.categoryId ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
    include: { category: true },
  });

  res.status(201).json(pot);
});

// PATCH /api/budget/event-pots/:id
router.patch("/event-pots/:id", async (req, res) => {
  const parsed = updatePotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const pot = await prisma.budgetEventPot.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { category: true },
  });

  res.json(pot);
});

// DELETE /api/budget/event-pots/:id
router.delete("/event-pots/:id", async (req, res) => {
  await prisma.budgetEventPot.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ============================================================================
// DASHBOARD ENDPOINTS
// ============================================================================

// GET /api/budget/overview/:month - Money Overview dashboard
router.get("/overview/:month", async (req, res) => {
  const overview = await getBudgetOverview(req.params.month);

  if (!overview) {
    res.status(404).json({ error: "Budget month not found. Create a budget for this month first." });
    return;
  }

  res.json(overview);
});

// GET /api/budget/spending/:month - Spending Breakdown dashboard
router.get("/spending/:month", async (req, res) => {
  const breakdown = await getSpendingBreakdown(req.params.month);
  res.json(breakdown);
});

// GET /api/budget/analysis - Range-based spending analysis workspace
router.get("/analysis", async (req, res) => {
  const parsed = analysisQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const analysis = await getSpendingAnalysis({
    start: parsed.data.start,
    end: parsed.data.end,
    compare: parsed.data.compare === "true",
    preset: parsed.data.preset,
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId,
    includeIgnored: parsed.data.includeIgnored === "true",
  });

  res.json(analysis);
});

// GET /api/budget/analysis/category/:categoryId - Range-based category drilldown
router.get("/analysis/category/:categoryId", async (req, res) => {
  const parsed = analysisQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const detail = await getCategoryDrilldown(req.params.categoryId, {
    start: parsed.data.start,
    end: parsed.data.end,
    compare: parsed.data.compare === "true",
    preset: parsed.data.preset,
    accountId: parsed.data.accountId,
    categoryId: parsed.data.categoryId,
    includeIgnored: parsed.data.includeIgnored === "true",
  });

  if (!detail) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.json(detail);
});

// GET /api/budget/overspend/:month - Categories over budget
router.get("/overspend/:month", async (req, res) => {
  const overBudget = await getCategoriesOverBudget(req.params.month);
  res.json(overBudget);
});

// GET /api/budget/current - Get the overview for the active pay cycle.
// Active cycle = the BudgetMonth whose date range contains today.
// If today falls outside every defined cycle, fall back to the most recent past
// cycle (the frontend renders it as elapsed).
router.get("/current", async (_req, res) => {
  const now = new Date();

  const containing = await prisma.budgetMonth.findFirst({
    where: {
      cycleStartDate: { lte: now },
      cycleEndDate: { gte: now },
    },
    orderBy: { cycleStartDate: "desc" },
    select: { month: true },
  });

  const activeMonth =
    containing ??
    (await prisma.budgetMonth.findFirst({
      orderBy: { cycleStartDate: "desc" },
      select: { month: true },
    }));

  if (!activeMonth) {
    res.status(404).json({ error: "No budget configured" });
    return;
  }

  const overview = await getBudgetOverview(activeMonth.month);

  if (!overview) {
    res.status(404).json({ error: "No budget set for current cycle" });
    return;
  }

  res.json(overview);
});

// GET /api/budget/cycles?count=N - Return the most recent N pay cycles.
// Used by Spending Analysis to resolve cycle-based preset ranges on the client.
// Returns [] when no BudgetMonth rows exist so the client can render a setup prompt.
router.get("/cycles", async (req, res) => {
  const countParam = Number.parseInt(String(req.query.count ?? "12"), 10);
  const count = Number.isFinite(countParam)
    ? Math.min(Math.max(countParam, 1), 24)
    : 12;

  const now = new Date();

  // Take up to N cycles ordered newest-first by start date. Cycles are stored
  // explicitly (not derived), so no walking-back-from-anchor required.
  const rows = await prisma.budgetMonth.findMany({
    orderBy: { cycleStartDate: "desc" },
    take: count,
    select: {
      month: true,
      cycleStartDate: true,
      cycleEndDate: true,
    },
  });

  if (rows.length === 0) {
    res.json({ cycles: [] });
    return;
  }

  const cycles = rows.map((row) => {
    const cycle = getPayCycleFromBudgetMonth(
      {
        month: row.month,
        cycleStartDate: new Date(row.cycleStartDate),
        cycleEndDate: new Date(row.cycleEndDate),
      },
      now,
    );
    return {
      budgetMonth: cycle.budgetMonth,
      startInclusive: cycle.startInclusive.toISOString(),
      endExclusive: cycle.endExclusive.toISOString(),
      cycleStartDate: cycle.cycleStartDate.toISOString(),
      cycleEndDate: cycle.cycleEndDate.toISOString(),
      daysInCycle: cycle.daysInCycle,
    };
  });

  res.json({ cycles });
});

// GET /api/budget/pace/:month - Monthly pace calculations (Layer 2)
router.get("/pace/:month", async (req, res) => {
  const pace = await getMonthlyBudgetPace(req.params.month);

  if (!pace) {
    res.status(404).json({ error: "Budget month not found. Create a budget for this month first." });
    return;
  }

  res.json(pace);
});

// GET /api/budget/category-pressure/:month/:categoryId - Category pressure detail (Layer 4)
router.get("/category-pressure/:month/:categoryId", async (req, res) => {
  const detail = await getCategoryPressureDetail(req.params.month, req.params.categoryId);

  if (!detail) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.json(detail);
});

// ============================================================================
// BUDGET RECOMMENDATIONS - Layer 5
// ============================================================================

// GET /api/budget/spending-history/:month - Deterministic spending history analysis
router.get("/spending-history/:month", async (req, res) => {
  try {
    const analysis = await getSpendingHistoryAnalysis(req.params.month);
    res.json(analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// GET /api/budget/category-evidence/:month - Batch category evidence for "Why?" UI
router.get("/category-evidence/:month", async (req, res) => {
  try {
    const evidenceMap = await getCategoryEvidenceBatch(req.params.month);
    // Convert Map to plain object for JSON serialization
    const evidence: Record<string, unknown> = {};
    for (const [key, value] of evidenceMap) {
      evidence[key] = value;
    }
    res.json(evidence);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/budget/recommendations/:month - Generate AI budget recommendations
router.post("/recommendations/:month", async (req, res) => {
  try {
    const recommendations = await generateBudgetRecommendations(req.params.month);
    res.json(recommendations);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// POST /api/budget/recommendations/:month/apply - Apply selected recommendations
const applyRecommendationsSchema = z.object({
  runId: z.string(),
  selections: z.array(z.object({
    categoryId: z.string(),
    recommendedBudget: z.number(),
    editedBudget: z.number().optional(),
    apply: z.boolean(),
  })),
});

router.post("/recommendations/:month/apply", async (req, res) => {
  const parsed = applyRecommendationsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  try {
    const result = await applyBudgetRecommendations(
      req.params.month,
      parsed.data.runId,
      parsed.data.selections
    );
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
