import { useState } from 'react';
import type { StockItemWithCategory } from '@/hooks/useStockItems';
import type { StockVariant } from '@/lib/types';
import { formatRWF } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { OptionTag } from './OptionPickers';
import { Search } from 'lucide-react';

export interface PickedVariant {
  item: StockItemWithCategory;
  variant: StockVariant;
}

/**
 * One search box over every size / colour in stock: type "shirt m white" and pick.
 * Out-of-stock options are listed but can't be chosen.
 */
export function VariantPicker({ items, onPick, placeholder = 'Search item, size or colour…', trigger }: {
  items: StockItemWithCategory[];
  onPick: (picked: PickedVariant) => void;
  placeholder?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" className="w-full justify-start gap-2 font-normal text-muted-foreground">
            <Search className="w-4 h-4" /> {placeholder}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(28rem,calc(100vw-2rem))]" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-80">
            <CommandEmpty>No matching item.</CommandEmpty>
            {items.map(item => (
              <CommandGroup key={item.id} heading={item.category ? `${item.name} · ${item.category.name}` : item.name}>
                {item.variants.map(v => (
                  <CommandItem
                    key={v.id}
                    value={`${item.name} ${v.size ?? ''} ${v.color ?? ''} ${item.category?.name ?? ''} ${v.id}`}
                    disabled={v.quantity <= 0}
                    onSelect={() => { onPick({ item, variant: v }); setOpen(false); }}
                    className="flex items-center justify-between gap-3"
                  >
                    <OptionTag size={v.size} color={v.color} />
                    <span className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      {v.default_price !== null && <span>{formatRWF(v.default_price)}</span>}
                      <span className={v.quantity <= 0 ? 'text-destructive' : 'text-foreground font-medium'}>
                        {v.quantity <= 0 ? 'Sold out' : `${v.quantity} left`}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
