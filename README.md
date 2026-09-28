# Cunga Stock — Clothing Store Edition

Inventory management for clothing shops, built on the Cunga Stock design.

## Modules

- **Dashboard** — stock levels, low-stock alerts, recent activity
- **Stock Items** — items with sizes & colours (variants); record sales, restock, low-stock thresholds
- **Categories** — T-Shirts & Tops, Shirts, Trousers & Jeans, Dresses & Skirts, Jackets & Coats, Shoes, Accessories, Kids (editable)
- **Temporary Stock** — garments taken from stock by a customer on approval or reserved; each record closes as **Returned** (back on the shelf) or **Sold** (a sale at the agreed price, with any unpaid balance becoming a debt)
- **History / Reports** — every stock movement, CSV & PDF exports

Prices are negotiated, so an item never has a fixed selling price: the price is typed on every sale line.
A variant's "usual price" is only a reminder. All money is RWF.

### Roles

| Role | Can do |
|---|---|
| Owner | Everything, plus manage the team (Settings → Team & Access) |
| Storekeeper | Add and change stock, sales, customers |
| Supervisor (`admin`) | View only |
| No role | New account waiting for the owner's approval — sees nothing |

The first account in a fresh database becomes the owner. Access is enforced by Postgres row-level security, not just the UI.

### Data model

Stock lives on `stock_variants` (item × size × colour); `stock_items` holds the totals. Sales (`sales`, `sale_items`),
`customers`, `debts` and `debt_payments` record money; a debt's balance is total − payments (`debt_balances` view).
Every stock change goes through a database function that locks the variant row (`record_sale`, `restock_variant`,
`check_out_temp`, `close_temp_checkout`, …), so two people can't sell the same last piece.

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
