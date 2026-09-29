import { useMemo } from 'react';
import { formatMoney } from '@/lib/money';
import { Link } from 'react-router-dom';
import { differenceInCalendarDays, format } from 'date-fns';
import { useCashReport, useTempStockSales, METHODS, METHOD_LABEL } from '@/hooks/useOpsReports';
import { useDebts } from '@/hooks/useDebts';
import { useTemporaryStock } from '@/hooks/useTemporaryStock';
import { useStockItems } from '@/hooks/useStockItems';
import { formatRWF } from '@/lib/format';
import { downloadCSV, downloadPDF } from '@/lib/exports';
import { StatCard } from '@/components/dashboard/StatCard';
import { OptionTag } from '@/components/shop/OptionPickers';
import { ExportButtons, periodLabel } from './PeriodPicker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Wallet, HandCoins, Banknote, RefreshCcw, AlertTriangle, Clock, Timer, ShoppingBag, Undo2, PackageX, Truck } from 'lucide-react';

const dayLabel = (day: string) => format(new Date(`${day}T00:00:00`), 'EEE dd MMM');
const Loading = () => <div className="flex justify-center py-16"><RefreshCcw className="w-8 h-8 animate-spin text-primary" /></div>;
const money = (n: number) => <span className="tabular-nums whitespace-nowrap">{formatRWF(n)}</span>;

