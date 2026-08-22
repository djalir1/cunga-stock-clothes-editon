import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { UniformItem, IssuedUniform, UniformCategory } from '@/types/uniform';
import { useToast } from '@/hooks/use-toast';

export const useUniformStore = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // --- 1. FETCH QUERIES ---
  const { data: categories = [] } = useQuery({
    queryKey: ['uniform-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('uniform_categories').select('*').order('name');
      if (error) throw error;
      return data as UniformCategory[];
    }
  });

  const { data: uniforms = [], isLoading } = useQuery({
    queryKey: ['uniform-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('uniform_items').select('*').order('name');
      if (error) throw error;
      return data.map((u: any) => ({
        id: u.id,
        name: u.name,
        category: u.category,
        totalQuantity: u.total_quantity,
        remainingQuantity: u.remaining_quantity
      })) as UniformItem[];
    }
  });

  const { data: issuedUniforms = [] } = useQuery({
    queryKey: ['uniform-issuances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('uniform_issuances')
        .select(`*, uniform_items ( name, category )`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((r: any) => ({
        id: r.id,
        studentName: r.student_name,
        uniformId: r.uniform_id,
        quantityTaken: r.quantity_taken,
        date: r.issue_date,
        created_at: r.created_at,
        uniformName: r.uniform_items?.name || 'Deleted Item',
        uniformCategory: r.uniform_items?.category || 'Uncategorized',
        sweaterNumber: r.sweater_number ?? null,
      })) as IssuedUniform[];
    }
  });

  const { data: movements = [], isLoading: isLoadingMovements } = useQuery({
    queryKey: ['uniform-movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('uniform_issuances')
        .select(`id, student_name, quantity_taken, created_at, uniform_items ( name )`)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data.map((m: any) => ({
        id: m.id,
        item_name: m.uniform_items?.name || 'Uniform Item',
        movement_type: 'issued',
        quantity: m.quantity_taken,
        created_at: m.created_at,
        performer_name: 'Admin',
        student_name: m.student_name
      }));
    }
  });

  // --- 2. MUTATIONS ---
  const addUniformMutation = useMutation({
    mutationFn: async (u: any) => {
      const { error } = await supabase.from('uniform_items').insert([{
        name: u.name,
        category: u.category, // always the category NAME from the dropdown
        total_quantity: u.totalQuantity,
        remaining_quantity: u.totalQuantity
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniform-items'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-issuances'] });
      toast({ title: "Success", description: "Uniform item added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not add uniform item.", variant: "destructive" });
    }
  });

  const updateUniformMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string, updates: Partial<UniformItem> }) => {
      const dbUpdates: any = {};
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.category) dbUpdates.category = updates.category;
      if (updates.totalQuantity !== undefined) dbUpdates.total_quantity = updates.totalQuantity;
      if (updates.remainingQuantity !== undefined) dbUpdates.remaining_quantity = updates.remainingQuantity;
      const { error } = await supabase.from('uniform_items').update(dbUpdates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniform-items'] });
      // Also refresh issuances so report categories reflect any category rename
      queryClient.invalidateQueries({ queryKey: ['uniform-issuances'] });
    }
  });

  const updateIssuedRecordMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string, updates: any }) => {
      const dbUpdates: any = {
        student_name: updates.studentName,
        quantity_taken: updates.quantityTaken,
        issue_date: updates.date,
      };
      if (updates.sweaterNumber !== undefined) {
        dbUpdates.sweater_number = updates.sweaterNumber || null;
      }
      const { error } = await supabase.from('uniform_issuances').update(dbUpdates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniform-issuances'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-items'] });
      toast({ title: "Success", description: "Record updated" });
    }
  });

  const deleteIssuedMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('uniform_issuances').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniform-issuances'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-items'] });
    }
  });

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('uniform_categories').insert([{ name }]);
      if (error) throw error;
    },
    onSuccess: () => {
      // Refresh categories so dropdown immediately shows the new category
      queryClient.invalidateQueries({ queryKey: ['uniform-categories'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-items'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-issuances'] });
      toast({ title: "Success", description: "Category added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not add category.", variant: "destructive" });
    }
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('uniform_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniform-categories'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-items'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-issuances'] });
      toast({ title: "Success", description: "Category deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not delete category.", variant: "destructive" });
    }
  });

  const deleteUniformMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('uniform_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniform-items'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-issuances'] });
      toast({ title: "Success", description: "Uniform item deleted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not delete uniform item.", variant: "destructive" });
    }
  });

  const issueUniformMutation = useMutation({
    mutationFn: async ({ name, id, qty, date, sweaterNumber }: { name: string, id: string, qty: number, date: string, sweaterNumber?: string }) => {
      const insertData: any = {
        student_name: name,
        uniform_id: id,
        quantity_taken: qty,
        issue_date: date,
      };
      if (sweaterNumber) insertData.sweater_number = sweaterNumber;
      const { error } = await supabase.from('uniform_issuances').insert([insertData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uniform-items'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-issuances'] });
      queryClient.invalidateQueries({ queryKey: ['uniform-movements'] });
    }
  });

  return {
    categories,
    uniforms,
    issuedUniforms,
    movements,
    isLoading,
    isLoadingMovements,
    onAddUniform: (u: any) => addUniformMutation.mutateAsync(u),
    onUpdateUniform: (id: string, updates: any) => updateUniformMutation.mutate({ id, updates }),
    onDeleteUniform: (id: string) => deleteUniformMutation.mutate(id),
    onAddCategory: (name: string) => addCategoryMutation.mutate(name),
    onDeleteCategory: (id: string) => deleteCategoryMutation.mutate(id),
    issueUniform: (name: string, id: string, qty: number, date: string, sweaterNumber?: string) =>
      issueUniformMutation.mutateAsync({ name, id, qty, date, sweaterNumber }),
    onUpdateIssuedRecord: (id: string, updates: any) => updateIssuedRecordMutation.mutate({ id, updates }),
    onDeleteIssuedRecord: (id: string) => deleteIssuedMutation.mutate(id),
  };
};