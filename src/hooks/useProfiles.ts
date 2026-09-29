import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** user id → first name, for "ordered by Shema" style labels */
export function useStaffNames() {
  const { data } = useQuery({
    queryKey: ['staff-names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, full_name');
      if (error) throw error;
      return new Map(data.map(p => [p.user_id, p.full_name]));
    },
    staleTime: 10 * 60 * 1000,
  });
  return (userId: string | null | undefined) => (userId ? data?.get(userId) ?? 'a team member' : null);
}
