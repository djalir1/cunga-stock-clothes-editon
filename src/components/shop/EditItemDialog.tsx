import { useEffect, useState } from 'react';
import { useStockItems, type StockItemWithCategory } from '@/hooks/useStockItems';
import { uploadItemImage, deleteItemImage } from '@/lib/image';
import { friendlyError } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { FormDialog } from './FormDialog';
import { PhotoInput } from './PhotoInput';
import { CategoryChips } from './CategoryChips';
import { OptionTag } from './OptionPickers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MoneyInput } from './MoneyInput';

const priceOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

/** Change an item's name, category, photo, price and low-stock warning. */
export function EditItemDialog({ item, onClose }: { item: StockItemWithCategory | null; onClose: () => void }) {
  const { updateItem, setPrices } = useStockItems();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [minQty, setMinQty] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [perVariant, setPerVariant] = useState(false);
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [initialCost, setInitialCost] = useState('');
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    const prices = item.variants.map(v => v.default_price);
    const allSame = prices.every(p => p === prices[0]);
    setName(item.name);
    setCategoryId(item.category_id);
    setMinQty(String(item.min_quantity));
    setPhoto(null);
    setPhotoUrl(item.image_url);
    setPerVariant(!allSame);
    setPrice(allSame && prices[0] !== null && prices[0] !== undefined ? String(prices[0]) : '');
    const costs = item.variants.map(v => v.cost_price).filter(c => c !== null);
    setCost(costs.length ? String(costs[0]) : '');
    setInitialCost(costs.length ? String(costs[0]) : '');
    setVariantPrices(Object.fromEntries(item.variants.map(v => [v.id, v.default_price === null ? '' : String(v.default_price)])));
  }, [item]);

  const save = async () => {
    if (!item || !name.trim()) return;
    setSaving(true);
    try {
      let image_url = photoUrl;
      if (photo) image_url = await uploadItemImage(photo);
      await updateItem.mutateAsync({
        id: item.id,
        name: name.trim(),
        category_id: categoryId,
        min_quantity: Math.max(1, Number(minQty) || 1),
        image_url,
      });
      await setPrices.mutateAsync(perVariant
        ? { itemId: item.id, cost: cost === initialCost ? undefined : priceOrNull(cost), variantPrices: item.variants.map(v => ({ id: v.id, price: priceOrNull(variantPrices[v.id] ?? '') })) }
        : { itemId: item.id, cost: cost === initialCost ? undefined : priceOrNull(cost), price: priceOrNull(price) });
      if (item.image_url && item.image_url !== image_url) await deleteItemImage(item.image_url);
      onClose();
    } catch (e) {
      toast({ title: 'Not saved', description: friendlyError(e as Error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={!!item}
      onOpenChange={o => !o && onClose()}
      title="Edit Item"
      description="Stock counts change through Restock and Sales, so they're not edited here."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </>
      }
    >
      <PhotoInput url={photoUrl} file={photo} onFile={setPhoto} onRemove={() => { setPhoto(null); setPhotoUrl(null); }} />
      <div className="space-y-2">
        <Label>Item name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Category</Label>
        <CategoryChips value={categoryId} onChange={setCategoryId} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Selling price</Label>
          {item && item.variants.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Different price per size / colour
              <Switch checked={perVariant} onCheckedChange={setPerVariant} />
            </label>
          )}
        </div>
        {!perVariant ? (
          <MoneyInput placeholder="Same for every size and colour" value={price} onChange={setPrice} />
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {item?.variants.map(v => (
              <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <OptionTag size={v.size} color={v.color} className="text-sm" />
                <div className="w-40">
                  <MoneyInput className="h-9" placeholder="Price"
                    value={variantPrices[v.id] ?? ''} onChange={val => setVariantPrices(p => ({ ...p, [v.id]: val }))} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Bought for (cost each) <span className="text-muted-foreground font-normal">used to work out profit</span></Label>
        <MoneyInput placeholder="What you paid the supplier per piece" value={cost} onChange={setCost} />
      </div>

      <div className="flex items-center gap-3">
        <Label className="shrink-0">Warn me when fewer than</Label>
        <Input type="number" min="1" className="w-20" value={minQty} onChange={e => setMinQty(e.target.value)} />
        <span className="text-sm text-muted-foreground">left</span>
      </div>
    </FormDialog>
  );
}
