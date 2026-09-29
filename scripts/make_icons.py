"""Builds every app icon from the HD logo (public/cunga-stock-logo-updated.jpeg).

- The symbol (the "C" with the shirt) becomes the phone / browser icons: text is unreadable that small.
- The paper-textured background is turned pure white (or transparent for the -nobg files).
Run: python scripts/make_icons.py
"""
from PIL import Image, ImageFilter

SRC = 'public/cunga-stock-logo-updated.jpeg'
im = Image.open(SRC).convert('RGB')
W, H = im.size

def clean(img, transparent=False):
    """Near-white paper texture → white (or transparent), keep the logo colours."""
    img = img.convert('RGBA')
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            light = min(r, g, b)
            if light > 215 and max(r, g, b) - light < 25:  # paper / white
                px[x, y] = (255, 255, 255, 0 if transparent else 255)
            elif transparent and light > 170 and max(r, g, b) - light < 25:  # soft edge
                alpha = int(255 * (215 - light) / 45)
                px[x, y] = (r, g, b, max(0, min(255, alpha)))
    return img

def bbox(img, top, bottom):
    """Box around the coloured pixels between two rows."""
    px = img.load()
    xs, ys = [], []
    for y in range(top, bottom):
        for x in range(img.width):
            r, g, b = px[x, y][:3]
            if min(r, g, b) < 170 or max(r, g, b) - min(r, g, b) > 60:
                xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1

# The symbol sits above the "Cunga stock" words (which start around 62% of the height)
sx0, sy0, sx1, sy1 = bbox(im, 0, int(H * 0.60))
symbol = im.crop((sx0, sy0, sx1, sy1))
print('symbol box', (sx0, sy0, sx1, sy1))

def square(img, size, pad, transparent=False):
    img = clean(img, transparent)
    side = max(img.width, img.height)
    canvas = Image.new('RGBA', (side, side), (255, 255, 255, 0 if transparent else 255))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    inner = int(size * (1 - 2 * pad))
    canvas = canvas.resize((inner, inner), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (255, 255, 255, 0 if transparent else 255))
    out.paste(canvas, ((size - inner) // 2, (size - inner) // 2), canvas)
    return out

# Phone / browser icons (white background, like the logo)
for name, size, pad in [
    ('icon-192.png', 192, 0.08), ('icon-512.png', 512, 0.08),
    ('android-chrome-192x192.png', 192, 0.08), ('android-chrome-512x512.png', 512, 0.08),
    ('icon-maskable-192.png', 192, 0.18), ('icon-maskable-512.png', 512, 0.18),  # Android crops to a circle
    ('apple-touch-icon.png', 180, 0.10),
    ('favicon-32x32.png', 32, 0.02), ('favicon-16x16.png', 16, 0.0),
]:
    square(symbol, size, pad).convert('RGB').save(f'public/{name}', optimize=True)

ico = square(symbol, 64, 0.02).convert('RGB')
ico.save('public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

# Sidebar / header mark (transparent) and the full logo (white background)
square(symbol, 256, 0.02, transparent=True).save('public/cunga-logo-nobg.png', optimize=True)
fx0, fy0, fx1, fy1 = bbox(im, 0, H)
full = clean(im.crop((max(0, fx0 - 20), max(0, fy0 - 20), min(W, fx1 + 20), min(H, fy1 + 20))))
full.convert('RGB').save('public/cunga-logo-full.png', optimize=True)
full.convert('RGB').save('public/cunga-logo.jpg', quality=92)
print('done')

# Small monochrome badge shown in the phone's status bar for notifications (Android uses only the shape)
badge = square(symbol, 96, 0.04, transparent=True)
px = badge.load()
for y in range(badge.height):
    for x in range(badge.width):
        a = px[x, y][3]
        px[x, y] = (255, 255, 255, a)
badge.save('public/notification-badge.png', optimize=True)
print('badge done')
