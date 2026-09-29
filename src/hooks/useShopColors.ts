import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { COLORS } from '@/lib/clothing';
import { friendlyError } from '@/lib/format';

export interface PaletteColor {
  name: string;
  hex: string;
  /** true for colours the shop added itself */
  saved?: boolean;
}

/** Built-in colours plus the ones the shop saved, with a name → hex lookup. */
export function useShopColors() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel('shop-colors-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_colors' }, () =>
        queryClient.invalidateQueries({ queryKey: ['shop-colors'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: saved = [] } = useQuery({
    queryKey: ['shop-colors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_colors').select('id, name, hex').order('created_at');
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const palette = useMemo<PaletteColor[]>(() => {
    const builtIn = new Set(COLORS.map(c => c.name.toLowerCase()));
    return [...COLORS, ...saved.filter(c => !builtIn.has(c.name.toLowerCase())).map(c => ({ name: c.name, hex: c.hex, saved: true }))];
  }, [saved]);

  const byName = useMemo(() => new Map(palette.map(c => [c.name.toLowerCase(), c.hex])), [palette]);
  const hexOf = useCallback((name: string | null | undefined) => (name ? byName.get(name.trim().toLowerCase()) ?? null : null), [byName]);

  const addColor = useMutation({
    mutationFn: async ({ name, hex }: { name: string; hex: string }) => {
      const clean = name.trim().replace(/\s+/g, ' ');
      const { error } = await supabase.from('shop_colors').insert({ name: clean, hex: hex.toUpperCase() });
      if (error) throw error;
      return clean;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shop-colors'] }),
    onError: (e: Error) => toast({ title: 'Colour not saved', description: friendlyError(e), variant: 'destructive' }),
  });

  return { palette, hexOf, addColor };
}
