import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SIZE_GROUPS } from '@/lib/clothing';
import { useShopColors, type PaletteColor } from '@/hooks/useShopColors';
import { detectColors, isLightColor, nearestColor } from '@/lib/image';
import { Check, Plus, X, Camera, Sparkles, Palette } from 'lucide-react';

const CUSTOM_DOT = 'repeating-linear-gradient(45deg,#f472b6 0 3px,#facc15 3px 6px,#3b82f6 6px 9px)';

/** Small round swatch. Colour names the shop never saved get a striped "custom" dot. */
export function ColorDot({ color, className }: { color: string | null | undefined; className?: string }) {
  const { hexOf } = useShopColors();
  if (!color) return null;
  const hex = hexOf(color);
  return (
    <span
      className={cn('inline-block w-3 h-3 rounded-full border border-border shrink-0', className)}
      style={hex ? { backgroundColor: hex } : { background: CUSTOM_DOT }}
      title={color}
    />
  );
}

/** "M · ● White" — size and colour with a swatch */
export function OptionTag({ size, color, className }: { size: string | null; color: string | null; className?: string }) {
  if (!size && !color) return <span className={cn('text-muted-foreground', className)}>One size</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {size && <span className="font-medium">{size}</span>}
      {size && color && <span className="text-muted-foreground">·</span>}
      {color && <><ColorDot color={color} />{color}</>}
    </span>
  );
}

interface PickerProps {
  /** Selected values. Single-select pickers use a one-item array. */
  value: string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function toggle(value: string[], item: string, multiple: boolean) {
  const exists = value.some(v => same(v, item));
  if (multiple) return exists ? value.filter(v => !same(v, item)) : [...value, item];
  return exists ? [] : [item];
}

function add(value: string[], item: string, multiple: boolean) {
  if (!multiple) return [item];
  return value.some(v => same(v, item)) ? value : [...value, item];
}

/** Removable chips showing what is selected, so choices in other tabs are never "lost". */
function SelectedChips({ value, onChange, render }: {
  value: string[];
  onChange: (v: string[]) => void;
  render?: (v: string) => React.ReactNode;
}) {
  if (!value.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-primary/5 border border-primary/20 px-2 py-1.5">
      <span className="text-xs font-medium text-primary mr-1">{value.length} selected:</span>
      {value.map(v => (
        <span key={v} className="inline-flex items-center gap-1 rounded-md bg-background border border-border pl-2 pr-1 py-0.5 text-xs font-medium">
          {render ? render(v) : v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter(x => !same(x, v)))}
            className="rounded p-0.5 hover:bg-muted"><X className="w-3 h-3" /></button>
        </span>
      ))}
    </div>
  );
}

function CustomEntry({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [text, setText] = useState('');
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };
  return (
    <div className="flex gap-2">
      <Input
        value={text}
        placeholder={placeholder}
        className="h-9 text-sm"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
      />
      <Button type="button" size="sm" variant="outline" className="h-9 gap-1 shrink-0" onClick={submit} disabled={!text.trim()}>
        <Plus className="w-3.5 h-3.5" /> Add
      </Button>
    </div>
  );
}

