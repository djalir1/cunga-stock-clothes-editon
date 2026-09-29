import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/format';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  /** Last sale, or when they were added */
  last_visit: string;
  visits: number;
  total_spent: number;
  /** Unpaid balance across all their debts */
  owes: number;
}

/** Customers, most recently active first, with what they bought and what they owe. */
export function useCustomers() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('customers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, () =>
        queryClient.invalidateQueries({ queryKey: ['customers'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const [{ data: customers, error }, { data: sales, error: salesError }, { data: debts, error: debtsError }] = await Promise.all([
        supabase.from('customers').select('id, name, phone, notes, created_at').order('name'),
        supabase.from('sales').select('customer_id, sold_at, total').not('customer_id', 'is', null).is('voided_at', null),
        supabase.from('debt_balances').select('customer_id, balance').gt('balance', 0),
      ]);
      if (error) throw error;
      if (salesError) throw salesError;
      if (debtsError) throw debtsError;

      const stats = new Map<string, { last: string; visits: number; spent: number }>();
      sales.forEach(s => {
        if (!s.customer_id) return;
        const st = stats.get(s.customer_id) ?? { last: '', visits: 0, spent: 0 };
        st.visits++;
        st.spent += Number(s.total);
        if (s.sold_at > st.last) st.last = s.sold_at;
        stats.set(s.customer_id, st);
      });
      const owes = new Map<string, number>();
      debts.forEach(d => d.customer_id && owes.set(d.customer_id, (owes.get(d.customer_id) ?? 0) + Number(d.balance ?? 0)));

      return customers
        .map(c => {
          const st = stats.get(c.id);
          return {
            ...c,
            last_visit: st?.last || c.created_at,
            visits: st?.visits ?? 0,
            total_spent: st?.spent ?? 0,
            owes: owes.get(c.id) ?? 0,
          };
        })
        .sort((a, b) => b.last_visit.localeCompare(a.last_visit));
    },
  });
}

export function useCustomerMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const failed = (e: Error) => toast({ title: 'Not saved', description: friendlyError(e), variant: 'destructive' });

  const saveCustomer = useMutation({
    mutationFn: async ({ id, ...fields }: { id?: string; name: string; phone: string | null; notes: string | null }) => {
      const row = { name: fields.name.trim(), phone: fields.phone?.trim() || null, notes: fields.notes?.trim() || null };
      if (id) {
        const { error } = await supabase.from('customers').update(row).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from('customers').insert(row).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      ['customers', 'debts'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      toast({ title: 'Customer saved' });
    },
    onError: failed,
  });

  return { saveCustomer };
}

/** One customer's sales, newest first */
export function useCustomerSales(customerId: string | null) {
  return useQuery({
    queryKey: ['sales', 'customer', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales')
        .select('id, receipt_no, sold_at, total, amount_paid, payment_status, voided_at, sale_items(item_name, size, color, quantity, set_name)')
        .eq('customer_id', customerId!)
        .order('sold_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}
