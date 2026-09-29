import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { eachDayOfInterval, format } from 'date-fns';

export interface ReportLine {
  sold_at: string;
  item_name: string;
  size: string | null;
  color: string | null;
  category_name: string | null;
  set_name: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number | null;
}

interface Group { key: string; pieces: number; revenue: number; profit: number; costKnown: boolean }

export interface SalesReport {
  revenue: number;
  salesCount: number;
  pieces: number;
  /** price − cost, only for pieces whose cost is known */
  profit: number;
  revenueWithCost: number;
  piecesWithoutCost: number;
  /** money actually received in the period: at the counter + debt repayments */
  received: number;
  receivedByMethod: { method: string; amount: number }[];
  creditGiven: number;
  cancelled: number;
  byDay: { day: string; label: string; revenue: number; profit: number; sales: number }[];
  byItem: Group[];
  bySize: Group[];
  byColor: Group[];
  byCategory: Group[];
  lines: ReportLine[];
}

const METHOD: Record<string, string> = { cash: 'Cash', mobile_money: 'Mobile Money', bank: 'Bank', other: 'Other' };

function groupBy(lines: ReportLine[], keyOf: (l: ReportLine) => string | null): Group[] {
  const map = new Map<string, Group>();
  lines.forEach(l => {
    const key = keyOf(l);
    if (!key) return;
    const g = map.get(key) ?? { key, pieces: 0, revenue: 0, profit: 0, costKnown: true };
    g.pieces += l.quantity;
    g.revenue += l.quantity * l.unit_price;
    if (l.unit_cost === null) g.costKnown = false;
    else g.profit += l.quantity * (l.unit_price - l.unit_cost);
    map.set(key, g);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Everything the Sales & Profit report shows, for [from, to] (inclusive dates, yyyy-MM-dd). */
export function useSalesReport(from: string, to: string) {
  return useQuery<SalesReport>({
    queryKey: ['sales', 'report', from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: async () => {
      const start = new Date(`${from}T00:00:00`).toISOString();
      const end = new Date(`${to}T23:59:59.999`).toISOString();

      const [{ data: sales, error }, { data: repayments, error: payError }, { count: cancelled, error: voidError }] = await Promise.all([
        supabase.from('sales')
          .select('id, sold_at, total, amount_paid, payment_method, sale_items(item_name, size, color, category_name, set_name, quantity, unit_price, unit_cost)')
          .gte('sold_at', start).lte('sold_at', end).is('voided_at', null),
        supabase.from('debt_payments').select('amount, method').eq('is_initial', false).gte('paid_at', start).lte('paid_at', end),
        supabase.from('sales').select('id', { count: 'exact', head: true }).gte('sold_at', start).lte('sold_at', end).not('voided_at', 'is', null),
      ]);
      if (error) throw error;
      if (payError) throw payError;
      if (voidError) throw voidError;

      const lines: ReportLine[] = sales.flatMap(s => s.sale_items.map(l => ({
        ...l,
        sold_at: s.sold_at,
        unit_price: Number(l.unit_price),
        unit_cost: l.unit_cost === null ? null : Number(l.unit_cost),
      })));

      const withCost = lines.filter(l => l.unit_cost !== null);
      const methods = new Map<string, number>();
      sales.forEach(s => methods.set(s.payment_method, (methods.get(s.payment_method) ?? 0) + Number(s.amount_paid)));
      repayments.forEach(p => methods.set(p.method, (methods.get(p.method) ?? 0) + Number(p.amount)));

      const days = eachDayOfInterval({ start: new Date(`${from}T00:00:00`), end: new Date(`${to}T00:00:00`) });
      const dayMap = new Map(days.map(d => [format(d, 'yyyy-MM-dd'), { revenue: 0, profit: 0, sales: 0 }]));
      sales.forEach(s => {
        const d = dayMap.get(format(new Date(s.sold_at), 'yyyy-MM-dd'));
        if (d) { d.revenue += Number(s.total); d.sales++; }
      });
      withCost.forEach(l => {
        const d = dayMap.get(format(new Date(l.sold_at), 'yyyy-MM-dd'));
        if (d) d.profit += l.quantity * (l.unit_price - l.unit_cost!);
      });

      const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
      const paidAtCounter = sales.reduce((s, x) => s + Number(x.amount_paid), 0);

      return {
        revenue,
        salesCount: sales.length,
        pieces: lines.reduce((s, l) => s + l.quantity, 0),
        profit: withCost.reduce((s, l) => s + l.quantity * (l.unit_price - l.unit_cost!), 0),
        revenueWithCost: withCost.reduce((s, l) => s + l.quantity * l.unit_price, 0),
        piecesWithoutCost: lines.filter(l => l.unit_cost === null).reduce((s, l) => s + l.quantity, 0),
        received: [...methods.values()].reduce((s, n) => s + n, 0),
        receivedByMethod: [...methods.entries()].map(([m, amount]) => ({ method: METHOD[m] ?? m, amount })).sort((a, b) => b.amount - a.amount),
        creditGiven: revenue - paidAtCounter,
        cancelled: cancelled ?? 0,
        byDay: [...dayMap.entries()].map(([day, v]) => ({ day, label: format(new Date(`${day}T00:00:00`), days.length > 31 ? 'MMM d' : 'EEE d'), ...v })),
        byItem: groupBy(lines, l => l.item_name),
        bySize: groupBy(lines, l => l.size),
        byColor: groupBy(lines, l => l.color),
        byCategory: groupBy(lines, l => l.category_name ?? 'No category'),
        lines,
      };
    },
  });
}
