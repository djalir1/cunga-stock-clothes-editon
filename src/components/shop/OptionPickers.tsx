import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { COLORS, SIZE_GROUPS, colorHex } from '@/lib/clothing';
import { Check, Plus } from 'lucide-react';

/** Small round swatch. Unknown colour names get a striped "custom" dot. */
export function ColorDot({ color, className }: { color: string | null | undefined; className?: string }) {
  if (!color) return null;
  const hex = colorHex(color);
  return (
    <span
      className={cn('inline-block w-3 h-3 rounded-full border border-border shrink-0', className)}
      style={hex ? { backgroundColor: hex } : { background: 'repeating-linear-gradient(45deg,#f472b6 0 3px,#facc15 3px 6px,#3b82f6 6px 9px)' }}
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

function toggle(value: string[], item: string, multiple: boolean) {
  const exists = value.some(v => v.toLowerCase() === item.toLowerCase());
  if (multiple) return exists ? value.filter(v => v.toLowerCase() !== item.toLowerCase()) : [...value, item];
  return exists ? [] : [item];
}

function CustomEntry({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };
  return (
    <div className="flex gap-2">
      <Input
        value={text}
        placeholder={placeholder}
        className="h-8 text-sm"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
      />
      <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={add} disabled={!text.trim()}>
        <Plus className="w-3.5 h-3.5" /> Add
      </Button>
    </div>
  );
}

export function SizePicker({ value, onChange, multiple = false }: PickerProps) {
  const [group, setGroup] = useState(0);
  const preset = new Set(SIZE_GROUPS.flatMap(g => g.sizes.map(s => s.toLowerCase())));
  const custom = value.filter(v => !preset.has(v.toLowerCase()));
  const isOn = (s: string) => value.some(v => v.toLowerCase() === s.toLowerCase());

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {SIZE_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            onClick={() => setGroup(i)}
            className={cn(
              'text-xs px-2 py-0.5 rounded-md transition-colors',
              group === i ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[...SIZE_GROUPS[group].sizes, ...custom].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(toggle(value, s, multiple))}
            className={cn(
              'min-w-10 h-9 px-2.5 rounded-lg border text-sm font-medium transition-all',
              isOn(s)
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background hover:border-primary/50 hover:bg-primary/5',
            )}
          >
            {s}
          </button>
        ))}
      </div>
      <CustomEntry placeholder="Other size…" onAdd={v => onChange(multiple ? toggle(value.filter(x => x.toLowerCase() !== v.toLowerCase()), v, true) : [v])} />
    </div>
  );
}

export function ColorPicker({ value, onChange, multiple = false }: PickerProps) {
  const custom = value.filter(v => !colorHex(v));
  const isOn = (c: string) => value.some(v => v.toLowerCase() === c.toLowerCase());

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 sm:grid-cols-7 gap-x-1 gap-y-2">
        {COLORS.map(c => (
          <button
            key={c.name}
            type="button"
            aria-pressed={isOn(c.name)}
            onClick={() => onChange(toggle(value, c.name, multiple))}
            className="flex flex-col items-center gap-1 rounded-lg py-1 hover:bg-muted/60 transition-colors"
          >
            <span
              className={cn(
                'w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center',
                isOn(c.name) ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-border',
              )}
              style={{ backgroundColor: c.hex }}
            >
              {isOn(c.name) && (
                <Check className={cn('w-4 h-4', ['White', 'Beige', 'Yellow', 'Silver', 'Sky Blue', 'Khaki', 'Gold'].includes(c.name) ? 'text-gray-900' : 'text-white')} />
              )}
            </span>
            <span className={cn('text-[11px] leading-tight', isOn(c.name) ? 'text-primary font-semibold' : 'text-muted-foreground')}>
              {c.name}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">

        {custom.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(toggle(value, c, multiple))}
            className="h-8 px-3 rounded-full border-2 border-primary ring-2 ring-primary/30 text-xs font-medium inline-flex items-center gap-1.5"
          >
            <ColorDot color={c} /> {c}
          </button>
        ))}
      </div>
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">Selected: {value.join(', ')}</p>
      )}
      <CustomEntry placeholder="Other colour (e.g. Kitenge print)…" onAdd={v => onChange(multiple ? toggle(value.filter(x => x.toLowerCase() !== v.toLowerCase()), v, true) : [v])} />
    </div>
  );
}
