import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TempStockItem {
  id: string;
  name: string;
  description: string | null;
  total_quantity: number;
  available_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface TempStockLoan {
  id: string;
  item_id: string;
  item_name: string;
  teacher_name: string;
  department: string | null;
  quantity: number;
  borrowed_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: 'borrowed' | 'returned';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useTemporaryLoans() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items = [], isLoading: itemsLoading } = useQuery<TempStockItem[]>({
    queryKey: ['temp-stock-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('temp_stock_items')
        .select('*')
        .order('name');
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
        throw error;
      }
      return (data ?? []) as TempStockItem[];
    },
  });

  const { data: loans = [], isLoading: loansLoading } = useQuery<TempStockLoan[]>({
    queryKey: ['temp-stock-loans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('temp_stock_loans')
        .select('*, temp_stock_items(name)')
        .order('created_at', { ascending: false });
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
        throw error;
      }
      return (data ?? []).map((r: any) => ({
        ...r,
        item_name: r.temp_stock_items?.name || 'Unknown Item',
      })) as TempStockLoan[];
    },
  });

  const addItem = useMutation({
    mutationFn: async (item: { name: string; description?: string; total_quantity: number }) => {
      const { error } = await supabase.from('temp_stock_items').insert([{
        name: item.name.trim(),
        description: item.description?.trim() || null,
        total_quantity: item.total_quantity,
        available_quantity: item.total_quantity,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temp-stock-items'] });
      toast({ title: 'Item added', description: 'Item added to temporary stock.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('temp_stock_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temp-stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['temp-stock-loans'] });
      toast({ title: 'Deleted', description: 'Item removed.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const lendItem = useMutation({
    mutationFn: async (loan: {
      item_id: string;
      teacher_name: string;
      department?: string;
      quantity: number;
      borrowed_date: string;
      expected_return_date?: string;
      notes?: string;
    }) => {
      const item = items.find(i => i.id === loan.item_id);
      if (!item) throw new Error('Item not found.');
      if (item.available_quantity < loan.quantity) {
        throw new Error(`Not enough stock. Only ${item.available_quantity} available.`);
      }

      const { error: loanErr } = await supabase.from('temp_stock_loans').insert([{
        item_id: loan.item_id,
        teacher_name: loan.teacher_name.trim(),
        department: loan.department?.trim() || null,
        quantity: loan.quantity,
        borrowed_date: loan.borrowed_date,
        expected_return_date: loan.expected_return_date || null,
        notes: loan.notes?.trim() || null,
        status: 'borrowed',
      }]);
      if (loanErr) throw loanErr;

      const { error: stockErr } = await supabase
        .from('temp_stock_items')
        .update({ available_quantity: item.available_quantity - loan.quantity, updated_at: new Date().toISOString() })
        .eq('id', loan.item_id);
      if (stockErr) throw stockErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temp-stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['temp-stock-loans'] });
      toast({ title: 'Item lent', description: 'Lending record created.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const returnLoan = useMutation({
    mutationFn: async (loanId: string) => {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) throw new Error('Loan not found.');

      const { error: loanErr } = await supabase
        .from('temp_stock_loans')
        .update({ status: 'returned', actual_return_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
        .eq('id', loanId);
      if (loanErr) throw loanErr;

      const item = items.find(i => i.id === loan.item_id);
      if (item) {
        const newQty = Math.min(item.available_quantity + loan.quantity, item.total_quantity);
        const { error: stockErr } = await supabase
          .from('temp_stock_items')
          .update({ available_quantity: newQty, updated_at: new Date().toISOString() })
          .eq('id', loan.item_id);
        if (stockErr) throw stockErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temp-stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['temp-stock-loans'] });
      toast({ title: 'Returned', description: 'Item marked as returned.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteLoan = useMutation({
    mutationFn: async (loanId: string) => {
      const loan = loans.find(l => l.id === loanId);
      if (loan?.status === 'borrowed') {
        const item = items.find(i => i.id === loan.item_id);
        if (item) {
          await supabase.from('temp_stock_items').update({
            available_quantity: Math.min(item.available_quantity + loan.quantity, item.total_quantity),
            updated_at: new Date().toISOString(),
          }).eq('id', loan.item_id);
        }
      }
      const { error } = await supabase.from('temp_stock_loans').delete().eq('id', loanId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['temp-stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['temp-stock-loans'] });
      toast({ title: 'Deleted', description: 'Loan record deleted.' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const today = new Date().toISOString().slice(0, 10);
  const activeLoans = loans.filter(l => l.status === 'borrowed');
  const returnedLoans = loans.filter(l => l.status === 'returned');
  const overdueLoans = activeLoans.filter(l => l.expected_return_date && l.expected_return_date < today);

  return {
    items,
    loans,
    activeLoans,
    returnedLoans,
    overdueLoans,
    isLoading: itemsLoading || loansLoading,
    addItem,
    deleteItem,
    lendItem,
    returnLoan,
    deleteLoan,
  };
}
