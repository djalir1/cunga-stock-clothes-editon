import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/format';
import { channelName } from '@/lib/realtime';

export type OrderStatus = 'ordered' | 'in_transit' | 'partial' | 'received' | 'cancelled';

export const ORDER_STATUS: Record<OrderStatus, { label: string; className: string }> = {
  ordered: { label: 'Ordered', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  in_transit: { label: 'On the way', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  partial: { label: 'Part arrived', className: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
  received: { label: 'Arrived', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
};

export interface OrderLine {
  id: string;
  item_id: string | null;
  item_name: string;
  size: string | null;
  color: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number | null;
}

export interface PurchaseOrder {
  id: string;
  po_no: number;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  status: OrderStatus;
  ordered_on: string;
  expected_on: string | null;
  received_on: string | null;
  transport: string | null;
  tracking_ref: string | null;
  shipping_cost: number;
  amount_paid: number;
  notes: string | null;
  lines: OrderLine[];
  /** goods + shipping */
  total: number;
  pieces: number;
  piecesReceived: number;
}

export interface Supplier { id: string; name: string; phone: string | null; location: string | null }

export interface NewOrder {
  supplier: { id: string | null; name: string; phone: string } | null;
  lines: { item_id: string; size: string; color: string; quantity: number; unit_cost: number | null }[];
  expected_on: string | null;
  status: 'ordered' | 'in_transit';
  transport: string;
  tracking_ref: string;
  shipping_cost: number;
  amount_paid: number;
  notes: string;
}

const today = () => new Date().toISOString().slice(0, 10);
export const isLate = (o: Pick<PurchaseOrder, 'status' | 'expected_on'>) =>
  ['ordered', 'in_transit', 'partial'].includes(o.status) && !!o.expected_on && o.expected_on < today();

export function usePurchaseOrders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel(channelName('orders-changes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_order_lines' }, () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const orders = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(phone), purchase_order_lines(id, item_id, item_name, size, color, quantity_ordered, quantity_received, unit_cost)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(({ purchase_order_lines, suppliers, ...o }) => {
        const lines = purchase_order_lines.map(l => ({ ...l, unit_cost: l.unit_cost === null ? null : Number(l.unit_cost) }));
        const goods = lines.reduce((s, l) => s + l.quantity_ordered * (l.unit_cost ?? 0), 0);
        const supplier = Array.isArray(suppliers) ? suppliers[0] : suppliers;
        return {
          ...o,
          status: o.status as OrderStatus,
          supplier_phone: supplier?.phone ?? null,
          shipping_cost: Number(o.shipping_cost),
          amount_paid: Number(o.amount_paid),
          lines,
          total: goods + Number(o.shipping_cost),
          pieces: lines.reduce((s, l) => s + l.quantity_ordered, 0),
          piecesReceived: lines.reduce((s, l) => s + l.quantity_received, 0),
        };
      });
    },
  });

  const suppliers = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id, name, phone, location').order('name');
      if (error) throw error;
      return data;
    },
  });

  const refresh = (...keys: string[]) => ['purchase-orders', 'suppliers', ...keys].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  const failed = (title: string) => (e: Error) => toast({ title, description: friendlyError(e), variant: 'destructive' });

  const createOrder = useMutation({
    mutationFn: async (o: NewOrder) => {
      const { data, error } = await supabase.rpc('create_purchase_order', {
        p_lines: o.lines.map(l => ({ item_id: l.item_id, size: l.size || null, color: l.color || null, quantity: l.quantity, unit_cost: l.unit_cost })),
        p_supplier_id: o.supplier?.id ?? undefined,
        p_supplier_name: o.supplier?.name || undefined,
        p_supplier_phone: o.supplier?.phone || undefined,
        p_expected_on: o.expected_on ?? undefined,
        p_transport: o.transport || undefined,
        p_tracking_ref: o.tracking_ref || undefined,
        p_shipping_cost: o.shipping_cost,
        p_amount_paid: o.amount_paid,
        p_notes: o.notes || undefined,
        p_status: o.status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { refresh(); toast({ title: 'Order saved', description: 'You can follow it under Orders until it arrives.' }); },
    onError: failed('Order not saved'),
  });

  const receive = useMutation({
    mutationFn: async ({ orderId, lines }: { orderId: string; lines: { line_id: string; quantity: number }[] }) => {
      const { data, error } = await supabase.rpc('receive_purchase_order', { p_po_id: orderId, p_lines: lines });
      if (error) throw error;
      return data;
    },
    onSuccess: status => {
      refresh('stock-items', 'stock-movements', 'dashboard-stats');
      toast({
        title: status === 'received' ? 'Everything checked in' : 'Checked in',
        description: status === 'received' ? 'The pieces are now in stock.' : 'The rest of the order is still expected.',
      });
    },
    onError: failed('Not checked in'),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; status?: OrderStatus; amount_paid?: number; expected_on?: string | null; tracking_ref?: string | null; transport?: string | null }) => {
      const { error } = await supabase.from('purchase_orders').update(fields).eq('id', id);
      if (error) throw error;
      return fields;
    },
    onSuccess: fields => {
      refresh();
      toast({ title: fields.status === 'cancelled' ? 'Order cancelled' : fields.status === 'in_transit' ? 'Marked as on the way' : 'Order updated' });
    },
    onError: failed('Not saved'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast({ title: 'Order deleted' }); },
    onError: failed('Not deleted'),
  });

  return {
    orders: orders.data ?? [],
    suppliers: suppliers.data ?? [],
    isLoading: orders.isLoading,
    createOrder, receive, update, remove,
  };
}
