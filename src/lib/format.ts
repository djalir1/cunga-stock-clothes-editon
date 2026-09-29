const rwf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 250000 → "FRW 250,000" (Rwandan francs). Every FRW amount in the app goes through this. */
export function formatRWF(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `FRW ${rwf.format(amount)}`;
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

/** Turns database errors into something a shop assistant can act on. */
export function friendlyError(error: { message?: string; code?: string } | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  const msg = error?.message ?? '';
  if (/row-level security|permission denied|42501/i.test(msg) || error?.code === '42501') {
    return "You don't have permission to do this, or your login has expired. Sign out and sign in again; if it still fails, ask the owner for edit access.";
  }
  if (/duplicate key|23505/i.test(msg) || error?.code === '23505') return 'That name already exists. Use a different one.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No internet connection. Check the connection and try again.';
  return msg || fallback;
}
