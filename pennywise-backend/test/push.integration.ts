import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createECDH } from 'node:crypto';
import pg from 'pg';

test('additive SQL preserves a populated pre-feature schema; concurrent daily claims send once', async () => {
  const url = process.env.PUSH_TEST_DATABASE_URL;
  assert.ok(url, 'Set PUSH_TEST_DATABASE_URL to a disposable local push_test database');
  const parsed = new URL(url);
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.pathname === '/push_test', 'Only disposable local push_test databases are supported');
  process.env.DATABASE_URL = url;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { prisma } = await import('../src/lib/prisma.js');
  const scratch = mkdtempSync(join(tmpdir(), 'pennywise-push-schema-'));
  try {
    // Recreate the pre-feature schema without migration history, as used by
    // this repository's existing db:push workflow, then retain a bank record.
    const schema = readFileSync('prisma/schema.prisma', 'utf8').replace(/model PushSubscription \{[^}]*\}/, '');
    const schemaFile = join(scratch, 'schema.prisma'); writeFileSync(schemaFile, schema);
    const cli = 'node_modules/prisma/build/index.js';
    const baseline = spawnSync(process.execPath, [cli, 'migrate', 'diff', '--from-empty', '--to-schema', schemaFile, '--script'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } });
    assert.equal(baseline.status, 0, baseline.stderr);
    await client.query(baseline.stdout);
    await client.query(`INSERT INTO bank_connections (id, access_token, refresh_token, institution_name, updated_at) VALUES ('preserved', 'test', 'test', 'Preserved Bank', NOW())`);
    const apply = spawnSync(process.execPath, [cli, 'db', 'execute', '--file', 'prisma/migrations/20261028080000_add_push_subscriptions/migration.sql'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } });
    assert.equal(apply.status, 0, apply.stderr);
    assert.equal((await client.query("SELECT institution_name FROM bank_connections WHERE id = 'preserved'")).rows[0].institution_name, 'Preserved Bank');
    const { registerSubscription } = await import('../src/services/push.js');
    const { runDailyNotifications } = await import('../src/services/notifications/daily-notifications.js');
    const key = createECDH('prime256v1'); key.generateKeys();
    const subscription = { endpoint: 'https://web.push.apple.com/test-device', keys: { p256dh: key.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 5).toString('base64url') } };
    await registerSubscription(subscription);
    let sends = 0;
    const deps = { build: async () => ({ title: 'Pennywise', body: 'Mock only', url: '/', tag: 'test' }), send: async () => { sends++; await new Promise((resolve) => setTimeout(resolve, 15)); return 'sent' as const; } };
    const results = await Promise.all(Array.from({ length: 12 }, () => runDailyNotifications(new Date('2026-10-28T08:00:00Z'), deps)));
    assert.equal(sends, 1);
    assert.equal(results.reduce((n, r) => n + r.sent, 0), 1);
    assert.equal(results.reduce((n, r) => n + r.skipped, 0), 11);
    await registerSubscription(subscription);
    const stored = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: subscription.endpoint } });
    assert.equal(stored.lastAttemptDate, '2026-10-28'); assert.equal(stored.lastSentDate, '2026-10-28');
    assert.equal((await runDailyNotifications(new Date('2026-10-28T09:00:00Z'), deps)).skipped, 1);
  } finally { await prisma.$disconnect(); await client.end(); rmSync(scratch, { recursive: true, force: true }); }
});
