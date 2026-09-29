import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ReceiptSale } from '@/lib/receipt';

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'other';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];

export interface SaleWithLines extends ReceiptSale {
  id: string;
  customer_id: string | null;
  source: string;
}

export interface NewSale {
  lines: { variant_id: string; quantity: number; unit_price: number }[];
  customer?: { id: string | null; name: string; phone: string } | null;
  /** undefined = paid in full */
  amountPaid?: number;
  dueDate?: string;
  method: PaymentMethod;
}

const SALE_SELECT = `
  id, receipt_no, sold_at, customer_id, customer_name, total, amount_paid, payment_status, payment_method, source,
  sale_items(item_name, size, color, quantity, unit_price),
  debts(id, due_date)
`;

export function useSales(limit = 30) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel('sales-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['sales'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const recent = useQuery<SaleWithLines[]>({
    queryKey: ['sales', 'recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select(SALE_SELECT)
        .order('sold_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data.map(s => ({
        ...s,
        lines: s.sale_items,
        due_date: s.debts[0]?.due_date ?? null,
      }));
    },
  });

  const recordSale = useMutation({
    mutationFn: async (sale: NewSale) => {
      const { data: saleId, error } = await supabase.rpc('record_sale', {
        p_lines: sale.lines,
        p_customer_id: sale.customer?.id || null,
        p_customer_name: sale.customer?.name || null,
        p_customer_phone: sale.customer?.phone || null,
        p_amount_paid: sale.amountPaid ?? null,
        p_due_date: sale.dueDate || null,
        p_payment_method: sale.method,
        p_source: 'pos',
      });
      if (error) throw error;

      const { data, error: fetchError } = await supabase.from('sales').select(SALE_SELECT).eq('id', saleId).single();
      if (fetchError) throw fetchError;
      return { ...data, lines: data.sale_items, due_date: data.debts[0]?.due_date ?? null } as SaleWithLines;
    },
    onSuccess: () => {
      ['sales', 'stock-items', 'stock-movements', 'dashboard-stats', 'customers', 'debts'].forEach(key =>
        queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (e: Error) => toast({ title: 'Sale not saved', description: e.message, variant: 'destructive' }),
  });

  return { recentSales: recent.data ?? [], isLoading: recent.isLoading, recordSale };
}

export interface TodaySummary {
  revenue: number;
  cashTaken: number;
  salesCount: number;
  piecesSold: number;
  owedToShop: number;
}

/** Today's takings and what customers still owe, for the dashboard. */
export function useTodaySummary() {
  return useQuery<TodaySummary>({
    queryKey: ['sales', 'today-summary'],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [{ data: sales, error }, { data: debts, error: debtsError }] = await Promise.all([
        supabase.from('sales').select('total, amount_paid, sale_items(quantity)').gte('sold_at', start.toISOString()),
        supabase.from('debt_balances').select('balance').gt('balance', 0),
      ]);
      if (error) throw error;
      if (debtsError) throw debtsError;
      return {
        revenue: sales.reduce((s, x) => s + Number(x.total), 0),
        cashTaken: sales.reduce((s, x) => s + Number(x.amount_paid), 0),
        salesCount: sales.length,
        piecesSold: sales.reduce((s, x) => s + x.sale_items.reduce((t, l) => t + l.quantity, 0), 0),
        owedToShop: debts.reduce((s, d) => s + Number(d.balance ?? 0), 0),
      };
    },
    refetchInterval: 60000,
  });
}
