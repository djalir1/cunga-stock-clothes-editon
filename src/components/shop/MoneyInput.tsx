import { forwardRef, useLayoutEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const group = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const pretty = (digits: string) => (digits === '' ? '' : group.format(Number(digits)));

/**
 * Money field that shows commas while you type ("150000" → "150,000 FRW").
 * `value` / `onChange` use plain digits ("150000"), so callers keep doing Number(value).
 */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (digits: string) => void;
  /** Hide the currency label (e.g. in tight table cells) */
  bare?: boolean;
  /** Label shown inside the field; FRW unless the customer pays in another currency */
  currency?: string;
}>(({ value, onChange, className, bare = false, currency = 'FRW', ...props }, forwarded) => {
  const inner = useRef<HTMLInputElement | null>(null);
  const caretDigits = useRef<number | null>(null);

  // Keep the cursor after the same digit once commas are added or removed
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el || caretDigits.current === null || document.activeElement !== el) return;
    let seen = 0, pos = 0;
    while (pos < el.value.length && seen < caretDigits.current) {
      if (/\d/.test(el.value[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  }, [value]);

  return (
    <div className="relative">
      <Input
        {...props}
        ref={el => {
          inner.current = el;
          if (typeof forwarded === 'function') forwarded(el);
          else if (forwarded) forwarded.current = el;
        }}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={pretty(value)}
        onChange={e => {
          const raw = e.target.value;
          const caret = e.target.selectionStart ?? raw.length;
          caretDigits.current = raw.slice(0, caret).replace(/\D/g, '').length;
          const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 12);
          onChange(digits);
        }}
        className={cn('tabular-nums', !bare && 'pr-12', className)}
      />
      {!bare && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">{currency}</span>
      )}
    </div>
  );
});
MoneyInput.displayName = 'MoneyInput';
