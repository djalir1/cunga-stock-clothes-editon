import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStockItems, type StockItemWithCategory, type NewVariantInput } from '@/hooks/useStockItems';
import { useCategories } from '@/hooks/useCategories';
import { useAuth } from '@/contexts/AuthContext';
import { formatRWF, optionLabel } from '@/lib/format';
import type { StockVariant } from '@/lib/types';
import { FormDialog } from '@/components/shop/FormDialog';
import { SizePicker, ColorPicker, ColorDot, OptionTag } from '@/components/shop/OptionPickers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Search, Minus, Trash2, ShieldCheck, RefreshCcw, Layers, ShoppingCart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const ONE = '__one__'; // key for "no size" / "no colour" in the quantity grid
const cellKey = (size: string, color: string) => `${size}|${color}`;
const toNumberOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/** Size / colour picker used by the Sell and Restock dialogs */
function VariantSelect({ variants, value, onChange, showStock = true }: {
  variants: StockVariant[];
  value: string;
  onChange: (id: string) => void;
  showStock?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Choose size / colour" /></SelectTrigger>
      <SelectContent>
        {variants.map(v => (
          <SelectItem key={v.id} value={v.id} disabled={showStock && v.quantity <= 0}>
            <span className="inline-flex items-center gap-2">
              <ColorDot color={v.color} />
              {optionLabel(v.size, v.color)}{showStock && ` — ${v.quantity} left`}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function Stock() {
  const { items, isLoading, addItem, addVariant, sellItem, restockVariant, deleteItem } = useStockItems();
  const { categories } = useCategories();
  const { canEdit } = useAuth();

  const isKeeper = canEdit;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Add item
  const emptyNewItem = { name: '', category_id: '', min_quantity: '5', default_price: '', cost_price: '' };
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newItem, setNewItem] = useState(emptyNewItem);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const gridSizes = sizes.length ? sizes : [ONE];
  const gridColors = colors.length ? colors : [ONE];
  const gridTotal = gridSizes.reduce((sum, s) => sum + gridColors.reduce((t, c) => t + (Number(grid[cellKey(s, c)]) || 0), 0), 0);

  // Sell
  const [sellingItem, setSellingItem] = useState<StockItemWithCategory | null>(null);
  const [sellForm, setSellForm] = useState({ variantId: '', quantity: '1', unitPrice: '', customer: '' });

  // Restock
  const [restockingItem, setRestockingItem] = useState<StockItemWithCategory | null>(null);
  const [restockForm, setRestockForm] = useState({ variantId: '', quantity: '' });

  // Add size / colour to an existing item
  const emptyVariantForm = { size: [] as string[], color: [] as string[], quantity: '', default_price: '', cost_price: '' };
  const [variantItem, setVariantItem] = useState<StockItemWithCategory | null>(null);
  const [variantForm, setVariantForm] = useState(emptyVariantForm);

  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  // Dashboard "Add Item" links here with ?add=1
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('add') === '1' && isKeeper) {
      setIsAddOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, isKeeper]);

  const filteredItems = items.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(q)
      || item.variants.some(v => `${v.size ?? ''} ${v.color ?? ''}`.toLowerCase().includes(q));
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const resetAddForm = () => {
    setNewItem(emptyNewItem);
    setSizes([]);
    setColors([]);
    setGrid({});
  };

  const handleAddItem = () => {
    if (!newItem.name.trim() || !isKeeper) return;
    const variants: NewVariantInput[] = gridSizes.flatMap(s => gridColors.map(c => ({
      size: s === ONE ? undefined : s,
      color: c === ONE ? undefined : c,
      quantity: Number(grid[cellKey(s, c)]) || 0,
      default_price: toNumberOrNull(newItem.default_price),
      cost_price: toNumberOrNull(newItem.cost_price),
    })));
    addItem.mutate(
      {
        name: newItem.name.trim(),
        category_id: newItem.category_id || null,
        min_quantity: Number(newItem.min_quantity) || 5,
        variants,
      },
      { onSuccess: () => { resetAddForm(); setIsAddOpen(false); } },
    );
  };

  const firstAvailable = (item: StockItemWithCategory) => item.variants.find(v => v.quantity > 0)?.id ?? '';

  const openSell = (item: StockItemWithCategory) => {
    setSellingItem(item);
    setSellForm({ variantId: firstAvailable(item), quantity: '1', unitPrice: '', customer: '' });
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

  const openAddVariant = (item: StockItemWithCategory) => {
    setVariantItem(item);
    setVariantForm(emptyVariantForm);
  };

  const handleAddVariant = () => {
    if (!variantItem || !isKeeper) return;
    addVariant.mutate(
      {
        itemId: variantItem.id,
        variant: {
          size: variantForm.size[0],
          color: variantForm.color[0],
          quantity: Number(variantForm.quantity) || 0,
          default_price: toNumberOrNull(variantForm.default_price),
          cost_price: toNumberOrNull(variantForm.cost_price),
        },
      },
      { onSuccess: () => setVariantItem(null) },
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_stock': return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">In Stock</Badge>;
      case 'low_stock': return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Low Stock</Badge>;
      case 'out_of_stock': return <Badge variant="destructive">Out of Stock</Badge>;
      default: return null;
    }
  };

  const hasOptions = (item: StockItemWithCategory) =>
    item.variants.length > 1 || item.variants.some(v => v.size || v.color);

  const gridLabel = (v: string, kind: 'size' | 'color') =>
    v === ONE ? (kind === 'size' ? 'Qty' : 'Qty') : v;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Inventory</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Every garment, size and colour in your shop</p>
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
            <Button className="gap-2" onClick={() => { resetAddForm(); setIsAddOpen(true); }}>
              <Plus className="w-4 h-4" /> Add Item
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search items, sizes or colours..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in_stock">In Stock</SelectItem>
                <SelectItem value="low_stock">Low Stock</SelectItem>
                <SelectItem value="out_of_stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCcw className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>{items.length === 0 ? 'No items yet.' : 'No items match your search.'}</p>
              {items.length === 0 && isKeeper && (
                <Button className="mt-4 gap-2" onClick={() => { resetAddForm(); setIsAddOpen(true); }}>
                  <Plus className="w-4 h-4" /> Add your first item
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Total Added</TableHead>
                  <TableHead className="text-center">Remaining</TableHead>
                  <TableHead className="text-center">Sold</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  {isKeeper && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div>{item.name}</div>
                      {hasOptions(item) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.variants.map(v => (
                            <Badge
                              key={v.id}
                              variant="outline"
                              className={`text-[10px] font-normal gap-1 ${v.quantity === 0 ? 'text-muted-foreground line-through' : ''}`}
                            >
                              <ColorDot color={v.color} className="w-2 h-2" />
                              {optionLabel(v.size, v.color)}: {v.quantity}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.category ? (
                        <Badge variant="outline" className="gap-1.5 inline-flex items-center" style={{ borderColor: item.category.color }}>
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.category.color }} />
                          {item.category.name}
                        </Badge>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-center font-mono">{item.total_added ?? 0}</TableCell>
                    <TableCell className="text-center font-mono">{item.quantity}</TableCell>
                    <TableCell className="text-center font-mono text-rose-600 font-medium">
                      {item.issued ?? 0}
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                    </TableCell>

                    {isKeeper && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" className="text-muted-foreground" onClick={() => openSell(item)} disabled={item.quantity <= 0}>
                                <Minus className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Quick sale (use Sales for receipts & credit)</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" onClick={() => openRestock(item)}>
                                <Plus className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Restock</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="icon" variant="ghost" onClick={() => openAddVariant(item)}>
                                <Layers className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Add size / colour</TooltipContent>
                          </Tooltip>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteItemId(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ADD ITEM DIALOG */}
      <FormDialog
        open={isAddOpen}
        onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetAddForm(); }}
        title="Add New Item"
        description="Tap the sizes and colours it comes in, then enter how many you have of each."
        className="sm:max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddItem} disabled={!newItem.name.trim() || addItem.isPending}>
              Save Item{gridTotal > 0 && ` · ${gridTotal} pieces`}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Item Name</Label>
            <Input placeholder="e.g. Cotton Shirt" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={newItem.category_id} onValueChange={(v) => setNewItem({ ...newItem, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Sizes <span className="text-muted-foreground font-normal">(skip for one-size items)</span></Label>
          <SizePicker multiple value={sizes} onChange={setSizes} />
        </div>

        <div className="space-y-2">
          <Label>Colours <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <ColorPicker multiple value={colors} onChange={setColors} />
        </div>

        <div className="space-y-2">
          <Label>How many of each?</Label>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              {colors.length > 0 && (
                <thead>
                  <tr className="bg-muted/40">
                    <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">{sizes.length ? 'Size' : ''}</th>
                    {gridColors.map(c => (
                      <th key={c} className="px-2 py-1.5 text-center font-medium">
                        <span className="inline-flex items-center gap-1.5"><ColorDot color={c} />{c}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {gridSizes.map(s => (
                  <tr key={s} className="border-t border-border first:border-t-0">
                    <td className="px-2 py-1.5 font-medium whitespace-nowrap">{s === ONE ? (colors.length ? '' : gridLabel(s, 'size')) : s}</td>
                    {gridColors.map(c => (
                      <td key={c} className="px-1.5 py-1.5">
                        <Input
                          type="number" min="0" placeholder="0" className="h-8 min-w-16 text-center"
                          value={grid[cellKey(s, c)] ?? ''}
                          onChange={(e) => setGrid(g => ({ ...g, [cellKey(s, c)]: e.target.value }))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Usual Price (RWF)</Label>
            <Input type="number" min="0" placeholder="Optional" value={newItem.default_price} onChange={(e) => setNewItem({ ...newItem, default_price: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Cost Price (RWF)</Label>
            <Input type="number" min="0" placeholder="Optional" value={newItem.cost_price} onChange={(e) => setNewItem({ ...newItem, cost_price: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Low Stock at</Label>
            <Input type="number" min="1" value={newItem.min_quantity} onChange={(e) => setNewItem({ ...newItem, min_quantity: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">The usual price is only a reminder — you type the agreed price on every sale.</p>
      </FormDialog>

      {/* SALE DIALOG (quick sale; the Sales page handles receipts and credit) */}
      <FormDialog
        open={!!sellingItem}
        onOpenChange={(open) => !open && setSellingItem(null)}
        title="Quick Sale"
        description={sellingItem?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setSellingItem(null)}>Cancel</Button>
            <Button onClick={handleSellConfirm} variant="destructive" disabled={!canConfirmSale || sellItem.isPending}>
              Confirm Sale
            </Button>
          </>
        }
      >
        {sellingItem && hasOptions(sellingItem) && (
          <div className="space-y-2">
            <Label>Size / Colour</Label>
            <VariantSelect
              variants={sellingItem.variants}
              value={sellForm.variantId}
              onChange={(id) => setSellForm({ ...sellForm, variantId: id })}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Quantity Sold</Label>
            <Input
              type="number"
              min="1"
              max={sellVariant?.quantity}
              value={sellForm.quantity}
              onChange={(e) => setSellForm({ ...sellForm, quantity: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Price per piece (RWF)</Label>
            <Input
              type="number"
              min="0"
              placeholder={sellVariant?.default_price ? `Usual: ${sellVariant.default_price.toLocaleString('en-US')}` : 'Agreed price'}
              value={sellForm.unitPrice}
              onChange={(e) => setSellForm({ ...sellForm, unitPrice: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Customer Name (optional)</Label>
          <Input
            placeholder="e.g. Jane Doe"
            value={sellForm.customer}
            onChange={(e) => setSellForm({ ...sellForm, customer: e.target.value.replace(/[^\p{L}\s'.,-]/gu, '') })}
          />
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
          Need a receipt, several items, or credit? Use <Link to="/sales" className="text-primary font-medium">Sales</Link>.
        </p>
      </FormDialog>

      {/* RESTOCK DIALOG */}
      <FormDialog
        open={!!restockingItem}
        onOpenChange={(open) => !open && setRestockingItem(null)}
        title="Restock Item"
        description={restockingItem?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setRestockingItem(null)}>Cancel</Button>
            <Button
              onClick={handleRestockConfirm}
              className="bg-green-600 hover:bg-green-700"
              disabled={!restockForm.variantId || !(Number(restockForm.quantity) > 0) || restockVariant.isPending}
            >
              Add to Stock
            </Button>
          </>
        }
      >
        {restockingItem && hasOptions(restockingItem) && (
          <div className="space-y-2">
            <Label>Size / Colour</Label>
            <div className="flex flex-wrap gap-2">
              {restockingItem.variants.map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setRestockForm({ ...restockForm, variantId: v.id })}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                    restockForm.variantId === v.id ? 'border-primary bg-primary/10 ring-2 ring-primary/20' : 'hover:border-primary/50'
                  }`}
                >
                  <OptionTag size={v.size} color={v.color} />
                  <span className="block text-xs text-muted-foreground mt-0.5">{v.quantity} in stock</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">New size or colour? Use the <Layers className="w-3 h-3 inline" /> button instead.</p>
          </div>
        )}
        <div className="space-y-2">
          <Label>Quantity to Add</Label>
          <Input
            type="number"
            placeholder="0"
            value={restockForm.quantity}
            onChange={(e) => setRestockForm({ ...restockForm, quantity: e.target.value })}
          />
        </div>
      </FormDialog>

      {/* ADD SIZE / COLOUR DIALOG */}
      <FormDialog
        open={!!variantItem}
        onOpenChange={(open) => !open && setVariantItem(null)}
        title="Add Size / Colour"
        description={variantItem?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setVariantItem(null)}>Cancel</Button>
            <Button
              onClick={handleAddVariant}
              disabled={(!variantForm.size.length && !variantForm.color.length) || addVariant.isPending}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label>Size</Label>
          <SizePicker value={variantForm.size} onChange={(size) => setVariantForm({ ...variantForm, size })} />
        </div>
        <div className="space-y-2">
          <Label>Colour</Label>
          <ColorPicker value={variantForm.color} onChange={(color) => setVariantForm({ ...variantForm, color })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input type="number" min="0" placeholder="0" value={variantForm.quantity} onChange={(e) => setVariantForm({ ...variantForm, quantity: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Usual Price</Label>
            <Input type="number" min="0" placeholder="Optional" value={variantForm.default_price} onChange={(e) => setVariantForm({ ...variantForm, default_price: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Cost Price</Label>
            <Input type="number" min="0" placeholder="Optional" value={variantForm.cost_price} onChange={(e) => setVariantForm({ ...variantForm, cost_price: e.target.value })} />
          </div>
        </div>
      </FormDialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the item, all its sizes and colours, and its stock history.
              Past sales and receipts are kept. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteItemId) deleteItem.mutate(deleteItemId); setDeleteItemId(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
