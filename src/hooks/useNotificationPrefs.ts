import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/format';

export interface NotificationPrefs {
  sales: boolean;
  sale_cancelled: boolean;
  low_stock: boolean;
  debt_due: boolean;
  debt_due_days: number;
  debt_overdue: boolean;
  orders: boolean;
  temp_stock: boolean;
  daily_summary: boolean;
  stock_changes: boolean;
  payments: boolean;
  customers: boolean;
  new_accounts: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = {
  sales: true, sale_cancelled: true, low_stock: true, debt_due: true, debt_due_days: 2,
  debt_overdue: true, orders: true, temp_stock: true, daily_summary: true,
  stock_changes: true, payments: true, customers: true, new_accounts: true,
};

/** Which phone alerts the owner / developers wants (everything is on until they change it). */
export function useNotificationPrefs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery<NotificationPrefs>({
    queryKey: ['notification-prefs', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('notification_prefs').select('*').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data ? { ...DEFAULT_PREFS, ...data } : DEFAULT_PREFS;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<NotificationPrefs>) => {
      const next = { ...(query.data ?? DEFAULT_PREFS), ...patch };
      const { error } = await supabase.from('notification_prefs').upsert({ user_id: user!.id, ...next }, { onConflict: 'user_id' });
      if (error) throw error;
      return next;
    },
    onMutate: patch => queryClient.setQueryData(['notification-prefs', user?.id], { ...(query.data ?? DEFAULT_PREFS), ...patch }),
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ['notification-prefs', user?.id] });
      toast({ title: 'Not saved', description: friendlyError(e), variant: 'destructive' });
    },
  });

  return { prefs: query.data ?? DEFAULT_PREFS, update };
}
