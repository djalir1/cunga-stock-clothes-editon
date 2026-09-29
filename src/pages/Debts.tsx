import { useMemo, useState } from 'react';
import { METHOD_LABEL, formatMoney } from '@/lib/money';
import { format, formatDistanceToNowStrict, startOfMonth } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useDebts, isOverdue, type Debt } from '@/hooks/useDebts';
import { formatRWF } from '@/lib/format';
import { receiptNumber } from '@/lib/receipt';
import { SHOP } from '@/config/shop';
import { PaymentDialog, type PaymentTarget } from '@/components/shop/PaymentDialog';
import { ContactButtons } from '@/components/shop/ContactButtons';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { HandCoins, AlertTriangle, Wallet, Search, ChevronDown, CheckCircle2, RefreshCcw, CalendarClock, ShieldCheck } from 'lucide-react';

interface CustomerDebts {
  customerId: string;
  name: string;
  phone: string | null;
  owes: number;
  overdue: boolean;
  nextDue: string | null;
  debts: Debt[];
}

const fmt = (d: string) => format(new Date(d), 'dd MMM yyyy');

function reminder(c: CustomerDebts) {
  return `Muraho ${c.name}, this is ${SHOP.name}. A friendly reminder that your balance is ${formatRWF(c.owes)}` +
    (c.nextDue ? `, due ${fmt(c.nextDue)}` : '') + '. Murakoze!';
}

function DueLabel({ debt }: { debt: Pick<Debt, 'due_date' | 'balance'> }) {
  if (!debt.due_date) return <span className="text-muted-foreground">No due date</span>;
  if (isOverdue(debt)) {
    return <span className="text-destructive font-medium">Overdue {formatDistanceToNowStrict(new Date(debt.due_date))}</span>;
  }
  return <span>Due {fmt(debt.due_date)}</span>;
}