/* ───────────── Cash vs credit per day ───────────── */
export function CashReport({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useCashReport(from, to);
  const period = periodLabel({ from, to });
  if (isLoading || !data) return <Loading />;
  const { days, total, foreign } = data;
  const active = days.filter(d => d.count || d.repayments);
  const usedMethods = METHODS.filter(m => total.moneyIn[m] > 0);

  const rowCells = (d: typeof total, label: string) => [
    label, d.count, formatRWF(d.sales), formatRWF(d.paidAtTill), formatRWF(d.onCredit), formatRWF(d.repayments),
    ...usedMethods.map(m => formatRWF(d.moneyIn[m])), formatRWF(d.totalIn),
  ];
  const head = ['Day', 'Sales', 'Sold for', 'Paid at till', 'On credit', 'Debts paid back', ...usedMethods.map(m => METHOD_LABEL[m]), 'Money in'];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportButtons disabled={!active.length}
          onCSV={() => downloadCSV(`cash-summary-${from}-to-${to}.csv`,
            ['Date', 'Sales', 'Sold for (FRW)', 'Paid at till (FRW)', 'On credit (FRW)', 'Debts paid back (FRW)', ...METHODS.map(m => `${METHOD_LABEL[m]} in (FRW)`), 'Money in (FRW)'],
            [...active.map(d => [d.day, d.count, d.sales, d.paidAtTill, d.onCredit, d.repayments, ...METHODS.map(m => d.moneyIn[m]), d.totalIn]),
              ['Total', total.count, total.sales, total.paidAtTill, total.onCredit, total.repayments, ...METHODS.map(m => total.moneyIn[m]), total.totalIn]])}
          onPDF={() => downloadPDF(`cash-summary-${from}-to-${to}.pdf`, 'Cash Summary — cash vs credit per day', `Period: ${period}`, [
            { title: 'Per day', head, body: [...active.map(d => rowCells(d, dayLabel(d.day))), rowCells(total, 'Total')], totals: true },
          ], 'Money in = paid at the till + debts paid back. Cancelled sales are not counted.')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Sold for" value={formatRWF(total.sales)} icon={ShoppingBag} variant="primary" description={`${total.count} sales`} />
        <StatCard title="Paid at the till" value={formatRWF(total.paidAtTill)} icon={Wallet} variant="success" description={`${Math.round((total.paidAtTill / (total.sales || 1)) * 100)}% of sales`} />
        <StatCard title="Given on credit" value={formatRWF(total.onCredit)} icon={HandCoins} variant="warning" description="Became debts" />
        <StatCard title="Money in" value={formatRWF(total.totalIn)} icon={Banknote} variant="default"
          description={`Includes ${formatRWF(total.repayments)} of debts paid back`} />
      </div>

      {(foreign.USD > 0 || foreign.EUR > 0) && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <b>Foreign money received:</b>{' '}
          {[foreign.USD > 0 && formatMoney(foreign.USD, 'USD'), foreign.EUR > 0 && formatMoney(foreign.EUR, 'EUR')].filter(Boolean).join(' · ')}
          <span className="text-muted-foreground"> — these notes should be in the drawer. Their FRW value is already counted in “Money in”; change was given in FRW.</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Cash vs credit per day</CardTitle>
          <CardDescription>{period} · compare “Money in” with your drawer and MoMo balance each evening</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {active.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No sales or repayments in this period.</p> : (
            <Table>
              <TableHeader>
                <TableRow>{head.map((h, i) => <TableHead key={h} className={i > 0 ? 'text-right' : ''}>{h}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {active.map(d => (
                  <TableRow key={d.day}>
                    <TableCell className="whitespace-nowrap font-medium">{dayLabel(d.day)}</TableCell>
                    <TableCell className="text-right">{d.count}</TableCell>
                    <TableCell className="text-right">{money(d.sales)}</TableCell>
                    <TableCell className="text-right">{money(d.paidAtTill)}</TableCell>
                    <TableCell className={cn('text-right', d.onCredit > 0 && 'text-amber-600')}>{money(d.onCredit)}</TableCell>
                    <TableCell className="text-right">{money(d.repayments)}</TableCell>
                    {usedMethods.map(m => <TableCell key={m} className="text-right text-muted-foreground">{money(d.moneyIn[m])}</TableCell>)}
                    <TableCell className="text-right font-semibold">{money(d.totalIn)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{total.count}</TableCell>
                  <TableCell className="text-right">{money(total.sales)}</TableCell>
                  <TableCell className="text-right">{money(total.paidAtTill)}</TableCell>
                  <TableCell className="text-right">{money(total.onCredit)}</TableCell>
                  <TableCell className="text-right">{money(total.repayments)}</TableCell>
                  {usedMethods.map(m => <TableCell key={m} className="text-right">{money(total.moneyIn[m])}</TableCell>)}
                  <TableCell className="text-right">{money(total.totalIn)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────── Aged debts ───────────── */
const BUCKETS = ['Not due yet', '1–30 days late', '31–60 days late', '61–90 days late', 'Over 90 days late'] as const;
const bucketOf = (daysLate: number) => (daysLate <= 0 ? 0 : daysLate <= 30 ? 1 : daysLate <= 60 ? 2 : daysLate <= 90 ? 3 : 4);

export function AgedDebtsReport() {
  const { debts, isLoading } = useDebts();
  const today = new Date();

  const rows = useMemo(() => {
    const byCustomer = new Map<string, { name: string; phone: string | null; buckets: number[]; total: number; oldest: number }>();
    debts.filter(d => d.balance > 0).forEach(d => {
      // Late = days past the promised date; with no date, days since the sale
      const ref = d.due_date ? new Date(`${d.due_date}T00:00:00`) : new Date(d.created_at);
      const late = differenceInCalendarDays(today, ref);
      const r = byCustomer.get(d.customer_id) ?? { name: d.customer_name, phone: d.customer_phone, buckets: [0, 0, 0, 0, 0], total: 0, oldest: 0 };
      r.buckets[d.due_date ? bucketOf(late) : bucketOf(Math.max(0, late - 30))] += d.balance; // no date: 30 days' grace
      r.total += d.balance;
      r.oldest = Math.max(r.oldest, late);
      byCustomer.set(d.customer_id, r);
    });
    return [...byCustomer.values()].sort((a, b) => b.buckets.slice(1).reduce((s, x) => s + x, 0) - a.buckets.slice(1).reduce((s, x) => s + x, 0) || b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debts]);

  if (isLoading) return <Loading />;
  const totals = BUCKETS.map((_, i) => rows.reduce((s, r) => s + r.buckets[i], 0));
  const grand = totals.reduce((s, x) => s + x, 0);
  const late = grand - totals[0];
  const asOf = `As of ${format(today, 'dd MMM yyyy')}`;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportButtons disabled={!rows.length}
          onCSV={() => downloadCSV(`aged-debts-${format(today, 'yyyy-MM-dd')}.csv`,
            ['Customer', 'Phone', ...BUCKETS.map(b => `${b} (FRW)`), 'Total owed (FRW)'],
            [...rows.map(r => [r.name, r.phone, ...r.buckets, r.total]), ['Total', '', ...totals, grand]])}
          onPDF={() => downloadPDF(`aged-debts-${format(today, 'yyyy-MM-dd')}.pdf`, 'Aged Debts (Amadeni)', asOf, [
            { title: 'Summary', head: ['', 'Amount', 'Share'], body: BUCKETS.map((b, i) => [b, formatRWF(totals[i]), `${Math.round((totals[i] / (grand || 1)) * 100)}%`]).concat([['Total owed', formatRWF(grand), '100%']]), totals: true },
            { title: 'By customer', head: ['Customer', ...BUCKETS, 'Total'], body: [...rows.map(r => [r.name, ...r.buckets.map(formatRWF), formatRWF(r.total)]), ['Total', ...totals.map(formatRWF), formatRWF(grand)]], totals: true },
          ], 'Late = days past the promised pay date. Debts without a date count as late 30 days after the sale.')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total owed" value={formatRWF(grand)} icon={HandCoins} variant="warning" description={`${rows.length} customers`} />
        <StatCard title="Late" value={formatRWF(late)} icon={AlertTriangle} variant="destructive" description={`${Math.round((late / (grand || 1)) * 100)}% of all debts`} />
        <StatCard title="Over 60 days late" value={formatRWF(totals[3] + totals[4])} icon={Clock} variant="default" description="Hardest to collect — call these first" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How late the money is</CardTitle>
          <CardDescription>{asOf} · late = days past the promised pay date (no date: 30 days after the sale)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-muted">
            {totals.map((t, i) => t > 0 && (
              <div key={i} title={`${BUCKETS[i]}: ${formatRWF(t)}`} style={{ width: `${(t / (grand || 1)) * 100}%` }}
                className={['bg-green-500', 'bg-amber-400', 'bg-orange-500', 'bg-red-500', 'bg-red-800'][i]} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {BUCKETS.map((b, i) => (
              <span key={b} className="inline-flex items-center gap-1.5">
                <span className={cn('w-2.5 h-2.5 rounded-sm', ['bg-green-500', 'bg-amber-400', 'bg-orange-500', 'bg-red-500', 'bg-red-800'][i])} />
                {b}: <b className="text-foreground">{formatRWF(totals[i])}</b>
              </span>
            ))}
          </div>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Nobody owes the shop anything. 🎉</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    {BUCKETS.map(b => <TableHead key={b} className="text-right whitespace-nowrap">{b}</TableHead>)}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.name + r.phone}>
                      <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.phone ?? ''}</div></TableCell>
                      {r.buckets.map((v, i) => <TableCell key={i} className={cn('text-right', v > 0 && i >= 2 && 'text-destructive font-medium', v === 0 && 'text-muted-foreground/50')}>{v ? money(v) : '—'}</TableCell>)}
                      <TableCell className="text-right font-semibold">{money(r.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell>Total</TableCell>
                    {totals.map((t, i) => <TableCell key={i} className="text-right">{money(t)}</TableCell>)}
                    <TableCell className="text-right">{money(grand)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
          <Button asChild variant="outline" size="sm"><Link to="/debts">Open Debts to record payments or send reminders</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────── Temporary stock outcomes ───────────── */
export function TempStockReport({ from, to }: { from: string; to: string }) {
  const { checkouts, isLoading } = useTemporaryStock();
  const period = periodLabel({ from, to });
  const today = format(new Date(), 'yyyy-MM-dd');
  const inPeriod = checkouts.filter(c => c.taken_date >= from && c.taken_date <= to);
  const { data: saleTotals = {} } = useTempStockSales(inPeriod.filter(c => c.sale_id).map(c => c.sale_id!));

  if (isLoading) return <Loading />;
  const pieces = (status: string) => inPeriod.filter(c => c.status === status).reduce((s, c) => s + c.quantity, 0);
  const taken = inPeriod.reduce((s, c) => s + c.quantity, 0);
  const sold = pieces('sold'), returned = pieces('returned'), out = pieces('out');
  const overdue = inPeriod.filter(c => c.status === 'out' && c.expected_return_date && c.expected_return_date < today);
  const soldValue = inPeriod.reduce((s, c) => s + (c.sale_id ? saleTotals[c.sale_id] ?? 0 : 0), 0);
  const depositsHeld = inPeriod.filter(c => c.status === 'out').reduce((s, c) => s + (c.deposit ?? 0), 0);
  const conversion = sold + returned ? Math.round((sold / (sold + returned)) * 100) : null;

  const byItem = new Map<string, { taken: number; sold: number; returned: number; out: number }>();
  inPeriod.forEach(c => {
    const r = byItem.get(c.item_name) ?? { taken: 0, sold: 0, returned: 0, out: 0 };
    r.taken += c.quantity;
    r[c.status] += c.quantity;
    byItem.set(c.item_name, r);
  });
  const items = [...byItem.entries()].sort((a, b) => b[1].taken - a[1].taken);
  const outcome = (s: string) => (s === 'sold' ? 'Bought' : s === 'returned' ? 'Returned' : 'Still out');

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportButtons disabled={!inPeriod.length}
          onCSV={() => downloadCSV(`temporary-stock-${from}-to-${to}.csv`,
            ['Taken', 'Customer', 'Phone', 'Item', 'Size', 'Colour', 'Pieces', 'Deposit (FRW)', 'Bring back by', 'Closed', 'Outcome', 'Sold for (FRW)'],
            inPeriod.map(c => [c.taken_date, c.customer_name, c.customer_phone, c.item_name, c.size, c.color, c.quantity, c.deposit ?? '', c.expected_return_date, c.closed_date, outcome(c.status), c.sale_id ? saleTotals[c.sale_id] ?? '' : '']))}
          onPDF={() => downloadPDF(`temporary-stock-${from}-to-${to}.pdf`, 'Temporary Stock — outcomes', `Taken out: ${period}`, [
            { title: 'Summary', head: ['', 'Pieces / amount'], body: [
              ['Taken out', taken], ['Bought by the customer', sold], ['Brought back', returned], ['Still out', out],
              ['Still out and late', overdue.reduce((s, c) => s + c.quantity, 0)],
              ['Bought ÷ (bought + returned)', conversion === null ? '—' : `${conversion}%`],
              ['Value of what was bought', formatRWF(soldValue)], ['Deposits held (still out)', formatRWF(depositsHeld)],
            ] },
            { title: 'By item', head: ['Item', 'Taken', 'Bought', 'Returned', 'Still out'], body: items.map(([n, r]) => [n, r.taken, r.sold, r.returned, r.out]) },
            { title: 'Every record', head: ['Taken', 'Customer', 'Item', 'Pcs', 'Outcome', 'Sold for'], body: inPeriod.map(c => [c.taken_date, c.customer_name, [c.item_name, c.size, c.color].filter(Boolean).join(' '), c.quantity, outcome(c.status), c.sale_id && saleTotals[c.sale_id] !== undefined ? formatRWF(saleTotals[c.sale_id]) : '—']) },
          ])} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Taken out" value={taken} icon={Timer} variant="primary" description={`${inPeriod.length} records`} />
        <StatCard title="Bought" value={sold} icon={ShoppingBag} variant="success" description={`${conversion === null ? '—' : `${conversion}%`} of those decided · ${formatRWF(soldValue)}`} />
        <StatCard title="Brought back" value={returned} icon={Undo2} variant="default" description="Back on the shelf" />
        <StatCard title="Still out" value={out} icon={AlertTriangle} variant="warning"
          description={overdue.length ? `${overdue.length} late · deposits held ${formatRWF(depositsHeld)}` : `Deposits held ${formatRWF(depositsHeld)}`} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">What happens to pieces taken on approval</CardTitle>
          <CardDescription>Taken out {period}</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nothing was taken out in this period.</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Taken</TableHead>
                  <TableHead className="text-right">Bought</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="text-right">Still out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(([name, r]) => (
                  <TableRow key={name}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-right">{r.taken}</TableCell>
                    <TableCell className="text-right text-green-600">{r.sold}</TableCell>
                    <TableCell className="text-right">{r.returned}</TableCell>
                    <TableCell className={cn('text-right', r.out > 0 && 'text-amber-600')}>{r.out}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────── Low stock ───────────── */
export function LowStockReport() {
  const { items, isLoading } = useStockItems();
  if (isLoading) return <Loading />;

  const low = items.filter(i => i.status !== 'in_stock').sort((a, b) => a.quantity - b.quantity);
  // Sizes / colours that ran out while the item still has others (the "M is gone" problem)
  const gaps = items.filter(i => i.quantity > 0).flatMap(i => i.variants.filter(v => v.quantity === 0 && v.sold > 0).map(v => ({ item: i, v })));
  const asOf = `As of ${format(new Date(), 'dd MMM yyyy')}`;
  const statusLabel = (s: string) => (s === 'out_of_stock' ? 'Sold out' : 'Low');

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportButtons disabled={!low.length && !gaps.length}
          onCSV={() => downloadCSV(`low-stock-${format(new Date(), 'yyyy-MM-dd')}.csv`,
            ['Item', 'Category', 'Size', 'Colour', 'Left', 'Warn below', 'Status'],
            [...low.flatMap(i => i.variants.map(v => [i.name, i.category?.name, v.size, v.color, v.quantity, i.min_quantity, statusLabel(i.status)])),
              ...gaps.map(g => [g.item.name, g.item.category?.name, g.v.size, g.v.color, 0, '', 'Size/colour sold out'])])}
          onPDF={() => downloadPDF(`low-stock-${format(new Date(), 'yyyy-MM-dd')}.pdf`, 'Low Stock', asOf, [
            { title: 'Items running low or sold out', head: ['Item', 'Category', 'Left', 'Warn below', 'Status'], body: low.map(i => [i.name, i.category?.name ?? '—', i.quantity, i.min_quantity, statusLabel(i.status)]) },
            { title: 'Sizes / colours sold out (item still has others)', head: ['Item', 'Size', 'Colour', 'Sold so far'], body: gaps.map(g => [g.item.name, g.v.size ?? '—', g.v.color ?? '—', g.v.sold]) },
          ])} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Sold out" value={items.filter(i => i.status === 'out_of_stock').length} icon={PackageX} variant="destructive" description="Items with 0 pieces" />
        <StatCard title="Running low" value={items.filter(i => i.status === 'low_stock').length} icon={AlertTriangle} variant="warning" description="Below their warning level" />
        <StatCard title="Sizes/colours gone" value={gaps.length} icon={Clock} variant="default" description="Customers asking for these will leave" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Items to restock</CardTitle>
            <CardDescription>{asOf}</CardDescription>
          </CardHeader>
          <CardContent>
            {low.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">Everything is well stocked.</p> : (
              <div className="space-y-2">
                {low.map(i => (
                  <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{i.name}</p>
                      <p className="text-xs text-muted-foreground">{i.category?.name ?? 'No category'} · warn below {i.min_quantity}</p>
                    </div>
                    <Badge variant={i.status === 'out_of_stock' ? 'destructive' : 'outline'} className={i.status === 'low_stock' ? 'text-amber-600 border-amber-500/40' : ''}>
                      {i.status === 'out_of_stock' ? 'Sold out' : `${i.quantity} left`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sizes / colours that ran out</CardTitle>
            <CardDescription>The item still has other sizes, so it doesn't show as sold out</CardDescription>
          </CardHeader>
          <CardContent>
            {gaps.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No gaps.</p> : (
              <div className="space-y-2">
                {gaps.map(({ item, v }) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{item.name} · <OptionTag size={v.size} color={v.color} className="text-muted-foreground" /></span>
                    <span className="text-xs text-muted-foreground shrink-0">{v.sold} sold</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Button asChild className="gap-2"><Link to="/orders"><Truck className="w-4 h-4" /> Order from a supplier</Link></Button>
    </div>
  );
}
