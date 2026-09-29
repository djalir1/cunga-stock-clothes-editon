import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  last_visit: string;
}

/** Customers, most recently active first (last sale or when they were added). */
export function useCustomers() {
  return useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const [{ data: customers, error }, { data: sales, error: salesError }] = await Promise.all([
        supabase.from('customers').select('id, name, phone, created_at').order('name'),
        supabase.from('sales').select('customer_id, sold_at').not('customer_id', 'is', null)
          .order('sold_at', { ascending: false }).limit(500),
      ]);
      if (error) throw error;
      if (salesError) throw salesError;

      const lastSale = new Map<string, string>();
      sales.forEach(s => { if (s.customer_id && !lastSale.has(s.customer_id)) lastSale.set(s.customer_id, s.sold_at); });

      return customers
        .map(c => ({ id: c.id, name: c.name, phone: c.phone, last_visit: lastSale.get(c.id) ?? c.created_at }))
        .sort((a, b) => b.last_visit.localeCompare(a.last_visit));
    },
  });
}
