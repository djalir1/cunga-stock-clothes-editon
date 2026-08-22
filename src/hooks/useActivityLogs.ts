import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

interface ActivityLogWithUser {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
}

export function useActivityLogs(limit = 20) {
  const queryClient = useQueryClient();

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('activity-logs-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['activity-logs'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['activity-logs', limit],
    queryFn: async (): Promise<ActivityLogWithUser[]> => {
      const { data: logs, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Fetch user names separately
      const userIds = [...new Set(logs.filter(l => l.user_id).map(l => l.user_id))];
      
      let userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds as string[]);
        
        if (profiles) {
          userMap = profiles.reduce((acc, p) => {
            acc[p.user_id] = p.full_name;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      return logs.map(log => ({
        ...log,
        details: log.details as Record<string, unknown> | null,
        user_name: log.user_id ? userMap[log.user_id] || null : null,
      }));
    },
  });
}
