import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useShopSettings } from '@/hooks/useShopSettings';
import { uploadItemImage, deleteItemImage } from '@/lib/image';
import { friendlyError } from '@/lib/format';
import { downloadReceipt } from '@/lib/receipt';
import { useToast } from '@/hooks/use-toast';
import { PhotoInput } from '@/components/shop/PhotoInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, FileDown } from 'lucide-react';

const empty = { name: '', tagline: '', location: '', phone: '', email: '', tin: '', receipt_footer: '' };

/** Shop name, logo and contacts that print on every receipt and report. Owner edits; others see. */
export function ShopProfile() {
  const { isManager } = useAuth();
  const { settings, save } = useShopSettings();
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      name: settings.name, tagline: settings.tagline ?? '', location: settings.location ?? '', phone: settings.phone ?? '',
      email: settings.email ?? '', tin: settings.tin ?? '', receipt_footer: settings.receipt_footer ?? '',
    });
    setLogoUrl(settings.logo_url);
    setLogoFile(null);
  }, [settings]);

  const field = (key: keyof typeof empty, label: string, placeholder: string, type = 'text') => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={form[key]} placeholder={placeholder} disabled={!isManager}
        onChange={e => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      let logo_url = logoUrl;
      if (logoFile) logo_url = await uploadItemImage(logoFile, 'shop', 400);
      const clean = (v: string) => v.trim() || null;
      await save.mutateAsync({
        name: form.name.trim(), tagline: clean(form.tagline), location: clean(form.location), phone: clean(form.phone),
        email: clean(form.email), tin: clean(form.tin), receipt_footer: clean(form.receipt_footer), logo_url,
      });
      if (settings?.logo_url && settings.logo_url !== logo_url) await deleteItemImage(settings.logo_url);
    } catch (e) {
      toast({ title: 'Logo not uploaded', description: friendlyError(e as Error), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const sample = () => downloadReceipt({
    receipt_no: 123, sold_at: new Date().toISOString(), customer_name: 'Sample customer', total: 45000, amount_paid: 45000,
    payment_status: 'paid', payment_method: 'mobile_money',
    lines: [
      { item_name: 'Slim fit shirt', size: 'M', color: 'White', quantity: 1, unit_price: 15000 },
      { item_name: 'Chino trousers', size: '32', color: 'Navy', quantity: 1, unit_price: 30000 },
    ],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Store className="w-5 h-5 text-primary" /> Shop profile</CardTitle>
        <CardDescription>
          Your shop's name, logo and contacts — printed on every receipt and report.{!isManager && ' Only the owner or an admin can change them.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Logo</Label>
          {isManager ? (
            <PhotoInput url={logoUrl} file={logoFile} onFile={setLogoFile} onRemove={() => { setLogoFile(null); setLogoUrl(null); }} />
          ) : logoUrl ? <img src={logoUrl} alt="Shop logo" className="h-20 rounded-lg border border-border object-contain bg-white p-1" /> : <p className="text-sm text-muted-foreground">No logo</p>}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {field('name', 'Shop name', 'e.g. Aline Fashion House')}
          {field('tagline', 'Tagline', 'e.g. Clothing & Shoes')}
          {field('location', 'Location', 'e.g. Kigali, Nyarugenge — KN 4 Ave')}
          {field('phone', 'Phone', 'e.g. 0788 000 000', 'tel')}
          {field('email', 'Email', 'optional', 'email')}
          {field('tin', 'TIN (tax number)', 'optional')}
        </div>
        {field('receipt_footer', 'Message at the bottom of receipts', 'e.g. Murakoze! Goods sold are exchangeable within 3 days.')}
        <div className="flex flex-wrap gap-2">
          {isManager && <Button onClick={submit} disabled={!form.name.trim() || saving}>{saving ? 'Saving…' : 'Save shop profile'}</Button>}
          <Button variant="outline" className="gap-2" onClick={sample}><FileDown className="w-4 h-4" /> Preview a receipt</Button>
        </div>
        <p className="text-xs text-muted-foreground">Receipts also show a small “Powered by Cunga Stock” mark at the bottom.</p>
      </CardContent>
    </Card>
  );
}
