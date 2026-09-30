import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isIOS, isStandalone } from '@/lib/pwa';

export type PushState =
  | 'loading'
  | 'unsupported'   // browser can't do push (or dev build without the service worker)
  | 'ios-install'   // iPhone: only works after "Add to Home Screen"
  | 'blocked'       // the person said "Block" — must be allowed in browser settings
  | 'off'
  | 'on';

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

function deviceName() {
  const ua = navigator.userAgent;
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'Windows' : /mac/i.test(ua) ? 'Mac' : 'Device';
  const browser = /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /edg\//i.test(ua) ? 'Edge' : /chrome/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${browser}${isStandalone() ? ' (app)' : ''}`;
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Sale alerts on this phone: turn on / off, send a test, "also my own sales". */
export function usePushAlerts() {
  const [state, setState] = useState<PushState>('loading');
  const [includeOwn, setIncludeOwn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!('Notification' in window) || !('PushManager' in window)) {
      setState(isIOS() && !isStandalone() ? 'ios-install' : 'unsupported');
      return;
    }
    const reg = await registration();
    if (!reg) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('blocked'); return; }
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { setState('off'); return; }
    const { data } = await supabase.from('push_subscriptions').select('include_own').eq('endpoint', sub.endpoint).maybeSingle();
    setIncludeOwn(!!data?.include_own);
    setState(data ? 'on' : 'off');
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const test = useCallback(async () => {
    const { data, error: e } = await supabase.functions.invoke('notify', { body: { action: 'test' } });
    if (e) throw e;
    return (data as { sent: number }).sent;
  }, []);

  const enable = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await registration();
      if (!reg) throw new Error('Open the installed app (or the live website) to turn on alerts.');
      const { data, error: keyError } = await supabase.functions.invoke('notify', { body: { action: 'public_key' } });
      if (keyError) throw keyError;
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes((data as { publicKey: string }).publicKey) });
      const json = sub.toJSON();
      // Also takes over the phone if someone else had alerts on here before
      const { error: saveError } = await supabase.rpc('register_push_device', {
        p_endpoint: sub.endpoint, p_p256dh: json.keys!.p256dh, p_auth: json.keys!.auth, p_device: deviceName(), p_include_own: includeOwn,
      });
      if (saveError) throw saveError;
      setState('on');
      await test();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [includeOwn, test]);

  const disable = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const sub = await (await registration())?.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const setOwn = useCallback(async (value: boolean) => {
    setIncludeOwn(value);
    const sub = await (await registration())?.pushManager.getSubscription();
    if (sub) await supabase.from('push_subscriptions').update({ include_own: value }).eq('endpoint', sub.endpoint);
  }, []);

  return { state, busy, error, includeOwn, enable, disable, test, setOwn };
}
