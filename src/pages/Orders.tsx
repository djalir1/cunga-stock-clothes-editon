import { useMemo, useState } from 'react';
import { addDays, format, formatDistanceToNowStrict } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useStockItems, type StockItemWithCategory } from '@/hooks/useStockItems';
import { useStaffNames } from '@/hooks/useProfiles';
import { usePurchaseOrders, ORDER_STATUS, isLate, type PurchaseOrder, type NewOrder } from '@/hooks/usePurchaseOrders';
import { formatRWF } from '@/lib/format';
import { FormDialog } from '@/components/shop/FormDialog';
import { MoneyInput } from '@/components/shop/MoneyInput';
import { ItemThumb } from '@/components/shop/PhotoInput';
import { OptionTag } from '@/components/shop/OptionPickers';
import { ContactButtons } from '@/components/shop/ContactButtons';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  Truck, PackageCheck, Plus, Trash2, AlertTriangle, Wallet, ChevronsUpDown, Minus, Package, CheckCircle2,
  RefreshCcw, ShieldCheck, ClipboardList, Ban, Mail,
} from 'lucide-react';

const TRANSPORT = ['Bus / coach', 'Courier (DHL…)', 'Envelope / parcel', 'Picked up myself', 'Supplier delivers'];
const fmt = (d: string) => format(new Date(d), 'dd MMM yyyy');
const inDays = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');

interface LineDraft { key: number; item: StockItemWithCategory | null; size: string; color: string; quantity: string; unit_cost: string }
const blankLine = (key: number): LineDraft => ({ key, item: null, size: '', color: '', quantity: '', unit_cost: '' });

