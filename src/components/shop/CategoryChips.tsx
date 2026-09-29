import { useState } from 'react';
import { useCategories } from '@/hooks/useCategories';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

const NEW_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];

/** Tap a category; "+ New" adds one on the spot without leaving the form. */
export function CategoryChips({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { categories, addCategory } = useCategories();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    const created = await addCategory.mutateAsync({
      name: name.trim(), description: null, color: NEW_COLORS[categories.length % NEW_COLORS.length],
    });
    onChange(created.id);
    setName('');
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {categories.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(value === c.id ? null : c.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm transition-all active:scale-95',
              value === c.id ? 'font-semibold' : 'border-border hover:border-primary/40',
            )}
            style={value === c.id ? { borderColor: c.color, backgroundColor: `${c.color}1A` } : undefined}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
          </button>
        ))}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-primary/50 px-3 py-1.5 text-sm text-primary font-medium">
            <Plus className="w-3.5 h-3.5" /> New category
          </button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2 animate-fade-in">
          <Input autoFocus placeholder="e.g. Suits & Sets, Dresses, Kids" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} />
          <Button type="button" onClick={create} disabled={!name.trim() || addCategory.isPending}>Add</Button>
          <Button type="button" variant="ghost" onClick={() => { setAdding(false); setName(''); }}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
