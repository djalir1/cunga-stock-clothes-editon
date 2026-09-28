import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS, type AppRole } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

const NO_ACCESS = 'none';

interface Member {
  user_id: string;
  full_name: string;
  role: AppRole | null;
}

/** Owner-only: give new accounts access and change team roles. */
export function TeamSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['team'],
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name').order('created_at'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const roleByUser = new Map(roles.map(r => [r.user_id, r.role as AppRole]));
      return profiles.map(p => ({ ...p, role: roleByUser.get(p.user_id) ?? null }));
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { error } = role === NO_ACCESS
        ? await supabase.from('user_roles').delete().eq('user_id', userId)
        : await supabase.from('user_roles').upsert({ user_id: userId, role: role as AppRole }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast.success('Access updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update access'),
  });

  const pending = members.filter(m => !m.role).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Team & Access
          {pending > 0 && (
            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">{pending} waiting</Badge>
          )}
        </CardTitle>
        <CardDescription>
          New accounts have no access until you choose a role. Storekeepers can edit; supervisors can only view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><RefreshCcw className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-[220px]">Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map(m => (
                <TableRow key={m.user_id}>
                  <TableCell className="font-medium">
                    {m.full_name}
                    {m.user_id === user?.id && <span className="text-muted-foreground font-normal"> (you)</span>}
                  </TableCell>
                  <TableCell>
                    {m.user_id === user?.id ? (
                      <Badge variant="outline">{m.role ? ROLE_LABELS[m.role] : 'No access'}</Badge>
                    ) : (
                      <Select
                        value={m.role ?? NO_ACCESS}
                        onValueChange={role => setRole.mutate({ userId: m.user_id, role })}
                        disabled={setRole.isPending}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_ACCESS}>No access (waiting)</SelectItem>
                          <SelectItem value="storekeeper">{ROLE_LABELS.storekeeper}</SelectItem>
                          <SelectItem value="admin">{ROLE_LABELS.admin}</SelectItem>
                          <SelectItem value="owner">{ROLE_LABELS.owner}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
