import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StockItem, StockStatus, Category } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export interface StockItemWithCategory extends Omit<StockItem, 'category'> {
  category: Category | null;
}

export function useStockItems() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('stock-items-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stock_items',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['stock-items'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: items = [], isLoading, error } = useQuery<StockItemWithCategory[]>({
    queryKey: ['stock-items'],
    queryFn: async () => {
      const { data: stockItems, error: itemsError } = await supabase
        .from('stock_items')
        .select(`
          id, name, category_id, quantity, min_quantity, status, person_responsible, notes,
          created_by, created_at, updated_at, total_added, issued
        `)
        .order('created_at', { ascending: false });

      if (itemsError) throw itemsError;

      const categoryIds = [...new Set(stockItems.filter(i => i.category_id).map(i => i.category_id))];
      let categoryMap: Record<string, Category> = {};

      if (categoryIds.length > 0) {
        const { data: categories, error: catError } = await supabase
          .from('categories')
          .select('*')
          .in('id', categoryIds as string[]);

        if (catError) throw catError;

        categoryMap = categories.reduce((acc, c) => {
          acc[c.id] = c as Category;
          return acc;
        }, {} as Record<string, Category>);
      }

      return stockItems.map(item => ({
        ...item,
        status: item.status as StockStatus,
        category: item.category_id ? categoryMap[item.category_id] || null : null,
      }));
    },
  });

  const logActivity = async (
    action: string,
    entityType: string,
    entityId: string,
    details?: Record<string, unknown>
  ) => {
    if (!user?.id) return;
    await supabase.from('activity_logs').insert({
      user_id: user.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details ? JSON.parse(JSON.stringify(details)) : null,
    });
  };

  const addItem = useMutation({
    mutationFn: async (item: {
      name: string;
      category_id?: string | null;
      quantity: number;
      min_quantity?: number;
      person_responsible?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('stock_items')
        .insert({
          name: item.name,
          category_id: item.category_id || null,
          quantity: item.quantity,
          total_added: item.quantity,
          issued: 0,
          min_quantity: item.min_quantity ?? 5,
          person_responsible: item.person_responsible || null,
          notes: item.notes || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('stock_movements').insert({
        item_id: data.id,
        movement_type: 'added',
        quantity: item.quantity,
        previous_quantity: 0,
        new_quantity: item.quantity,
        notes: 'Initial stock',
        performed_by: user?.id || null,
      });

      await logActivity('created', 'stock_item', data.id, {
        name: item.name,
        quantity: item.quantity,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'Success', description: 'Item added to stock.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message || 'Failed to add item.', variant: 'destructive' });
    },
  });

  const issueItem = useMutation({
    mutationFn: async ({ id, quantity, notes, recipient }: { id: string; quantity: number; notes?: string; recipient?: string }) => {
      const { data: current, error: fetchError } = await supabase
        .from('stock_items')
        .select('quantity, issued, total_added')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!current) throw new Error('Item not found');

      const newQuantity = current.quantity - quantity;
      if (newQuantity < 0) throw new Error('Not enough stock');

      const newIssued = (current.issued || 0) + quantity;

      const { error: updateError } = await supabase
        .from('stock_items')
        .update({
          quantity: newQuantity,
          issued: newIssued,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      await supabase.from('stock_movements').insert({
        item_id: id,
        movement_type: 'issued',
        quantity: -quantity,
        previous_quantity: current.quantity,
        new_quantity: newQuantity,
        notes: recipient ? `Issued to: ${recipient}` : (notes || null),
        performed_by: user?.id || null,
      });

      await logActivity('issued', 'stock_item', id, { quantity, recipient });

      return { quantity: newQuantity, issued: newIssued };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast({ title: 'Success', description: 'Item issued successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message || 'Failed to issue item.', variant: 'destructive' });
    },
  });

  const returnItem = useMutation({
    mutationFn: async ({ id, quantity, notes }: { id: string; quantity: number; notes?: string }) => {
      const { data: current, error: fetchError } = await supabase
        .from('stock_items')
        .select('quantity, issued, total_added')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!current) throw new Error('Item not found');

      const newQuantity = current.quantity + quantity;
      // ────────────────────────────────────────────────
      // IMPORTANT CHANGE: issued is NOT decreased anymore
      // It stays exactly the same value as before
      const newIssued = current.issued || 0;

      const newTotalAdded = (current.total_added || 0) + quantity;

      const { error: updateError } = await supabase
        .from('stock_items')
        .update({
          quantity: newQuantity,
          issued: newIssued,           // ← no change here
          total_added: newTotalAdded,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      await supabase.from('stock_movements').insert({
        item_id: id,
        movement_type: 'returned',
        quantity: quantity,
        previous_quantity: current.quantity,
        new_quantity: newQuantity,
        notes: notes || null,
        performed_by: user?.id || null,
      });

      await logActivity('returned', 'stock_item', id, { quantity, notes });

      return { quantity: newQuantity, issued: newIssued, total_added: newTotalAdded };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      toast({ title: 'Success', description: 'Item returned / restocked successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message || 'Failed to restock item.', variant: 'destructive' });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({
      id,
      name,
      category_id,
      quantity,
      min_quantity,
      person_responsible,
      notes,
    }: {
      id: string;
      name?: string;
      category_id?: string | null;
      quantity?: number;
      min_quantity?: number;
      person_responsible?: string | null;
      notes?: string | null;
    }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (category_id !== undefined) updates.category_id = category_id;
      if (quantity !== undefined) updates.quantity = quantity;
      if (min_quantity !== undefined) updates.min_quantity = min_quantity;
      if (person_responsible !== undefined) updates.person_responsible = person_responsible;
      if (notes !== undefined) updates.notes = notes;

      const { data, error } = await supabase
        .from('stock_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await logActivity('updated', 'stock_item', id, updates);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'Success', description: 'Item updated successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message || 'Failed to update item.', variant: 'destructive' });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stock_items').delete().eq('id', id);
      if (error) throw error;
      await logActivity('deleted', 'stock_item', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast({ title: 'Success', description: 'Item deleted successfully.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message || 'Failed to delete item.', variant: 'destructive' });
    },
  });

  return {
    items,
    isLoading,
    error,
    addItem,
    updateItem,
    deleteItem,
    issueItem,
    returnItem,
  };
}