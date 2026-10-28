import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotificationController } from '../../pennywise-frontend/src/features/connections/notification-controller.ts';

function fixture() {
  let subscription: any = { endpoint: 'device', expirationTime: null, toJSON: () => ({ endpoint: 'device' }), unsubscribe: async () => { subscription = null; return true; } };
  let permission = 'granted';
  let pending = false;
  let registered = 0;
  const deps = {
    permission: () => permission,
    getSubscription: async () => subscription,
    subscribe: async () => subscription,
    register: async () => { registered++; },
    remove: async () => {},
    sendTest: async () => {},
    isDisabling: () => pending,
    setDisabling: (value: boolean) => { pending = value; },
  };
  return { deps, controller: new NotificationController(deps), setPermission: (p: string) => { permission = p; }, getSubscription: () => subscription, registrations: () => registered };
}
test('existing subscription is enabled only after backend registration succeeds', async () => {
  const f = fixture(); f.deps.register = async () => { throw new Error('offline'); };
  await assert.rejects(f.controller.check());
  assert.equal(f.controller.enabled, false);
});
test('denied permission never reports enabled', async () => {
  const f = fixture(); await f.controller.check(); assert.equal(f.controller.enabled, true);
  f.setPermission('denied'); await f.controller.check(); assert.equal(f.controller.enabled, false);
});
test('expired browser subscription is not registered', async () => {
  const f = fixture(); f.getSubscription().expirationTime = 1;
  await f.controller.check(); assert.equal(f.controller.enabled, false); assert.equal(f.registrations(), 0);
});
test('failed enable registration leaves UI off and allows retry with existing subscription', async () => {
  const f = fixture(); f.deps.register = async () => { throw new Error('offline'); };
  await assert.rejects(f.controller.enable()); assert.equal(f.controller.enabled, false);
  f.deps.register = async () => {}; await f.controller.enable(); assert.equal(f.controller.enabled, true);
});
test('failed server deletion retains browser subscription and disabling intent for retry', async () => {
  const f = fixture(); f.deps.remove = async () => { throw new Error('offline'); };
  await assert.rejects(f.controller.disable()); assert.ok(f.getSubscription()); assert.equal(f.deps.isDisabling(), true);
  f.deps.remove = async () => {}; await f.controller.check();
  assert.equal(f.getSubscription(), null); assert.equal(f.registrations(), 0);
});
test('failed unsubscribe cannot resurrect server registration on reload', async () => {
  const f = fixture(); f.getSubscription().unsubscribe = async () => false;
  await assert.rejects(f.controller.disable());
  await assert.rejects(f.controller.check());
  assert.equal(f.registrations(), 0); assert.equal(f.controller.enabled, false);
});
test('failed test send clears enabled status', async () => {
  const f = fixture(); await f.controller.check();
  f.deps.sendTest = async () => { throw new Error('expired'); };
  await assert.rejects(f.controller.test()); assert.equal(f.controller.enabled, false);
});
test('server-expired subscription is discarded before Enable creates a replacement', async () => {
  const f = fixture(); const old = f.getSubscription();
  f.deps.sendTest = async () => { throw Object.assign(new Error('expired'), { status: 410 }); };
  await assert.rejects(f.controller.test());
  let replacementCreated = false;
  f.deps.subscribe = async () => { replacementCreated = true; return { ...old, endpoint: 'new-device' }; };
  await f.controller.enable();
  assert.equal(replacementCreated, true); assert.equal(f.controller.enabled, true);
});