function ItemCombo({ items, value, onPick }: { items: StockItemWithCategory[]; value: StockItemWithCategory | null; onPick: (i: StockItemWithCategory) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}>
          <span className="truncate">{value ? value.name : 'Choose item…'}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(24rem,calc(100vw-2rem))]" align="start">
        <Command>
          <CommandInput placeholder="Search items…" />
          <CommandList>
            <CommandEmpty>No item. Add it in Stock first (0 pieces is fine).</CommandEmpty>
            <CommandGroup>
              {items.map(i => (
                <CommandItem key={i.id} value={`${i.name} ${i.id}`} onSelect={() => { onPick(i); setOpen(false); }}>
                  <ItemThumb url={i.image_url} color={i.category?.color} className="w-7 h-7 mr-2" />
                  <span className="flex-1 truncate">{i.name}</span>
                  <span className="text-xs text-muted-foreground">{i.quantity} in stock</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Ordered → On the way → Arrived */
function Tracker({ status }: { status: PurchaseOrder['status'] }) {
  if (status === 'cancelled') return null;
  const step = status === 'ordered' ? 0 : status === 'in_transit' ? 1 : 2;
  const labels = ['Ordered', 'On the way', status === 'partial' ? 'Part arrived' : 'Arrived'];
  return (
    <div className="flex items-center gap-1">
      {labels.map((l, i) => (
        <div key={l} className="flex-1">
          <div className={cn('h-1.5 rounded-full', i <= step ? (status === 'partial' && i === 2 ? 'bg-violet-500' : 'bg-primary') : 'bg-muted')} />
          <p className={cn('text-[10px] mt-1', i <= step ? 'text-foreground font-medium' : 'text-muted-foreground')}>{l}</p>
        </div>
      ))}
    </div>
  );
}

export default function Orders() {
  const { canEdit } = useAuth();
  const { items } = useStockItems();
  const { orders, suppliers, isLoading, createOrder, receive, update, remove } = usePurchaseOrders();
  const nameOf = useStaffNames();

  // New order form
  const [creating, setCreating] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine(1)]);
  const [expected, setExpected] = useState('');
  const [onTheWay, setOnTheWay] = useState(false);
  const [transport, setTransport] = useState('');
  const [tracking, setTracking] = useState('');
  const [shipping, setShipping] = useState('');
  const [paid, setPaid] = useState('');
  const [notes, setNotes] = useState('');

  // Receive / pay / cancel
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [arrived, setArrived] = useState<Record<string, number>>({});
  const [paying, setPaying] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [confirm, setConfirm] = useState<{ order: PurchaseOrder; action: 'cancel' | 'delete' } | null>(null);

  const knownSupplier = suppliers.find(s => s.name.toLowerCase() === supplierName.trim().toLowerCase());
  const goods = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
  const validLines = lines.filter(l => l.item && Number(l.quantity) > 0);
  const canSave = validLines.length > 0 && validLines.length === lines.filter(l => l.item || l.quantity).length;

  const openCreate = () => {
    setSupplierName(''); setSupplierPhone(''); setLines([blankLine(1)]); setExpected(''); setOnTheWay(false);
    setTransport(''); setTracking(''); setShipping(''); setPaid(''); setNotes('');
    setCreating(true);
  };

  const setLine = (key: number, patch: Partial<LineDraft>) => setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));

  const saveOrder = async () => {
    const order: NewOrder = {
      supplier: supplierName.trim() ? { id: knownSupplier?.id ?? null, name: supplierName.trim(), phone: supplierPhone } : null,
      lines: validLines.map(l => ({
        item_id: l.item!.id, size: l.size.trim(), color: l.color.trim(),
        quantity: Number(l.quantity), unit_cost: l.unit_cost === '' ? null : Number(l.unit_cost),
      })),
      expected_on: expected || null,
      status: onTheWay ? 'in_transit' : 'ordered',
      transport, tracking_ref: tracking, notes,
      shipping_cost: Number(shipping) || 0,
      amount_paid: Number(paid) || 0,
    };
    await createOrder.mutateAsync(order);
    setCreating(false);
  };

  const openReceive = (o: PurchaseOrder) => {
    setReceiving(o);
    setArrived(Object.fromEntries(o.lines.map(l => [l.id, Math.max(0, l.quantity_ordered - l.quantity_received)])));
  };
  const arrivingNow = Object.values(arrived).reduce((s, n) => s + n, 0);

  const active = orders.filter(o => ['ordered', 'in_transit', 'partial'].includes(o.status));
  const done = orders.filter(o => o.status === 'received');
  const cancelled = orders.filter(o => o.status === 'cancelled');
  const late = active.filter(isLate);
  const owedToSuppliers = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + Math.max(0, o.total - o.amount_paid), 0);

  const sizesOf = (i: StockItemWithCategory | null) => [...new Set(i?.variants.map(v => v.size).filter(Boolean) as string[])];
  const colorsOf = (i: StockItemWithCategory | null) => [...new Set(i?.variants.map(v => v.color).filter(Boolean) as string[])];

  const orderCard = (o: PurchaseOrder) => {
    const lateBy = isLate(o) && o.expected_on ? formatDistanceToNowStrict(new Date(o.expected_on)) : null;
    const balance = Math.max(0, o.total - o.amount_paid);
    return (
      <Card key={o.id} className={cn(lateBy && 'border-amber-500/50')}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold flex items-center gap-2 flex-wrap">
                Order #{o.po_no}
                <Badge className={ORDER_STATUS[o.status].className}>{ORDER_STATUS[o.status].label}</Badge>
                {lateBy && <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Late by {lateBy}</Badge>}
              </p>
              <p className="text-sm text-muted-foreground truncate">{o.supplier_name || 'No supplier'} · ordered {fmt(o.ordered_on)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {nameOf(o.created_by) && <>Placed by <b className="text-foreground">{nameOf(o.created_by)}</b></>}
                {nameOf(o.received_by) && <> · checked in by <b className="text-foreground">{nameOf(o.received_by)}</b></>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold">{formatRWF(o.total)}</p>
              <p className="text-xs text-muted-foreground">{o.pieces} pieces</p>
            </div>
          </div>

          <Tracker status={o.status} />

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-muted-foreground">{o.status === 'received' ? 'Arrived' : 'Expected'}</p>
              <p className="font-medium">{o.status === 'received' && o.received_on ? fmt(o.received_on) : o.expected_on ? fmt(o.expected_on) : 'Not set'}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <p className="text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> How it's coming</p>
              <p className="font-medium truncate">{[o.transport, o.tracking_ref].filter(Boolean).join(' · ') || '—'}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {o.lines.map(l => (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{l.item_name} <OptionTag size={l.size} color={l.color} className="text-xs text-muted-foreground ml-1" /></span>
                {l.unit_cost !== null && <span className="text-xs text-muted-foreground">{formatRWF(l.unit_cost)}</span>}
                <span className={cn('text-xs font-medium w-14 text-right', l.quantity_received >= l.quantity_ordered ? 'text-green-600' : '')}>
                  {l.quantity_received}/{l.quantity_ordered}
                </span>
              </div>
            ))}
            {o.status === 'partial' && <Progress value={(o.piecesReceived / o.pieces) * 100} className="h-1.5" />}
          </div>

          <div className="flex items-center justify-between text-xs border-t border-border pt-2">
            <span className="text-muted-foreground">
              {o.shipping_cost > 0 && <>Transport {formatRWF(o.shipping_cost)} · </>}Paid {formatRWF(o.amount_paid)}
            </span>
            <span className={cn('font-semibold', balance > 0 ? 'text-amber-600' : 'text-green-600')}>
              {balance > 0 ? `Still to pay ${formatRWF(balance)}` : 'Supplier paid'}
            </span>
          </div>
          {o.notes && <p className="text-xs text-muted-foreground italic">{o.notes}</p>}

          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-1">
              {['ordered', 'in_transit', 'partial'].includes(o.status) && (
                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => openReceive(o)}>
                  <PackageCheck className="w-4 h-4" /> Goods arrived
                </Button>
              )}
              {o.status === 'ordered' && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => update.mutate({ id: o.id, status: 'in_transit' })}>
                  <Truck className="w-4 h-4" /> On the way
                </Button>
              )}
              {balance > 0 && o.status !== 'cancelled' && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setPaying(o); setPayAmount(''); }}>
                  <Wallet className="w-4 h-4" /> Pay supplier
                </Button>
              )}
              <ContactButtons compact phone={o.supplier_phone} message={`Hello, this is about order #${o.po_no}. `} />
              {o.status === 'ordered' || o.status === 'in_transit' ? (
                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:bg-destructive/10 ml-auto" onClick={() => setConfirm({ order: o, action: 'cancel' })}>
                  <Ban className="w-4 h-4" /> Cancel
                </Button>
              ) : o.status === 'cancelled' ? (
                <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:bg-destructive/10 ml-auto" onClick={() => setConfirm({ order: o, action: 'delete' })}>
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const list = (rows: PurchaseOrder[], empty: string) => isLoading ? (
    <div className="flex justify-center py-10"><RefreshCcw className="w-6 h-6 animate-spin text-primary" /></div>
  ) : rows.length === 0 ? (
    <div className="text-center py-12 text-muted-foreground"><ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>{empty}</p></div>
  ) : <div className="grid gap-3 lg:grid-cols-2">{rows.map(orderCard)}</div>;

  const supplierMatches = useMemo(() =>
    supplierName.trim() && !knownSupplier
      ? suppliers.filter(s => s.name.toLowerCase().includes(supplierName.trim().toLowerCase())).slice(0, 5)
      : [], [supplierName, suppliers, knownSupplier]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders & Deliveries</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Stock you ordered from suppliers — where it is, when it arrives, what came</p>
            {!canEdit && <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1"><ShieldCheck className="w-3 h-3" /> View Only</Badge>}
          </div>
        </div>
        {canEdit && <Button className="gap-2" onClick={openCreate}><Plus className="w-4 h-4" /> New Order</Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Coming" value={active.length} icon={Truck} variant="primary"
          description={`${active.reduce((s, o) => s + o.pieces - o.piecesReceived, 0)} pieces still expected`} />
        <StatCard title="Late" value={late.length} icon={AlertTriangle} variant="warning"
          description={late.length ? 'Call the supplier' : 'Nothing is late'} />
        <StatCard title="Owed to suppliers" value={formatRWF(owedToSuppliers)} icon={Wallet} variant="destructive"
          description="Goods + transport not yet paid" />
      </div>

      <Tabs defaultValue="coming">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="coming">Coming ({active.length})</TabsTrigger>
          <TabsTrigger value="arrived">Arrived ({done.length})</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
        <TabsContent value="coming" className="mt-4">{list(active, 'No orders on the way. Tap “New Order” when you buy from a supplier.')}</TabsContent>
        <TabsContent value="arrived" className="mt-4">{list(done, 'No orders have arrived yet.')}</TabsContent>
        <TabsContent value="cancelled" className="mt-4">{list(cancelled, 'No cancelled orders.')}</TabsContent>
      </Tabs>

      {/* ── New order ── */}
      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        className="sm:max-w-2xl"
        title="New Order"
        description="What you bought, from whom, and how it's coming."
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={saveOrder} disabled={!canSave || createOrder.isPending}>
              {createOrder.isPending ? 'Saving…' : `Save order${goods + (Number(shipping) || 0) > 0 ? ` · ${formatRWF(goods + (Number(shipping) || 0))}` : ''}`}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2 relative">
            <Label>Supplier</Label>
            <Input placeholder="e.g. Kampala wholesaler, Nyabugogo shop" value={supplierName} onChange={e => setSupplierName(e.target.value)} />
            {supplierMatches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
                {supplierMatches.map(s => (
                  <button key={s.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => setSupplierName(s.name)}>
                    {s.name}{s.phone && <span className="text-muted-foreground"> · {s.phone}</span>}
                  </button>
                ))}
              </div>
            )}
            {knownSupplier && <p className="text-xs text-green-600">Saved supplier{knownSupplier.phone ? ` · ${knownSupplier.phone}` : ''}</p>}
          </div>
          {!knownSupplier && supplierName.trim() && (
            <div className="space-y-2">
              <Label>Supplier phone <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input type="tel" placeholder="0788 000 000" value={supplierPhone} onChange={e => setSupplierPhone(e.target.value)} />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>What did you order?</Label>
          {lines.map((l, idx) => (
            <div key={l.key} className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0"><ItemCombo items={items} value={l.item} onPick={item => setLine(l.key, { item, unit_cost: l.unit_cost || (item.variants.find(v => v.cost_price !== null)?.cost_price?.toString() ?? '') })} /></div>
                {lines.length > 1 && (
                  <Button type="button" size="icon" variant="ghost" className="text-destructive shrink-0" onClick={() => setLines(lines.filter(x => x.key !== l.key))}><Trash2 className="w-4 h-4" /></Button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <Input list={`sizes-${l.key}`} placeholder="Size" value={l.size} onChange={e => setLine(l.key, { size: e.target.value })} />
                  <datalist id={`sizes-${l.key}`}>{sizesOf(l.item).map(s => <option key={s} value={s} />)}</datalist>
                </div>
                <div>
                  <Input list={`colors-${l.key}`} placeholder="Colour" value={l.color} onChange={e => setLine(l.key, { color: e.target.value })} />
                  <datalist id={`colors-${l.key}`}>{colorsOf(l.item).map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <Input type="number" inputMode="numeric" min="1" placeholder="Pieces" value={l.quantity} onChange={e => setLine(l.key, { quantity: e.target.value })} />
                <MoneyInput placeholder="Cost each" value={l.unit_cost} onChange={unit_cost => setLine(l.key, { unit_cost })} />
              </div>
              {Number(l.quantity) > 0 && Number(l.unit_cost) > 0 && (
                <p className="text-xs text-right text-muted-foreground">{l.quantity} × {formatRWF(Number(l.unit_cost))} = <b className="text-foreground">{formatRWF(Number(l.quantity) * Number(l.unit_cost))}</b></p>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLines([...lines, { ...blankLine(Date.now()), item: lines[lines.length - 1]?.item ?? null, unit_cost: lines[lines.length - 1]?.unit_cost ?? '' }])}>
            <Plus className="w-4 h-4" /> Another size / colour / item
          </Button>
          <p className="text-xs text-muted-foreground">New item? Add it in Stock first with 0 pieces. New sizes or colours are created when the goods arrive.</p>
        </div>

        <div className="space-y-2">
          <Label>Where is it now?</Label>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: false, label: 'Just ordered', icon: ClipboardList }, { v: true, label: 'Already on the way', icon: Truck }].map(o => (
              <button key={o.label} type="button" onClick={() => setOnTheWay(o.v)}
                className={cn('rounded-lg border-2 px-3 py-2.5 text-sm font-medium flex items-center gap-2 justify-center',
                  onTheWay === o.v ? 'border-primary bg-primary/10' : 'border-border')}>
                <o.icon className="w-4 h-4" /> {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Expected to arrive</Label>
          <Input type="date" value={expected} onChange={e => setExpected(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {[{ l: 'Tomorrow', d: 1 }, { l: 'In 3 days', d: 3 }, { l: 'In a week', d: 7 }, { l: 'In 2 weeks', d: 14 }, { l: 'In a month', d: 30 }].map(o => (
              <Button key={o.d} type="button" size="sm" className="h-7 text-xs" variant={expected === inDays(o.d) ? 'default' : 'outline'} onClick={() => setExpected(inDays(o.d))}>{o.l}</Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>How is it coming?</Label>
          <div className="flex flex-wrap gap-1.5">
            {TRANSPORT.map(t => (
              <Button key={t} type="button" size="sm" className="h-8" variant={transport === t ? 'default' : 'outline'} onClick={() => setTransport(transport === t ? '' : t)}>{t}</Button>
            ))}
          </div>
          <Input placeholder="Envelope / parcel / tracking number, bus company, driver phone…" value={tracking} onChange={e => setTracking(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Transport cost</Label>
            <MoneyInput placeholder="0" value={shipping} onChange={setShipping} />
          </div>
          <div className="space-y-2">
            <Label>Paid to supplier so far</Label>
            <MoneyInput placeholder="0" value={paid} onChange={setPaid} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notes <span className="text-muted-foreground font-normal">optional</span></Label>
          <Textarea rows={2} placeholder="e.g. Supplier will add 2 free belts" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="rounded-xl bg-muted/50 p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Goods</span><span>{formatRWF(goods)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Transport</span><span>{formatRWF(Number(shipping) || 0)}</span></div>
          <div className="flex justify-between font-semibold"><span>Total</span><span>{formatRWF(goods + (Number(shipping) || 0))}</span></div>
          {(Number(paid) || 0) > 0 && <div className="flex justify-between text-amber-600"><span>Still to pay</span><span>{formatRWF(Math.max(0, goods + (Number(shipping) || 0) - Number(paid)))}</span></div>}
        </div>
      </FormDialog>

      {/* ── Goods arrived ── */}
      <FormDialog
        open={!!receiving}
        onOpenChange={o => !o && setReceiving(null)}
        title={receiving ? `Check in order #${receiving.po_no}` : ''}
        description="Count what actually arrived. Only these pieces are added to stock."
        footer={
          <>
            <Button variant="outline" onClick={() => setReceiving(null)}>Cancel</Button>
            <Button className="gap-1.5 bg-green-600 hover:bg-green-700" disabled={arrivingNow <= 0 || receive.isPending}
              onClick={async () => {
                if (!receiving) return;
                await receive.mutateAsync({ orderId: receiving.id, lines: Object.entries(arrived).filter(([, n]) => n > 0).map(([line_id, quantity]) => ({ line_id, quantity })) });
                setReceiving(null);
              }}>
              <CheckCircle2 className="w-4 h-4" /> Add {arrivingNow} pieces to stock
            </Button>
          </>
        }
      >
        {receiving?.lines.map(l => {
          const left = Math.max(0, l.quantity_ordered - l.quantity_received);
          const n = arrived[l.id] ?? 0;
          return (
            <div key={l.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.item_name}</p>
                  <OptionTag size={l.size} color={l.color} className="text-xs" />
                </div>
                <p className="text-xs text-muted-foreground text-right">Ordered {l.quantity_ordered}<br />Already in {l.quantity_received}</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">Arrived now</span>
                <div className="flex items-center gap-1">
                  <Button type="button" size="icon" variant="outline" className="h-9 w-9" disabled={n <= 0} onClick={() => setArrived({ ...arrived, [l.id]: n - 1 })}><Minus className="w-4 h-4" /></Button>
                  <Input type="number" inputMode="numeric" className="h-9 w-16 text-center font-semibold" value={n || ''} placeholder="0"
                    onChange={e => setArrived({ ...arrived, [l.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                  <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => setArrived({ ...arrived, [l.id]: n + 1 })}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
              {n > left && <p className="text-xs text-amber-600">That's {n - left} more than ordered — fine if the supplier sent extra.</p>}
              {n < left && n > 0 && <p className="text-xs text-muted-foreground">{left - n} still expected later.</p>}
              {left === 0 && n === 0 && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> All in</p>}
            </div>
          );
        })}
        {receiving && (
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setArrived(Object.fromEntries(receiving.lines.map(l => [l.id, 0])))}>
            <Package className="w-4 h-4" /> Set all to 0
          </Button>
        )}
      </FormDialog>

      {/* ── Pay supplier ── */}
      <FormDialog
        open={!!paying}
        onOpenChange={o => !o && setPaying(null)}
        title="Pay Supplier"
        description={paying && <>Order #{paying.po_no} · {paying.supplier_name || 'supplier'} · still to pay {formatRWF(Math.max(0, paying.total - paying.amount_paid))}</>}
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)}>Cancel</Button>
            <Button disabled={!(Number(payAmount) > 0) || update.isPending}
              onClick={async () => {
                if (!paying) return;
                await update.mutateAsync({ id: paying.id, amount_paid: paying.amount_paid + Number(payAmount) });
                setPaying(null);
              }}>
              Record {Number(payAmount) > 0 ? formatRWF(Number(payAmount)) : 'payment'}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label>Amount paid now</Label>
          <MoneyInput autoFocus className="h-12 text-lg font-semibold" value={payAmount} onChange={setPayAmount} />
          {paying && (
            <Button type="button" size="sm" variant="outline" onClick={() => setPayAmount(String(Math.max(0, paying.total - paying.amount_paid)))}>
              Everything · {formatRWF(Math.max(0, paying.total - paying.amount_paid))}
            </Button>
          )}
        </div>
      </FormDialog>

      <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.action === 'cancel' ? `Cancel order #${confirm.order.po_no}?` : `Delete order #${confirm?.order.po_no}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === 'cancel' ? 'Use this when the supplier won’t deliver. Nothing is added to stock.' : 'The cancelled order is removed for good.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => {
              if (!confirm) return;
              if (confirm.action === 'cancel') update.mutate({ id: confirm.order.id, status: 'cancelled' });
              else remove.mutate(confirm.order.id);
              setConfirm(null);
            }}>
              {confirm?.action === 'cancel' ? 'Cancel order' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
