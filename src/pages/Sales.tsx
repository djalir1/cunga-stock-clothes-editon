import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useStockItems, type StockItemWithCategory } from '@/hooks/useStockItems';
import { useSales, PAYMENT_METHODS, type PaymentMethod, type SaleWithLines } from '@/hooks/useSales';
import { formatRWF } from '@/lib/format';
import { downloadReceipt, printReceipt, receiptNumber } from '@/lib/receipt';
import type { StockVariant } from '@/lib/types';
import { CustomerPicker, type CustomerChoice } from '@/components/shop/CustomerPicker';
import { ColorDot, OptionTag } from '@/components/shop/OptionPickers';
import { FormDialog } from '@/components/shop/FormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, Printer, FileDown, Receipt, ShieldCheck,
  CheckCircle2, RefreshCcw, Shirt, Wallet, HandCoins,
} from 'lucide-react';

interface CartLine {
  item: StockItemWithCategory;
  variant: StockVariant;
  quantity: number;
  price: string;
}

export function PaymentBadge({ status }: { status: string }) {
  if (status === 'paid') return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Paid</Badge>;
  if (status === 'partial') return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Part paid</Badge>;
  return <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20">On credit</Badge>;
}

export default function Sales() {
  const { canEdit } = useAuth();
  const { items, isLoading: itemsLoading } = useStockItems();
  const { recentSales, isLoading: salesLoading, recordSale } = useSales();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerChoice | null>(null);
  const [payInFull, setPayInFull] = useState(true);
  const [amountPaid, setAmountPaid] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [receipt, setReceipt] = useState<SaleWithLines | null>(null);

  const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

  const shownItems = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter(i => i.variants.some(v => v.quantity > 0))
      .filter(i => {
        if (!words.length) return true;
        const text = `${i.name} ${i.category?.name ?? ''} ${i.variants.map(v => `${v.size ?? ''} ${v.color ?? ''}`).join(' ')}`.toLowerCase();
        return words.every(w => text.includes(w));
      });
  }, [items, search]);

  const inCart = (variantId: string) => cart.find(l => l.variant.id === variantId)?.quantity ?? 0;

  const addToCart = (item: StockItemWithCategory, variant: StockVariant) => {
    setCart(prev => {
      const existing = prev.find(l => l.variant.id === variant.id);
      if (existing) {
        if (existing.quantity >= variant.quantity) return prev;
        return prev.map(l => l.variant.id === variant.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, { item, variant, quantity: 1, price: '' }];
    });
  };

  const updateLine = (variantId: string, patch: Partial<CartLine>) =>
    setCart(prev => prev.map(l => l.variant.id === variantId ? { ...l, ...patch } : l));
  const removeLine = (variantId: string) => setCart(prev => prev.filter(l => l.variant.id !== variantId));

  const missingPrice = cart.some(l => l.price === '' || Number(l.price) < 0);
  const total = cart.reduce((s, l) => s + l.quantity * (Number(l.price) || 0), 0);
  const pieces = cart.reduce((s, l) => s + l.quantity, 0);
  const paid = payInFull ? total : Number(amountPaid) || 0;
  const owes = total - paid;
  const paidTooMuch = !payInFull && paid > total;
  const needsCustomer = owes > 0 && !customer;
  const canComplete = canEdit && cart.length > 0 && !missingPrice && !paidTooMuch && !needsCustomer && !recordSale.isPending;

  const resetSale = () => {
    setCart([]);
    setCustomer(null);
    setPayInFull(true);
    setAmountPaid('');
    setDueDate('');
    setMethod('cash');
  };

  const completeSale = async () => {
    if (!canComplete) return;
    const sale = await recordSale.mutateAsync({
      lines: cart.map(l => ({ variant_id: l.variant.id, quantity: l.quantity, unit_price: Number(l.price) })),
      customer,
      amountPaid: payInFull ? undefined : paid,
      dueDate: owes > 0 ? dueDate || undefined : undefined,
      method,
    });
    resetSale();
    setReceipt(sale);
  };

  const blockReason = cart.length === 0 ? 'Tap an item to add it'
    : missingPrice ? 'Enter a price for every item'
    : paidTooMuch ? "Amount paid can't be more than the total"
    : needsCustomer ? 'Choose the customer who owes the rest'
    : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Sell garments, take payment and print the receipt</p>
            {!canEdit && (
              <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1">
                <ShieldCheck className="w-3 h-3" /> View Only
              </Badge>
            )}
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* ── Pick items ── */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><Shirt className="w-5 h-5 text-primary" /> 1. Pick the items</CardTitle>
              <CardDescription>Tap a size / colour to add it. Tap again for another piece.</CardDescription>
              <div className="relative pt-2">
                <Search className="absolute left-3 top-1/2 translate-y-[-25%] w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search: e.g. “shirt M white” or “jeans 32”"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="flex justify-center py-10"><RefreshCcw className="w-6 h-6 animate-spin text-primary" /></div>
              ) : shownItems.length === 0 ? (
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
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                  {shownItems.map(item => (
                    <div key={item.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{item.name}</p>
                          {item.category && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.category.color }} />
                              {item.category.name}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{item.quantity} in stock</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.variants.map(v => {
                          const taken = inCart(v.id);
                          const left = v.quantity - taken;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              disabled={left <= 0}
                              onClick={() => addToCart(item, v)}
                              className={cn(
                                'relative rounded-lg border px-3 py-2 text-left text-sm transition-all min-w-[92px]',
                                'hover:border-primary hover:bg-primary/5 active:scale-95',
                                'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                                taken > 0 && 'border-primary bg-primary/10',
                              )}
                            >
                              <OptionTag size={v.size} color={v.color} />
                              <span className="block text-xs text-muted-foreground mt-0.5">
                                {v.quantity <= 0 ? 'Sold out' : `${left} left`}
                                {v.default_price !== null && ` · ${formatRWF(v.default_price)}`}
                              </span>
                              {taken > 0 && (
                                <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                                  {taken}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Cart & payment ── */}
          <Card className="lg:col-span-2 lg:sticky lg:top-20 self-start">
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
                  The cart is empty. Tap an item on the left.
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map(l => (
                    <div key={l.variant.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{l.item.name}</p>
                          <OptionTag size={l.variant.size} color={l.variant.color} className="text-xs" />
                        </div>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => removeLine(l.variant.id)} aria-label="Remove">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Button type="button" size="icon" variant="outline" className="h-9 w-9"
                            onClick={() => l.quantity > 1 ? updateLine(l.variant.id, { quantity: l.quantity - 1 }) : removeLine(l.variant.id)}>
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="w-7 text-center font-semibold">{l.quantity}</span>
                          <Button type="button" size="icon" variant="outline" className="h-9 w-9"
                            disabled={l.quantity >= l.variant.quantity}
                            onClick={() => updateLine(l.variant.id, { quantity: l.quantity + 1 })}>
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        <span className="text-muted-foreground text-sm">×</span>
                        <Input
                          type="number" min="0" inputMode="numeric"
                          placeholder="Price (RWF)"
                          value={l.price}
                          onChange={e => updateLine(l.variant.id, { price: e.target.value })}
                          className={cn('h-9', l.price === '' && 'border-amber-400 focus-visible:ring-amber-400')}
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        {l.variant.default_price !== null && l.price === '' ? (
                          <button type="button" className="text-primary font-medium"
                            onClick={() => updateLine(l.variant.id, { price: String(l.variant.default_price) })}>
                            Use usual price {formatRWF(l.variant.default_price)}
                          </button>
                        ) : <span />}
                        {l.price !== '' && <span className="font-semibold">{formatRWF(l.quantity * Number(l.price))}</span>}
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
                    className={cn('rounded-lg border px-3 py-2.5 text-sm font-medium flex items-center gap-2 justify-center transition-all',
                      payInFull ? 'border-green-600 bg-green-600/10 text-green-700 dark:text-green-400' : 'hover:border-primary/50')}>
                    <Wallet className="w-4 h-4" /> Paid in full
                  </button>
                  <button type="button" onClick={() => setPayInFull(false)}
                    className={cn('rounded-lg border px-3 py-2.5 text-sm font-medium flex items-center gap-2 justify-center transition-all',
                      !payInFull ? 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'hover:border-primary/50')}>
                    <HandCoins className="w-4 h-4" /> Part / credit
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_METHODS.map(m => (
                    <Button key={m.value} type="button" size="sm" className="h-8"
                      variant={method === m.value ? 'default' : 'outline'}
                      onClick={() => setMethod(m.value)}>
                      {m.label}
                    </Button>
                  ))}
                </div>
                {!payInFull && (
                  <div className="space-y-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 animate-fade-in">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Paid now (RWF) — 0 if nothing</Label>
                      <Input type="number" min="0" inputMode="numeric" placeholder="0" value={amountPaid}
                        onChange={e => setAmountPaid(e.target.value)} />
                    </div>
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
                {!payInFull && (
                  <>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid now</span><span>{formatRWF(paid)}</span></div>
                    {owes > 0 && (
                      <div className="flex justify-between text-sm font-semibold text-amber-600">
                        <span>Still owes (goes to debts)</span><span>{formatRWF(owes)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Button className="w-full h-12 text-base gap-2 bg-green-600 hover:bg-green-700" disabled={!canComplete} onClick={completeSale}>
                  <CheckCircle2 className="w-5 h-5" />
                  {recordSale.isPending ? 'Saving…' : `Complete Sale${total > 0 ? ` · ${formatRWF(total)}` : ''}`}
                </Button>
                {blockReason && <p className="text-xs text-center text-muted-foreground">{blockReason}</p>}
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={resetSale}>Clear sale</Button>
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
          <CardDescription>Tap a receipt to print it again</CardDescription>
        </CardHeader>
        <CardContent>
          {salesLoading ? (
            <div className="flex justify-center py-8"><RefreshCcw className="w-6 h-6 animate-spin text-primary" /></div>
          ) : recentSales.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No sales yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setReceipt(s)}>
                      <TableCell className="font-mono text-sm">{receiptNumber(s.receipt_no)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{format(new Date(s.sold_at), 'dd MMM, HH:mm')}</TableCell>
                      <TableCell className="text-sm">{s.customer_name || <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                      <TableCell className="text-sm max-w-[260px]">
                        <div className="flex flex-wrap gap-1">
                          {s.lines.map((l, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs rounded-md bg-muted px-1.5 py-0.5">
                              <ColorDot color={l.color} className="w-2 h-2" />
                              {l.quantity}× {l.item_name}{l.size ? ` ${l.size}` : ''}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">{formatRWF(s.total)}</TableCell>
                      <TableCell><PaymentBadge status={s.payment_status} /></TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" aria-label="Print receipt"
                          onClick={e => { e.stopPropagation(); printReceipt(s); }}>
                          <Printer className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Receipt ── */}
      <FormDialog
        open={!!receipt}
        onOpenChange={open => !open && setReceipt(null)}
        title={receipt ? `Receipt ${receiptNumber(receipt.receipt_no)}` : ''}
        description={receipt && format(new Date(receipt.sold_at), 'dd MMM yyyy · HH:mm')}
        footer={receipt && (
          <>
            <Button variant="outline" className="gap-2" onClick={() => downloadReceipt(receipt)}><FileDown className="w-4 h-4" /> Download PDF</Button>
            <Button className="gap-2" onClick={() => printReceipt(receipt)}><Printer className="w-4 h-4" /> Print</Button>
          </>
        )}
      >
        {receipt && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{receipt.customer_name || 'Walk-in'}</span>
            </div>
            <div className="rounded-lg border border-border divide-y divide-border">
              {receipt.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{l.item_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <OptionTag size={l.size} color={l.color} /> · {l.quantity} × {formatRWF(l.unit_price)}
                    </p>
                  </div>
                  <span className="font-semibold whitespace-nowrap">{formatRWF(l.quantity * l.unit_price)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2 space-y-1">
              <div className="flex justify-between text-base"><span>Total</span><span className="font-bold">{formatRWF(receipt.total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{formatRWF(receipt.amount_paid)}</span></div>
              {receipt.payment_status !== 'paid' && (
                <div className="flex justify-between text-amber-600 font-semibold">
                  <span>Owes{receipt.due_date ? ` (by ${format(new Date(receipt.due_date), 'dd MMM')})` : ''}</span>
                  <span>{formatRWF(receipt.total - receipt.amount_paid)}</span>
                </div>
              )}
            </div>
            <div className="flex justify-center"><PaymentBadge status={receipt.payment_status} /></div>
          </div>
        )}
      </FormDialog>
    </div>
  );
}
