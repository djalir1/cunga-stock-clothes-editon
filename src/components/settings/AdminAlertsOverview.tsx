import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { ROLE_LABELS, type AppRole } from '@/lib/types';
import { ALL_KINDS } from '@/components/pwa/SaleAlerts';
import { DEFAULT_PREFS, type NotificationPrefs } from '@/hooks/useNotificationPrefs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Code2, RefreshCcw, Smartphone, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Overview { supervisor_alerts: string[]; storekeeper_alerts: string[]; people: Person[] }

interface Person {
  user_id: string;
  name: string;
  role: AppRole;
  prefs: Partial<NotificationPrefs> | null;
  devices: { device: string | null; include_own: boolean; added: string; last_sent_at: string | null }[];
}

/**
 * Admins only: who gets phone alerts, on which devices, and which kinds
 * each person has switched on or off.
 */
export function AdminAlertsOverview() {
  const { data, isLoading, refetch, isFetching } = useQuery<Overview>({
    queryKey: ['notification-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('notification_overview');
      if (error) throw error;
      return data as unknown as Overview;
    },
  });
  const people = data?.people ?? [];
  const allowedFor: Partial<Record<AppRole, string[]>> = {
    supervisor: data?.supervisor_alerts ?? [],
    storekeeper: data?.storekeeper_alerts ?? [],
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code2 className="w-5 h-5" />
          Alerts overview
          <Badge variant="outline">Admins only</Badge>
          <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCcw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
        </CardTitle>
        <CardDescription>
          Who receives phone alerts, on which devices, and which alerts each person has turned on or off.
          The owner and admins can receive every alert; supervisors and storekeepers only the ones the owner allows their role.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6"><RefreshCcw className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          people.map(p => {
            const limit = allowedFor[p.role];
            const canReceive = !limit || limit.length > 0;
            const prefs = { ...DEFAULT_PREFS, ...(p.prefs ?? {}) };
            const kinds = limit ? ALL_KINDS.filter(k => limit.includes(k.key)) : ALL_KINDS;
            const on = kinds.filter(k => prefs[k.key]);
            return (
              <div key={p.user_id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <Badge variant="secondary">{ROLE_LABELS[p.role]}</Badge>
                  {canReceive && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {on.length} of {kinds.length} alerts on{p.prefs ? '' : ' (never changed)'}
                    </span>
                  )}
                </div>

                <div className="text-sm">
                  {p.devices.length === 0 ? (
                    <p className="text-muted-foreground flex items-center gap-1.5">
                      <Smartphone className="w-4 h-4" />
                      {canReceive ? 'No device turned on, so no alerts arrive.' : 'The owner hasn\'t allowed any alerts for this role.'}
                    </p>
                  ) : (
                    <ul className="space-y-0.5">
                      {p.devices.map((d, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                          <Smartphone className="w-4 h-4" />
                          <span className="text-foreground">{d.device ?? 'Device'}</span>
                          <span>· last alert {d.last_sent_at ? formatDistanceToNow(new Date(d.last_sent_at), { addSuffix: true }) : 'never'}</span>
                          {d.include_own && <span>· also their own actions</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {canReceive && (
                  <div className="flex flex-wrap gap-1.5">
                    {kinds.map(k => (
                      <span key={k.key} className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border',
                        prefs[k.key]
                          ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
                          : 'border-border bg-muted text-muted-foreground line-through',
                      )}>
                        {prefs[k.key] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {k.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
