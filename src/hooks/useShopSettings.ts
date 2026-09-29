import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/format';
import { channelName } from '@/lib/realtime';
import { applyShopSettings, type ShopSettingsRow } from '@/config/shop';

/** Shop name, logo, contacts — used on receipts and reports. Only the owner can change them. */
export function useShopSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery<ShopSettingsRow>({
    queryKey: ['shop-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('shop_settings')
        .select('name, tagline, location, phone, email, tin, logo_url, receipt_footer, usd_rate, eur_rate, rates_updated_at').eq('id', 1).single();
      if (error) throw error;
      await applyShopSettings(data);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const save = useMutation({
    mutationFn: async (row: Partial<ShopSettingsRow>) => {
      const { error } = await supabase.from('shop_settings').update(row).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-settings'] });
      toast({ title: 'Shop profile saved', description: 'Receipts and reports now use these details.' });
    },
    onError: (e: Error) => toast({ title: 'Not saved', description: friendlyError(e), variant: 'destructive' }),
  });

  /** Owner: today's exchange rates */
  const saveRates = useMutation({
    mutationFn: async (rates: { usd_rate: number; eur_rate: number }) => {
      const { error } = await supabase.from('shop_settings')
        .update({ ...rates, rates_updated_at: new Date().toISOString() }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-settings'] });
      toast({ title: 'Exchange rates saved', description: 'New USD / EUR payments will use these rates.' });
    },
    onError: (e: Error) => toast({ title: 'Not saved', description: friendlyError(e), variant: 'destructive' }),
  });

  return { settings: query.data, isLoading: query.isLoading, save, saveRates };
}

/** FRW for 1 USD / 1 EUR (the owner sets them in Settings) */
export function useExchangeRates() {
  const { settings } = useShopSettings();
  return {
    USD: Number(settings?.usd_rate ?? 0) || 0,
    EUR: Number(settings?.eur_rate ?? 0) || 0,
    updatedAt: settings?.rates_updated_at ?? null,
  };
}

/** Keeps the shop profile loaded and live for the whole app. Call once, in the layout. */
export function useShopSettingsLive() {
  const queryClient = useQueryClient();
  useShopSettings();
  useEffect(() => {
    const channel = supabase
      .channel(channelName('shop-settings-changes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_settings' }, () =>
        queryClient.invalidateQueries({ queryKey: ['shop-settings'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);
}
