import { useQuery } from '@tanstack/react-query';
import { eachDayOfInterval, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

const bounds = (from: string, to: string) => ({
  start: new Date(`${from}T00:00:00`).toISOString(),
  end: new Date(`${to}T23:59:59.999`).toISOString(),
});

export const METHODS = ['cash', 'mobile_money', 'bank', 'other'] as const;
export const METHOD_LABEL: Record<string, string> = { cash: 'Cash', mobile_money: 'Mobile Money', bank: 'Bank', other: 'Other' };

export interface CashDay {
  day: string;
  sales: number;
  count: number;
  /** paid at the till when the sale was made */
  paidAtTill: number;
  /** part of the day's sales not paid (became debts) */
  onCredit: number;
  /** old debts paid back that day */
  repayments: number;
  /** till + repayments, split by method */
  moneyIn: Record<string, number>;
  totalIn: number;
}

/** Cash vs credit per day: what was sold, what was paid, what went on credit, what came back. */
export function useCashReport(from: string, to: string) {
  return useQuery<{ days: CashDay[]; total: CashDay }>({
    queryKey: ['sales', 'cash-report', from, to],
    enabled: !!from && !!to && from <= to,
    queryFn: async () => {
      const { start, end } = bounds(from, to);
      const [{ data: sales, error }, { data: pays, error: payError }] = await Promise.all([
        supabase.from('sales').select('sold_at, total, amount_paid, payment_method').gte('sold_at', start).lte('sold_at', end).is('voided_at', null),
        // cancelled sales' debts (and their payments) are deleted, so nothing to exclude here
        supabase.from('debt_payments').select('paid_at, amount, method').eq('is_initial', false).gte('paid_at', start).lte('paid_at', end),
      ]);
      if (error) throw error;
      if (payError) throw payError;

      const blank = (day: string): CashDay => ({
        day, sales: 0, count: 0, paidAtTill: 0, onCredit: 0, repayments: 0,
        moneyIn: Object.fromEntries(METHODS.map(m => [m, 0])), totalIn: 0,
      });
      const days = new Map(eachDayOfInterval({ start: new Date(`${from}T00:00:00`), end: new Date(`${to}T00:00:00`) })
        .map(d => [format(d, 'yyyy-MM-dd'), blank(format(d, 'yyyy-MM-dd'))]));
      const dayOf = (iso: string) => days.get(format(new Date(iso), 'yyyy-MM-dd'));

      sales.forEach(s => {
        const d = dayOf(s.sold_at); if (!d) return;
        const total = Number(s.total), paid = Number(s.amount_paid);
        d.sales += total; d.count++; d.paidAtTill += paid; d.onCredit += total - paid;
        d.moneyIn[s.payment_method] = (d.moneyIn[s.payment_method] ?? 0) + paid;
        d.totalIn += paid;
      });
      pays.forEach(p => {
        const d = dayOf(p.paid_at); if (!d) return;
        const amount = Number(p.amount);
        d.repayments += amount;
        d.moneyIn[p.method] = (d.moneyIn[p.method] ?? 0) + amount;
        d.totalIn += amount;
      });

      const list = [...days.values()];
      const total = list.reduce((t, d) => {
        t.sales += d.sales; t.count += d.count; t.paidAtTill += d.paidAtTill; t.onCredit += d.onCredit;
        t.repayments += d.repayments; t.totalIn += d.totalIn;
        METHODS.forEach(m => { t.moneyIn[m] += d.moneyIn[m] ?? 0; });
        return t;
      }, blank('Total'));
      return { days: list, total };
    },
  });
}

/** Sales totals for sales that came from temporary stock (to value the "bought" outcomes) */
export function useTempStockSales(saleIds: string[]) {
  return useQuery<Record<string, number>>({
    queryKey: ['sales', 'temp-stock-sales', saleIds.slice().sort().join(',')],
    enabled: saleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('sales').select('id, total, voided_at').in('id', saleIds);
      if (error) throw error;
      return Object.fromEntries(data.filter(s => !s.voided_at).map(s => [s.id, Number(s.total)]));
    },
  });
}
