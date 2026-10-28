import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { fetchPushPublicKey, registerPushSubscription, removePushSubscription, sendPushTest } from '@/shared/lib/api';
import { NotificationController } from '../notification-controller';

const disableKey = 'pennywise-push-disabling';
async function registration() {
  await navigator.serviceWorker.register('/sw.js');
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Notification setup timed out. Please reload and retry.')), 10_000); }),
    ]);
  } finally { clearTimeout(timer!); }
}

export function NotificationSettings() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Checking notification settings…');
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  const needsInstall = isiOS && !installed;
  const supported = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const controller = useMemo(() => new NotificationController({
    permission: () => Notification.permission,
    getSubscription: async () => (await registration()).pushManager.getSubscription(),
    subscribe: async () => {
      const { publicKey } = await fetchPushPublicKey();
      const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
      const key = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
      return (await registration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    },
    register: registerPushSubscription,
    remove: removePushSubscription,
    sendTest: sendPushTest,
    isDisabling: () => localStorage.getItem(disableKey) === 'true',
    setDisabling: (value) => { if (value) localStorage.setItem(disableKey, 'true'); else localStorage.removeItem(disableKey); },
  }), []);

  useEffect(() => {
    if (!supported || needsInstall) return;
    let active = true;
    const check = async () => {
      try {
        await controller.check();
        if (active) setMessage(controller.enabled ? 'Notifications are enabled on this device.' : Notification.permission === 'denied' ? 'Notifications are blocked. Allow them in your browser or device settings, then retry.' : 'Notifications are off on this device.');
      } catch { if (active) setMessage('Could not verify notification settings. Retry Enable or Disable.'); }
      finally { if (active) { setEnabled(controller.enabled); setBusy(false); } }
    };
    void check();
    return () => { active = false; };
  }, [controller, needsInstall, supported]);

  async function act(action: 'enable' | 'disable' | 'test') {
    setBusy(true);
    try {
      // Permission request is the first asynchronous operation after the click.
      if (action === 'enable' && Notification.permission === 'default') await Notification.requestPermission();
      await controller[action]();
      setMessage(action === 'test' ? 'Test accepted by the push service. Check this device.' : action === 'disable' ? 'Notifications are off on this device.' : 'Notifications are enabled on this device.');
    } catch {
      setMessage(action === 'disable' ? 'Could not finish disabling. Retry Disable to complete removal.' : Notification.permission === 'denied' ? 'Notifications are blocked. Allow them in device settings and retry.' : 'Could not verify or enable notifications. Retry Enable; check your connection and server setup.');
    } finally { setEnabled(controller.enabled); setBusy(false); }
  }

  return <section className="space-y-3 rounded-lg border p-4" aria-labelledby="notification-heading">
    <h2 id="notification-heading" className="font-semibold">Notifications</h2>
    <p className="text-sm text-muted-foreground">A morning spending summary when daily notifications are scheduled.</p>
    {needsInstall ? <p className="text-sm">On iPhone or iPad, open Pennywise in Safari, tap Share → Add to Home Screen, then open the installed app to enable notifications.</p> : !supported ? <p className="text-sm">Push notifications need a supported browser and HTTPS. On iPhone, use the Home Screen app on iOS 16.4 or later.</p> : <>
      <p className="text-sm" role="status">{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void act('enable')} disabled={busy || enabled}>Enable</Button>
        <Button variant="outline" onClick={() => void act('disable')} disabled={busy}>Disable</Button>
        <Button variant="outline" onClick={() => void act('test')} disabled={busy || !enabled}>Send Test</Button>
      </div>
    </>}
  </section>;
}
