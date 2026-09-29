import { useMemo } from 'react';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { downloadPDF } from '@/lib/exports';
import { ExportButtons, periodLabel } from './PeriodPicker';
import { useSalesReport } from '@/hooks/useSalesReport';
import { useStockItems } from '@/hooks/useStockItems';
import { useShopColors } from '@/hooks/useShopColors';
import { formatRWF } from '@/lib/format';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { TrendingUp, Wallet, ShoppingBag, Coins, RefreshCcw, Info, PackageSearch, Warehouse } from 'lucide-react';

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

function GroupTable({ rows, label, render }: {
  rows: { key: string; pieces: number; revenue: number; profit: number; costKnown: boolean }[];
  label: string;
  render?: (key: string) => React.ReactNode;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">No sales in this period.</p>;
  const max = rows[0].revenue || 1;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">Pieces</TableHead>
          <TableHead className="text-right">Sales</TableHead>
          <TableHead className="text-right">Profit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 15).map(r => (
          <TableRow key={r.key}>
            <TableCell className="min-w-[140px]">
              <div className="font-medium">{render ? render(r.key) : r.key}</div>
              <div className="h-1.5 mt-1 rounded-full bg-primary/15 overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.revenue / max) * 100}%` }} />
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.pieces}</TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">{formatRWF(r.revenue)}</TableCell>
            <TableCell className="text-right tabular-nums whitespace-nowrap">
              {formatRWF(r.profit)}{!r.costKnown && <span className="text-muted-foreground" title="Some pieces have no cost price">*</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SalesProfitReport({ from, to }: { from: string; to: string }) {
  const { data: r, isLoading } = useSalesReport(from, to);
  const { items } = useStockItems();
  const { hexOf } = useShopColors();

  const stock = useMemo(() => {
    const variants = items.flatMap(i => i.variants);
    const pieces = variants.reduce((s, v) => s + v.quantity, 0);
    return {
      pieces,
      cost: variants.reduce((s, v) => s + v.quantity * (v.cost_price ?? 0), 0),
      value: variants.reduce((s, v) => s + v.quantity * (v.default_price ?? 0), 0),
      noCost: variants.filter(v => v.quantity > 0 && v.cost_price === null).reduce((s, v) => s + v.quantity, 0),
    };
  }, [items]);

  const slowMovers = useMemo(() => {
    const sold = new Set(r?.byItem.map(g => g.key) ?? []);
    return items.filter(i => i.quantity > 0 && !sold.has(i.name)).sort((a, b) => b.quantity - a.quantity);
  }, [items, r]);

  const period = periodLabel({ from, to });

  const exportCSV = () => {
    if (!r) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let csv = 'Date,Item,Size,Colour,Category,Set,Pieces,Price each (FRW),Cost each (FRW),Sales (FRW),Profit (FRW)\n';
    r.lines.forEach(l => {
      csv += [format(new Date(l.sold_at), 'yyyy-MM-dd HH:mm'), l.item_name, l.size, l.color, l.category_name, l.set_name, l.quantity,
        l.unit_price, l.unit_cost ?? '', l.quantity * l.unit_price, l.unit_cost === null ? '' : l.quantity * (l.unit_price - l.unit_cost)].map(esc).join(',') + '\n';
    });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `sales-${from}-to-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!r) return;
    const group = (rows: typeof r.byItem) => rows.slice(0, 25).map(g => [g.key, g.pieces, formatRWF(g.revenue), formatRWF(g.profit) + (g.costKnown ? '' : '*')]);
    downloadPDF(`sales-profit-${from}-to-${to}.pdf`, 'Sales & Profit Report', `Period: ${period}`, [
      {
        title: 'Summary', head: ['', 'Amount'], body: [
          ['Sales', formatRWF(r.revenue)], ['Number of sales', r.salesCount], ['Pieces sold', r.pieces],
          ['Profit (where cost is known)', formatRWF(r.profit)], ['Margin', pct(r.profit, r.revenueWithCost)],
          ['Money received', formatRWF(r.received)], ...r.receivedByMethod.map(m => [`   ${m.method}`, formatRWF(m.amount)]),
          ['Sold on credit', formatRWF(r.creditGiven)], ['Cancelled sales (not counted)', r.cancelled],
        ],
      },
      {
        title: 'Sales by day', head: ['Day', 'Sales', 'Amount', 'Profit'], totals: true,
        body: [...r.byDay.filter(x => x.sales > 0).map(x => [format(new Date(`${x.day}T00:00:00`), 'EEE dd MMM'), x.sales, formatRWF(x.revenue), formatRWF(x.profit)]),
          ['Total', r.salesCount, formatRWF(r.revenue), formatRWF(r.profit)]],
      },
      { title: 'Best-selling items', head: ['Item', 'Pieces', 'Sales', 'Profit'], body: group(r.byItem) },
      { title: 'By category', head: ['Category', 'Pieces', 'Sales', 'Profit'], body: group(r.byCategory) },
      { title: 'By size', head: ['Size', 'Pieces', 'Sales', 'Profit'], body: group(r.bySize) },
      { title: 'By colour', head: ['Colour', 'Pieces', 'Sales', 'Profit'], body: group(r.byColor) },
    ], '* some pieces have no cost price, so their profit is not counted');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><ExportButtons onCSV={exportCSV} onPDF={exportPDF} disabled={!r?.lines.length} /></div>

      {isLoading || !r ? (
        <div className="flex justify-center py-16"><RefreshCcw className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Sales" value={formatRWF(r.revenue)} icon={ShoppingBag} variant="primary"
              description={`${r.salesCount} sales · ${r.pieces} pieces${r.salesCount ? ` · avg ${formatRWF(Math.round(r.revenue / r.salesCount))}` : ''}`} />
            <StatCard title="Profit" value={formatRWF(r.profit)} icon={TrendingUp} variant="success"
              description={`Margin ${pct(r.profit, r.revenueWithCost)}${r.piecesWithoutCost ? ` · ${r.piecesWithoutCost} pieces have no cost price` : ''}`} />
            <StatCard title="Money received" value={formatRWF(r.received)} icon={Wallet} variant="default"
              description="At the till + debt repayments" />
            <StatCard title="Sold on credit" value={formatRWF(r.creditGiven)} icon={Coins} variant="warning"
              description={r.cancelled ? `${r.cancelled} cancelled sale${r.cancelled > 1 ? 's' : ''} not counted` : 'Not yet paid at the time of sale'} />
          </div>

          {r.piecesWithoutCost > 0 && (
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Profit only counts pieces with a cost price (“Bought for”). Add it in Stock → Edit, or it’s filled in automatically when an order arrives.
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sales per day</CardTitle>
                <CardDescription>{period} · amounts in FRW · hover a bar for profit</CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.byDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" minTickGap={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={72} stroke="hsl(var(--muted-foreground))"
                      tickFormatter={v => new Intl.NumberFormat('en-US').format(v)} />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as SalesReportDay;
                        return (
                          <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md space-y-0.5">
                            <p className="font-semibold">{format(new Date(`${p.day}T00:00:00`), 'EEE dd MMM')}</p>
                            <p>Sales: <b>{formatRWF(p.revenue)}</b> ({p.sales})</p>
                            <p className="text-muted-foreground">Profit: {formatRWF(p.profit)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Money received by method</CardTitle>
                <CardDescription>Count your drawer / MoMo against this</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {r.receivedByMethod.length === 0 ? <p className="text-sm text-muted-foreground">Nothing received.</p> : r.receivedByMethod.map(m => (
                  <div key={m.method} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <span>{m.method}</span><span className="font-semibold tabular-nums">{formatRWF(m.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 pt-1 text-sm font-bold border-t border-border">
                  <span>Total</span><span className="tabular-nums">{formatRWF(r.received)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What sold best</CardTitle>
              <CardDescription>* some pieces have no cost price, so their profit isn’t counted</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="items">
                <TabsList className="grid w-full max-w-md grid-cols-4">
                  <TabsTrigger value="items">Items</TabsTrigger>
                  <TabsTrigger value="sizes">Sizes</TabsTrigger>
                  <TabsTrigger value="colors">Colours</TabsTrigger>
                  <TabsTrigger value="categories">Categories</TabsTrigger>
                </TabsList>
                <TabsContent value="items"><GroupTable rows={r.byItem} label="Item" /></TabsContent>
                <TabsContent value="sizes"><GroupTable rows={r.bySize} label="Size" /></TabsContent>
                <TabsContent value="colors">
                  <GroupTable rows={r.byColor} label="Colour" render={k => (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: hexOf(k) ?? '#ccc' }} />{k}
                    </span>
                  )} />
                </TabsContent>
                <TabsContent value="categories"><GroupTable rows={r.byCategory} label="Category" /></TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Warehouse className="w-4 h-4 text-primary" /> Stock in the shop now</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Pieces</span><span className="font-semibold">{stock.pieces}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">What it cost you</span><span className="font-semibold">{formatRWF(stock.cost)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Worth at usual prices</span><span className="font-semibold">{formatRWF(stock.value)}</span></div>
                <div className={cn('flex justify-between rounded-lg px-3 py-2', 'bg-green-500/10')}>
                  <span>Profit waiting on the shelves</span><span className="font-bold text-green-600">{formatRWF(Math.max(0, stock.value - stock.cost))}</span>
                </div>
                {stock.noCost > 0 && <p className="text-xs text-muted-foreground">{stock.noCost} pieces have no cost price.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><PackageSearch className="w-4 h-4 text-amber-500" /> Not selling</CardTitle>
                <CardDescription>In stock but no sales in this period — think about a discount or moving them to the front</CardDescription>
              </CardHeader>
              <CardContent>
                {slowMovers.length === 0 ? <p className="text-sm text-muted-foreground">Everything in stock sold at least once. 👏</p> : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {slowMovers.slice(0, 20).map(i => (
                      <div key={i.id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{i.name}</span>
                        <span className="text-muted-foreground shrink-0">{i.quantity} pieces</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

type SalesReportDay = { day: string; label: string; revenue: number; profit: number; sales: number };
