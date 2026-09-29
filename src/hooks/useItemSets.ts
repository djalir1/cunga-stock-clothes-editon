import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/format';

/** An outfit made of several items, e.g. "Suit" = Jacket + Trousers. Stock stays on the parts. */
export interface ItemSet {
  id: string;
  name: string;
  category_id: string | null;
  usual_price: number | null;
  notes: string | null;
  /** item ids, in display order */
  part_ids: string[];
}

export interface ItemSetInput {
  name: string;
  category_id: string | null;
  usual_price: number | null;
  part_ids: string[];
}

export function useItemSets() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel('item-sets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_sets' }, () =>
        queryClient.invalidateQueries({ queryKey: ['item-sets'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_set_parts' }, () =>
        queryClient.invalidateQueries({ queryKey: ['item-sets'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: sets = [], isLoading } = useQuery<ItemSet[]>({
    queryKey: ['item-sets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_sets')
        .select('id, name, category_id, usual_price, notes, item_set_parts(item_id, position)')
        .order('name');
      if (error) throw error;
      return data.map(({ item_set_parts, ...s }) => ({
        ...s,
        part_ids: [...item_set_parts].sort((a, b) => a.position - b.position).map(p => p.item_id),
      }));
    },
  });

  const done = (message: string) => () => {
    queryClient.invalidateQueries({ queryKey: ['item-sets'] });
    toast({ title: message });
  };
  const failed = (e: Error) => toast({ title: 'Not saved', description: friendlyError(e), variant: 'destructive' });

  const writeParts = async (setId: string, partIds: string[]) => {
    const { error: delError } = await supabase.from('item_set_parts').delete().eq('set_id', setId);
    if (delError) throw delError;
    const { error } = await supabase.from('item_set_parts')
      .insert(partIds.map((item_id, position) => ({ set_id: setId, item_id, position })));
    if (error) throw error;
  };

  const saveSet = useMutation({
    mutationFn: async ({ id, ...input }: ItemSetInput & { id?: string }) => {
      if (input.part_ids.length < 2) throw new Error('A set needs at least two items.');
      const row = { name: input.name.trim(), category_id: input.category_id, usual_price: input.usual_price };
      if (id) {
        const { error } = await supabase.from('item_sets').update(row).eq('id', id);
        if (error) throw error;
        await writeParts(id, input.part_ids);
        return id;
      }
      const { data, error } = await supabase.from('item_sets').insert(row).select('id').single();
      if (error) throw error;
      await writeParts(data.id, input.part_ids);
      return data.id;
    },
    onSuccess: done('Set saved'),
    onError: failed,
  });

  const deleteSet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('item_sets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: done('Set removed — its items are still in stock'),
    onError: failed,
  });

  return { sets, isLoading, saveSet, deleteSet };
}
