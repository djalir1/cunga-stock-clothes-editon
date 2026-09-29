import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/format';
import { channelName } from '@/lib/realtime';

export type CheckoutStatus = 'out' | 'returned' | 'sold';

export interface TempStockCheckout {
  id: string;
  variant_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  item_name: string;
  size: string | null;
  color: string | null;
  quantity: number;
  deposit: number | null;
  taken_date: string;
  expected_return_date: string | null;
  closed_date: string | null;
  status: CheckoutStatus;
  sale_id: string | null;
  notes: string | null;
  created_at: string;
}

// Garments taken from the main stock by a customer on approval / reserved.
// Checking out takes them off the shelf; closing puts them back or sells them.
export function useTemporaryStock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['temp-stock-checkouts'] });
    queryClient.invalidateQueries({ queryKey: ['stock-items'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };
  const onError = (e: Error) => toast({ title: 'Error', description: friendlyError(e), variant: 'destructive' });

  // Live: another phone checks something out or closes it → this list updates by itself
  useEffect(() => {
    const channel = supabase
      .channel(channelName('temp-stock-changes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'temp_stock_checkouts' }, () =>
        queryClient.invalidateQueries({ queryKey: ['temp-stock-checkouts'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: checkouts = [], isLoading } = useQuery<TempStockCheckout[]>({
    queryKey: ['temp-stock-checkouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('temp_stock_checkouts')
        .select('id, variant_id, customer_id, customer_name, customer_phone, item_name, size, color, quantity, deposit, taken_date, expected_return_date, closed_date, status, sale_id, notes, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(r => ({
        ...r,
        status: r.status as CheckoutStatus,
        deposit: r.deposit === null ? null : Number(r.deposit),
      }));
    },
  });

  const checkOut = useMutation({
    mutationFn: async (c: {
      variant_id: string;
      customer_id?: string | null;
      customer_name: string;
      customer_phone?: string;
      quantity: number;
      deposit?: number;
      taken_date: string;
      expected_return_date?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.rpc('check_out_temp', {
        p_variant_id: c.variant_id,
        p_quantity: c.quantity,
        p_customer_id: c.customer_id || null,
        p_customer_name: c.customer_name,
        p_customer_phone: c.customer_phone || null,
        p_deposit: c.deposit ?? null,
        p_taken_date: c.taken_date,
        p_expected_return_date: c.expected_return_date || null,
        p_notes: c.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ title: 'Checked out', description: 'Item recorded as out with the customer.' });
    },
    onError,
  });

  // 'returned' puts the pieces back on the shelf. 'sold' records a sale at the
  // agreed price; if less than the total is paid, the rest becomes a debt.
  const closeCheckout = useMutation({
    mutationFn: async ({ id, outcome, unitPrice, amountPaid, dueDate }: {
      id: string;
      outcome: 'returned' | 'sold';
      unitPrice?: number;
      amountPaid?: number;
      dueDate?: string;
    }) => {
      const { error } = await supabase.rpc('close_temp_checkout', {
        p_checkout_id: id,
        p_outcome: outcome,
        p_unit_price: unitPrice ?? null,
        p_amount_paid: amountPaid ?? null,
        p_due_date: dueDate || null,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { outcome }) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast(outcome === 'returned'
        ? { title: 'Returned', description: 'Item is back in stock.' }
        : { title: 'Sold', description: 'Sale recorded for the customer.' });
    },
    onError,
  });

  const deleteCheckout = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_temp_checkout', { p_checkout_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Deleted', description: 'Record deleted.' });
    },
    onError,
  });

  const today = new Date().toISOString().slice(0, 10);
  const openCheckouts = checkouts.filter(c => c.status === 'out');
  const closedCheckouts = checkouts.filter(c => c.status !== 'out');
  const overdueCheckouts = openCheckouts.filter(c => c.expected_return_date && c.expected_return_date < today);

  return {
    checkouts,
    openCheckouts,
    closedCheckouts,
    overdueCheckouts,
    isLoading,
    checkOut,
    closeCheckout,
    deleteCheckout,
  };
}
