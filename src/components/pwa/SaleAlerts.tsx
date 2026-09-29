import { useState } from 'react';
import { usePushAlerts } from '@/lib/push';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { BellRing, BellOff, Share, Send, X } from 'lucide-react';

const DISMISS_KEY = 'cunga-alerts-card-dismissed';

/**
 * Owner / supervisor: get a notification on this phone for every sale,
 * even when the app is closed. `compact` = the dismissable dashboard card.
 */
export function SaleAlerts({ compact = false }: { compact?: boolean }) {
  const { state, busy, error, includeOwn, enable, disable, test, setOwn } = usePushAlerts();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  if (compact && (dismissed || state !== 'off')) return null;
  if (state === 'loading') return null;

  const sendTest = async () => {
    try {
      const sent = await test();
      toast({ title: sent ? 'Test sent' : 'No device to send to', description: sent ? 'Check your notifications.' : 'Turn alerts on first.' });
    } catch (e) {
      toast({ title: 'Test failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const body = (() => {
    switch (state) {
      case 'unsupported':
        return <p className="text-sm text-muted-foreground">This browser can't show alerts. Open Cunga Stock in <b>Chrome</b> or <b>Samsung Internet</b> on the live website (or the installed app).</p>;
      case 'ios-install':
        return (
          <p className="text-sm text-muted-foreground">
            On iPhone, alerts work in the installed app: tap <Share className="w-3.5 h-3.5 inline" /> <b>Share → Add to Home Screen</b>, open Cunga Stock from the home screen, then turn alerts on here.
          </p>
        );
      case 'blocked':
        return <p className="text-sm text-muted-foreground">Notifications are blocked for this site. Tap the 🔒 lock / ⓘ next to the address → <b>Notifications → Allow</b>, then reload.</p>;
      case 'on':
        return (
          <div className="space-y-3">
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">On for this device — you'll get a notification for every sale and cancelled sale.</p>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Also notify me about sales <b>I</b> make</span>
              <Switch checked={includeOwn} onCheckedChange={setOwn} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={sendTest}><Send className="w-4 h-4" /> Send a test</Button>
              <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={disable} disabled={busy}><BellOff className="w-4 h-4" /> Turn off</Button>
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Get a notification on this phone whenever staff make a sale — who bought what, for how much, and who sold it. Tap it to open the receipt.</p>
            <Button className="gap-2" onClick={enable} disabled={busy}><BellRing className="w-4 h-4" /> {busy ? 'Turning on…' : 'Turn on sale alerts'}</Button>
          </div>
        );
    }
  })();

  return (
    <Card className={compact ? 'border-primary/30 bg-gradient-to-r from-primary/10 to-accent/10' : ''}>
      <CardContent className="p-4 flex gap-3">
        <span className="rounded-full bg-primary/10 p-2 h-fit"><BellRing className="w-5 h-5 text-primary" /></span>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-semibold">Sale alerts on this phone</p>
          {body}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        {compact && (
          <Button size="icon" variant="ghost" className="shrink-0" aria-label="Not now"
            onClick={() => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ } }}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
