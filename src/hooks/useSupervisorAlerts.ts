import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/format';
import type { NotificationPrefs } from '@/hooks/useNotificationPrefs';

export type AlertKey = Exclude<keyof NotificationPrefs, 'debt_due_days'>;

/** The alert kinds supervisors are allowed to receive. The owner picks them; supervisors switch them on or off. */
export function useSupervisorAlerts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery<AlertKey[]>({
    queryKey: ['supervisor-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_settings').select('supervisor_alerts').eq('id', 1).maybeSingle();
      if (error) throw error;
      return (data?.supervisor_alerts ?? []) as AlertKey[];
    },
  });

  const save = useMutation({
    mutationFn: async (allowed: AlertKey[]) => {
      const { error } = await supabase.from('shop_settings').update({ supervisor_alerts: allowed }).eq('id', 1);
      if (error) throw error;
    },
    onMutate: allowed => queryClient.setQueryData(['supervisor-alerts'], allowed),
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-alerts'] });
      toast({ title: 'Not saved', description: friendlyError(e), variant: 'destructive' });
    },
  });

  return { allowed: query.data ?? [], isLoading: query.isLoading, save };
}