export default function Debts() {
  const { canEdit } = useAuth();
  const { debts, isLoading, changeDueDate } = useDebts();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);

  const monthStart = startOfMonth(new Date()).toISOString();
  const collected = debts.flatMap(d => d.payments).filter(p => !p.is_initial && p.paid_at >= monthStart).reduce((s, p) => s + p.amount, 0);

  const byCustomer = useMemo(() => {
    const map = new Map<string, CustomerDebts>();
    debts.forEach(d => {
      const c = map.get(d.customer_id) ?? { customerId: d.customer_id, name: d.customer_name, phone: d.customer_phone, owes: 0, overdue: false, nextDue: null, debts: [] };
      c.debts.push(d);
      c.owes += d.balance;
      if (isOverdue(d)) c.overdue = true;
      if (d.balance > 0 && d.due_date && (!c.nextDue || d.due_date < c.nextDue)) c.nextDue = d.due_date;
      map.set(d.customer_id, c);
    });
    return [...map.values()];
  }, [debts]);

  const q = search.toLowerCase();
  const match = (c: CustomerDebts) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q);
  const owing = byCustomer.filter(c => c.owes > 0 && match(c))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.nextDue ?? '9999').localeCompare(b.nextDue ?? '9999'));
  const paidOff = byCustomer.filter(c => c.owes === 0 && match(c));
  const totalOwed = byCustomer.reduce((s, c) => s + c.owes, 0);
  const overdue = byCustomer.filter(c => c.overdue);

  const customerCard = (c: CustomerDebts) => {
    const expanded = open === c.customerId;
    return (
      <Card key={c.customerId} className={cn(c.overdue && 'border-destructive/40')}>
        <CardContent className="p-4 space-y-3">
          <button type="button" className="w-full text-left flex items-start justify-between gap-3" onClick={() => setOpen(expanded ? null : c.customerId)}>
            <div className="min-w-0">
              <p className="font-semibold truncate flex items-center gap-2">
                {c.name}
                {c.overdue && <Badge variant="destructive" className="text-[10px]">Overdue</Badge>}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {c.phone || 'No phone'} · {c.debts.filter(d => d.balance > 0).length || c.debts.length} sale{c.debts.length > 1 ? 's' : ''}
                {c.nextDue && <> · next due {fmt(c.nextDue)}</>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn('text-lg font-bold', c.owes > 0 ? (c.overdue ? 'text-destructive' : 'text-amber-600') : 'text-green-600')}>
                {c.owes > 0 ? formatRWF(c.owes) : 'Paid'}
              </p>
              <ChevronDown className={cn('w-4 h-4 ml-auto text-muted-foreground transition-transform', expanded && 'rotate-180')} />
            </div>
          </button>

          {c.owes > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button size="sm" className="gap-1.5 h-8 bg-green-600 hover:bg-green-700"
                  onClick={() => setPaying({ customerId: c.customerId, customerName: c.name, owes: c.owes })}>
                  <Wallet className="w-3.5 h-3.5" /> Record payment
                </Button>
              )}
              <ContactButtons phone={c.phone} message={reminder(c)} />
            </div>
          )}

          {expanded && (
            <div className="space-y-2 pt-1 animate-fade-in">
              {c.debts.map(d => (
                <div key={d.id} className="rounded-lg border border-border p-3 text-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {d.receipt_no ? `Receipt ${receiptNumber(d.receipt_no)}` : 'Debt'} · {fmt(d.created_at)}
                      </p>
                      <p className="text-xs"><DueLabel debt={d} /></p>
                    </div>
                    <div className="text-right text-xs">
                      <p>Total {formatRWF(d.amount)}</p>
                      <p className="text-muted-foreground">Paid {formatRWF(d.paid)}</p>
                      <p className={cn('font-semibold', d.balance > 0 ? 'text-amber-600' : 'text-green-600')}>
                        {d.balance > 0 ? `Left ${formatRWF(d.balance)}` : 'Cleared'}
                      </p>
                    </div>
                  </div>
                  {d.payments.length > 0 && (
                    <div className="space-y-1 border-t border-border pt-2">
                      {d.payments.map(p => (
                        <p key={p.id} className="text-xs text-muted-foreground flex justify-between gap-2">
                          <span>{format(new Date(p.paid_at), 'dd MMM')} · {METHOD_LABEL[p.method] ?? p.method}{p.currency !== 'RWF' && p.amount_foreign ? ` · ${formatMoney(Number(p.amount_foreign), p.currency)}` : ''}{p.is_initial ? ' · at the sale' : ''}{p.note && !p.is_initial ? ` · ${p.note}` : ''}</span>
                          <span className="text-green-600 font-medium">+{formatRWF(p.amount)}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  {canEdit && d.balance > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => setPaying({ customerId: c.customerId, customerName: c.name, owes: c.owes, debtId: d.id, debtBalance: d.balance })}>
                        Pay this one
                      </Button>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="w-3.5 h-3.5" /> Due
                        <Input type="date" className="h-7 w-36 text-xs" defaultValue={d.due_date ?? ''}
                          onBlur={e => { if ((e.target.value || null) !== d.due_date) changeDueDate.mutate({ debtId: d.id, dueDate: e.target.value || null }); }} />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Debts <span className="text-muted-foreground font-normal text-xl">· Amadeni</span></h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-muted-foreground">Who owes the shop, how much, and when they promised to pay</p>
          {!canEdit && <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1"><ShieldCheck className="w-3 h-3" /> View Only</Badge>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Owed to the shop" value={formatRWF(totalOwed)} icon={HandCoins} variant="warning"
          description={`${byCustomer.filter(c => c.owes > 0).length} customers`} />
        <StatCard title="Overdue" value={formatRWF(overdue.reduce((s, c) => s + c.owes, 0))} icon={AlertTriangle} variant="destructive"
          description={overdue.length ? `${overdue.length} customer${overdue.length > 1 ? 's' : ''} late — send a reminder` : 'Nobody is late'} />
        <StatCard title="Collected this month" value={formatRWF(collected)} icon={Wallet} variant="success"
          description="Repayments received" />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-10" placeholder="Search name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Tabs defaultValue="owing">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="owing">Owing ({owing.length})</TabsTrigger>
          <TabsTrigger value="paid">Paid off ({paidOff.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="owing" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-10"><RefreshCcw className="w-6 h-6 animate-spin text-primary" /></div>
          ) : owing.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{search ? 'Nobody matches your search.' : 'Nobody owes the shop anything. 🎉'}</p>
              <p className="text-xs mt-1">A debt is created when a sale is marked “Part / credit”.</p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">{owing.map(customerCard)}</div>
          )}
        </TabsContent>
        <TabsContent value="paid" className="mt-4">
          {paidOff.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">No fully paid debts yet.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">{paidOff.map(customerCard)}</div>
          )}
        </TabsContent>
      </Tabs>

      <PaymentDialog target={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
