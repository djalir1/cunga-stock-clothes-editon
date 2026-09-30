import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStockItems, type StockItemWithCategory } from '@/hooks/useStockItems';
import { useAuth } from '@/contexts/AuthContext';
import { formatRWF, optionLabel } from '@/lib/format';
import type { StockVariant } from '@/lib/types';
import { FormDialog } from '@/components/shop/FormDialog';
import { ItemWizard } from '@/components/shop/ItemWizard';
import { EditItemDialog } from '@/components/shop/EditItemDialog';
import { SetsPanel } from '@/components/shop/SetsPanel';
import { ItemThumb } from '@/components/shop/PhotoInput';
import { SizePicker, ColorPicker, ColorDot, OptionTag } from '@/components/shop/OptionPickers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Search, Trash2, ShieldCheck, RefreshCcw, Layers, ShoppingCart, Pencil, MoreVertical, PackagePlus, Palette, Shirt } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { MoneyInput } from '@/components/shop/MoneyInput';

/** Size / colour picker used by the Sell dialog */
function VariantSelect({ variants, value, onChange }: {
  variants: StockVariant[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Choose size / colour" /></SelectTrigger>
      <SelectContent>
        {variants.map(v => (
          <SelectItem key={v.id} value={v.id} disabled={v.quantity <= 0}>
            <span className="inline-flex items-center gap-2">
              <ColorDot color={v.color} />
              {optionLabel(v.size, v.color)} — {v.quantity} left
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'in_stock': return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">In Stock</Badge>;
    case 'low_stock': return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Low Stock</Badge>;
    case 'out_of_stock': return <Badge variant="destructive">Sold Out</Badge>;
    default: return null;
  }
}

const hasOptions = (item: StockItemWithCategory) => item.variants.length > 1 || item.variants.some(v => v.size || v.color);

/** Every size / colour with its count, sold-out ones struck through */
function VariantChips({ item }: { item: StockItemWithCategory }) {
  if (!hasOptions(item)) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {item.variants.map(v => (
        <Badge key={v.id} variant="outline"
          className={`text-[10px] font-normal gap-1 ${v.quantity === 0 ? 'text-muted-foreground line-through' : ''}`}>
          <ColorDot color={v.color} className="w-2 h-2" />
          {optionLabel(v.size, v.color)}: {v.quantity}
        </Badge>
      ))}
    </div>
  );
}

function priceRange(item: StockItemWithCategory) {
  const prices = item.variants.map(v => v.default_price).filter((p): p is number => p !== null);
  if (!prices.length) return null;
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? formatRWF(lo) : `${formatRWF(lo)} – ${formatRWF(hi)}`;
}

export default function Stock() {
  const { items, isLoading, addVariant, sellItem, restockVariant, deleteItem } = useStockItems();
  const { canEdit } = useAuth();
  const isKeeper = canEdit;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tab, setTab] = useState('items');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newSetSignal, setNewSetSignal] = useState(0);
  const [editingItem, setEditingItem] = useState<StockItemWithCategory | null>(null);

  // Sell
  const [sellingItem, setSellingItem] = useState<StockItemWithCategory | null>(null);
  const [sellForm, setSellForm] = useState({ variantId: '', quantity: '1', unitPrice: '', customer: '' });

  // Restock
  const [restockingItem, setRestockingItem] = useState<StockItemWithCategory | null>(null);
  const [restockForm, setRestockForm] = useState({ variantId: '', quantity: '' });

  // Add sizes / colours to an existing item
  const [variantItem, setVariantItem] = useState<StockItemWithCategory | null>(null);
  const [variantForm, setVariantForm] = useState({ sizes: [] as string[], colors: [] as string[], quantity: '' });
  const [addingVariants, setAddingVariants] = useState(false);

  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  // Dashboard "Add Item" links here with ?add=1
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('add') === '1' && isKeeper) {
      setIsAddOpen(true);
      setSearchParams({}, { replace: true });
    }
    // Header search opens Stock filtered to what was picked
    const q = searchParams.get('q');
    if (q !== null) {
      setSearch(q);
      setTab('items');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, isKeeper]);

  const filteredItems = items.filter((item) => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const text = `${item.name} ${item.category?.name ?? ''} ${item.variants.map(v => `${v.size ?? ''} ${v.color ?? ''}`).join(' ')}`.toLowerCase();
    const matchesSearch = words.every(w => text.includes(w));
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openSell = (item: StockItemWithCategory) => {
    setSellingItem(item);
    setSellForm({ variantId: item.variants.find(v => v.quantity > 0)?.id ?? '', quantity: '1', unitPrice: '', customer: '' });
  };

  const sellVariant = sellingItem?.variants.find(v => v.id === sellForm.variantId);
  const sellQty = Number(sellForm.quantity) || 0;
  const sellPrice = sellForm.unitPrice === '' ? null : Number(sellForm.unitPrice);
  const canConfirmSale = !!sellVariant && sellQty > 0 && sellQty <= sellVariant.quantity && sellPrice !== null && sellPrice >= 0;

  const handleSellConfirm = () => {
    if (!canConfirmSale || !isKeeper || sellPrice === null) return;
    sellItem.mutate(
      { variantId: sellForm.variantId, quantity: sellQty, unitPrice: sellPrice, customerName: sellForm.customer.trim() || undefined },
      { onSuccess: () => setSellingItem(null) },
    );
  };

  const openRestock = (item: StockItemWithCategory) => {
    setRestockingItem(item);
    setRestockForm({ variantId: item.variants.length === 1 ? item.variants[0].id : '', quantity: '' });
  };

  const handleRestockConfirm = () => {
    const qty = Number(restockForm.quantity);
    if (!restockForm.variantId || qty <= 0 || !isKeeper) return;
    restockVariant.mutate(
      { variantId: restockForm.variantId, quantity: qty },
      { onSuccess: () => setRestockingItem(null) },
    );
  };

  const openAddVariants = (item: StockItemWithCategory) => {
    setVariantItem(item);
    setVariantForm({ sizes: [], colors: [], quantity: '' });
  };

  // New size × colour combinations the item doesn't have yet
  const newCombos = (() => {
    if (!variantItem) return [];
    const sizes = variantForm.sizes.length ? variantForm.sizes : [null];
    const colors = variantForm.colors.length ? variantForm.colors : [null];
    const has = new Set(variantItem.variants.map(v => `${(v.size ?? '').toLowerCase()}|${(v.color ?? '').toLowerCase()}`));
    return sizes.flatMap(size => colors.map(color => ({ size, color })))
      .filter(c => (c.size || c.color) && !has.has(`${(c.size ?? '').toLowerCase()}|${(c.color ?? '').toLowerCase()}`));
  })();

  const handleAddVariants = async () => {
    if (!variantItem || !isKeeper || !newCombos.length) return;
    const price = variantItem.variants.find(v => v.default_price !== null)?.default_price ?? null;
    const cost = variantItem.variants.find(v => v.cost_price !== null)?.cost_price ?? null;
    setAddingVariants(true);
    try {
      for (const c of newCombos) {
        await addVariant.mutateAsync({
          itemId: variantItem.id,
          variant: { size: c.size ?? undefined, color: c.color ?? undefined, quantity: Number(variantForm.quantity) || 0, default_price: price, cost_price: cost },
        });
      }
      setVariantItem(null);
    } catch { /* the hook shows the error */ } finally {
      setAddingVariants(false);
    }
  };

  const actionsMenu = (item: StockItemWithCategory) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="outline" aria-label="More actions"><MoreVertical className="w-4 h-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setEditingItem(item)}><Pencil className="w-4 h-4 mr-2" /> Edit name, price, photo…</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openAddVariants(item)}><Palette className="w-4 h-4 mr-2" /> Add sizes / colours</DropdownMenuItem>
        <DropdownMenuItem onClick={() => openSell(item)} disabled={item.quantity <= 0}><ShoppingCart className="w-4 h-4 mr-2" /> Quick sale</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteItemId(item.id)}>
          <Trash2 className="w-4 h-4 mr-2" /> Delete item
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Every garment, colour and size in your shop</p>
            {!isKeeper && (
              <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1">
                <ShieldCheck className="w-3 h-3" /> View Only
              </Badge>
            )}
          </div>
        </div>

        {isKeeper && (
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" asChild>
              <Link to="/sales"><ShoppingCart className="w-4 h-4" /> New Sale</Link>
            </Button>
            {tab === 'sets' ? (
              <Button className="gap-2" onClick={() => setNewSetSignal(n => n + 1)}><Layers className="w-4 h-4" /> New Set</Button>
            ) : (
              <Button className="gap-2" onClick={() => setIsAddOpen(true)}><Plus className="w-4 h-4" /> Add Item</Button>
            )}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="items" className="gap-1.5"><Shirt className="w-4 h-4" /> Items ({items.length})</TabsTrigger>
          <TabsTrigger value="sets" className="gap-1.5"><Layers className="w-4 h-4" /> Outfit sets</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search: “shirt navy”, “jeans 32”…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="sm:w-[180px]"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All items</SelectItem>
                    <SelectItem value="in_stock">In Stock</SelectItem>
                    <SelectItem value="low_stock">Low Stock</SelectItem>
                    <SelectItem value="out_of_stock">Sold Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12"><RefreshCcw className="w-8 h-8 animate-spin text-primary" /></div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shirt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>{items.length === 0 ? 'No items yet.' : 'No items match your search.'}</p>
                  {items.length === 0 && isKeeper && (
                    <Button className="mt-4 gap-2" onClick={() => setIsAddOpen(true)}><Plus className="w-4 h-4" /> Add your first item</Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Phones: cards */}
                  <div className="space-y-3 md:hidden">
                    {filteredItems.map(item => (
                      <div key={item.id} className="rounded-xl border border-border p-3">
                        <div className="flex gap-3">
                          <ItemThumb url={item.image_url} color={item.category?.color} className="w-14 h-14" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold truncate">{item.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.category?.name ?? 'No category'}{priceRange(item) && ` · ${priceRange(item)}`}
                                </p>
                              </div>
                              {isKeeper && actionsMenu(item)}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <StatusBadge status={item.status} />
                              <span className="text-sm"><b>{item.quantity}</b> left · {item.issued ?? 0} sold</span>
                            </div>
                          </div>
                        </div>
                        <VariantChips item={item} />
                        {isKeeper && (
                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openRestock(item)}>
                              <PackagePlus className="w-4 h-4" /> Restock
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openSell(item)} disabled={item.quantity <= 0}>
                              <ShoppingCart className="w-4 h-4" /> Sell
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Larger screens: table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead className="text-center">In stock</TableHead>
                          <TableHead className="text-center">Sold</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Updated</TableHead>
                          {isKeeper && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="flex gap-3">
                                <ItemThumb url={item.image_url} color={item.category?.color} />
                                <div className="min-w-0">
                                  <div className="font-medium">{item.name}</div>
                                  <VariantChips item={item} />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.category ? (
                                <Badge variant="outline" className="gap-1.5 inline-flex items-center" style={{ borderColor: item.category.color }}>
                                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.category.color }} />
                                  {item.category.name}
                                </Badge>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{priceRange(item) ?? <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="text-center font-mono font-semibold">{item.quantity}</TableCell>
                            <TableCell className="text-center font-mono text-rose-600">{item.issued ?? 0}</TableCell>
                            <TableCell><StatusBadge status={item.status} /></TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                              {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                            </TableCell>
                            {isKeeper && (
                              <TableCell className="text-right">
                                <div className="flex justify-end items-center gap-1">
                                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openRestock(item)}>
                                    <PackagePlus className="w-4 h-4" /> Restock
                                  </Button>
                                  <Button size="icon" variant="outline" onClick={() => setEditingItem(item)} aria-label="Edit item">
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  {actionsMenu(item)}
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sets" className="mt-4">
          <SetsPanel canEdit={isKeeper} createSignal={newSetSignal} />
        </TabsContent>
      </Tabs>

      <ItemWizard open={isAddOpen} onOpenChange={setIsAddOpen} />
      <EditItemDialog item={editingItem} onClose={() => setEditingItem(null)} />

      {/* QUICK SALE (the Sales page handles receipts, sets and credit) */}
      <FormDialog
        open={!!sellingItem}
        onOpenChange={(open) => !open && setSellingItem(null)}
        title="Quick Sale"
        description={sellingItem?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setSellingItem(null)}>Cancel</Button>
            <Button onClick={handleSellConfirm} className="bg-green-600 hover:bg-green-700" disabled={!canConfirmSale || sellItem.isPending}>
              Confirm Sale
            </Button>
          </>
        }
      >
        {sellingItem && hasOptions(sellingItem) && (
          <div className="space-y-2">
            <Label>Size / Colour</Label>
            <VariantSelect variants={sellingItem.variants} value={sellForm.variantId} onChange={(id) => setSellForm({ ...sellForm, variantId: id })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Pieces</Label>
            <Input type="number" min="1" max={sellVariant?.quantity} value={sellForm.quantity}
              onChange={(e) => setSellForm({ ...sellForm, quantity: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Price per piece</Label>
            <MoneyInput
              placeholder={sellVariant?.default_price ? `Usual: ${sellVariant.default_price.toLocaleString('en-US')}` : 'Agreed price'}
              value={sellForm.unitPrice} onChange={unitPrice => setSellForm({ ...sellForm, unitPrice })} />
            {sellVariant && sellVariant.default_price !== null && sellForm.unitPrice === '' && (
              <button type="button" className="text-xs text-primary font-medium"
                onClick={() => setSellForm({ ...sellForm, unitPrice: String(sellVariant.default_price) })}>
                Use usual price
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Customer name (optional)</Label>
          <Input placeholder="e.g. Jane Doe" value={sellForm.customer}
            onChange={(e) => setSellForm({ ...sellForm, customer: e.target.value.replace(/[^\p{L}\s'.,-]/gu, '') })} />
        </div>
        {sellVariant && sellQty > sellVariant.quantity && (
          <p className="text-sm text-destructive">Only {sellVariant.quantity} left in this size / colour.</p>
        )}
        {sellPrice !== null && sellQty > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="font-semibold">{formatRWF(sellQty * sellPrice)}</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Need a receipt, several items, a set, or credit? Use <Link to="/sales" className="text-primary font-medium">Sales</Link>.
        </p>
      </FormDialog>

      {/* RESTOCK */}
      <FormDialog
        open={!!restockingItem}
        onOpenChange={(open) => !open && setRestockingItem(null)}
        title="Restock"
        description={restockingItem?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setRestockingItem(null)}>Cancel</Button>
            <Button onClick={handleRestockConfirm} className="bg-green-600 hover:bg-green-700"
              disabled={!restockForm.variantId || !(Number(restockForm.quantity) > 0) || restockVariant.isPending}>
              Add to Stock
            </Button>
          </>
        }
      >
        {restockingItem && hasOptions(restockingItem) && (
          <div className="space-y-2">
            <Label>Which colour / size came in?</Label>
            <div className="flex flex-wrap gap-2">
              {restockingItem.variants.map(v => (
                <button key={v.id} type="button"
                  onClick={() => setRestockForm({ ...restockForm, variantId: v.id })}
                  className={`rounded-lg border-2 px-3 py-2 text-sm transition-all ${
                    restockForm.variantId === v.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                  <OptionTag size={v.size} color={v.color} />
                  <span className="block text-xs text-muted-foreground mt-0.5">{v.quantity} in stock</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {restockingItem && (
          <button type="button" className="text-xs text-primary font-medium"
            onClick={() => { const it = restockingItem; setRestockingItem(null); openAddVariants(it); }}>
            + A new colour or size came in
          </button>
        )}
        <div className="space-y-2">
          <Label>How many pieces came in?</Label>
          <Input type="number" inputMode="numeric" placeholder="0" value={restockForm.quantity}
            onChange={(e) => setRestockForm({ ...restockForm, quantity: e.target.value })} />
        </div>
      </FormDialog>

      {/* ADD SIZES / COLOURS */}
      <FormDialog
        open={!!variantItem}
        onOpenChange={(open) => !open && setVariantItem(null)}
        title="Add Sizes / Colours"
        description={variantItem && <>New options for <b>{variantItem.name}</b>. You can choose several at once.</>}
        className="sm:max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setVariantItem(null)}>Cancel</Button>
            <Button onClick={handleAddVariants} disabled={!newCombos.length || addingVariants}>
              {addingVariants ? 'Adding…' : newCombos.length ? `Add ${newCombos.length} option${newCombos.length > 1 ? 's' : ''}` : 'Add'}
            </Button>
          </>
        }
      >
        {variantItem && (
          <>
            <div className="space-y-2">
              <Label>Colours</Label>
              <ColorPicker multiple value={variantForm.colors} onChange={colors => setVariantForm({ ...variantForm, colors })} />
            </div>
            <div className="space-y-2">
              <Label>Sizes</Label>
              <SizePicker multiple value={variantForm.sizes} onChange={sizes => setVariantForm({ ...variantForm, sizes })} />
            </div>
            <div className="flex items-center gap-3">
              <Label className="shrink-0">Pieces of each</Label>
              <Input type="number" inputMode="numeric" min="0" className="w-24" placeholder="0" value={variantForm.quantity}
                onChange={e => setVariantForm({ ...variantForm, quantity: e.target.value })} />
            </div>
            {newCombos.length > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
                <p className="font-medium">Will add:</p>
                <div className="flex flex-wrap gap-1.5">
                  {newCombos.map(c => (
                    <Badge key={`${c.size}|${c.color}`} variant="outline" className="gap-1 font-normal">
                      <OptionTag size={c.size} color={c.color} />
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Options the item already has are skipped. They get the item's usual price.</p>
              </div>
            )}
          </>
        )}
      </FormDialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the item, all its sizes and colours, and its stock history.
              Past sales and receipts are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteItemId) deleteItem.mutate(deleteItemId); setDeleteItemId(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
