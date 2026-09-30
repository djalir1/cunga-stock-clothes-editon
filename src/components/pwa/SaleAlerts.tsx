import { useState } from 'react';
import { usePushAlerts } from '@/lib/push';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { BellRing, BellOff, Share, Send, X, ShieldCheck, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleAlerts, type AlertKey, type LimitedRole } from '@/hooks/useSupervisorAlerts';
import { cn } from '@/lib/utils';
import { useNotificationPrefs, type NotificationPrefs } from '@/hooks/useNotificationPrefs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Kind = { key: keyof NotificationPrefs; label: string; hint: string };

/** Every kind of alert, grouped the way the shop works. Also used by the admins' overview. */
export const ALERT_GROUPS: { title: string; kinds: Kind[] }[] = [
  {
    title: 'Selling',
    kinds: [
      { key: 'sales', label: 'Every sale', hint: 'Who bought what, for how much, and who sold it' },
      { key: 'sale_cancelled', label: 'Cancelled sales', hint: 'When a sale is cancelled, with the reason' },
      { key: 'payments', label: 'Customer payments', hint: 'When a customer pays back money they owe' },
      { key: 'customers', label: 'New customers', hint: 'When staff add a new customer' },
    ],
  },
  {
    title: 'Stock',
    kinds: [
      { key: 'stock_changes', label: 'Stock changes', hint: 'Items added, restocked, edited, deleted, and price changes' },
      { key: 'low_stock', label: 'Running low / sold out', hint: 'When an item runs low or sells out, and every morning' },
      { key: 'temp_stock', label: 'Temporary stock', hint: 'Clothes taken on approval, brought back, or late' },
      { key: 'orders', label: 'Orders & deliveries', hint: 'New orders, arrivals, cancellations, late deliveries' },
    ],
  },
  {
    title: 'Money owed & reminders',
    kinds: [
      { key: 'debt_due', label: 'Debts coming due', hint: 'Customers who should pay soon' },
      { key: 'debt_overdue', label: 'Late payments', hint: 'Customers past their promised date' },
      { key: 'daily_summary', label: "Yesterday's sales", hint: 'A short summary every morning at 8:00' },
    ],
  },
  {
    title: 'Team',
    kinds: [
      { key: 'new_accounts', label: 'New accounts', hint: 'Someone signed up and is waiting for you to let them in' },
    ],
  },
];
export const ALL_KINDS = ALERT_GROUPS.flatMap(g => g.kinds);

