import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useStockItems, type StockItemWithCategory } from '@/hooks/useStockItems';
import { useItemSets, type ItemSet } from '@/hooks/useItemSets';
import { useSales, type SaleWithLines } from '@/hooks/useSales';
import { METHOD_LABEL, formatMoney, newPart, partsPayload, summarizeParts, type DraftPart, type SavedPart } from '@/lib/money';
import { PaymentParts } from '@/components/shop/PaymentParts';
import { formatRWF } from '@/lib/format';
import { downloadReceipt, groupReceiptLines, printReceipt, receiptNumber } from '@/lib/receipt';
import type { StockVariant } from '@/lib/types';
import { CustomerPicker, type CustomerChoice } from '@/components/shop/CustomerPicker';
import { ColorDot, OptionTag } from '@/components/shop/OptionPickers';
import { FormDialog } from '@/components/shop/FormDialog';
import { ItemThumb } from '@/components/shop/PhotoInput';
import { PaymentBadge } from '@/components/shop/PaymentBadge';
import { useStaffNames } from '@/hooks/useProfiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { MoneyInput } from '@/components/shop/MoneyInput';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, Printer, FileDown, Receipt, ShieldCheck,
  CheckCircle2, RefreshCcw, Shirt, Wallet, HandCoins, Layers, Ban,
} from 'lucide-react';

interface Picked { item: StockItemWithCategory; variant: StockVariant }

type CartEntry =
  | { kind: 'item'; key: string; item: StockItemWithCategory; variant: StockVariant; quantity: number; price: string }
  | { kind: 'set'; key: string; set: ItemSet; parts: Picked[]; quantity: number; price: string };

/** Splits one set price over its parts (by their usual prices, or evenly), in whole francs. */
function splitSetPrice(total: number, parts: Picked[]): number[] {
  const weights = parts.map(p => p.variant.default_price ?? 0);
  const sum = weights.reduce((s, w) => s + w, 0);
  const shares = parts.map((_, i) => Math.floor(sum > 0 ? (total * weights[i]) / sum : total / parts.length));
  shares[0] += total - shares.reduce((s, x) => s + x, 0);
  return shares;
}

