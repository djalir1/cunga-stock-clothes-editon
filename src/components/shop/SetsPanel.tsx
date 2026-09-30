import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useItemSets, type ItemSet } from '@/hooks/useItemSets';
import { useStockItems } from '@/hooks/useStockItems';
import { useCategories } from '@/hooks/useCategories';
import { formatRWF } from '@/lib/format';
import { FormDialog } from './FormDialog';
import { CategoryChips } from './CategoryChips';
import { ItemThumb } from './PhotoInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Layers, Pencil, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { MoneyInput } from './MoneyInput';

const empty = { name: '', category_id: null as string | null, usual_price: '', part_ids: [] as string[] };

export function SetsPanel({ canEdit, createSignal }: { canEdit: boolean; createSignal?: number }) {
  const { sets, isLoading, saveSet, deleteSet } = useItemSets();
  const { items } = useStockItems();
  const { categories } = useCategories();
  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

  const [editing, setEditing] = useState<(typeof empty & { id?: string }) | null>(null);
  const [deleting, setDeleting] = useState<ItemSet | null>(null);
  const [search, setSearch] = useState('');
  const [lastSignal, setLastSignal] = useState(createSignal);
  if (createSignal !== lastSignal) { setLastSignal(createSignal); setEditing({ ...empty }); }

  const openEdit = (s: ItemSet) => setEditing({
    id: s.id, name: s.name, category_id: s.category_id,
    usual_price: s.usual_price === null ? '' : String(s.usual_price), part_ids: s.part_ids,
  });

  const save = async () => {
    if (!editing) return;
    await saveSet.mutateAsync({
      id: editing.id,
      name: editing.name,
      category_id: editing.category_id,
      usual_price: editing.usual_price === '' ? null : Number(editing.usual_price),
      part_ids: editing.part_ids,
    });
    setEditing(null);
  };

  const togglePart = (id: string) => editing && setEditing({
    ...editing,
    part_ids: editing.part_ids.includes(id) ? editing.part_ids.filter(p => p !== id) : [...editing.part_ids, id],
  });

  const pickable = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 text-sm">
        <p className="font-medium">Outfit sets = items that go together, like a shirt + trousers or a 3-piece suit.</p>
        <p className="text-muted-foreground mt-1">
          Each part keeps its own stock, sizes and colours, so it can still be sold alone. At the till, choose
          <b> Sets</b> to sell the full outfit for one price.
        </p>
      </div>

      {isLoading ? null : sets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No sets yet.</p>
          {canEdit && (
            <Button className="mt-4 gap-2" onClick={() => setEditing({ ...empty })} disabled={items.length < 2}>
              <Plus className="w-4 h-4" /> Create a set
            </Button>
          )}
          {items.length < 2 && <p className="text-xs mt-2">Add the separate items first (e.g. the shirt and the trousers).</p>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sets.map(s => {
            const parts = s.part_ids.map(id => itemById.get(id)).filter(Boolean);
            const complete = parts.length ? Math.min(...parts.map(p => p!.quantity)) : 0;
            const cat = categories.find(c => c.id === s.category_id);
            return (
              <div key={s.id} className="rounded-xl border border-border p-4 space-y-3 bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{s.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {cat && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />{cat.name}</span>}
                      {s.usual_price !== null && <span>{formatRWF(s.usual_price)} full set</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className={complete > 0 ? 'text-green-600 border-green-600/30' : 'text-destructive border-destructive/30'}>
                    {complete > 0 ? `up to ${complete} sets` : 'a part is sold out'}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {parts.map(p => (
                    <div key={p!.id} className="flex items-center gap-2 text-sm">
                      <ItemThumb url={p!.image_url} color={p!.category?.color} className="w-8 h-8" />
                      <span className="flex-1 truncate">{p!.name}</span>
                      <span className="text-xs text-muted-foreground">{p!.quantity} in stock</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button asChild size="sm" variant="outline" className="gap-1.5 flex-1"><Link to="/sales?tab=sets"><ShoppingCart className="w-3.5 h-3.5" /> Sell</Link></Button>
                  {canEdit && (
                    <>
                      <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => openEdit(s)} aria-label="Edit set"><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="outline" className="h-9 w-9 text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => setDeleting(s)} aria-label="Remove set"><Trash2 className="w-4 h-4" /></Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FormDialog
        open={!!editing}
        onOpenChange={o => !o && setEditing(null)}
        title={editing?.id ? 'Edit Set' : 'New Outfit Set'}
        description="Tick the items that make up the outfit."
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={!editing?.name.trim() || (editing?.part_ids.length ?? 0) < 2 || saveSet.isPending}>
              Save set{editing && editing.part_ids.length > 0 ? ` · ${editing.part_ids.length} items` : ''}
            </Button>
          </>
        }
      >
        {editing && (
          <>
            <div className="space-y-2">
              <Label>Set name</Label>
              <Input autoFocus placeholder="e.g. Linen suit, School uniform, Kitenge set" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <CategoryChips value={editing.category_id} onChange={category_id => setEditing({ ...editing, category_id })} />
            </div>
            <div className="space-y-2">
              <Label>Items in the set <span className="text-muted-foreground font-normal">(choose 2 or more)</span></Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="rounded-lg border border-border divide-y divide-border max-h-64 overflow-y-auto">
                {pickable.map(i => {
                  const on = editing.part_ids.includes(i.id);
                  return (
                    <label key={i.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${on ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                      <Checkbox checked={on} onCheckedChange={() => togglePart(i.id)} />
                      <ItemThumb url={i.image_url} color={i.category?.color} className="w-8 h-8" />
                      <span className="flex-1 text-sm font-medium truncate">{i.name}</span>
                      {on && <Badge className="text-[10px]">#{editing.part_ids.indexOf(i.id) + 1}</Badge>}
                    </label>
                  );
                })}
                {pickable.length === 0 && <p className="p-3 text-sm text-muted-foreground">No items match.</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Price for the full set <span className="text-muted-foreground font-normal">optional</span></Label>
              <MoneyInput placeholder="e.g. 45,000" value={editing.usual_price} onChange={usual_price => setEditing({ ...editing, usual_price })} />
            </div>
          </>
        )}
      </FormDialog>

      <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Only the set is removed. Its items and their stock stay as they are.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { if (deleting) deleteSet.mutate(deleting.id); setDeleting(null); }}>
              Remove set
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