export function SizePicker({ value, onChange, multiple = false }: PickerProps) {
  const initialGroup = Math.max(0, SIZE_GROUPS.findIndex(g => g.sizes.some(s => value.some(v => same(v, s)))));
  const [group, setGroup] = useState(initialGroup);
  const isOn = (s: string) => value.some(v => same(v, s));

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        {multiple ? 'Tap every size you have — you can choose as many as you like, from any tab.' : 'Tap one size.'}
      </p>
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1 w-fit">
        {SIZE_GROUPS.map((g, i) => {
          const count = g.sizes.filter(isOn).length;
          return (
            <button
              key={g.label}
              type="button"
              onClick={() => setGroup(i)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md transition-colors font-medium',
                group === i ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {g.label}{count > 0 && <span className="ml-1 text-primary">({count})</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {SIZE_GROUPS[group].sizes.map(s => (
          <button
            key={s}
            type="button"
            aria-pressed={isOn(s)}
            onClick={() => onChange(toggle(value, s, multiple))}
            className={cn(
              'relative min-w-12 h-11 px-3 rounded-lg border-2 text-sm font-semibold transition-all active:scale-95',
              isOn(s)
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background border-border hover:border-primary/50 hover:bg-primary/5',
            )}
          >
            {s}
            {isOn(s) && multiple && <Check className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-green-600 text-white p-0.5" />}
          </button>
        ))}
      </div>
      <SelectedChips value={value} onChange={onChange} />
      <CustomEntry placeholder="Another size (e.g. 44, Free size)…" onAdd={v => onChange(add(value, v, multiple))} />
    </div>
  );
}

function Swatch({ color, on, onClick }: { color: PaletteColor; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg py-1.5 hover:bg-muted/60 transition-colors active:scale-95"
    >
      <span
        className={cn(
          'w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center',
          on ? 'border-primary ring-2 ring-primary/40 scale-110' : 'border-border',
        )}
        style={{ backgroundColor: color.hex }}
      >
        {on && <Check className={cn('w-4 h-4', isLightColor(color.hex) ? 'text-gray-900' : 'text-white')} />}
      </span>
      <span className={cn('text-[11px] leading-tight text-center', on ? 'text-primary font-semibold' : 'text-muted-foreground')}>
        {color.name}
      </span>
    </button>
  );
}

/** Make a new colour: name + exact shade (colour wheel), saved for everyone in the shop. */
function NewColorPanel({ initialHex, onSaved, onCancel }: {
  initialHex?: string;
  onSaved: (name: string) => void;
  onCancel: () => void;
}) {
  const { palette, addColor } = useShopColors();
  const [hex, setHex] = useState(initialHex ?? '#8B5A2B');
  const [name, setName] = useState('');
  const near = nearestColor(hex, palette);
  const taken = palette.some(c => same(c.name, name.trim()));

  const save = async () => {
    if (!name.trim() || taken) return;
    const saved = await addColor.mutateAsync({ name, hex });
    onSaved(saved);
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-3 animate-fade-in">
      <p className="text-sm font-medium flex items-center gap-2"><Palette className="w-4 h-4 text-primary" /> New colour</p>
      <div className="flex items-center gap-3">
        <label className="relative w-14 h-14 rounded-full border-2 border-border shadow-inner cursor-pointer shrink-0 overflow-hidden" style={{ backgroundColor: hex }}>
          <input type="color" value={hex} onChange={e => setHex(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Choose the shade" />
        </label>
        <div className="flex-1 space-y-1">
          <Input autoFocus placeholder="Colour name, e.g. Mustard, Kitenge blue" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }} />
          <p className="text-[11px] text-muted-foreground">
            Tap the circle to choose the exact shade{near && <> · looks like <b>{near.name}</b></>}
          </p>
        </div>
      </div>
      {taken && <p className="text-xs text-destructive">“{name.trim()}” already exists — pick it from the list above.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" onClick={save} disabled={!name.trim() || taken || addColor.isPending}>Save colour</Button>
      </div>
    </div>
  );
}

/** Reads the main colours from a photo and offers them as one-tap choices. */
function PhotoColors({ photo, value, multiple, onChange, onMakeNew }: {
  photo: Blob;
  value: string[];
  multiple: boolean;
  onChange: (v: string[]) => void;
  onMakeNew: (hex: string) => void;
}) {
  const { palette } = useShopColors();
  const [found, setFound] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    setFound(null);
    detectColors(photo).then(hexes => alive && setFound(hexes)).catch(() => alive && setFound([]));
    return () => { alive = false; };
  }, [photo]);

  if (found === null) return <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 animate-pulse" /> Looking at the colours in your photo…</p>;
  if (!found.length) return null;

  return (
    <div className="rounded-lg border border-dashed border-primary/40 p-2.5 space-y-2">
      <p className="text-xs font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary" /> Colours in your photo — tap to add</p>
      <div className="flex flex-wrap gap-2">
        {found.map(hex => {
          const near = nearestColor(hex, palette);
          if (!near) return null;
          const on = value.some(v => same(v, near.name));
          return (
            <div key={hex} className="flex items-center gap-1">
              <button type="button" onClick={() => onChange(add(value, near.name, multiple))}
                className={cn('inline-flex items-center gap-2 rounded-full border-2 pl-1 pr-3 py-1 text-sm transition-all',
                  on ? 'border-primary bg-primary/10 font-semibold' : 'border-border hover:border-primary/50')}>
                <span className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: hex }} />
                {near.name}{on && <Check className="w-3.5 h-3.5 text-primary" />}
              </button>
              <button type="button" className="text-[11px] text-primary underline-offset-2 hover:underline" onClick={() => onMakeNew(hex)}>
                exact shade
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange, multiple = false, photo }: PickerProps & {
  /** Item photo: its main colours are suggested */
  photo?: Blob | null;
}) {
  const { palette } = useShopColors();
  const [newColor, setNewColor] = useState<{ hex?: string } | null>(null);
  const [ownPhoto, setOwnPhoto] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shownPhoto = photo ?? ownPhoto;
  const isOn = (c: string) => value.some(v => same(v, c));
  const hexOf = (name: string) => palette.find(c => same(c.name, name))?.hex;

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">
        {multiple ? 'Tap every colour you have — you can choose several.' : 'Tap one colour.'}
      </p>

      {shownPhoto && (
        <PhotoColors photo={shownPhoto} value={value} multiple={multiple} onChange={onChange} onMakeNew={hex => setNewColor({ hex })} />
      )}

      <div className="grid grid-cols-4 min-[420px]:grid-cols-5 sm:grid-cols-7 gap-x-1 gap-y-1">
        {palette.map(c => (
          <Swatch key={c.name} color={c} on={isOn(c.name)} onClick={() => onChange(toggle(value, c.name, multiple))} />
        ))}
        <button type="button" onClick={() => setNewColor({})}
          className="flex flex-col items-center gap-1 rounded-lg py-1.5 hover:bg-muted/60 transition-colors">
          <span className="w-9 h-9 rounded-full border-2 border-dashed border-primary/60 flex items-center justify-center text-primary">
            <Plus className="w-4 h-4" />
          </span>
          <span className="text-[11px] leading-tight text-primary font-medium">New colour</span>
        </button>
      </div>

      {newColor && (
        <NewColorPanel
          initialHex={newColor.hex}
          onCancel={() => setNewColor(null)}
          onSaved={name => { onChange(add(value, name, multiple)); setNewColor(null); }}
        />
      )}

      <SelectedChips
        value={value}
        onChange={onChange}
        render={v => (
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full border border-border" style={hexOf(v) ? { backgroundColor: hexOf(v) } : { background: CUSTOM_DOT }} />
            {v}
          </span>
        )}
      />

      {!photo && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setOwnPhoto(f); e.target.value = ''; }} />
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => fileRef.current?.click()}>
            <Camera className="w-4 h-4" /> Find colours from a photo
          </Button>
        </>
      )}
    </div>
  );
}
