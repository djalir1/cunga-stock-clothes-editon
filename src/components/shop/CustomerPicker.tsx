import { useState } from 'react';
import { useCustomers } from '@/hooks/useCustomers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Phone, UserPlus, User, X } from 'lucide-react';

/** A picked customer. id is null for someone new (created when the sale / checkout is saved). */
export interface CustomerChoice {
  id: string | null;
  name: string;
  phone: string;
}

export function CustomerPicker({ value, onChange, placeholder = 'Search or add a customer' }: {
  value: CustomerChoice | null;
  onChange: (value: CustomerChoice | null) => void;
  placeholder?: string;
}) {
  const { data: customers = [] } = useCustomers();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const exactMatch = customers.some(c => c.name.toLowerCase() === search.trim().toLowerCase());

  const pick = (choice: CustomerChoice) => {
    onChange(choice);
    setOpen(false);
    setSearch('');
  };

  if (value) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium truncate">
              <User className="w-4 h-4 text-primary shrink-0" /> {value.name}
              {!value.id && <span className="text-xs font-normal text-primary">(new)</span>}
            </div>
            {value.id && value.phone && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5"><Phone className="w-3 h-3" />{value.phone}</div>
            )}
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => onChange(null)} aria-label="Change customer">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {!value.id && (
          <Input
            type="tel"
            placeholder="Phone (optional) — e.g. 0788 000 000"
            value={value.phone}
            onChange={e => onChange({ ...value, phone: e.target.value })}
          />
        )}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal text-muted-foreground">
          {placeholder}
          <ChevronsUpDown className="w-4 h-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Type a name or phone…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{search.trim() ? 'No customer found.' : 'No customers yet.'}</CommandEmpty>
            {search.trim() && !exactMatch && (
              <CommandGroup>
                <CommandItem value={`__new__ ${search}`} onSelect={() => pick({ id: null, name: search.trim(), phone: '' })}>
                  <UserPlus className="w-4 h-4 mr-2 text-primary" />
                  Add “{search.trim()}” as a new customer
                </CommandItem>
              </CommandGroup>
            )}
            {customers.length > 0 && (
              <CommandGroup heading="Customers">
                {customers.map(c => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.phone ?? ''} ${c.id}`}
                    onSelect={() => pick({ id: c.id, name: c.name, phone: c.phone ?? '' })}
                  >
                    <User className="w-4 h-4 mr-2 text-muted-foreground" />
                    <span className="flex-1 truncate">{c.name}</span>
                    {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
