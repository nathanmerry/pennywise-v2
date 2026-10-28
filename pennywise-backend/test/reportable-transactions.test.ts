import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { stubMethod } from './helpers.js';
import { getReportableOutflows } from '../src/services/reporting/reportable-transactions.js';

test('reporting filters ignored/income by effective sign and keeps uncategorised edited spending', async () => {
  const startDate = new Date('2026-10-27'), endDate = new Date('2026-10-27T23:59:59.999Z');
  stubMethod(prisma.transaction, 'findMany', async ({ where }: any) => {
    assert.equal(where.isIgnored, false);
    assert.deepEqual(where.transactionDate, { gte: startDate, lte: endDate });
    assert.deepEqual(where.OR, [
      { updatedTransactionAmount: { lt: 0 } },
      { updatedTransactionAmount: null, amount: { lt: 0 } },
    ]);
    return [{ id: 'edited', amount: -100, updatedTransactionAmount: -42.8, transactionDate: startDate, description: 'Shopping', merchantName: null, normalizedMerchant: null, categories: [] }];
  });
  const rows = await getReportableOutflows({ startDate, endDate });
  assert.equal(rows[0].amount, 42.8); assert.deepEqual(rows[0].categoryIds, []);
});
