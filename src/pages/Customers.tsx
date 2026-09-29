import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useCustomers, useCustomerMutations, useCustomerSales, type Customer } from '@/hooks/useCustomers';
import { formatRWF } from '@/lib/format';
import { groupReceiptLines, receiptNumber } from '@/lib/receipt';
import { SHOP } from '@/config/shop';
import { FormDialog } from '@/components/shop/FormDialog';
import { PaymentDialog, type PaymentTarget } from '@/components/shop/PaymentDialog';
import { ContactButtons } from '@/components/shop/ContactButtons';
import { PaymentBadge } from '@/components/shop/PaymentBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Search, UserPlus, Users, Wallet, RefreshCcw, ShoppingBag, Pencil, ShieldCheck } from 'lucide-react';

const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

function CustomerDetail({ customer, canEdit, onEdit, onPay }: {
  customer: Customer;
  canEdit: boolean;
  onEdit: () => void;
  onPay: () => void;
}) {
  const { data: sales = [], isLoading } = useCustomerSales(customer.id);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 p-2"><p className="text-lg font-bold">{customer.visits}</p><p className="text-[11px] text-muted-foreground">Purchases</p></div>
        <div className="rounded-lg bg-muted/50 p-2"><p className="text-sm font-bold pt-1">{formatRWF(customer.total_spent)}</p><p className="text-[11px] text-muted-foreground">Spent</p></div>
        <div className={cn('rounded-lg p-2', customer.owes > 0 ? 'bg-amber-500/10' : 'bg-green-500/10')}>
          <p className={cn('text-sm font-bold pt-1', customer.owes > 0 ? 'text-amber-600' : 'text-green-600')}>{customer.owes > 0 ? formatRWF(customer.owes) : 'Nothing'}</p>
          <p className="text-[11px] text-muted-foreground">Owes</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canEdit && customer.owes > 0 && (
          <Button size="sm" className="gap-1.5 h-8 bg-green-600 hover:bg-green-700" onClick={onPay}><Wallet className="w-3.5 h-3.5" /> Record payment</Button>
        )}
        <ContactButtons phone={customer.phone}
          message={customer.owes > 0
            ? `Muraho ${customer.name}, this is ${SHOP.name}. A friendly reminder that your balance is ${formatRWF(customer.owes)}. Murakoze!`
            : `Muraho ${customer.name}, this is ${SHOP.name}. `} />
        {canEdit && <Button size="sm" variant="ghost" className="gap-1.5 h-8" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /> Edit</Button>}
      </div>
      {customer.notes && <p className="text-sm rounded-lg border border-border p-2 bg-muted/30">{customer.notes}</p>}

      <div className="space-y-2">
        <p className="text-sm font-semibold">What they bought</p>
        {isLoading ? (
          <div className="flex justify-center py-4"><RefreshCcw className="w-5 h-5 animate-spin text-primary" /></div>
        ) : sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">No purchases yet.</p>
        ) : (
          <div className="space-y-2">
            {sales.map(s => (
              <div key={s.id} className="rounded-lg border border-border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{receiptNumber(s.receipt_no)} · {format(new Date(s.sold_at), 'dd MMM yyyy')}</span>
                  <span className="font-semibold">{formatRWF(s.total)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xs text-muted-foreground truncate">
                    {groupReceiptLines(s.sale_items.map(l => ({ ...l, unit_price: 0 }))).map(g =>
                      g.set_name ? `${g.lines[0].quantity}× ${g.set_name}` : `${g.lines[0].quantity}× ${g.lines[0].item_name}${g.lines[0].size ? ` ${g.lines[0].size}` : ''}${g.lines[0].color ? ` ${g.lines[0].color}` : ''}`,
                    ).join(', ')}
                  </span>
                  <PaymentBadge status={s.payment_status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Customers() {
  const { canEdit } = useAuth();
  const { data: customers = [], isLoading } = useCustomers();
  const { saveCustomer } = useCustomerMutations();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<{ id?: string; name: string; phone: string; notes: string } | null>(null);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);

  // Keep the open customer in sync after a payment or edit
  useEffect(() => {
    if (viewing) setViewing(customers.find(c => c.id === viewing.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  const q = search.toLowerCase().trim();
  const shown = customers
    .filter(c => !q || c.name.toLowerCase().includes(q) || (c.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')))
    .filter(c => filter === 'all' || (filter === 'owes' ? c.owes > 0 : c.visits >= 3));

  const duplicate = editing && customers.find(c => c.id !== editing.id && c.name.toLowerCase() === editing.name.trim().toLowerCase()
    && (c.phone ?? '') === editing.phone.trim());

  const save = async () => {
    if (!editing?.name.trim() || duplicate) return;
    await saveCustomer.mutateAsync({ id: editing.id, name: editing.name, phone: editing.phone, notes: editing.notes });
    setEditing(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-muted-foreground">Your regulars, what they bought and what they owe</p>
            {!canEdit && <Badge variant="outline" className="text-blue-500 border-blue-500/30 gap-1"><ShieldCheck className="w-3 h-3" /> View Only</Badge>}
          </div>
        </div>
        {canEdit && (
          <Button className="gap-2" onClick={() => setEditing({ name: '', phone: '', notes: '' })}><UserPlus className="w-4 h-4" /> Add Customer</Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-10" placeholder="Search name or phone…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers ({customers.length})</SelectItem>
            <SelectItem value="owes">Owe money ({customers.filter(c => c.owes > 0).length})</SelectItem>
            <SelectItem value="regular">Regulars (3+ purchases)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCcw className="w-8 h-8 animate-spin text-primary" /></div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{customers.length === 0 ? 'No customers yet. They are added when you pick or type a customer at a sale.' : 'No customer matches.'}</p>
          {customers.length === 0 && <Button asChild variant="outline" className="mt-4 gap-2"><Link to="/sales"><ShoppingBag className="w-4 h-4" /> Go to Sales</Link></Button>}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(c => (
            <Card key={c.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setViewing(c)}>
              <CardContent className="p-4 flex items-start gap-3">
                <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials(c.name)}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold truncate">{c.name}</p>
                    {c.owes > 0 && <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">Owes {formatRWF(c.owes)}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.phone || 'No phone'}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {c.visits} purchase{c.visits === 1 ? '' : 's'} · {formatRWF(c.total_spent)} · {formatDistanceToNow(new Date(c.last_visit), { addSuffix: true })}
                  </p>
                </div>
                <ContactButtons compact phone={c.phone} message={`Muraho ${c.name}, this is ${SHOP.name}. `} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FormDialog
        open={!!viewing}
        onOpenChange={o => !o && setViewing(null)}
        title={viewing?.name ?? ''}
        description={viewing && (viewing.phone || 'No phone number')}
        footer={<Button variant="outline" onClick={() => setViewing(null)}>Close</Button>}
      >
        {viewing && (
          <CustomerDetail
            customer={viewing}
            canEdit={canEdit}
            onEdit={() => setEditing({ id: viewing.id, name: viewing.name, phone: viewing.phone ?? '', notes: viewing.notes ?? '' })}
            onPay={() => setPaying({ customerId: viewing.id, customerName: viewing.name, owes: viewing.owes })}
          />
        )}
      </FormDialog>

      <FormDialog
        open={!!editing}
        onOpenChange={o => !o && setEditing(null)}
        title={editing?.id ? 'Edit Customer' : 'Add Customer'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={!editing?.name.trim() || !!duplicate || saveCustomer.isPending}>Save</Button>
          </>
        }
      >
        {editing && (
          <>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input autoFocus placeholder="e.g. Aline Uwase" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone <span className="text-muted-foreground font-normal">for calls and WhatsApp reminders</span></Label>
              <Input type="tel" placeholder="0788 000 000" value={editing.phone} onChange={e => setEditing({ ...editing, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground font-normal">optional</span></Label>
              <Textarea rows={2} placeholder="e.g. Prefers size M, likes kitenge" value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
            </div>
            {duplicate && <p className="text-sm text-destructive">A customer with this name and phone already exists.</p>}
          </>
        )}
      </FormDialog>

      <PaymentDialog target={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
