import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatRWF, friendlyError } from '@/lib/format';
import type { PaymentMethod } from '@/hooks/useSales';
import { channelName } from '@/lib/realtime';

export interface DebtPayment {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
  note: string | null;
  is_initial: boolean;
}

export interface Debt {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  sale_id: string | null;
  receipt_no: number | null;
  amount: number;
  paid: number;
  balance: number;
  due_date: string | null;
  created_at: string;
  payments: DebtPayment[];
}

const today = () => new Date().toISOString().slice(0, 10);
export const isOverdue = (d: Pick<Debt, 'balance' | 'due_date'>) => d.balance > 0 && !!d.due_date && d.due_date < today();

/** Every debt with its balance and payments, soonest due first. */
export function useDebts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const channel = supabase
      .channel(channelName('debts-changes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, () => queryClient.invalidateQueries({ queryKey: ['debts'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debt_payments' }, () => queryClient.invalidateQueries({ queryKey: ['debts'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const query = useQuery<Debt[]>({
    queryKey: ['debts'],
    queryFn: async () => {
      const [{ data: balances, error }, { data: payments, error: payError }, { data: sales, error: salesError }] = await Promise.all([
        supabase.from('debt_balances').select('*'),
        supabase.from('debt_payments').select('id, debt_id, amount, method, paid_at, note, is_initial').order('paid_at', { ascending: false }),
        supabase.from('sales').select('id, receipt_no').neq('payment_status', 'paid'),
      ]);
      if (error) throw error;
      if (payError) throw payError;
      if (salesError) throw salesError;

      const receiptBySale = new Map(sales.map(s => [s.id, s.receipt_no]));
      const paymentsByDebt = new Map<string, DebtPayment[]>();
      payments.forEach(({ debt_id, ...p }) => {
        const list = paymentsByDebt.get(debt_id) ?? [];
        list.push({ ...p, amount: Number(p.amount) });
        paymentsByDebt.set(debt_id, list);
      });

      return balances
        .map(d => ({
          id: d.id!,
          customer_id: d.customer_id!,
          customer_name: d.customer_name ?? 'Unknown',
          customer_phone: d.customer_phone,
          sale_id: d.sale_id,
          receipt_no: d.sale_id ? receiptBySale.get(d.sale_id) ?? null : null,
          amount: Number(d.amount ?? 0),
          paid: Number(d.paid ?? 0),
          balance: Number(d.balance ?? 0),
          due_date: d.due_date,
          created_at: d.created_at!,
          payments: paymentsByDebt.get(d.id!) ?? [],
        }))
        .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at));
    },
  });

  const invalidate = () => {
    ['debts', 'customers', 'sales'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  /** Customer pays an amount; it clears their oldest debts first */
  const payCustomer = useMutation({
    mutationFn: async (p: { customerId: string; amount: number; method: PaymentMethod; note?: string }) => {
      const { data, error } = await supabase.rpc('pay_customer_debts', {
        p_customer_id: p.customerId, p_amount: p.amount, p_method: p.method, p_note: p.note || undefined,
      });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: left => {
      invalidate();
      toast({ title: 'Payment recorded', description: left > 0 ? `Still owes ${formatRWF(left)}.` : 'All paid up. 🎉' });
    },
    onError: (e: Error) => toast({ title: 'Payment not saved', description: friendlyError(e), variant: 'destructive' }),
  });

  /** Payment towards one specific debt */
  const payDebt = useMutation({
    mutationFn: async (p: { debtId: string; amount: number; method: PaymentMethod; note?: string }) => {
      const { data, error } = await supabase.rpc('record_debt_payment', {
        p_debt_id: p.debtId, p_amount: p.amount, p_method: p.method, p_note: p.note || undefined,
      });
      if (error) throw error;
      return Number(data);
    },
    onSuccess: left => {
      invalidate();
      toast({ title: 'Payment recorded', description: left > 0 ? `${formatRWF(left)} left on this debt.` : 'This debt is fully paid.' });
    },
    onError: (e: Error) => toast({ title: 'Payment not saved', description: friendlyError(e), variant: 'destructive' }),
  });

  const changeDueDate = useMutation({
    mutationFn: async ({ debtId, dueDate }: { debtId: string; dueDate: string | null }) => {
      const { error } = await supabase.from('debts').update({ due_date: dueDate }).eq('id', debtId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast({ title: 'Due date changed' }); },
    onError: (e: Error) => toast({ title: 'Not saved', description: friendlyError(e), variant: 'destructive' }),
  });

  return { debts: query.data ?? [], isLoading: query.isLoading, payCustomer, payDebt, changeDueDate };
}

/** Rwandan numbers → international form for WhatsApp links: 0788 123 456 → 250788123456 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = `250${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('7')) digits = `250${digits}`;
  return digits.length >= 11 ? digits : null;
}

export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const n = whatsappNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
}
