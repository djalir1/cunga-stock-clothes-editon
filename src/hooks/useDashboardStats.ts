import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DashboardStats, StockItem, StockMovement, Category } from '@/lib/types';
import { useEffect } from 'react';

export function useDashboardStats() {
  const queryClient = useQueryClient();

  // Real-time subscription for dashboard updates
  useEffect(() => {
    const stockChannel = supabase
      .channel('dashboard-stock-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_items',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }
      )
      .subscribe();

    const movementChannel = supabase
      .channel('dashboard-movement-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_movements',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(movementChannel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async (): Promise<DashboardStats> => {
      // Fetch all stock items
      const { data: items, error: itemsError } = await supabase
        .from('stock_items')
        .select(`
          *,
          category:categories(*)
        `)
        .order('created_at', { ascending: false });

      if (itemsError) throw itemsError;

      // Fetch recent movements
      const { data: movements, error: movementsError } = await supabase
        .from('stock_movements')
        .select(`
          *,
          item:stock_items(name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (movementsError) throw movementsError;

      // Fetch categories
      const { data: categories, error: categoriesError } = await supabase
        .from('categories')
        .select('*');

      if (categoriesError) throw categoriesError;

      const typedItems = items as StockItem[];
      const typedCategories = categories as Category[];

      // Calculate stats
      const totalItems = typedItems.length;
      const inStock = typedItems.filter((i) => i.status === 'in_stock').length;
      const outOfStock = typedItems.filter((i) => i.status === 'out_of_stock').length;
      const lowStock = typedItems.filter((i) => i.status === 'low_stock').length;

      // Recently added (last 5)
      const recentlyAdded = typedItems.slice(0, 5);

      // Recently issued
      const recentlyIssued = (movements as StockMovement[])
        .filter((m) => m.movement_type === 'issued')
        .slice(0, 5);

      // Category breakdown
      const categoryBreakdown = typedCategories.map((cat) => ({
        name: cat.name,
        count: typedItems.filter((i) => i.category_id === cat.id).length,
        color: cat.color,
      }));

      return {
        totalItems,
        inStock,
        outOfStock,
        lowStock,
        recentlyAdded,
        recentlyIssued,
        categoryBreakdown,
      };
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
