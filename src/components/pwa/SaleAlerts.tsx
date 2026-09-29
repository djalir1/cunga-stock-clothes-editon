import { useState } from 'react';
import { usePushAlerts } from '@/lib/push';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { BellRing, BellOff, Share, Send, X } from 'lucide-react';
import { useNotificationPrefs, type NotificationPrefs } from '@/hooks/useNotificationPrefs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const KINDS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'sales', label: 'Every sale', hint: 'Who bought what, for how much, who sold it' },
  { key: 'sale_cancelled', label: 'Cancelled sales', hint: 'When a sale is cancelled, with the reason' },
  { key: 'low_stock', label: 'Restock reminders', hint: 'When an item runs low or sells out, and every morning' },
  { key: 'debt_due', label: 'Debts coming due', hint: 'Customers who should pay soon' },
  { key: 'debt_overdue', label: 'Late payments', hint: 'Customers past their promised date' },
  { key: 'orders', label: 'Orders & deliveries', hint: 'Deliveries due today/tomorrow, late, or arrived' },
  { key: 'temp_stock', label: 'Temporary stock', hint: 'Clothes that should come back today or are late' },
  { key: 'daily_summary', label: "Yesterday's sales", hint: 'A short summary every morning at 8:00' },
];

/** The kinds of alerts this person wants (saved on the account, used for every device) */
function AlertChoices() {
  const { prefs, update } = useNotificationPrefs();
  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <p className="text-sm font-semibold">What to notify me about</p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {KINDS.map(k => (
          <div key={k.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{k.label}</p>
              <p className="text-xs text-muted-foreground">{k.hint}</p>
              {k.key === 'debt_due' && prefs.debt_due && (
                <div className="flex items-center gap-2 mt-1.5 text-xs">
                  <span>Remind me</span>
                  <Select value={String(prefs.debt_due_days)} onValueChange={v => update.mutate({ debt_due_days: Number(v) })}>
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[0, 1, 2, 3, 5, 7].map(d => <SelectItem key={d} value={String(d)}>{d === 0 ? 'on the day' : `${d} day${d > 1 ? 's' : ''} before`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Switch checked={prefs[k.key] as boolean} onCheckedChange={v => update.mutate({ [k.key]: v })} />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Morning reminders arrive at 8:00. Storekeepers don't receive alerts.</p>
    </div>
  );
}

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
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">On for this device. Choose below what you want to hear about.</p>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Also notify me about things <b>I</b> do</span>
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
          <p className="font-semibold">{compact ? 'Sale alerts on this phone' : 'Phone notifications'}</p>
          {body}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!compact && <AlertChoices />}
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
