/**
 * Money in the shop: everything is counted in Rwandan francs (shown as FRW).
 * A customer can pay in several parts (e.g. part Mobile Money, rest cash), and a
 * part can be in FRW (the default), USD or EUR at the shop's exchange rate.
 */
import { formatRWF } from '@/lib/format';

/** Stored as the ISO code 'RWF'; shown as "FRW" like on Rwandan receipts */
export type Currency = 'RWF' | 'USD' | 'EUR';
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'other';

export const CURRENCIES: { value: Currency; label: string; symbol: string }[] = [
  { value: 'RWF', label: 'FRW', symbol: 'FRW' },
  { value: 'USD', label: 'USD', symbol: '$' },
  { value: 'EUR', label: 'EUR', symbol: '€' },
];
export const currencyLabel = (c: string) => (c === 'RWF' || c === 'FRW' ? 'FRW' : c);

export const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', mobile_money: 'Mobile Money', bank: 'Bank', other: 'Other', split: 'Split',
};

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** "FRW 25,000", "USD 20", "EUR 9.09" */
export function formatMoney(amount: number | null | undefined, currency: string = 'RWF'): string {
  if (currency === 'RWF' || currency === 'FRW') return formatRWF(amount);
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `${currency} ${cents.format(amount)}`;
}

/** A saved payment part (sales.payments, activity log details) */
export interface SavedPart {
  method: string;
  currency: string;
  amount: number;
  rate: number;
  frw: number;
}

/** "Cash USD 20 (= FRW 29,000) + Mobile Money FRW 15,000" */
export function describeParts(parts: SavedPart[] | null | undefined): string {
  if (!parts?.length) return '';
  return parts.map(p => {
    const method = METHOD_LABEL[p.method] ?? p.method;
    return p.currency === 'RWF'
      ? `${method} ${formatRWF(Number(p.amount))}`
      : `${method} ${formatMoney(Number(p.amount), p.currency)} (= ${formatRWF(Number(p.frw))})`;
  }).join(' + ');
}

/** Money in per method for one sale: split sales count each part; change comes out of the cash */
export function moneyInByMethod(sale: { amount_paid: number | string; payment_method: string; payments?: unknown; change_given?: number | string | null }) {
  const parts = (Array.isArray(sale.payments) ? sale.payments : []) as SavedPart[];
  const out: Record<string, number> = {};
  if (!parts.length) {
    if (Number(sale.amount_paid) > 0) out[sale.payment_method] = Number(sale.amount_paid);
    return out;
  }
  parts.forEach(p => { out[p.method] = (out[p.method] ?? 0) + Number(p.frw); });
  const change = Number(sale.change_given ?? 0);
  if (change > 0) out.cash = (out.cash ?? 0) - change;
  return out;
}

// ── Payment parts being typed at the till ──

export interface DraftPart {
  id: string;
  method: PaymentMethod;
  currency: Currency;
  /** digits in the part's currency; '' = not typed */
  amount: string;
  /** FRW for 1 unit of a foreign currency, digits */
  rate: string;
}

export const newPart = (method: PaymentMethod = 'cash', currency: Currency = 'RWF', rate = ''): DraftPart =>
  ({ id: crypto.randomUUID(), method, currency, amount: '', rate });

export interface PartsSummary {
  /** amount of each part in its own currency (the auto "rest" part filled in) */
  amounts: number[];
  /** FRW value of each part */
  frw: number[];
  /** index of the part that takes "the rest", or -1 */
  restIndex: number;
  received: number;
  /** counted towards the bill (at most the bill) */
  paid: number;
  change: number;
  owes: number;
  /** change is only possible from cash */
  changeTooBig: boolean;
  missingRate: boolean;
}

/**
 * Works out the parts. With `autoRest`, the last part left empty takes whatever is
 * still due (so the default single cash FRW part = the whole bill).
 */
export function summarizeParts(parts: DraftPart[], due: number, autoRest: boolean): PartsSummary {
  const rateOf = (p: DraftPart) => (p.currency === 'RWF' ? 1 : Number(p.rate) || 0);
  let restIndex = -1;
  if (autoRest) for (let i = parts.length - 1; i >= 0; i--) if (parts[i].amount === '') { restIndex = i; break; }

  const amounts = parts.map(p => Number(p.amount) || 0);
  const frw = parts.map((p, i) => Math.round(amounts[i] * rateOf(p)));
  if (restIndex >= 0) {
    const others = frw.reduce((s, x, i) => (i === restIndex ? s : s + x), 0);
    const rest = Math.max(due - others, 0);
    const p = parts[restIndex];
    const rate = rateOf(p);
    // Foreign cash: round up to whole notes/coins; the difference is change
    amounts[restIndex] = p.currency === 'RWF' ? rest : rate > 0 ? Math.ceil(rest / rate) : 0;
    frw[restIndex] = Math.round(amounts[restIndex] * rate);
  }
  const received = frw.reduce((s, x) => s + x, 0);
  const paid = Math.min(received, due);
  const change = received - paid;
  const cash = frw.reduce((s, x, i) => (parts[i].method === 'cash' ? s + x : s), 0);
  return {
    amounts, frw, restIndex, received, paid, change, owes: due - paid,
    changeTooBig: change > cash,
    missingRate: parts.some(p => p.currency !== 'RWF' && !(Number(p.rate) > 0)),
  };
}

/** What the database functions expect (p_payments) */
export const partsPayload = (parts: DraftPart[], s: PartsSummary) =>
  parts
    .map((p, i) => ({ method: p.method, currency: p.currency, amount: s.amounts[i], rate: p.currency === 'RWF' ? 1 : Number(p.rate) }))
    .filter(p => p.amount > 0);
