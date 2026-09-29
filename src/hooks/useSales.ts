import { useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ReceiptSale } from '@/lib/receipt';
import { formatRWF, friendlyError } from '@/lib/format';
import { channelName } from '@/lib/realtime';

export type { PaymentMethod } from '@/lib/money';
import type { PaymentMethod } from '@/lib/money';

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
  voided_at: string | null;
  void_reason: string | null;
  created_by: string | null;
}

export interface NewSale {
  lines: { variant_id: string; quantity: number; unit_price: number; set_name?: string }[];
  customer?: { id: string | null; name: string; phone: string } | null;
  /** undefined = paid in full */
  amountPaid?: number;
  dueDate?: string;
  /** How it was paid: parts in FRW / USD / EUR (see lib/money partsPayload) */
  payments: { method: PaymentMethod; currency: string; amount: number; rate: number }[];
}

const SALE_SELECT = `
  id, receipt_no, sold_at, customer_id, customer_name, total, amount_paid, payment_status, payment_method, payments, change_given, source, voided_at, void_reason, created_by,
  sale_items(item_name, size, color, quantity, unit_price, set_name),
  debts(id, due_date)
`;

/** sales → debts is one-to-one (sale_id is unique), so PostgREST returns an object or null, not a list */
type DebtRef = { id: string; due_date: string | null } | { id: string; due_date: string | null }[] | null;
const dueDateOf = (debts: DebtRef) => (Array.isArray(debts) ? debts[0]?.due_date : debts?.due_date) ?? null;

export function useSales(limit = 30) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel(channelName('sales-changes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['customers'] });
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
        due_date: dueDateOf(s.debts as DebtRef),
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
        p_due_date: sale.dueDate || null,
        p_payments: sale.payments,
        p_source: 'pos',
      });
      if (error) throw error;

      const { data, error: fetchError } = await supabase.from('sales').select(SALE_SELECT).eq('id', saleId).single();
      if (fetchError) throw fetchError;
      return { ...data, lines: data.sale_items, due_date: dueDateOf(data.debts as DebtRef) } as SaleWithLines;
    },
    onSuccess: () => {
      ['sales', 'stock-items', 'stock-movements', 'dashboard-stats', 'customers', 'debts'].forEach(key =>
        queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (e: Error) => toast({ title: 'Sale not saved', description: friendlyError(e), variant: 'destructive' }),
  });

  /** Owner only: cancels a sale, puts the pieces back in stock and removes its debt */
  const voidSale = useMutation({
    mutationFn: async ({ saleId, reason }: { saleId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('void_sale', { p_sale_id: saleId, p_reason: reason });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: refund => {
      ['sales', 'stock-items', 'stock-movements', 'dashboard-stats', 'customers', 'debts'].forEach(key =>
        queryClient.invalidateQueries({ queryKey: [key] }));
      toast({
        title: 'Sale cancelled',
        description: refund > 0 ? `Pieces are back in stock. Give the customer back ${formatRWF(refund)}.` : 'Pieces are back in stock.',
      });
    },
    onError: (e: Error) => toast({ title: 'Not cancelled', description: friendlyError(e), variant: 'destructive' }),
  });

  /** One sale with its lines, e.g. to open the receipt from a notification */
  const fetchSale = useCallback(async (id: string): Promise<SaleWithLines | null> => {
    const { data, error } = await supabase.from('sales').select(SALE_SELECT).eq('id', id).maybeSingle();
    if (error || !data) return null;
    return { ...data, lines: data.sale_items, due_date: dueDateOf(data.debts as DebtRef) } as SaleWithLines;
  }, []);

  return { recentSales: recent.data ?? [], isLoading: recent.isLoading, recordSale, voidSale, fetchSale };
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
        supabase.from('sales').select('total, amount_paid, sale_items(quantity)').gte('sold_at', start.toISOString()).is('voided_at', null),
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