/** The kinds of alerts this person wants (saved on the account, used for every device) */
function AlertChoices() {
  const { role } = useAuth();
  const { prefs, update } = useNotificationPrefs();
  // Supervisors and storekeepers only see the kinds the owner allows their role
  const limited: LimitedRole | null = role === 'supervisor' || role === 'storekeeper' ? role : null;
  const { allowed } = useRoleAlerts(limited ?? 'supervisor');
  const groups = ALERT_GROUPS
    .map(g => ({ ...g, kinds: g.kinds.filter(k => !limited || allowed.includes(k.key as AlertKey)) }))
    .filter(g => g.kinds.length);
  const kinds = groups.flatMap(g => g.kinds);
  const onCount = kinds.filter(k => prefs[k.key]).length;
  const setAll = (value: boolean) => update.mutate(Object.fromEntries(kinds.map(k => [k.key, value])) as Partial<NotificationPrefs>);

  if (limited && kinds.length === 0) {
    return <p className="text-sm text-muted-foreground pt-3 border-t border-border">The owner hasn't allowed any alerts for {limited}s yet.</p>;
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          What to notify me about <span className="font-normal text-muted-foreground">· {onCount} of {kinds.length} on</span>
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll(true)} disabled={onCount === kinds.length}>Turn all on</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAll(false)} disabled={onCount === 0}>Turn all off</Button>
        </div>
      </div>
      {groups.map(group => (
        <div key={group.title} className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {group.kinds.map(k => (
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
                <Switch aria-label={k.label} checked={prefs[k.key] as boolean} onCheckedChange={v => update.mutate({ [k.key]: v })} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        These choices apply to all your phones and computers. Morning reminders arrive at 8:00.
        {limited ? ` The owner decides which alerts ${limited}s can get.` : ''}
      </p>
    </div>
  );
}

const ROLE_TEXT: Record<LimitedRole, { title: string; text: string; icon: typeof ShieldCheck }> = {
  supervisor: {
    title: 'Alerts supervisors can get',
    text: "Supervisors can see everything and make reports, but can't change anything.",
    icon: ShieldCheck,
  },
  storekeeper: {
    title: 'Alerts storekeepers can get',
    text: 'Storekeepers sell and look after the stock. Useful for them: running low, temporary stock, deliveries, debts.',
    icon: Store,
  },
};

/** Owner: which alerts supervisors / storekeepers are allowed to receive */
function RoleAlertsCard({ role }: { role: LimitedRole }) {
  const { allowed, save } = useRoleAlerts(role);
  const toggle = (key: AlertKey, on: boolean) =>
    save.mutate(on ? [...new Set([...allowed, key])] : allowed.filter(k => k !== key));
  const { title, text, icon: Icon } = ROLE_TEXT[role];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div>
          <p className="font-semibold flex items-center gap-2"><Icon className="w-5 h-5 text-primary" /> {title}</p>
          <p className="text-sm text-muted-foreground">
            {text} Choose which phone alerts they may receive. Each of them can then switch these on or off for themselves.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_KINDS.map(k => {
            const on = allowed.includes(k.key as AlertKey);
            return (
              <button key={k.key} type="button" onClick={() => toggle(k.key as AlertKey, !on)} title={k.hint} aria-pressed={on}
                className={cn('rounded-full border-2 px-3 py-1.5 text-sm transition-colors min-h-9',
                  on ? 'border-primary bg-primary text-primary-foreground font-medium' : 'border-border bg-card text-foreground hover:bg-muted')}>
                {on ? '✓ ' : '+ '}{k.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{allowed.length} of {ALL_KINDS.length} allowed. Tap one to allow or block it.</p>
      </CardContent>
    </Card>
  );
}

export function SupervisorAlertsSection() {
  return (
    <>
      <RoleAlertsCard role="supervisor" />
      <RoleAlertsCard role="storekeeper" />
    </>
  );
}

const DISMISS_KEY = 'cunga-alerts-card-dismissed';

/**
 * Everyone with a role: a notification on this phone for everything that happens
 * in the shop, even when the app is closed. `compact` = the dismissable dashboard card.
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
        return <p className="text-sm text-muted-foreground">This browser can't show alerts. Open Cunga Stock Clothing in <b>Chrome</b> or <b>Samsung Internet</b> on the live website (or the installed app).</p>;
      case 'ios-install':
        return (
          <p className="text-sm text-muted-foreground">
            On iPhone, alerts work in the installed app: tap <Share className="w-3.5 h-3.5 inline" /> <b>Share → Add to Home Screen</b>, open the app from the home screen, then turn alerts on here.
          </p>
        );
      case 'blocked':
        return <p className="text-sm text-muted-foreground">Notifications are blocked for this site. Tap the 🔒 lock / ⓘ next to the address → <b>Notifications → Allow</b>, then reload.</p>;
      case 'on':
        return (
          <div className="space-y-3">
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">✓ On for this device. Choose below what you want to hear about.</p>
            <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
              <span>Also notify me about things <b>I</b> do myself</span>
              <Switch checked={includeOwn} onCheckedChange={setOwn} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={sendTest}><Send className="w-4 h-4" /> Send a test</Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/40" onClick={disable} disabled={busy}><BellOff className="w-4 h-4" /> Turn off on this device</Button>
            </div>
          </div>
        );
      default:
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Get a notification on this phone for everything that happens in the shop: sales, payments, stock added or changed,
              temporary stock, orders and more. It works even when the app is closed. Tap a notification to open the right page.
            </p>
            <Button className="gap-2" onClick={enable} disabled={busy}><BellRing className="w-4 h-4" /> {busy ? 'Turning on…' : 'Turn on phone alerts'}</Button>
          </div>
        );
    }
  })();

  return (
    <Card className={compact ? 'border-primary/30 bg-gradient-to-r from-primary/10 to-accent/10' : ''}>
      <CardContent className="p-4 flex gap-3">
        <span className="rounded-full bg-primary/10 p-2 h-fit"><BellRing className="w-5 h-5 text-primary" /></span>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-semibold">{compact ? 'Know everything that happens in your shop' : 'Phone notifications'}</p>
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
