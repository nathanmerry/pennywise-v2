import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const fails of [false, true]) test(`built daily CLI returns ${fails ? 'failure' : 'success'}, sanitises output and closes resources`, () => {
  const result = spawnSync(process.execPath, ['--require', './test/cli-mocks.cjs', 'dist/scripts/send-daily-notifications.js'], { encoding: 'utf8', env: { ...process.env, PUSH_TEST_FAIL: fails ? '1' : '0' } });
  assert.equal(result.status, fails ? 1 : 0, result.stderr);
  assert.match(result.stdout, /test-database-closed/);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-/);
  const counts = JSON.parse(result.stdout.split('\n')[0]);
  assert.equal(counts.sent, fails ? 0 : 1); assert.equal(counts.failed, fails ? 1 : 0);
});
