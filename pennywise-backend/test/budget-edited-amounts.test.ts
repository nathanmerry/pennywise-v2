import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { getBudgetOverview } from '../src/services/budget.js';
import { stubMethod } from './helpers.js';
test('shared budget overview deducts edited spending and honours edited direction', async () => {
  stubMethod(prisma.budgetMonth, 'findUnique', async () => ({ month: '2026-11', expectedIncome: 1000, savingsTargetType: 'fixed', savingsTargetValue: 0, cycleStartDate: new Date('2026-10-25'), cycleEndDate: new Date('2026-11-24'), fixedCommitments: [], plannedSpends: [], categoryPlans: [], events: [] }));
  const rows = [
    { amount: -100, updatedTransactionAmount: -10, categories: [], isIgnored: false },
    { amount: -90, updatedTransactionAmount: 90, categories: [], isIgnored: false },
    { amount: 50, updatedTransactionAmount: -50, categories: [], isIgnored: false },
  ];
  stubMethod(prisma.transaction, 'findMany', async ({ select }: any) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => select[key]))));
  stubMethod(prisma.category, 'findMany', async () => []);
  const overview = await getBudgetOverview('2026-11');
  assert.equal(overview?.remainingFlexible, 940);
  assert.equal(overview?.actualSpend, 60);
  assert.equal(overview?.moneyOut, 60);
  assert.equal(overview?.moneyIn, 90);
});