export default function Sales() {
  const { canEdit, isManager } = useAuth();
  const { items, isLoading: itemsLoading } = useStockItems();
  const { sets } = useItemSets();
  const { recentSales, isLoading: salesLoading, recordSale, voidSale, fetchSale } = useSales();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pickTab, setPickTab] = useState<'items' | 'sets'>(searchParams.get('tab') === 'sets' ? 'sets' : 'items');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [customer, setCustomer] = useState<CustomerChoice | null>(null);
  const [payInFull, setPayInFull] = useState(true);
  const [dueDate, setDueDate] = useState('');
  // How the customer pays: one cash FRW part by default (= the whole bill)
  const [payParts, setPayParts] = useState<DraftPart[]>(() => [newPart()]);
  const [receipt, setReceipt] = useState<SaleWithLines | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [justSold, setJustSold] = useState(false);
  const nameOf = useStaffNames();
  // Phones: the cart is below the items, so a floating bar shows the total and jumps to it
  const cartRef = useRef<HTMLDivElement>(null);
  const [cartVisible, setCartVisible] = useState(false);
  useEffect(() => {
    const el = cartRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setCartVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const [setPick, setSetPick] = useState<{ set: ItemSet; chosen: Record<string, string> } | null>(null);

  // A tapped phone notification opens /sales?receipt=<id>
  const receiptParam = searchParams.get('receipt');
  useEffect(() => {
    if (!receiptParam) return;
    let alive = true;
    fetchSale(receiptParam).then(sale => {
      if (!alive) return;
      if (sale) { setReceipt(sale); setCancelReason(null); setJustSold(false); }
      setSearchParams({}, { replace: true });
    });
    return () => { alive = false; };
  }, [receiptParam, fetchSale, setSearchParams]);

  const openReceipt = (s: SaleWithLines) => { setReceipt(s); setCancelReason(null); setJustSold(false); };

  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shownItems = items
    .filter(i => i.variants.some(v => v.quantity > 0))
    .filter(i => {
      const text = `${i.name} ${i.category?.name ?? ''} ${i.variants.map(v => `${v.size ?? ''} ${v.color ?? ''}`).join(' ')}`.toLowerCase();
      return words.every(w => text.includes(w));
    });
  const shownSets = sets.filter(s => {
    const text = `${s.name} ${s.part_ids.map(id => itemById.get(id)?.name ?? '').join(' ')}`.toLowerCase();
    return words.every(w => text.includes(w));
  });

  /** Pieces of a size/colour already in the cart, alone or inside sets */
  const inCart = (variantId: string) => cart.reduce((sum, e) =>
    sum + (e.kind === 'item'
      ? (e.variant.id === variantId ? e.quantity : 0)
      : e.parts.filter(p => p.variant.id === variantId).length * e.quantity), 0);
  const leftOf = (v: StockVariant) => v.quantity - inCart(v.id);

  const addItem = (item: StockItemWithCategory, variant: StockVariant) => {
    if (leftOf(variant) <= 0) return;
    setCart(prev => {
      const existing = prev.find(e => e.kind === 'item' && e.variant.id === variant.id);
      if (existing) return prev.map(e => e === existing ? { ...e, quantity: e.quantity + 1 } : e);
      return [...prev, { kind: 'item', key: variant.id, item, variant, quantity: 1, price: '' }];
    });
  };

  const openSet = (set: ItemSet) => {
    // Pre-pick the only in-stock option of each part
    const chosen: Record<string, string> = {};
    set.part_ids.forEach(id => {
      const available = itemById.get(id)?.variants.filter(v => leftOf(v) > 0) ?? [];
      if (available.length === 1) chosen[id] = available[0].id;
    });
    setSetPick({ set, chosen });
  };

  const setParts = setPick?.set.part_ids.map(id => itemById.get(id)).filter((i): i is StockItemWithCategory => !!i) ?? [];
  const setReady = !!setPick && setParts.length >= 2 && setParts.every(p => setPick.chosen[p.id]);

  const addSet = () => {
    if (!setPick || !setReady) return;
    const parts = setParts.map(item => ({ item, variant: item.variants.find(v => v.id === setPick.chosen[item.id])! }));
    const key = `${setPick.set.id}:${parts.map(p => p.variant.id).join(',')}`;
    setCart(prev => {
      const existing = prev.find(e => e.key === key);
      if (existing) return prev.map(e => e === existing ? { ...e, quantity: e.quantity + 1 } : e);
      return [...prev, {
        kind: 'set', key, set: setPick.set, parts, quantity: 1,
        price: '',
      }];
    });
    setSetPick(null);
  };

  const canIncrease = (e: CartEntry) => e.kind === 'item' ? leftOf(e.variant) > 0 : e.parts.every(p => leftOf(p.variant) > 0);
  const updateEntry = (key: string, patch: Partial<Pick<CartEntry, 'quantity' | 'price'>>) =>
    setCart(prev => prev.map(e => e.key === key ? { ...e, ...patch } as CartEntry : e));
  const removeEntry = (key: string) => setCart(prev => prev.filter(e => e.key !== key));

  const missingPrice = cart.some(e => e.price === '' || Number(e.price) < 0);
  const total = cart.reduce((s, e) => s + e.quantity * (Number(e.price) || 0), 0);
  const pieces = cart.reduce((s, e) => s + e.quantity * (e.kind === 'set' ? e.parts.length : 1), 0);
  // "Paid in full": an empty part takes the rest of the bill. "Part / credit": empty = nothing paid.
  const pay = summarizeParts(payParts, total, payInFull);
  const paid = pay.paid;
  const owes = total - paid;
  const shortInFull = payInFull && pay.owes > 0;
  const paidTooMuch = !payInFull && pay.received > total;
  const needsCustomer = owes > 0 && !customer;
  const canComplete = canEdit && cart.length > 0 && !missingPrice && !shortInFull && !paidTooMuch && !pay.changeTooBig
    && !pay.missingRate && !needsCustomer && !recordSale.isPending;

  const resetSale = () => {
    setCart([]); setCustomer(null); setPayInFull(true); setDueDate(''); setPayParts([newPart()]);
  };

  const completeSale = async () => {
    if (!canComplete) return;
    const lines = cart.flatMap(e => {
      if (e.kind === 'item') return [{ variant_id: e.variant.id, quantity: e.quantity, unit_price: Number(e.price) }];
      const shares = splitSetPrice(Number(e.price), e.parts);
      return e.parts.map((p, i) => ({ variant_id: p.variant.id, quantity: e.quantity, unit_price: shares[i], set_name: e.set.name }));
    });
    const sale = await recordSale.mutateAsync({
      lines,
      customer,
      dueDate: owes > 0 ? dueDate || undefined : undefined,
      payments: partsPayload(payParts, pay),
    });
    resetSale();
    setCancelReason(null);
    setJustSold(true);
    setReceipt(sale);
  };

  const blockReason = cart.length === 0 ? 'Tap an item or set to add it'
    : missingPrice ? 'Enter a price for everything in the cart'
    : pay.missingRate ? "Enter today's exchange rate for the USD / EUR part"
    : shortInFull ? `${formatRWF(pay.owes)} is still missing. Add another part, or choose "Part / credit"`
    : paidTooMuch ? `That's more than the total. Choose "Paid in full" to give change`
    : pay.changeTooBig ? 'Only cash can be more than the bill (change is given in cash). Lower the Mobile Money / bank part'
    : needsCustomer ? 'Choose the customer who owes the rest'
    : null;

  const variantButton = (item: StockItemWithCategory, v: StockVariant, selected: boolean, onClick: () => void, badge?: number) => {
    const left = leftOf(v);
    return (
      <button
        key={v.id}
        type="button"
        disabled={left <= 0 && !selected}
        onClick={onClick}
        className={cn(
          'relative rounded-lg border-2 px-3 py-2 text-left text-sm transition-all min-w-[92px]',
          'hover:border-primary hover:bg-primary/5 active:scale-95',
          'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-border',
          selected ? 'border-primary bg-primary/10' : 'border-border',
        )}
      >
        <OptionTag size={v.size} color={v.color} />
        <span className="block text-xs text-muted-foreground mt-0.5">
          {v.quantity <= 0 ? 'Sold out' : `${left} left`}
          {v.default_price !== null && ` · ${formatRWF(v.default_price)}`}
        </span>
        {!!badge && (
          <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-muted-foreground">Sell garments or full outfits, take payment and print the receipt</p>
          {!canEdit && (
            <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1">
              <ShieldCheck className="w-3 h-3" /> View Only
            </Badge>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Pick items ── */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3 space-y-3">
              <CardTitle className="text-lg flex items-center gap-2"><Shirt className="w-5 h-5 text-primary" /> 1. Pick what they're buying</CardTitle>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {([['items', 'Single items', Shirt], ['sets', `Outfit sets${sets.length ? ` (${sets.length})` : ''}`, Layers]] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" onClick={() => setPickTab(k)}
                    className={cn('rounded-md py-2 text-sm font-medium flex items-center justify-center gap-1.5 transition-colors',
                      pickTab === k ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={pickTab === 'items' ? 'Search: “shirt M white” or “jeans 32”' : 'Search sets…'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="flex justify-center py-10"><RefreshCcw className="w-6 h-6 animate-spin text-primary" /></div>
              ) : pickTab === 'items' ? (
                shownItems.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Shirt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    {items.length === 0 ? (
                      <>
                        <p>No items in stock yet.</p>
                        <Button asChild className="mt-4 gap-2"><Link to="/stock?add=1"><Plus className="w-4 h-4" /> Add your first item</Link></Button>
                      </>
                    ) : <p>Nothing in stock matches “{search}”.</p>}
                  </div>
                ) : (
                  <div className="space-y-3 lg:max-h-[60vh] lg:overflow-y-auto lg:pr-1">
                    <p className="text-xs text-muted-foreground">Tap a colour / size to add it. Tap again for another piece.</p>
                    {shownItems.map(item => (
                      <div key={item.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center gap-3 mb-2">
                          <ItemThumb url={item.image_url} color={item.category?.color} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold truncate">{item.name}</p>
                            {item.category && <p className="text-xs text-muted-foreground">{item.category.name}</p>}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">{item.quantity} in stock</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.variants.map(v => {
                            const taken = cart.find(e => e.kind === 'item' && e.variant.id === v.id)?.quantity ?? 0;
                            return variantButton(item, v, taken > 0, () => addItem(item, v), taken);
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : shownSets.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>{sets.length === 0 ? 'No outfit sets yet.' : `No set matches “${search}”.`}</p>
                  {sets.length === 0 && <Button asChild variant="outline" className="mt-4"><Link to="/stock">Create sets in Stock → Outfit sets</Link></Button>}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:max-h-[60vh] lg:overflow-y-auto lg:pr-1">
                  {shownSets.map(s => {
                    const parts = s.part_ids.map(id => itemById.get(id)).filter((i): i is StockItemWithCategory => !!i);
                    const available = parts.length >= 2 && parts.every(p => p.variants.some(v => leftOf(v) > 0));
                    return (
                      <button key={s.id} type="button" disabled={!available} onClick={() => openSet(s)}
                        className="text-left rounded-xl border-2 border-border p-3 hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold truncate">{s.name}</p>
                          {s.usual_price !== null && <span className="text-sm font-medium text-primary shrink-0">{formatRWF(s.usual_price)}</span>}
                        </div>
                        <div className="flex -space-x-2 mt-2">
                          {parts.map(p => <ItemThumb key={p.id} url={p.image_url} color={p.category?.color} className="w-9 h-9 ring-2 ring-background" />)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 truncate">{parts.map(p => p.name).join(' + ')}</p>
                        {!available && <p className="text-xs text-destructive mt-1">A part is sold out</p>}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Cart & payment ── */}
          <Card ref={cartRef} className="lg:col-span-2 lg:sticky lg:top-20 self-start scroll-mt-20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-primary" /> 2. Cart
                {pieces > 0 && <Badge className="ml-auto">{pieces} {pieces === 1 ? 'piece' : 'pieces'}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {cart.length === 0 ? (
                <div className="text-center py-8 rounded-lg border border-dashed border-border text-muted-foreground text-sm">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  The cart is empty. Tap an item or a set.
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(e => (
                    <div key={e.key} className={cn('rounded-lg border p-3 space-y-2', e.kind === 'set' ? 'border-primary/40 bg-primary/5' : 'border-border')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {e.kind === 'item' ? (
                            <>
                              <p className="font-medium truncate">{e.item.name}</p>
                              <OptionTag size={e.variant.size} color={e.variant.color} className="text-xs" />
                            </>
                          ) : (
                            <>
                              <p className="font-medium truncate flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-primary" /> {e.set.name}</p>
                              <div className="space-y-0.5 mt-0.5">
                                {e.parts.map(p => (
                                  <p key={p.variant.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    {p.item.name} · <OptionTag size={p.variant.size} color={p.variant.color} />
                                  </p>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                        <Button size="icon" variant="outline" className="h-7 w-7 text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
                          onClick={() => removeEntry(e.key)} aria-label="Remove">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Button type="button" size="icon" variant="outline" className="h-9 w-9"
                            onClick={() => e.quantity > 1 ? updateEntry(e.key, { quantity: e.quantity - 1 }) : removeEntry(e.key)}>
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="w-7 text-center font-semibold">{e.quantity}</span>
                          <Button type="button" size="icon" variant="outline" className="h-9 w-9"
                            disabled={!canIncrease(e)}
                            onClick={() => updateEntry(e.key, { quantity: e.quantity + 1 })}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <span className="text-muted-foreground text-sm">×</span>
                        <div className="flex-1">
                          <MoneyInput
                            placeholder={e.kind === 'set' ? 'Set price' : 'Price'}
                            value={e.price}
                            onChange={price => updateEntry(e.key, { price })}
                            className={cn('h-9', e.price === '' && 'border-amber-400 focus-visible:ring-amber-400')}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        {(() => {
                          const usual = e.kind === 'item' ? e.variant.default_price : e.set.usual_price;
                          return usual !== null && e.price === '' ? (
                            <button type="button" className="text-primary font-medium"
                              onClick={() => updateEntry(e.key, { price: String(usual) })}>
                              Use usual {e.kind === 'set' ? 'set ' : ''}price {formatRWF(usual)}
                            </button>
                          ) : <span />;
                        })()}
                        {e.price !== '' && <span className="font-semibold">{formatRWF(e.quantity * Number(e.price))}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <Label>Customer <span className="text-muted-foreground font-normal">{owes > 0 ? '(needed — they owe the rest)' : '(optional)'}</span></Label>
                <CustomerPicker value={customer} onChange={setCustomer} />
              </div>

              <div className="space-y-2">
                <Label>3. Payment</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPayInFull(true)}
                    className={cn('rounded-lg border-2 px-3 py-2.5 text-sm font-medium flex items-center gap-2 justify-center transition-all',
                      payInFull ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400' : 'border-border hover:border-primary/50')}>
                    <Wallet className="w-4 h-4" /> Paid in full
                  </button>
                  <button type="button" onClick={() => setPayInFull(false)}
                    className={cn('rounded-lg border-2 px-3 py-2.5 text-sm font-medium flex items-center gap-2 justify-center transition-all',
                      !payInFull ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-border hover:border-primary/50')}>
                    <HandCoins className="w-4 h-4" /> Part / credit
                  </button>
                </div>
                {!payInFull && <p className="text-xs text-muted-foreground">What they pay now — leave empty if nothing. The rest goes to their debts.</p>}
                <PaymentParts parts={payParts} onChange={setPayParts} summary={pay} autoRest={payInFull} />
                {!payInFull && (
                  <div className="space-y-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 animate-fade-in">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Pay the rest by</Label>
                      <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                      <div className="flex flex-wrap gap-1.5">
                        {[{ label: 'In a week', days: 7 }, { label: 'In 2 weeks', days: 14 }, { label: 'In a month', days: 30 }].map(o => (
                          <Button key={o.days} type="button" size="sm" className="h-7 text-xs"
                            variant={dueDate === inDays(o.days) ? 'default' : 'outline'}
                            onClick={() => setDueDate(inDays(o.days))}>{o.label}</Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-muted/50 p-4 space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-2xl font-bold">{formatRWF(total)}</span>
                </div>
                {(pay.received !== total || !payInFull) && total > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Received</span><span>{formatRWF(pay.received)}</span></div>
                )}
                {pay.change > 0 && (
                  <div className={cn('flex justify-between text-sm font-semibold', pay.changeTooBig ? 'text-destructive' : 'text-green-700 dark:text-green-400')}>
                    <span>Give back (change, FRW cash)</span><span>{formatRWF(pay.change)}</span>
                  </div>
                )}
                {!payInFull && owes > 0 && (
                  <div className="flex justify-between text-sm font-semibold text-amber-600">
                    <span>Still owes (goes to debts)</span><span>{formatRWF(owes)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Button className="w-full h-12 text-base gap-2 bg-green-600 hover:bg-green-700" disabled={!canComplete} onClick={completeSale}>
                  <CheckCircle2 className="w-5 h-5" />
                  {recordSale.isPending ? 'Saving…' : `Complete Sale${total > 0 ? ` · ${formatRWF(total)}` : ''}`}
                </Button>
                {blockReason && <p className="text-xs text-center text-muted-foreground">{blockReason}</p>}
                {cart.length > 0 && (
                  <Button variant="outline" size="sm" className="w-full " onClick={resetSale}>Clear sale</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Recent sales ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /> Recent Sales</CardTitle>
          <CardDescription>Tap a sale to see or print its receipt</CardDescription>
        </CardHeader>
        <CardContent>
          {salesLoading ? (
            <div className="flex justify-center py-8"><RefreshCcw className="w-6 h-6 animate-spin text-primary" /></div>
          ) : recentSales.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No sales yet.</p>
            </div>
          ) : (
            <>
            <div className="space-y-2 md:hidden">
              {recentSales.map(s => (
                <button key={s.id} type="button" onClick={() => openReceipt(s)}
                  className={cn('w-full text-left rounded-xl border border-border p-3 active:bg-muted', s.voided_at && 'opacity-50')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{formatRWF(s.total)}</span>
                    {s.voided_at ? <Badge variant="outline" className="text-destructive border-destructive/40">Cancelled</Badge> : <PaymentBadge status={s.payment_status} />}
                  </div>
                  <p className="text-sm truncate mt-0.5">
                    {groupReceiptLines(s.lines).map(g => g.set_name ? `${g.lines[0].quantity}× ${g.set_name}` : `${g.lines[0].quantity}× ${g.lines[0].item_name}`).join(', ')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {receiptNumber(s.receipt_no)} · {format(new Date(s.sold_at), 'dd MMM, HH:mm')} · {s.customer_name || 'Walk-in'}{nameOf(s.created_by) && ` · by ${nameOf(s.created_by)}`}
                  </p>
                </button>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentSales.map(s => (
                    <TableRow key={s.id} className={cn('cursor-pointer', s.voided_at && 'opacity-50 line-through')} onClick={() => openReceipt(s)}>
                      <TableCell className="font-mono text-sm">{receiptNumber(s.receipt_no)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(s.sold_at), 'dd MMM, HH:mm')}</TableCell>
                      <TableCell className="text-sm">{s.customer_name || <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                      <TableCell className="text-sm max-w-[280px]">
                        <div className="flex flex-wrap gap-1">
                          {groupReceiptLines(s.lines).map((g, i) => g.set_name ? (
                            <span key={i} className="inline-flex items-center gap-1 text-xs rounded-md bg-primary/10 text-primary px-1.5 py-0.5">
                              <Layers className="w-3 h-3" /> {g.lines[0].quantity}× {g.set_name}
                            </span>
                          ) : (
                            <span key={i} className="inline-flex items-center gap-1 text-xs rounded-md bg-muted px-1.5 py-0.5">
                              <ColorDot color={g.lines[0].color} className="w-2 h-2" />
                              {g.lines[0].quantity}× {g.lines[0].item_name}{g.lines[0].size ? ` ${g.lines[0].size}` : ''}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">{formatRWF(s.total)}</TableCell>
                      <TableCell>{s.voided_at ? <Badge variant="outline" className="text-destructive border-destructive/40 no-underline">Cancelled</Badge> : <PaymentBadge status={s.payment_status} />}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="outline" aria-label="Print receipt"
                          onClick={e => { e.stopPropagation(); printReceipt(s); }}>
                          <Printer className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Phones: floating cart bar ── */}
      {canEdit && cart.length > 0 && !cartVisible && (
        <div className="lg:hidden fixed inset-x-3 bottom-3 z-40 animate-fade-in" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <button type="button" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="w-full flex items-center justify-between gap-3 rounded-2xl bg-green-600 text-white px-4 py-3 shadow-xl active:scale-[0.99]">
            <span className="flex items-center gap-2 font-medium"><ShoppingCart className="w-5 h-5" /> {pieces} {pieces === 1 ? 'piece' : 'pieces'}</span>
            <span className="font-bold">{formatRWF(total)} · Checkout →</span>
          </button>
        </div>
      )}

      {/* ── Choose each part of a set ── */}
      <FormDialog
        open={!!setPick}
        onOpenChange={o => !o && setSetPick(null)}
        title={setPick ? `Sell “${setPick.set.name}”` : ''}
        description="Choose the colour and size of each part."
        footer={
          <>
            <Button variant="outline" onClick={() => setSetPick(null)}>Cancel</Button>
            <Button onClick={addSet} disabled={!setReady}>Add set to cart</Button>
          </>
        }
      >
        {setPick && setParts.map((part, i) => (
          <div key={part.id} className="space-y-2">
            <Label className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{i + 1}</span>
              {part.name}
              {setPick.chosen[part.id] && <CheckCircle2 className="w-4 h-4 text-green-600" />}
            </Label>
            <div className="flex flex-wrap gap-2">
              {part.variants.map(v => variantButton(part, v, setPick.chosen[part.id] === v.id,
                () => setSetPick({ ...setPick, chosen: { ...setPick.chosen, [part.id]: v.id } })))}
            </div>
          </div>
        ))}
      </FormDialog>

      {/* ── Receipt ── */}
      <FormDialog
        open={!!receipt}
        onOpenChange={open => !open && setReceipt(null)}
        title={receipt ? (justSold ? `Sale saved ✅  Receipt ${receiptNumber(receipt.receipt_no)}` : `Receipt ${receiptNumber(receipt.receipt_no)}`) : ''}
        description={receipt && <>{format(new Date(receipt.sold_at), 'dd MMM yyyy · HH:mm')}{nameOf(receipt.created_by) && <> · sold by <b className="text-foreground">{nameOf(receipt.created_by)}</b></>}</>}
        footer={receipt && (
          <>
            {isManager && !receipt.voided_at && cancelReason === null && (
              <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 sm:mr-auto" onClick={() => setCancelReason('')}>
                <Ban className="w-4 h-4" /> Cancel sale
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => downloadReceipt(receipt)}><FileDown className="w-4 h-4" /> PDF</Button>
            <Button variant="outline" className="gap-2" onClick={() => printReceipt(receipt)}><Printer className="w-4 h-4" /> Print</Button>
            <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => setReceipt(null)}>
              <CheckCircle2 className="w-4 h-4" /> {justSold ? 'Done — next customer' : 'Close'}
            </Button>
          </>
        )}
      >
        {receipt && (
          <div className="space-y-3 text-sm">
            {receipt.voided_at && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                <p className="font-semibold flex items-center gap-2"><Ban className="w-4 h-4" /> Cancelled {format(new Date(receipt.voided_at), 'dd MMM, HH:mm')}</p>
                {receipt.void_reason && <p className="text-xs mt-0.5">Reason: {receipt.void_reason}</p>}
              </div>
            )}
            {cancelReason !== null && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2 animate-fade-in">
                <p className="font-medium">Cancel this sale?</p>
                <p className="text-xs text-muted-foreground">The pieces go back into stock and any debt from this sale is removed. The receipt stays in the records, marked cancelled.</p>
                <Input autoFocus placeholder="Why? e.g. entered twice, customer returned it" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setCancelReason(null)}>Keep sale</Button>
                  <Button size="sm" variant="destructive" disabled={!cancelReason.trim() || voidSale.isPending}
                    onClick={async () => {
                      await voidSale.mutateAsync({ saleId: receipt.id, reason: cancelReason });
                      setCancelReason(null);
                      setReceipt(null);
                    }}>
                    {voidSale.isPending ? 'Cancelling…' : 'Cancel sale'}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{receipt.customer_name || 'Walk-in'}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              {groupReceiptLines(receipt.lines).map((g, i) => (
                <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    {g.set_name ? (
                      <>
                        <p className="font-medium flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-primary" /> {g.set_name}</p>
                        {g.lines.map((l, j) => (
                          <p key={j} className="text-xs text-muted-foreground flex items-center gap-1.5">
                            {l.quantity} × {l.item_name} · <OptionTag size={l.size} color={l.color} />
                          </p>
                        ))}
                      </>
                    ) : (
                      <>
                        <p className="font-medium truncate">{g.lines[0].item_name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <OptionTag size={g.lines[0].size} color={g.lines[0].color} /> · {g.lines[0].quantity} × {formatRWF(g.lines[0].unit_price)}
                        </p>
                      </>
                    )}
                  </div>
                  <span className="font-semibold whitespace-nowrap">{formatRWF(g.total)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-1">
              <div className="flex justify-between text-base"><span>Total</span><span className="font-bold">{formatRWF(receipt.total)}</span></div>
              {(Array.isArray(receipt.payments) && receipt.payments.length ? receipt.payments as SavedPart[] : null)?.map((p, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Paid · {METHOD_LABEL[p.method] ?? p.method}
                    {p.currency !== 'RWF' && <> · <b className="text-foreground">{formatMoney(Number(p.amount), p.currency)}</b> @ {Number(p.rate).toLocaleString('en-US')}</>}
                  </span>
                  <span>{formatRWF(Number(p.frw))}</span>
                </div>
              )) ?? <div className="flex justify-between"><span className="text-muted-foreground">Paid · {METHOD_LABEL[receipt.payment_method] ?? receipt.payment_method}</span><span>{formatRWF(receipt.amount_paid)}</span></div>}
              {Number(receipt.change_given) > 0 && (
                <div className="flex justify-between text-green-700 dark:text-green-400"><span>Change given</span><span>{formatRWF(Number(receipt.change_given))}</span></div>
              )}
              {receipt.payment_status !== 'paid' && (
                <div className="flex justify-between text-amber-600 font-semibold">
                  <span>Owes{receipt.due_date ? ` (by ${format(new Date(receipt.due_date), 'dd MMM')})` : ''}</span>
                  <span>{formatRWF(receipt.total - receipt.amount_paid)}</span>
                </div>
              )}
            </div>
            {!receipt.voided_at && <div className="flex justify-center"><PaymentBadge status={receipt.payment_status} /></div>}
          </div>
        )}
      </FormDialog>
    </div>
  );
}
