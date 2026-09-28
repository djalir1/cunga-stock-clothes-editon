import { useState } from 'react';
import { useStockItems, type StockItemWithCategory, type NewVariantInput } from '@/hooks/useStockItems';
import { useCategories } from '@/hooks/useCategories';
import { useAuth } from '@/contexts/AuthContext';
import { formatRWF, optionLabel } from '@/lib/format';
import type { StockVariant } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Search, Minus, Trash2, ShieldCheck, RefreshCcw, Layers, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VariantRow {
  size: string;
  color: string;
  quantity: string;
  default_price: string;
  cost_price: string;
}

const emptyVariantRow = (): VariantRow => ({ size: '', color: '', quantity: '', default_price: '', cost_price: '' });

const toNumberOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

const toVariantInput = (row: VariantRow): NewVariantInput => ({
  size: row.size.trim() || undefined,
  color: row.color.trim() || undefined,
  quantity: Number(row.quantity) || 0,
  default_price: toNumberOrNull(row.default_price),
  cost_price: toNumberOrNull(row.cost_price),
});

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
            {optionLabel(v.size, v.color)}{showStock && ` — ${v.quantity} left`}
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
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [newItem, setNewItem] = useState({ name: '', category_id: '', min_quantity: '5' });
  const [newVariants, setNewVariants] = useState<VariantRow[]>([emptyVariantRow()]);

  // Sell
  const [sellingItem, setSellingItem] = useState<StockItemWithCategory | null>(null);
  const [sellForm, setSellForm] = useState({ variantId: '', quantity: '1', unitPrice: '', customer: '' });

  // Restock
  const [restockingItem, setRestockingItem] = useState<StockItemWithCategory | null>(null);
  const [restockForm, setRestockForm] = useState({ variantId: '', quantity: '' });

  // Add size / colour to an existing item
  const [variantItem, setVariantItem] = useState<StockItemWithCategory | null>(null);
  const [variantForm, setVariantForm] = useState<VariantRow>(emptyVariantRow());

  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const resetAddForm = () => {
    setNewItem({ name: '', category_id: '', min_quantity: '5' });
    setNewVariants([emptyVariantRow()]);
  };

  const updateVariantRow = (index: number, patch: Partial<VariantRow>) =>
    setNewVariants(rows => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const handleAddItem = () => {
    if (!newItem.name.trim() || !isKeeper) return;
    addItem.mutate(
      {
        name: newItem.name.trim(),
        category_id: newItem.category_id || null,
        min_quantity: Number(newItem.min_quantity) || 5,
        variants: newVariants.map(toVariantInput),
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
    setVariantForm(emptyVariantRow());
  };

  const handleAddVariant = () => {
    if (!variantItem || !isKeeper) return;
    addVariant.mutate(
      { itemId: variantItem.id, variant: toVariantInput(variantForm) },
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Inventory</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Monitor and manage your shop's clothing stock</p>
            {!isKeeper && (
              <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1">
                <ShieldCheck className="w-3 h-3" /> View Only
              </Badge>
            )}
          </div>
        </div>

        {isKeeper && (
          <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetAddForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add New Item</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Item Name</Label>
                  <Input placeholder="e.g. Cotton Shirt" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={newItem.category_id} onValueChange={(v) => setNewItem({ ...newItem, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Low Stock Threshold</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newItem.min_quantity}
                      onChange={(e) => setNewItem({ ...newItem, min_quantity: e.target.value })}
                      placeholder="e.g. 3"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Sizes & Colours</Label>
                  <p className="text-xs text-muted-foreground">
                    One row per size / colour. Leave size and colour empty for a one-size item.
                    The usual price is only a reminder — you type the agreed price on every sale.
                  </p>
                  <div className="space-y-2">
                    {newVariants.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_0.8fr_1.1fr_1.1fr_auto] gap-2 items-center">
                        <Input placeholder="Size" value={row.size} onChange={(e) => updateVariantRow(i, { size: e.target.value })} />
                        <Input placeholder="Colour" value={row.color} onChange={(e) => updateVariantRow(i, { color: e.target.value })} />
                        <Input type="number" min="0" placeholder="Qty" value={row.quantity} onChange={(e) => updateVariantRow(i, { quantity: e.target.value })} />
                        <Input type="number" min="0" placeholder="Usual price" value={row.default_price} onChange={(e) => updateVariantRow(i, { default_price: e.target.value })} />
                        <Input type="number" min="0" placeholder="Cost price" value={row.cost_price} onChange={(e) => updateVariantRow(i, { cost_price: e.target.value })} />
                        <Button
                          type="button" size="icon" variant="ghost"
                          disabled={newVariants.length === 1}
                          onClick={() => setNewVariants(rows => rows.filter((_, j) => j !== i))}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setNewVariants(rows => [...rows, emptyVariantRow()])}>
                    <Plus className="w-3.5 h-3.5" /> Add another size / colour
                  </Button>
                </div>

                <Button onClick={handleAddItem} className="w-full" disabled={!newItem.name.trim() || addItem.isPending}>
                  Save Item
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search items..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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
                              className={`text-[10px] font-normal ${v.quantity === 0 ? 'text-muted-foreground line-through' : ''}`}
                            >
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
                              <Button size="icon" variant="ghost" onClick={() => openSell(item)} disabled={item.quantity <= 0}>
                                <Minus className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Record sale</TooltipContent>
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

      {/* SALE DIALOG */}
      <Dialog open={!!sellingItem} onOpenChange={(open) => !open && setSellingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Sale</DialogTitle>
            {sellingItem && <p className="text-sm text-muted-foreground mt-1">{sellingItem.name}</p>}
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setSellingItem(null)}>Cancel</Button>
              <Button onClick={handleSellConfirm} variant="destructive" disabled={!canConfirmSale || sellItem.isPending}>
                Confirm Sale
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* RESTOCK DIALOG */}
      <Dialog open={!!restockingItem} onOpenChange={(open) => !open && setRestockingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restock Item</DialogTitle>
            {restockingItem && <p className="text-sm text-muted-foreground mt-1">{restockingItem.name}</p>}
          </DialogHeader>
          <div className="space-y-4 py-4">
            {restockingItem && hasOptions(restockingItem) && (
              <div className="space-y-2">
                <Label>Size / Colour</Label>
                <VariantSelect
                  variants={restockingItem.variants}
                  value={restockForm.variantId}
                  onChange={(id) => setRestockForm({ ...restockForm, variantId: id })}
                  showStock={false}
                />
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setRestockingItem(null)}>Cancel</Button>
              <Button
                onClick={handleRestockConfirm}
                className="bg-green-600 hover:bg-green-700"
                disabled={!restockForm.variantId || !(Number(restockForm.quantity) > 0) || restockVariant.isPending}
              >
                Add to Stock
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ADD SIZE / COLOUR DIALOG */}
      <Dialog open={!!variantItem} onOpenChange={(open) => !open && setVariantItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Size / Colour</DialogTitle>
            {variantItem && <p className="text-sm text-muted-foreground mt-1">{variantItem.name}</p>}
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Size</Label>
              <Input placeholder="e.g. M, 42" value={variantForm.size} onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Colour</Label>
              <Input placeholder="e.g. Black" value={variantForm.color} onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min="0" placeholder="0" value={variantForm.quantity} onChange={(e) => setVariantForm({ ...variantForm, quantity: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Usual Price (RWF, optional)</Label>
              <Input type="number" min="0" value={variantForm.default_price} onChange={(e) => setVariantForm({ ...variantForm, default_price: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Cost Price (RWF, optional)</Label>
              <Input type="number" min="0" value={variantForm.cost_price} onChange={(e) => setVariantForm({ ...variantForm, cost_price: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVariantItem(null)}>Cancel</Button>
            <Button
              onClick={handleAddVariant}
              disabled={(!variantForm.size.trim() && !variantForm.color.trim()) || addVariant.isPending}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
