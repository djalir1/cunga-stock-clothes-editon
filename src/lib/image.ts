import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'item-images';

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a picture we can read.')); };
    img.src = url;
  });
}

function drawScaled(img: HTMLImageElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff'; // transparent PNGs become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/** Phone photos are 3–8 MB; this makes a ~100 KB JPEG that still looks sharp in the app. */
export async function compressImage(file: File, maxSide = 900, quality = 0.8): Promise<Blob> {
  const img = await loadImage(file);
  const { canvas } = drawScaled(img, maxSide);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not prepare the picture.'))), 'image/jpeg', quality));
}

export async function uploadItemImage(file: File, folder = 'items', maxSide = 900): Promise<string> {
  const blob = await compressImage(file, maxSide);
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Removes a photo we uploaded (ignored if it isn't one of ours). */
export async function deleteItemImage(url: string | null | undefined) {
  const marker = `/${BUCKET}/`;
  if (!url || !url.includes(marker)) return;
  await supabase.storage.from(BUCKET).remove([url.split(marker)[1]]);
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The main colours of a garment photo, most common first.
 * Looks at the middle of the picture (where the garment usually is), skips the
 * plain background around the edges, and groups similar shades together.
 */
export async function detectColors(file: Blob, max = 3): Promise<string[]> {
  const img = await loadImage(file);
  const { canvas, ctx } = drawScaled(img, 120);
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;

  // Background = the most common colour along the border
  const bucket = (r: number, g: number, b: number) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
  const edge = new Map<number, number>();
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) {
    const i = (y * w + x) * 4; const k = bucket(data[i], data[i + 1], data[i + 2]);
    edge.set(k, (edge.get(k) ?? 0) + 1);
  }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) {
    const i = (y * w + x) * 4; const k = bucket(data[i], data[i + 1], data[i + 2]);
    edge.set(k, (edge.get(k) ?? 0) + 1);
  }
  const bg = [...edge.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const [bgR, bgG, bgB] = bg === undefined ? [-999, -999, -999] : [((bg >> 8) & 15) * 16 + 8, ((bg >> 4) & 15) * 16 + 8, (bg & 15) * 16 + 8];

  // Coarse buckets (32 levels per channel) over the central 70%
  const groups = new Map<number, { n: number; r: number; g: number; b: number }>();
  const x0 = Math.floor(w * 0.15), x1 = Math.ceil(w * 0.85), y0 = Math.floor(h * 0.15), y1 = Math.ceil(h * 0.85);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) < 60) continue;
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const grp = groups.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    grp.n++; grp.r += r; grp.g += g; grp.b += b;
    groups.set(k, grp);
  }

  const sorted = [...groups.values()].sort((a, b) => b.n - a.n);
  const total = sorted.reduce((s, g) => s + g.n, 0) || 1;
  const picked: string[] = [];
  for (const grp of sorted) {
    if (grp.n / total < 0.06 || picked.length >= max) break;
    const hex = toHex(grp.r / grp.n, grp.g / grp.n, grp.b / grp.n);
    const [r, g, b] = hexToRgb(hex);
    const tooClose = picked.some(p => { const [pr, pg, pb] = hexToRgb(p); return Math.abs(pr - r) + Math.abs(pg - g) + Math.abs(pb - b) < 70; });
    if (!tooClose) picked.push(hex);
  }
  return picked;
}

/** Closest named colour, judged roughly the way eyes see it (weighted RGB distance). */
export function nearestColor<T extends { name: string; hex: string }>(hex: string, palette: T[]): T | null {
  const [r, g, b] = hexToRgb(hex);
  let best: T | null = null; let bestD = Infinity;
  for (const c of palette) {
    const [cr, cg, cb] = hexToRgb(c.hex);
    const rm = (r + cr) / 2;
    const d = (2 + rm / 256) * (r - cr) ** 2 + 4 * (g - cg) ** 2 + (2 + (255 - rm) / 256) * (b - cb) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Dark text on light swatches, white on dark ones */
export function isLightColor(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
