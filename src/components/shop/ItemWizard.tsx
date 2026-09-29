import { useState } from 'react';
import { useStockItems, type NewVariantInput } from '@/hooks/useStockItems';
import { useShopColors } from '@/hooks/useShopColors';
import { uploadItemImage } from '@/lib/image';
import { friendlyError } from '@/lib/format';
import { useToast } from '@/hooks/use-toast';
import { FormDialog } from './FormDialog';
import { PhotoInput } from './PhotoInput';
import { CategoryChips } from './CategoryChips';
import { SizePicker, ColorPicker } from './OptionPickers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from 'lucide-react';

const STEPS = ['Details', 'Colours', 'Sizes', 'How many'] as const;
const NONE = '';
const key = (color: string, size: string) => `${color}|${size}`;

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="icon" variant="outline" className="h-9 w-9" disabled={value <= 0} onClick={() => onChange(value - 1)}>
        <Minus className="w-4 h-4" />
      </Button>
      <Input
        type="number" inputMode="numeric" min="0"
        className="h-9 w-16 text-center font-semibold"
        value={value || ''}
        placeholder="0"
        onChange={e => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
      <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => onChange(value + 1)}>
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
}

/**
 * Add an item in four short steps. One item = one design (e.g. "Slim fit shirt");
 * every colour × size is counted separately so nobody mixes them up.
 */
export function ItemWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { addItem } = useStockItems();
  const { hexOf } = useShopColors();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [minQty, setMinQty] = useState('3');
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [fillAll, setFillAll] = useState('');
  const [saving, setSaving] = useState(false);

  const colorRows = colors.length ? colors : [NONE];
  const sizeCols = sizes.length ? sizes : [NONE];
  const total = colorRows.reduce((s, c) => s + sizeCols.reduce((t, z) => t + (counts[key(c, z)] ?? 0), 0), 0);

  const reset = () => {
    setStep(0); setPhoto(null); setName(''); setCategoryId(null); setPrice(''); setCost(''); setMinQty('3');
    setColors([]); setSizes([]); setCounts({}); setFillAll('');
  };
  const close = (o: boolean) => { onOpenChange(o); if (!o) reset(); };

  const save = async () => {
    setSaving(true);
    let image_url: string | null = null;
    try {
      if (photo) image_url = await uploadItemImage(photo);
    } catch (e) {
      toast({ title: 'Photo not uploaded', description: `${friendlyError(e as Error)} Remove the photo to save without it.`, variant: 'destructive' });
      setSaving(false);
      return;
    }
    try {
      const variants: NewVariantInput[] = colorRows.flatMap(c => sizeCols.map(z => ({
        color: c || undefined,
        size: z || undefined,
        quantity: counts[key(c, z)] ?? 0,
        default_price: price === '' ? null : Number(price),
        cost_price: cost === '' ? null : Number(cost),
      })));
      await addItem.mutateAsync({
        name: name.trim(),
        category_id: categoryId,
        min_quantity: Number(minQty) || 3,
        image_url,
        variants,
      });
      close(false);
    } catch {
      // addItem shows its own error toast; keep the form open so nothing typed is lost
    } finally {
      setSaving(false);
    }
  };

  const canNext = step === 0 ? !!name.trim() : true;
  const last = step === STEPS.length - 1;

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      className="sm:max-w-2xl"
      title="Add New Item"
      description={
        <span className="flex gap-1.5 pt-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <button key={s} type="button" disabled={i > 0 && !name.trim()} onClick={() => setStep(i)}
              className={cn('flex-1 text-left rounded-md pt-1.5 border-t-4 text-[11px] sm:text-xs font-medium transition-colors',
                i <= step ? 'border-primary text-primary' : 'border-muted text-muted-foreground')}>
              {i + 1}. {s}
            </button>
          ))}
        </span>
      }
      footer={
        <>
          {step > 0 ? (
            <Button variant="outline" className="gap-1.5 sm:mr-auto" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          ) : (
            <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          )}
          {last ? (
            <Button className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={save} disabled={saving || !name.trim()}>
              <Check className="w-4 h-4" /> {saving ? 'Saving…' : `Save item${total ? ` · ${total} pieces` : ''}`}
            </Button>
          ) : (
            <Button className="gap-1.5" onClick={() => setStep(step + 1)} disabled={!canNext}>
              {step === 1 && !colors.length ? 'Skip — one colour' : step === 2 && !sizes.length ? 'Skip — one size' : 'Next'}
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </>
      }
    >
      {step === 0 && (
        <div className="space-y-5">
          <PhotoInput file={photo} onFile={setPhoto} onRemove={() => setPhoto(null)} />
          <div className="space-y-2">
            <Label>Item name</Label>
            <Input autoFocus placeholder="e.g. Slim fit shirt, Ankara dress, Chino trousers" value={name} onChange={e => setName(e.target.value)} />
            <p className="text-xs text-muted-foreground">One name for the design — you add its colours and sizes in the next steps.</p>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <CategoryChips value={categoryId} onChange={setCategoryId} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Selling price (RWF)</Label>
              <Input type="number" inputMode="numeric" min="0" placeholder="e.g. 15000" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bought for (RWF) <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input type="number" inputMode="numeric" min="0" placeholder="Cost price" value={cost} onChange={e => setCost(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">Same price for every colour and size. You can still agree a different price at the till.</p>
          <div className="flex items-center gap-3">
            <Label className="shrink-0">Warn me when fewer than</Label>
            <Input type="number" min="1" className="w-20" value={minQty} onChange={e => setMinQty(e.target.value)} />
            <span className="text-sm text-muted-foreground">pieces are left</span>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          <Label className="text-base">Which colours does “{name}” come in?</Label>
          <ColorPicker multiple value={colors} onChange={setColors} photo={photo} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <Label className="text-base">Which sizes do you have?</Label>
          <SizePicker multiple value={sizes} onChange={setSizes} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <Label className="text-base">How many pieces of each?</Label>
          {colorRows.length * sizeCols.length > 1 && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
              <span className="text-sm shrink-0">Same for all:</span>
              <Input type="number" inputMode="numeric" min="0" className="h-9 w-20" value={fillAll} onChange={e => setFillAll(e.target.value)} />
              <Button type="button" size="sm" variant="outline" disabled={fillAll === ''}
                onClick={() => {
                  const n = Math.max(0, Math.floor(Number(fillAll) || 0));
                  setCounts(Object.fromEntries(colorRows.flatMap(c => sizeCols.map(z => [key(c, z), n]))));
                }}>
                Fill
              </Button>
            </div>
          )}
          {colorRows.map(c => (
            <div key={c || 'none'} className="rounded-xl border border-border overflow-hidden">
              {c && (
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 font-medium text-sm">
                  <span className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: hexOf(c) ?? '#ddd' }} />
                  {c}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {sizeCols.reduce((t, z) => t + (counts[key(c, z)] ?? 0), 0)} pieces
                  </span>
                </div>
              )}
              <div className="divide-y divide-border">
                {sizeCols.map(z => (
                  <div key={z || 'one'} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="font-semibold text-sm">{z || (c ? 'Pieces' : 'How many pieces?')}</span>
                    <Stepper value={counts[key(c, z)] ?? 0} onChange={n => setCounts(prev => ({ ...prev, [key(c, z)]: n }))} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-sm text-right">Total: <b>{total}</b> pieces</p>
        </div>
      )}
    </FormDialog>
  );
}
