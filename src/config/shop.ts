// Shop details printed on receipts, report PDFs and WhatsApp messages.
// The owner edits them in Settings → Shop profile; these are the defaults until they load.
export const SHOP = {
  name: 'Cunga Stock',
  tagline: 'Clothing Store' as string | null,
  location: 'Kigali, Rwanda' as string | null,
  phone: '' as string | null,
  email: '' as string | null,
  tin: '' as string | null,
  logoUrl: null as string | null,
  receiptFooter: 'Murakoze! Thank you for shopping with us.' as string | null,
  /** Logos as data URLs, ready for PDFs (jsPDF can't load images by URL) */
  logoData: null as string | null,
  cungaLogoData: null as string | null,
};

export interface ShopSettingsRow {
  name: string;
  tagline: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  tin: string | null;
  logo_url: string | null;
  receipt_footer: string | null;
  /** FRW for 1 USD / 1 EUR, used when a customer pays in those currencies */
  usd_rate: number;
  eur_rate: number;
  rates_updated_at: string;
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise(resolve => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function applyShopSettings(row: ShopSettingsRow) {
  const logoChanged = row.logo_url !== SHOP.logoUrl;
  Object.assign(SHOP, {
    name: row.name, tagline: row.tagline, location: row.location, phone: row.phone,
    email: row.email, tin: row.tin, logoUrl: row.logo_url, receiptFooter: row.receipt_footer,
  });
  if (logoChanged) SHOP.logoData = row.logo_url ? await toDataUrl(row.logo_url) : null;
  if (!SHOP.cungaLogoData) SHOP.cungaLogoData = await toDataUrl('/cunga-logo-nobg.png');
}
