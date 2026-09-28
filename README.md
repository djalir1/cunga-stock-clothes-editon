# Cunga Stock — Clothing Store Edition

Inventory management for clothing shops, built on the Cunga Stock design.

## Modules

- **Dashboard** — stock levels, low-stock alerts, recent activity
- **Stock Items** — add garments, record sales, restock, low-stock thresholds
- **Categories** — T-Shirts & Tops, Shirts, Trousers & Jeans, Dresses & Skirts, Jackets & Coats, Shoes, Accessories, Kids (editable)
- **Temporary Stock** — garments out with customers on approval or reserved: customer name/phone, size, colour, deposit, expected return; each record closes as **Returned** (back on the shelf) or **Sold**
- **History / Reports** — every stock movement, CSV & PDF exports

Roles: `storekeeper` can make changes; `admin` is a view-only supervisor. New sign-ups get `storekeeper`.

## Setup

Requires Node.js.

```sh
npm install
npm run dev
```

Create a `.env` file (not committed) with the Supabase project values:

```
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<publishable key>"
VITE_SUPABASE_PROJECT_ID="<project-ref>"
```

The database schema lives in `supabase/migrations/`.

## Tech

Vite · React · TypeScript · shadcn-ui · Tailwind CSS · Supabase
