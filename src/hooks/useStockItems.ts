import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StockItem, StockStatus, Category, StockVariant } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { friendlyError } from '@/lib/format';
import { channelName } from '@/lib/realtime';

export interface StockItemWithCategory extends Omit<StockItem, 'category'> {
  category: Category | null;
  variants: StockVariant[];
}

export interface NewVariantInput {
  size?: string;
  color?: string;
  quantity: number;
  default_price?: number | null;
  cost_price?: number | null;
}

// All quantity changes go through database functions that lock the variant row,
// so two people can never sell or restock from a stale number.
export function useStockItems() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(channelName('stock-items-changes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ['stock-items'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_variants' }, () => {
        queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: items = [], isLoading, error } = useQuery<StockItemWithCategory[]>({
    queryKey: ['stock-items'],
    queryFn: async () => {
      const [{ data: stockItems, error: itemsError }, { data: variants, error: variantsError }, { data: categories, error: catError }] =
        await Promise.all([
          supabase
            .from('stock_items')
            .select(`
              id, name, category_id, quantity, min_quantity, status, person_responsible, notes,
              created_by, created_at, updated_at, total_added, issued, image_url
            `)
            .order('created_at', { ascending: false }),
          supabase
            .from('stock_variants')
            .select('id, item_id, size, color, quantity, total_added, sold, default_price, cost_price')
            .order('size', { nullsFirst: true })
            .order('color', { nullsFirst: true }),
          supabase.from('categories').select('*'),
        ]);

      if (itemsError) throw itemsError;
      if (variantsError) throw variantsError;
      if (catError) throw catError;

      const categoryMap = new Map(categories.map(c => [c.id, c as Category]));
      const variantsByItem = new Map<string, StockVariant[]>();
      variants.forEach(v => {
        const list = variantsByItem.get(v.item_id) ?? [];
        list.push(v);
        variantsByItem.set(v.item_id, list);
      });

      return stockItems.map(item => ({
        ...item,
        status: item.status as StockStatus,
        category: item.category_id ? categoryMap.get(item.category_id) ?? null : null,
        variants: variantsByItem.get(item.id) ?? [],
      }));
    },
  });

  const invalidateStock = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-items'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
  };

  const onError = (fallback: string) => (error: Error) => {
    toast({ title: 'Error', description: friendlyError(error, fallback), variant: 'destructive' });
  };

  const addItem = useMutation({
    mutationFn: async (item: {
      name: string;
      category_id?: string | null;
      min_quantity?: number;
      image_url?: string | null;
      variants: NewVariantInput[];
    }) => {
      const { data, error } = await supabase.rpc('create_stock_item', {
        p_name: item.name,
        p_category_id: item.category_id || null,
        p_min_quantity: item.min_quantity ?? 5,
        p_image_url: item.image_url ?? undefined,
        p_variants: item.variants.map(v => ({
          size: v.size || null,
          color: v.color || null,
          quantity: v.quantity,
          default_price: v.default_price ?? null,
          cost_price: v.cost_price ?? null,
        })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateStock();
      toast({ title: 'Success', description: 'Item added to stock.' });
    },
    onError: onError('Failed to add item.'),
  });

  const addVariant = useMutation({
    mutationFn: async ({ itemId, variant }: { itemId: string; variant: NewVariantInput }) => {
      const { error } = await supabase.rpc('add_stock_variant', {
        p_item_id: itemId,
        p_size: variant.size || null,
        p_color: variant.color || null,
        p_quantity: variant.quantity,
        p_default_price: variant.default_price ?? null,
        p_cost_price: variant.cost_price ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateStock();
      toast({ title: 'Success', description: 'Size / colour added.' });
    },
    onError: onError('Failed to add size / colour.'),
  });

  // Quick sale from the stock list. The price is always typed at the time of sale.
  const sellItem = useMutation({
    mutationFn: async ({ variantId, quantity, unitPrice, customerName }: {
      variantId: string; quantity: number; unitPrice: number; customerName?: string;
    }) => {
      const { data, error } = await supabase.rpc('record_sale', {
        p_lines: [{ variant_id: variantId, quantity, unit_price: unitPrice }],
        p_customer_name: customerName || null,
        p_source: 'stock',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateStock();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      toast({ title: 'Success', description: 'Sale recorded successfully.' });
    },
    onError: onError('Failed to record sale.'),
  });

  const restockVariant = useMutation({
    mutationFn: async ({ variantId, quantity, notes }: { variantId: string; quantity: number; notes?: string }) => {
      const { error } = await supabase.rpc('restock_variant', {
        p_variant_id: variantId,
        p_quantity: quantity,
        p_notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateStock();
      toast({ title: 'Success', description: 'Item restocked successfully.' });
    },
    onError: onError('Failed to restock item.'),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...fields }: {
      id: string;
      name?: string;
      category_id?: string | null;
      min_quantity?: number;
      image_url?: string | null;
      person_responsible?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.from('stock_items').update(fields).eq('id', id).select().single();
      if (error) throw error;

      if (user?.id) {
        await supabase.from('activity_logs').insert({
          user_id: user.id, action: 'updated', entity_type: 'stock_item', entity_id: id,
          details: JSON.parse(JSON.stringify(fields)),
        });
      }
      return data;
    },
    onSuccess: () => {
      invalidateStock();
      toast({ title: 'Success', description: 'Item updated successfully.' });
    },
    onError: onError('Failed to update item.'),
  });

  /** One price for every size and colour of the item (the usual case), or per variant */
  const setPrices = useMutation({
    mutationFn: async ({ itemId, price, cost, variantPrices }: {
      itemId: string;
      price?: number | null;
      /** cost price for every size and colour */
      cost?: number | null;
      variantPrices?: { id: string; price: number | null }[];
    }) => {
      if (price !== undefined) {
        const { error } = await supabase.from('stock_variants').update({ default_price: price }).eq('item_id', itemId);
        if (error) throw error;
      }
      if (cost !== undefined) {
        const { error } = await supabase.from('stock_variants').update({ cost_price: cost }).eq('item_id', itemId);
        if (error) throw error;
      }
      for (const v of variantPrices ?? []) {
        const { error } = await supabase.from('stock_variants').update({ default_price: v.price }).eq('id', v.id);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-items'] }),
    onError: onError('Failed to save the price.'),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stock_items').delete().eq('id', id);
      if (error) throw error;
      if (user?.id) {
        await supabase.from('activity_logs').insert({
          user_id: user.id, action: 'deleted', entity_type: 'stock_item', entity_id: id,
        });
      }
    },
    onSuccess: () => {
      invalidateStock();
      toast({ title: 'Success', description: 'Item deleted successfully.' });
    },
    onError: onError('Failed to delete item.'),
  });

  return {
    items,
    isLoading,
    error,
    addItem,
    addVariant,
    updateItem,
    setPrices,
    deleteItem,
    sellItem,
    restockVariant,
  };
}
