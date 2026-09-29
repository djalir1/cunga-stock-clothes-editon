import { useEffect, useState, useSyncExternalStore } from 'react';

/** Chrome/Edge/Android fire this when the app can be installed */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
/** A newer build is on the server (the page was opened before it was published) */
let newBuild = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // we show our own "Install app" button
    installEvent = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => { installEvent = null; emit(); });

  // Only in the built app: in dev the service worker would serve stale files
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const track = (worker: ServiceWorker | null) => {
        worker?.addEventListener('statechange', () => {
          // A new version finished installing while an old one is running
          if (worker.state === 'installed' && navigator.serviceWorker.controller) { waitingWorker = worker; emit(); }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { waitingWorker = reg.waiting; emit(); }
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Check for a new version every 30 minutes while the app is open
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    } catch (e) {
      console.warn('Service worker not registered', e);
    }
  });
  // Coming back to the app (e.g. phone unlocked): look for a newer version, at most every 10 minutes
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 10 * 60 * 1000) return;
    lastCheck = Date.now();
    navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => {});
    checkForNewBuild();
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

/** Compares the app files this page runs with the ones on the server. */
async function checkForNewBuild() {
  try {
    const current = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src;
    if (!current) return;
    const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
    const latest = html.match(/src="([^"]*\/assets\/[^"]+\.js)"/)?.[1];
    if (latest && !current.endsWith(latest)) { newBuild = true; emit(); }
  } catch { /* offline */ }
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

/** Install button state: 'prompt' (one tap), 'ios' (show Share → Add to Home Screen), 'installed' or 'unavailable' */
export function useInstall() {
  const event = useSyncExternalStore(subscribe, () => installEvent);
  const state: 'prompt' | 'ios' | 'installed' | 'unavailable' =
    isStandalone() ? 'installed' : event ? 'prompt' : isIOS() ? 'ios' : 'unavailable';
  const install = async () => {
    if (!installEvent) return false;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    installEvent = null;
    emit();
    return outcome === 'accepted';
  };
  return { state, install };
}

/** A new version is downloaded and waiting */
export function useUpdateReady() {
  const worker = useSyncExternalStore(subscribe, () => waitingWorker);
  const fresh = useSyncExternalStore(subscribe, () => newBuild);
  return {
    ready: !!worker || fresh,
    apply: () => (worker ? worker.postMessage('SKIP_WAITING') : window.location.reload()),
  };
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
