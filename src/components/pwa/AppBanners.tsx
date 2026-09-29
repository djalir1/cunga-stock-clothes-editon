import { useOnline, useUpdateReady } from '@/lib/pwa';
import { Button } from '@/components/ui/button';
import { WifiOff, Sparkles } from 'lucide-react';

/** Offline warning and "new version ready" bar, shown above every page. */
export function AppBanners() {
  const online = useOnline();
  const update = useUpdateReady();
  return (
    <>
      {!online && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span><b>No internet.</b> You can look around, but sales and changes can't be saved until the connection is back.</span>
        </div>
      )}
      {update.ready && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="flex-1">A new version of Cunga Stock is ready.</span>
          <Button size="sm" onClick={update.apply}>Update now</Button>
        </div>
      )}
    </>
  );
}
