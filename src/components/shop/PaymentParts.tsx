import { Button } from '@/components/ui/button';
import { MoneyInput } from './MoneyInput';
import { Plus, X, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRWF } from '@/lib/format';
import {
  CURRENCIES, METHOD_LABEL, currencyLabel, formatMoney, newPart,
  type Currency, type DraftPart, type PartsSummary, type PaymentMethod,
} from '@/lib/money';
import { useExchangeRates } from '@/hooks/useShopSettings';

const METHODS: PaymentMethod[] = ['cash', 'mobile_money', 'bank', 'other'];

/**
 * How the customer pays: one or more parts (e.g. 10,000 on Mobile Money + the rest in cash),
 * each in FRW (default), USD or EUR. The FRW value of foreign money is shown right away.
 */
export function PaymentParts({ parts, onChange, summary, autoRest }: {
  parts: DraftPart[];
  onChange: (parts: DraftPart[]) => void;
  summary: PartsSummary;
  /** the last empty part takes whatever is still due */
  autoRest: boolean;
}) {
  const rates = useExchangeRates();
  const update = (id: string, patch: Partial<DraftPart>) => onChange(parts.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const setCurrency = (p: DraftPart, currency: Currency) =>
    update(p.id, { currency, amount: '', rate: currency === 'RWF' ? '' : String(rates[currency] || '') });

  const addPart = () => {
    const last = parts[parts.length - 1];
    // "Part on the phone, the rest in cash": the new part is the other usual method
    onChange([...parts, newPart(last?.method === 'cash' ? 'mobile_money' : 'cash')]);
  };

  return (
    <div className="space-y-2">
      {parts.map((p, i) => {
        const isRest = i === summary.restIndex;
        const foreign = p.currency !== 'RWF';
        return (
          <div key={p.id} className="rounded-lg border border-border p-2.5 space-y-2 bg-background">
            {parts.length > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Part {i + 1}{isRest ? ' · the rest' : ''}</span>
                <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => onChange(parts.filter(x => x.id !== p.id))}>
                  <X className="w-4 h-4" /> Remove
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {METHODS.map(m => (
                <Button key={m} type="button" size="sm" className="h-8" variant={p.method === m ? 'default' : 'outline'}
                  onClick={() => update(p.id, m === 'mobile_money' && p.currency !== 'RWF'
                    ? { method: m, currency: 'RWF', amount: '', rate: '' } // Mobile Money is always FRW
                    : { method: m })}>
                  {METHOD_LABEL[m]}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              {p.method === 'mobile_money' ? (
                <span className="flex items-center rounded-md border border-border bg-muted px-2.5 text-xs font-semibold text-muted-foreground shrink-0"
                  title="Mobile Money is always in FRW">FRW only</span>
              ) : (
                <div className="flex rounded-md border-2 border-border overflow-hidden shrink-0" role="group" aria-label="Currency">
                  {CURRENCIES.map(c => (
                    <button key={c.value} type="button" onClick={() => setCurrency(p, c.value)} aria-pressed={p.currency === c.value}
                      className={cn('px-3 min-h-10 text-xs font-bold transition-colors border-r border-border last:border-r-0',
                        p.currency === c.value ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted text-foreground')}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <MoneyInput
                  currency={currencyLabel(p.currency)}
                  placeholder={isRest ? `${summary.amounts[i].toLocaleString('en-US')} (the rest)` : '0'}
                  value={p.amount}
                  onChange={amount => update(p.id, { amount })}
                />
              </div>
            </div>
            {foreign && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">1 {p.currency} =</span>
                <div className="w-28"><MoneyInput bare className="h-7 text-xs" value={p.rate} onChange={rate => update(p.id, { rate })} /></div>
                <span className="text-muted-foreground">FRW</span>
                {Number(p.rate) > 0 && summary.amounts[i] > 0 && (
                  <span className="font-semibold">
                    {formatMoney(summary.amounts[i], p.currency)} = {formatRWF(summary.frw[i])}
                  </span>
                )}
                {!(Number(p.rate) > 0) && <span className="text-destructive">Enter today's rate</span>}
              </div>
            )}
          </div>
        );
      })}
      {parts.length < 4 && (
        <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-dashed" onClick={addPart}>
          <Plus className="w-4 h-4" /> Split payment (e.g. part on Mobile Money, rest in cash)
        </Button>
      )}
      {autoRest && parts.length > 1 && summary.restIndex >= 0 && (
        <p className="text-xs text-muted-foreground">Leave one amount empty and it takes the rest of the bill.</p>
      )}
    </div>
  );
}

/** Received / change / still owed, under the parts */
export function PaymentTotals({ summary, due, dueLabel = 'Total' }: { summary: PartsSummary; due: number; dueLabel?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4 space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-muted-foreground">{dueLabel}</span>
        <span className="text-2xl font-bold">{formatRWF(due)}</span>
      </div>
      {summary.received > 0 && summary.received !== due && (
        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Received</span><span>{formatRWF(summary.received)}</span></div>
      )}
      {summary.change > 0 && (
        <div className={cn('flex justify-between text-sm font-semibold', summary.changeTooBig ? 'text-destructive' : 'text-green-700 dark:text-green-400')}>
          <span>Give back (change, in FRW cash)</span><span>{formatRWF(summary.change)}</span>
        </div>
      )}
      {summary.owes > 0 && summary.received > 0 && (
        <div className="flex justify-between text-sm font-semibold text-amber-600"><span>Still owes</span><span>{formatRWF(summary.owes)}</span></div>
      )}
    </div>
  );
}

