import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/format';
import type { NotificationPrefs } from '@/hooks/useNotificationPrefs';

export type AlertKey = Exclude<keyof NotificationPrefs, 'debt_due_days'>;
/** Roles whose alerts the owner chooses (owner and admins can get every alert) */
export type LimitedRole = 'supervisor' | 'storekeeper';
const COLUMN = { supervisor: 'supervisor_alerts', storekeeper: 'storekeeper_alerts' } as const;

/** The alert kinds a role is allowed to receive. The owner picks them; each person switches them on or off. */
export function useRoleAlerts(role: LimitedRole) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = ['role-alerts', role];

  const query = useQuery<AlertKey[]>({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_settings').select(COLUMN[role]).eq('id', 1).maybeSingle();
      if (error) throw error;
      return ((data as Record<string, string[]> | null)?.[COLUMN[role]] ?? []) as AlertKey[];
    },
  });

  const save = useMutation({
    mutationFn: async (allowed: AlertKey[]) => {
      const { error } = await supabase.from('shop_settings').update({ [COLUMN[role]]: allowed }).eq('id', 1);
      if (error) throw error;
    },
    onMutate: allowed => queryClient.setQueryData(key, allowed),
    onError: (e: Error) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: 'Not saved', description: friendlyError(e), variant: 'destructive' });
    },
  });

  return { allowed: query.data ?? [], isLoading: query.isLoading, save };
}

export const useSupervisorAlerts = () => useRoleAlerts('supervisor');
