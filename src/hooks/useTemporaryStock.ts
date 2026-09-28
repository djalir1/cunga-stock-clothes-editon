import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TempStockItem {
  id: string;
  name: string;
  description: string | null;
  size: string | null;
  color: string | null;
  total_quantity: number;
  available_quantity: number;
  created_at: string;
  updated_at: string;
}

export type CheckoutStatus = 'out' | 'returned' | 'sold';

export interface TempStockCheckout {
  id: string;
  item_id: string;
  item_name: string;
  item_size: string | null;
  item_color: string | null;
  customer_name: string;
  customer_phone: string | null;
  quantity: number;
  deposit: number | null;
  taken_date: string;
  expected_return_date: string | null;
  closed_date: string | null;
  status: CheckoutStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

async function fetchItemQuantities(itemId: string) {
  const { data, error } = await supabase
    .from('temp_stock_items')
    .select('total_quantity, available_quantity')
    .eq('id', itemId)
    .single();
  if (error) throw error;
  return data as { total_quantity: number; available_quantity: number };
}

export function useTemporaryStock() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['temp-stock-items'] });
    queryClient.invalidateQueries({ queryKey: ['temp-stock-checkouts'] });
  };
  const onError = (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' });

  const { data: items = [], isLoading: itemsLoading } = useQuery<TempStockItem[]>({
    queryKey: ['temp-stock-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('temp_stock_items')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as TempStockItem[];
    },
  });

  const { data: checkouts = [], isLoading: checkoutsLoading } = useQuery<TempStockCheckout[]>({
    queryKey: ['temp-stock-checkouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('temp_stock_checkouts')
        .select('*, temp_stock_items(name, size, color)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        deposit: r.deposit === null ? null : Number(r.deposit),
        item_name: r.temp_stock_items?.name || 'Unknown Item',
        item_size: r.temp_stock_items?.size ?? null,
        item_color: r.temp_stock_items?.color ?? null,
      })) as TempStockCheckout[];
    },
  });

  const addItem = useMutation({
    mutationFn: async (item: { name: string; description?: string; size?: string; color?: string; total_quantity: number }) => {
      const { error } = await supabase.from('temp_stock_items').insert([{
        name: item.name.trim(),
        description: item.description?.trim() || null,
        size: item.size?.trim() || null,
        color: item.color?.trim() || null,
        total_quantity: item.total_quantity,
        available_quantity: item.total_quantity,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item added', description: 'Item added to temporary stock.' });
    },
    onError,
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('temp_stock_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Deleted', description: 'Item removed.' });
    },
    onError,
  });

  const checkOut = useMutation({
    mutationFn: async (checkout: {
      item_id: string;
      customer_name: string;
      customer_phone?: string;
      quantity: number;
      deposit?: number;
      taken_date: string;
      expected_return_date?: string;
      notes?: string;
    }) => {
      const item = await fetchItemQuantities(checkout.item_id);
      if (item.available_quantity < checkout.quantity) {
        throw new Error(`Not enough stock. Only ${item.available_quantity} available.`);
      }

      const { error: checkoutErr } = await supabase.from('temp_stock_checkouts').insert([{
        item_id: checkout.item_id,
        customer_name: checkout.customer_name.trim(),
        customer_phone: checkout.customer_phone?.trim() || null,
        quantity: checkout.quantity,
        deposit: checkout.deposit ?? null,
        taken_date: checkout.taken_date,
        expected_return_date: checkout.expected_return_date || null,
        notes: checkout.notes?.trim() || null,
        status: 'out',
      }]);
      if (checkoutErr) throw checkoutErr;

      const { error: stockErr } = await supabase
        .from('temp_stock_items')
        .update({ available_quantity: item.available_quantity - checkout.quantity })
        .eq('id', checkout.item_id);
      if (stockErr) throw stockErr;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Checked out', description: 'Item recorded as out with the customer.' });
    },
    onError,
  });

  // Closes an open checkout: 'returned' puts the pieces back on the shelf,
  // 'sold' removes them from temporary stock for good.
  const closeCheckout = useMutation({
    mutationFn: async ({ id, outcome }: { id: string; outcome: 'returned' | 'sold' }) => {
      const checkout = checkouts.find(c => c.id === id);
      if (!checkout) throw new Error('Record not found.');
      if (checkout.status !== 'out') throw new Error('This record is already closed.');

      const { error: checkoutErr } = await supabase
        .from('temp_stock_checkouts')
        .update({ status: outcome, closed_date: new Date().toISOString().slice(0, 10) })
        .eq('id', id);
      if (checkoutErr) throw checkoutErr;

      const item = await fetchItemQuantities(checkout.item_id);
      const update = outcome === 'returned'
        ? { available_quantity: Math.min(item.available_quantity + checkout.quantity, item.total_quantity) }
        : { total_quantity: Math.max(item.total_quantity - checkout.quantity, item.available_quantity) };
      const { error: stockErr } = await supabase
        .from('temp_stock_items')
        .update(update)
        .eq('id', checkout.item_id);
      if (stockErr) throw stockErr;
    },
    onSuccess: (_data, { outcome }) => {
      invalidate();
      toast(outcome === 'returned'
        ? { title: 'Returned', description: 'Item is back in stock.' }
        : { title: 'Sold', description: 'Item marked as bought by the customer.' });
    },
    onError,
  });

  const deleteCheckout = useMutation({
    mutationFn: async (id: string) => {
      const checkout = checkouts.find(c => c.id === id);
      if (checkout?.status === 'out') {
        const item = await fetchItemQuantities(checkout.item_id);
        const { error: stockErr } = await supabase.from('temp_stock_items').update({
          available_quantity: Math.min(item.available_quantity + checkout.quantity, item.total_quantity),
        }).eq('id', checkout.item_id);
        if (stockErr) throw stockErr;
      }
      const { error } = await supabase.from('temp_stock_checkouts').delete().eq('id', id);
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
    items,
    checkouts,
    openCheckouts,
    closedCheckouts,
    overdueCheckouts,
    isLoading: itemsLoading || checkoutsLoading,
    addItem,
    deleteItem,
    checkOut,
    closeCheckout,
    deleteCheckout,
  };
}
