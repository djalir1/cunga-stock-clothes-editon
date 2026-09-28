const rwf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 250000 → "RWF 250,000". Every money value in the app goes through this. */
export function formatRWF(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `RWF ${rwf.format(amount)}`;
}

/** "Cotton Shirt" + M + White → "Cotton Shirt (M · White)" */
export function variantLabel(name: string, size: string | null, color: string | null): string {
  const option = [size, color].filter(Boolean).join(' · ');
  return option ? `${name} (${option})` : name;
}

/** Just the option part: "M · White", or "One size" for the default variant */
export function optionLabel(size: string | null, color: string | null): string {
  return [size, color].filter(Boolean).join(' · ') || 'One size';
}
