import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { stubMethod } from './helpers.js';
import { syncAllConnections } from '../src/services/sync.js';
afterEach(() => mock.restoreAll());
test('exhausted initial SCA windows produce a failed outcome and do not advance freshness', async () => {
  const bank = { id: 'bank', status: 'active', accessToken: 'fake', refreshToken: 'fake', lastSyncedAt: null, accounts: [] };
  let advancedFreshness = false;
  stubMethod(prisma.bankConnection, 'findMany', async () => [bank]);
  stubMethod(prisma.bankConnection, 'findUniqueOrThrow', async () => bank);
  stubMethod(prisma.bankConnection, 'update', async ({ data }: any) => { if (data.lastSyncedAt) advancedFreshness = true; return bank; });
  stubMethod(prisma.account, 'upsert', async () => ({ id: 'account', providerAccountId: 'provider' }));
  stubMethod(prisma.account, 'updateMany', async () => ({ count: 0 }));
  mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('/connect/token')) return Response.json({ access_token: 'fake', refresh_token: 'fake' });
    if (url.endsWith('/accounts')) return Response.json({ results: [{ account_id: 'provider', display_name: 'Bank', currency: 'GBP' }] });
    return new Response('sca_exceeded', { status: 403 });
  });
  const outcomes = await syncAllConnections();
  assert.equal(outcomes[0].status, 'error'); assert.equal(advancedFreshness, false);
});
