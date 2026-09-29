import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlerts, type Alert } from '@/hooks/useAlerts';
import { useActivityLogs } from '@/hooks/useActivityLogs';
import { useAuth } from '@/contexts/AuthContext';
import { formatRWF } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bell, AlertTriangle, CheckCircle2, ShoppingCart, Package, HandCoins, Truck, Timer, Users,
  UserPlus, Trash2, Pencil, XCircle, ChevronRight, RefreshCcw, Settings as SettingsIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const READ_KEY = 'cunga-read-alerts';
const loadSet = (key: string) => { try { return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]')); } catch { return new Set<string>(); } };
const saveSet = (key: string, set: Set<string>) => { try { localStorage.setItem(key, JSON.stringify([...set].slice(-500))); } catch { /* private mode */ } };

const ALERT_ICON: Record<Alert['kind'], typeof Bell> = { stock: Package, debt: HandCoins, order: Truck, temp: Timer };

interface Entry {
  id: string;
  icon: typeof Bell;
  tone: 'good' | 'bad' | 'info';
  title: string;
  message: string;
  who: string | null;
  at: Date;
  href: string;
}

type Log = ReturnType<typeof useActivityLogs>['data'] extends (infer T)[] | undefined ? T : never;

const num = (v: unknown) => Number(v ?? 0);
const text = (v: unknown, fallback = '') => (v == null || v === '' ? fallback : String(v));

/** Turns one line of the activity log into a sentence anyone can read */
function describe(log: Log): Omit<Entry, 'id' | 'who' | 'at'> {
  const d = (log.details ?? {}) as Record<string, unknown>;
  const key = `${log.entity_type}:${log.action}`;
  switch (key) {
    case 'sale:sold':
      return {
        icon: ShoppingCart, tone: 'good', title: `Sale · ${formatRWF(num(d.total))}`,
        message: `${text(d.customer, 'Walk-in customer')} · ${d.status === 'paid' ? 'paid in full' : d.status === 'partial' ? `paid ${formatRWF(num(d.paid))}, owes the rest` : 'on credit'}`,
        href: `/sales?receipt=${log.entity_id}`,
      };
    case 'sale:sale_cancelled':
      return {
        icon: XCircle, tone: 'bad', title: `Sale cancelled · ${formatRWF(num(d.total))}`,
        message: `Receipt #${String(d.receipt ?? '').padStart(5, '0')}${d.reason ? ` — ${d.reason}` : ''}`,
        href: `/sales?receipt=${log.entity_id}`,
      };
    case 'customer:debt_payment':
      return {
        icon: HandCoins, tone: 'good', title: `Payment · ${formatRWF(num(d.amount))}`,
        message: `${text(d.customer, 'A customer')} paid back money they owed`, href: '/debts',
      };
    case 'customer:created':
      return { icon: UserPlus, tone: 'info', title: 'New customer', message: `${text(d.name)}${d.phone ? ` · ${d.phone}` : ''}`, href: '/customers' };
    case 'stock_item:created':
      return { icon: Package, tone: 'good', title: 'New item added', message: text(d.name, 'An item'), href: `/stock?q=${encodeURIComponent(text(d.name))}` };
    case 'stock_item:restocked': {
      const lines = (d.lines ?? []) as { item: string; quantity: number; size?: string | null; color?: string | null }[];
      return {
        icon: Package, tone: 'good', title: `Stock added · ${num(d.pieces)} ${num(d.pieces) === 1 ? 'piece' : 'pieces'}`,
        message: lines.slice(0, 3).map(l => `${Math.abs(l.quantity)}× ${l.item}${[l.size, l.color].filter(Boolean).length ? ` (${[l.size, l.color].filter(Boolean).join(', ')})` : ''}`).join(', ') + (lines.length > 3 ? ` +${lines.length - 3} more` : ''),
        href: `/stock?q=${encodeURIComponent(lines[0]?.item ?? '')}`,
      };
    }
    case 'stock_item:updated': {
      const parts: string[] = [];
      const price = d.price as [number | null, number | null] | undefined;
      if (price) parts.push(`price ${price[0] != null ? formatRWF(price[0]) : '—'} → ${price[1] != null ? formatRWF(price[1]) : '—'}${d.variant ? ` (${d.variant})` : ''}`);
      const cost = d.cost as [number | null, number | null] | undefined;
      if (cost) parts.push(`cost ${cost[0] != null ? formatRWF(cost[0]) : '—'} → ${cost[1] != null ? formatRWF(cost[1]) : '—'}`);
      const name = d.name as [string, string] | undefined;
      if (Array.isArray(name)) parts.push(`renamed from "${name[0]}"`);
      if (d.min_quantity) parts.push('low-stock warning changed');
      if (d.category) parts.push('category changed');
      if (d.photo) parts.push('new photo');
      if (d.notes) parts.push('notes changed');
      const item = text(d.item, Array.isArray(name) ? name[1] : 'An item');
      return {
        icon: Pencil, tone: 'info', title: price ? 'Price changed' : 'Item changed',
        message: `${item}${parts.length ? `: ${parts.join('; ')}` : ''}`, href: `/stock?q=${encodeURIComponent(item)}`,
      };
    }
    case 'stock_item:deleted':
      return {
        icon: Trash2, tone: 'bad', title: 'Item deleted',
        message: d.name ? `${d.name}${num(d.quantity) ? ` (${num(d.quantity)} pieces were in stock)` : ''}` : 'An item was deleted', href: '/movements',
      };
    case 'temp_stock:taken_on_approval':
      return { icon: Timer, tone: 'info', title: 'Taken on approval', message: `${text(d.customer)} took ${num(d.quantity)}× ${text(d.item)}`, href: '/temporary-stock' };
    case 'temp_stock:brought_back':
      return { icon: Timer, tone: 'good', title: 'Brought back', message: `${text(d.customer)} returned ${num(d.quantity)}× ${text(d.item)}`, href: '/temporary-stock' };
    case 'temp_stock:deleted':
      return { icon: Trash2, tone: 'bad', title: 'Temporary stock record deleted', message: `${text(d.customer)} · ${num(d.quantity)}× ${text(d.item)}`, href: '/temporary-stock' };
    case 'purchase_order:ordered':
      return { icon: Truck, tone: 'info', title: 'New order to a supplier', message: text(d.supplier, 'Supplier not set'), href: '/orders' };
    case 'purchase_order:received':
      return { icon: Truck, tone: 'good', title: d.status === 'partial' ? 'Part of an order arrived' : 'Order arrived', message: `Order #${text(d.order)} was checked in and added to stock`, href: '/orders' };
    case 'account:signed_up':
      return { icon: Users, tone: 'info', title: 'New account waiting', message: `${text(d.name, 'Someone')} signed up and needs access`, href: '/settings' };
    default:
      return { icon: Bell, tone: 'info', title: `${log.action.replace(/_/g, ' ')}`, message: log.entity_type.replace(/_/g, ' '), href: '/movements' };
  }
}

const TONE = {
  good: 'bg-green-500/10 text-green-600 dark:text-green-400',
  bad: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
};

function Row({ icon: Icon, tone, title, message, meta, unread, onClick }: {
  icon: typeof Bell; tone: keyof typeof TONE; title: string; message: string; meta: string; unread?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left flex items-start gap-3 p-3 sm:p-4 rounded-xl border transition-colors hover:bg-muted/60',
        unread ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
      )}
    >
      <span className={cn('rounded-full p-2 shrink-0', TONE[tone])}><Icon className="w-4 h-4" /></span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {unread && <span className="w-2 h-2 rounded-full bg-primary" />}
        </span>
        <span className="block text-sm text-muted-foreground break-words">{message}</span>
        <span className="block text-xs text-muted-foreground mt-1">{meta}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 self-center" />
    </button>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Bell; text: string }) {
  return (
    <div className="text-center py-12">
      <Icon className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const alerts = useAlerts();
  const { data: logs = [], isLoading, refetch, isFetching } = useActivityLogs(80);
  const [readIds, setReadIds] = useState(() => loadSet(READ_KEY));

  const activity = useMemo<Entry[]>(() => logs.map(l => ({
    id: l.id,
    ...describe(l),
    who: l.user_name,
    at: new Date(l.created_at),
  })), [logs]);

  const unread = alerts.filter(a => !readIds.has(a.id));
  const markAllAsRead = () => {
    const next = new Set([...readIds, ...alerts.map(a => a.id)]);
    setReadIds(next);
    saveSet(READ_KEY, next);
  };
  const openAlert = (a: Alert) => {
    const next = new Set([...readIds, a.id]);
    setReadIds(next);
    saveSet(READ_KEY, next);
    navigate(a.href);
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            Notifications
            {unread.length > 0 && <Badge variant="destructive">{unread.length} new</Badge>}
          </h1>
          <p className="text-muted-foreground">What needs your attention, and everything that happened in the shop. Tap any line to open it.</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllAsRead} disabled={unread.length === 0}>Mark all as read</Button>
      </div>

      {(role === 'owner' || role === 'admin' || role === 'supervisor') && (
        <Card className="border-dashed">
          <CardContent className="p-3 flex items-center gap-3 text-sm">
            <Bell className="w-4 h-4 text-primary shrink-0" />
            <span className="flex-1 text-muted-foreground">Want these on your phone, even when the app is closed?</span>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link to="/settings"><SettingsIcon className="w-4 h-4" /> Phone alerts</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={alerts.length ? 'attention' : 'activity'}>
        <TabsList className="grid grid-cols-2 w-full sm:w-auto sm:inline-grid">
          <TabsTrigger value="attention" className="gap-1.5"><AlertTriangle className="w-4 h-4" /> Needs attention ({alerts.length})</TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5"><Bell className="w-4 h-4" /> What happened</TabsTrigger>
        </TabsList>

        <TabsContent value="attention" className="mt-4 space-y-2">
          {alerts.length === 0 ? (
            <Empty icon={CheckCircle2} text="All good — nothing needs your attention right now." />
          ) : (
            alerts.map(a => (
              <Row key={a.id} icon={ALERT_ICON[a.kind]} tone="bad" title={a.title} message={a.message}
                meta={formatDistanceToNow(a.timestamp, { addSuffix: true })} unread={!readIds.has(a.id)} onClick={() => openAlert(a)} />
            ))
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-2">
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>Latest {activity.length} actions, newest first. Updates live.</span>
            <button onClick={() => refetch()} className="inline-flex items-center gap-1 hover:text-foreground">
              <RefreshCcw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} /> Refresh
            </button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10"><RefreshCcw className="w-5 h-5 animate-spin text-primary" /></div>
          ) : activity.length === 0 ? (
            <Empty icon={Bell} text="Nothing has happened yet. Sales, payments and stock changes will show up here." />
          ) : (
            activity.map(e => (
              <Row key={e.id} icon={e.icon} tone={e.tone} title={e.title} message={e.message}
                meta={`${e.who ? `${e.who} · ` : ''}${formatDistanceToNow(e.at, { addSuffix: true })}`} onClick={() => navigate(e.href)} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
