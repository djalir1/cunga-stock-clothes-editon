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
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      const track = (worker: ServiceWorker | null) => {
        worker?.addEventListener('statechange', () => {
          // A new version finished installing while an old one is running
          if (worker.state === 'installed' && navigator.serviceWorker.controller) { waitingWorker = worker; emit(); applyWhenSafe(); }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) { waitingWorker = reg.waiting; emit(); applyWhenSafe(); }
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Look for a new version every 5 minutes while the app is open
      setInterval(() => { reg.update().catch(() => {}); checkForNewBuild(); }, 5 * 60 * 1000);
    } catch (e) {
      console.warn('Service worker not registered', e);
    }
  });

  // Coming back to the app (e.g. phone unlocked, app reopened from the home screen):
  // look for a newer version straight away. Going to the background: install a waiting update.
  let lastCheck = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (updatePending()) applyUpdate(); return; }
    resumedAt = Date.now();
    if (Date.now() - lastCheck < 60 * 1000) return;
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

/** When the app was opened or brought back to the screen */
let resumedAt = Date.now();
const updatePending = () => !!waitingWorker || newBuild;

function applyUpdate() {
  if (waitingWorker) waitingWorker.postMessage('SKIP_WAITING'); // → controllerchange → reload
  else window.location.reload();
}

/**
 * Install an update without asking, but never in the middle of someone's work:
 * right away if the app was just opened (and no sale or form is open),
 * otherwise the next time the app goes to the background.
 */
function applyWhenSafe() {
  if (!updatePending()) return;
  const justOpened = Date.now() - resumedAt < 15 * 1000;
  const busy = location.pathname.startsWith('/sales') || !!document.querySelector('[role="dialog"], [role="alertdialog"]');
  if (document.visibilityState === 'hidden' || (justOpened && !busy)) applyUpdate();
}

/** Compares the app files this page runs with the ones on the server. */
async function checkForNewBuild() {
  try {
    const current = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.src;
    if (!current) return;
    const html = await (await fetch('/index.html', { cache: 'no-store' })).text();
    const latest = html.match(/src="([^"]*\/assets\/[^"]+\.js)"/)?.[1];
    if (latest && !current.endsWith(latest)) { newBuild = true; emit(); applyWhenSafe(); }
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
    apply: applyUpdate,
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
