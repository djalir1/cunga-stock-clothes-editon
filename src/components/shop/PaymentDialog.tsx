import { useEffect, useState } from 'react';
import { useDebts } from '@/hooks/useDebts';
import { PAYMENT_METHODS, type PaymentMethod } from '@/hooks/useSales';
import { formatRWF } from '@/lib/format';
import { FormDialog } from './FormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';
import { MoneyInput } from './MoneyInput';

export interface PaymentTarget {
  customerId: string;
  customerName: string;
  /** Total the customer owes */
  owes: number;
  /** Pay one specific debt instead of the oldest first */
  debtId?: string;
  debtBalance?: number;
}

/** Customer pays back money they owe — all of it or part. */
export function PaymentDialog({ target, onClose }: { target: PaymentTarget | null; onClose: () => void }) {
  const { payCustomer, payDebt } = useDebts();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');

  const max = target ? target.debtBalance ?? target.owes : 0;
  const value = Number(amount) || 0;
  const tooMuch = value > max;
  const pending = payCustomer.isPending || payDebt.isPending;

  useEffect(() => {
    if (target) { setAmount(''); setMethod('cash'); setNote(''); }
  }, [target]);

  const save = async () => {
    if (!target || value <= 0 || tooMuch) return;
    if (target.debtId) await payDebt.mutateAsync({ debtId: target.debtId, amount: value, method, note });
    else await payCustomer.mutateAsync({ customerId: target.customerId, amount: value, method, note });
    onClose();
  };

  return (
    <FormDialog
      open={!!target}
      onOpenChange={o => !o && onClose()}
      title="Record Payment"
      description={target && <><b className="text-foreground">{target.customerName}</b> owes {formatRWF(max)}{target.debtId ? ' on this sale' : ''}.</>}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={save} disabled={value <= 0 || tooMuch || pending}>
            <CheckCircle2 className="w-4 h-4" /> {pending ? 'Saving…' : `Record ${value > 0 ? formatRWF(value) : 'payment'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label>How much did they pay?</Label>
        <MoneyInput autoFocus placeholder="0" className="h-12 text-lg font-semibold" value={amount} onChange={setAmount} />
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant={value === max ? 'default' : 'outline'} className="h-8" onClick={() => setAmount(String(max))}>
            Everything · {formatRWF(max)}
          </Button>
          {max >= 2000 && (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setAmount(String(Math.round(max / 2)))}>Half</Button>
          )}
        </div>
        {tooMuch && <p className="text-sm text-destructive">That's more than they owe ({formatRWF(max)}).</p>}
        {value > 0 && !tooMuch && (
          <p className="text-sm text-muted-foreground">
            {value === max ? 'This clears everything.' : <>They will still owe <b>{formatRWF(max - value)}</b>.</>}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Paid with</Label>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_METHODS.map(m => (
            <Button key={m.value} type="button" size="sm" className="h-9" variant={method === m.value ? 'default' : 'outline'} onClick={() => setMethod(m.value)}>
              {m.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Note <span className="text-muted-foreground font-normal">optional</span></Label>
        <Input placeholder="e.g. MoMo ref 1234" value={note} onChange={e => setNote(e.target.value)} />
      </div>
      {!target?.debtId && (
        <p className="text-xs text-muted-foreground">If they owe on several sales, the oldest is paid first.</p>
      )}
    </FormDialog>
  );
}
