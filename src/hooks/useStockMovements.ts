import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MovementType } from '@/lib/types';
import { useEffect } from 'react';

interface StockMovementWithDetails {
  id: string;
  item_id: string;
  movement_type: MovementType;
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  item_name: string | null;
  category_name: string | null;
  category_color: string | null;
  performer_name: string | null;
}

export function useStockMovements(itemId?: string, limit = 50) {
  const queryClient = useQueryClient();

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('stock-movements-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_movements',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['stock-movements', itemId, limit],
    queryFn: async (): Promise<StockMovementWithDetails[]> => {
      let query = supabase
        .from('stock_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (itemId) {
        query = query.eq('item_id', itemId);
      }

      const { data: movements, error } = await query;
      if (error) throw error;

      // Fetch item details
      const itemIds = [...new Set(movements.map(m => m.item_id))];
      const { data: items } = await supabase
        .from('stock_items')
        .select('id, name, category_id')
        .in('id', itemIds);

      // Fetch categories
      const categoryIds = [...new Set(items?.filter(i => i.category_id).map(i => i.category_id) || [])];
      let categoryMap: Record<string, { name: string; color: string }> = {};
      if (categoryIds.length > 0) {
        const { data: categories } = await supabase
          .from('categories')
          .select('id, name, color')
          .in('id', categoryIds as string[]);
        
        if (categories) {
          categoryMap = categories.reduce((acc, c) => {
            acc[c.id] = { name: c.name, color: c.color || '#3B82F6' };
            return acc;
          }, {} as Record<string, { name: string; color: string }>);
        }
      }

      const itemMap = items?.reduce((acc, i) => {
        acc[i.id] = { 
          name: i.name, 
          category: i.category_id ? categoryMap[i.category_id] : null 
        };
        return acc;
      }, {} as Record<string, { name: string; category: { name: string; color: string } | null }>) || {};

      // Fetch performer names
      const performerIds = [...new Set(movements.filter(m => m.performed_by).map(m => m.performed_by))];
      let performerMap: Record<string, string> = {};
      if (performerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', performerIds as string[]);
        
        if (profiles) {
          performerMap = profiles.reduce((acc, p) => {
            acc[p.user_id] = p.full_name;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      return movements.map(m => ({
        id: m.id,
        item_id: m.item_id,
        movement_type: m.movement_type as MovementType,
        quantity: m.quantity,
        previous_quantity: m.previous_quantity,
        new_quantity: m.new_quantity,
        notes: m.notes,
        performed_by: m.performed_by,
        created_at: m.created_at,
        item_name: itemMap[m.item_id]?.name || null,
        category_name: itemMap[m.item_id]?.category?.name || null,
        category_color: itemMap[m.item_id]?.category?.color || null,
        performer_name: m.performed_by ? performerMap[m.performed_by] || null : null,
      }));
    },
  });
}
