import { useEffect, useState } from 'react';
import { useDebts } from '@/hooks/useDebts';
import { formatRWF } from '@/lib/format';
import { newPart, partsPayload, summarizeParts, type DraftPart } from '@/lib/money';
import { FormDialog } from './FormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';
import { PaymentParts, PaymentTotals } from './PaymentParts';

export interface PaymentTarget {
  customerId: string;
  customerName: string;
  /** Total the customer owes */
  owes: number;
  /** Pay one specific debt instead of the oldest first */
  debtId?: string;
  debtBalance?: number;
}

/** Customer pays back money they owe — all of it or part, in one or more parts and currencies. */
export function PaymentDialog({ target, onClose }: { target: PaymentTarget | null; onClose: () => void }) {
  const { payCustomer, payDebt } = useDebts();
  const [parts, setParts] = useState<DraftPart[]>(() => [newPart()]);
  const [note, setNote] = useState('');

  const max = target ? target.debtBalance ?? target.owes : 0;
  const pay = summarizeParts(parts, max, false);
  const tooMuch = pay.changeTooBig;
  const pending = payCustomer.isPending || payDebt.isPending;
  const canSave = pay.received > 0 && !tooMuch && !pay.missingRate && !pending;

  useEffect(() => {
    if (target) { setParts([newPart()]); setNote(''); }
  }, [target]);

  /** Quick amounts: fill the first part in FRW */
  const fill = (amount: number) => setParts(prev => [{ ...prev[0], currency: 'RWF', rate: '', amount: String(amount) }, ...prev.slice(1)]);

  const save = async () => {
    if (!target || !canSave) return;
    const payments = partsPayload(parts, pay);
    if (target.debtId) await payDebt.mutateAsync({ debtId: target.debtId, payments, note });
    else await payCustomer.mutateAsync({ customerId: target.customerId, payments, note });
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
          <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={save} disabled={!canSave}>
            <CheckCircle2 className="w-4 h-4" /> {pending ? 'Saving…' : `Record ${pay.paid > 0 ? formatRWF(pay.paid) : 'payment'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label>How did they pay?</Label>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant={parts.length === 1 && pay.received === max ? 'default' : 'outline'} className="h-8" onClick={() => fill(max)}>
            Everything · {formatRWF(max)}
          </Button>
          {max >= 2000 && (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => fill(Math.round(max / 2))}>Half</Button>
          )}
        </div>
        <PaymentParts parts={parts} onChange={setParts} summary={pay} autoRest={false} />
        {tooMuch && <p className="text-sm text-destructive">That's more than they owe ({formatRWF(max)}). Only cash can be more — the extra is given back as change.</p>}
        {pay.received > 0 && !tooMuch && (
          <p className="text-sm text-muted-foreground">
            {pay.owes === 0 ? 'This clears everything.' : <>They will still owe <b>{formatRWF(pay.owes)}</b>.</>}
          </p>
        )}
      </div>
      {pay.received > 0 && <PaymentTotals summary={pay} due={max} dueLabel="Owed" />}
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
