import { Router } from 'express';
import { z } from 'zod/v4';
import { endpointSchema, subscriptionSchema, getPublicKey, registerSubscription, removeSubscription, sendTestNotification } from '../services/push.js';

const router = Router();
router.get('/public-key', (_req, res) => {
  try { res.json({ publicKey: getPublicKey() }); }
  catch { res.status(503).json({ error: 'Notifications are not configured yet.' }); }
});
router.post('/subscriptions', async (req, res) => {
  const input = subscriptionSchema.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Invalid push subscription.' }); return; }
  try { await registerSubscription(input.data); res.json({ ok: true }); }
  catch { res.status(503).json({ error: 'Could not register this device.' }); }
});
router.delete('/subscriptions', async (req, res) => {
  const input = z.object({ endpoint: endpointSchema }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Invalid push endpoint.' }); return; }
  try { await removeSubscription(input.data.endpoint); res.json({ ok: true }); }
  catch { res.status(503).json({ error: 'Could not remove this device. Please retry.' }); }
});
router.post('/test', async (req, res) => {
  const input = subscriptionSchema.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Invalid push subscription.' }); return; }
  try {
    const result = await sendTestNotification(input.data);
    if (result === 'sent') res.json({ ok: true });
    else res.status(result === 'expired' ? 410 : 503).json({ error: result === 'expired' ? 'Subscription expired. Enable notifications again.' : 'Test was not accepted. Please retry.' });
  } catch { res.status(409).json({ error: 'Device registration could not be verified. Enable notifications again.' }); }
});
export default router;
