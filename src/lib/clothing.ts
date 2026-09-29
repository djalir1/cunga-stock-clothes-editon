// Size and colour presets for the pickers. Anything else can still be typed in.

export const SIZE_GROUPS: { label: string; sizes: string[] }[] = [
  { label: 'Clothing', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  { label: 'Waist', sizes: ['28', '30', '32', '34', '36', '38', '40', '42'] },
  { label: 'Shoes', sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
  { label: 'Kids', sizes: ['0-6M', '6-12M', '1-2Y', '3-4Y', '5-6Y', '7-8Y', '9-10Y', '11-12Y'] },
];

export const COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#111111' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Grey', hex: '#9CA3AF' },
  { name: 'Navy', hex: '#1E3A8A' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Sky Blue', hex: '#7DD3FC' },
  { name: 'Red', hex: '#DC2626' },
  { name: 'Maroon', hex: '#7F1D1D' },
  { name: 'Pink', hex: '#F472B6' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Olive', hex: '#6B7234' },
  { name: 'Yellow', hex: '#FACC15' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Brown', hex: '#7C4A1E' },
  { name: 'Beige', hex: '#E8D8B8' },
  { name: 'Khaki', hex: '#BDB38A' },
  { name: 'Gold', hex: '#D4A017' },
  { name: 'Silver', hex: '#C0C0C0' },
];

const colorByName = new Map(COLORS.map(c => [c.name.toLowerCase(), c.hex]));

/** Hex for a known colour name; null for custom names like "Kitenge print" */
export function colorHex(name: string | null | undefined): string | null {
  if (!name) return null;
  return colorByName.get(name.trim().toLowerCase()) ?? null;
}
