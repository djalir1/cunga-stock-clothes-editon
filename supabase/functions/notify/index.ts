// Phone notifications (Web Push) for everyone in the shop: owner, developers (admin role), supervisors, storekeepers.
//
// Actions (POST JSON):
//   { action: "public_key" }            → VAPID public key phones subscribe with (created on first use)
//   { action: "test" }                  → test notification to the caller's own devices (needs their login)
//   { action: "resubscribe", old_endpoint, subscription } → the phone's service worker got a new push address
//                                          (works while logged out; the old address identifies the device)
//   From the database only (x-hook-secret header):
//   { action: "sale" | "sale_cancelled", sale_id, actor }
//   { action: "low_stock", item_id, actor }
//   { action: "order_received", order_id, actor }
//   { action: "daily" }                 → 08:00 reminders: debts due / overdue, deliveries, temporary stock,
//                                          low stock, yesterday's sales
//   { action: "activity", kind, … }     → every other action: stock added / edited / deleted, payments,
//                                          customers, temporary stock, new / cancelled orders, new accounts
// Who gets what: owner + developers get everything they switch on (notification_prefs, all on by default);
// supervisors and storekeepers only the kinds the owner allows them (shop_settings.supervisor_alerts /
// storekeeper_alerts), and each can switch those off for themselves.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const rwf = (n: number) => `FRW ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;
const METHOD: Record<string, string> = { cash: "Cash", mobile_money: "Mobile Money", bank: "Bank", other: "Other", split: "Split" };
const foreignMoney = (n: number, cur: string) => `${cur} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}`;

interface Part { method: string; currency: string; amount: number; rate: number; frw: number }
/** " · paid in USD" when foreign money was used, so it stands out in the title */
const currencies = (parts: Part[]) => {
  const foreign = [...new Set(parts.map(p => p.currency).filter(c => c !== "RWF"))];
  return foreign.length ? ` · paid in ${foreign.join(" + ")}` : "";
};
/** "Cash USD 20 (= FRW 29,000) + Mobile Money FRW 15,000" */
const describeParts = (parts: Part[]) => parts.map(p => p.currency === "RWF"
  ? `${METHOD[p.method] ?? p.method} ${rwf(Number(p.frw))}`
  : `${METHOD[p.method] ?? p.method} ${foreignMoney(Number(p.amount), p.currency)} (= ${rwf(Number(p.frw))})`).join(" + ");
// Rwanda time (UTC+2) for "today" in reminders
const kigaliDate = (offsetDays = 0) => new Date(Date.now() + 2 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type PrefKey = "sales" | "sale_cancelled" | "low_stock" | "debt_due" | "debt_overdue" | "orders" | "temp_stock" | "daily_summary"
  | "stock_changes" | "payments" | "customers" | "new_accounts";
interface Prefs { user_id: string; debt_due_days: number; [k: string]: unknown }
interface Sub { id: string; endpoint: string; p256dh: string; auth: string; user_id: string; include_own: boolean }
interface Message { title: string; body: string; url: string; tag: string }

interface Config { vapid_public: string | null; vapid_private: string | null; hook_secret: string }
async function config(): Promise<Config> {
  const read = async () => {
    const { data, error } = await db.rpc("push_config");
    if (error) throw error;
    return data as Config;
  };
  let cfg = await read();
  if (!cfg.vapid_public || !cfg.vapid_private) {
    const keys = webpush.generateVAPIDKeys();
    const { error } = await db.rpc("save_vapid_keys", { p_public: keys.publicKey, p_private: keys.privateKey });
    if (error) throw error;
    cfg = await read();
  }
  webpush.setVapidDetails("mailto:alerts@cungastock.app", cfg.vapid_public!, cfg.vapid_private!);
  return cfg;
}

/**
 * Everyone with a role, with their preferences (missing row = everything on).
 * Supervisors and storekeepers only get the kinds the owner allows their role.
 */
async function recipients(): Promise<Map<string, Prefs>> {
  const [{ data: roles }, { data: shop }] = await Promise.all([
    db.from("user_roles").select("user_id, role").in("role", ["owner", "admin", "supervisor", "storekeeper"]),
    db.from("shop_settings").select("supervisor_alerts, storekeeper_alerts").eq("id", 1).maybeSingle(),
  ]);
  const ids = (roles ?? []).map(r => r.user_id);
  const { data: prefs } = ids.length ? await db.from("notification_prefs").select("*").in("user_id", ids) : { data: [] };
  const byUser = new Map((prefs ?? []).map(p => [p.user_id, p as Prefs]));
  const allowedFor: Record<string, string[] | null> = {
    supervisor: (shop?.supervisor_alerts ?? []) as string[],
    storekeeper: (shop?.storekeeper_alerts ?? []) as string[],
  };
  return new Map((roles ?? []).map(r => [r.user_id, {
    ...(byUser.get(r.user_id) ?? { user_id: r.user_id, debt_due_days: 2 }),
    allowed: allowedFor[r.role] ?? null,
  }]));
}
const wants = (p: Prefs, key: PrefKey) =>
  p[key] !== false && (!Array.isArray(p.allowed) || (p.allowed as string[]).includes(key));

async function devices(userIds: string[]): Promise<Sub[]> {
  if (!userIds.length) return [];
  const { data } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id, include_own").in("user_id", userIds);
  return (data ?? []) as Sub[];
}

/** Send to each device; forget devices the browser says are gone. */
async function send(subs: Sub[], message: Message) {
  let sent = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(message),
        { TTL: 60 * 60 * 24, urgency: "high" },
      );
      sent++;
      await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
      else console.error("push failed", code, (e as Error).message);
    }
  }));
  return sent;
}

/** One event → everyone who wants this kind of alert (not the person who did it, unless they asked) */
async function broadcast(key: PrefKey, message: Message, actor: string | null) {
  const people = await recipients();
  const users = [...people.values()].filter(p => wants(p, key)).map(p => p.user_id);
  const subs = (await devices(users)).filter(s => s.user_id !== actor || s.include_own);
  return { sent: subs.length ? await send(subs, message) : 0 };
}

async function firstName(userId: string | null) {
  if (!userId) return "Staff";
  const { data } = await db.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
  return data?.full_name?.split(" ")[0] ?? "Staff";
}

function describeLines(lines: { item_name: string; size: string | null; color: string | null; quantity: number; set_name: string | null }[]) {
  const sets = new Map<string, number>();
  const parts: string[] = [];
  for (const l of lines) {
    if (l.set_name) { sets.set(l.set_name, l.quantity); continue; }
    const opt = [l.size, l.color].filter(Boolean).join(", ");
    parts.push(`${l.quantity}× ${l.item_name}${opt ? ` (${opt})` : ""}`);
  }
  sets.forEach((q, name) => parts.push(`${q}× ${name} set`));
  const text = parts.slice(0, 3).join(", ");
  return parts.length > 3 ? `${text} +${parts.length - 3} more` : text;
}

async function saleAlert(saleId: string, action: "sale" | "sale_cancelled", actor: string | null) {
  const { data: sale } = await db
    .from("sales")
    .select("id, receipt_no, total, amount_paid, payment_status, payment_method, payments, change_given, source, customer_name, created_by, void_reason, sale_items(item_name, size, color, quantity, set_name)")
    .eq("id", saleId).maybeSingle();
  if (!sale) return { sent: 0, reason: "sale not found" };
  const by = actor ?? sale.created_by;
  const who = sale.customer_name ?? "A walk-in customer";
  const items = describeLines(sale.sale_items ?? []);
  const total = Number(sale.total), paid = Number(sale.amount_paid);
  // Which method and currency the customer paid with, e.g. "Cash USD 20 (= FRW 29,000) + Mobile Money FRW 15,000"
  const parts = (Array.isArray(sale.payments) ? sale.payments : []) as Part[];
  const how = parts.length ? describeParts(parts) : METHOD[sale.payment_method] ?? sale.payment_method;
  const change = Number(sale.change_given ?? 0);
  const payment = sale.payment_status === "paid"
    ? `Paid: ${how}${change > 0 ? ` · change ${rwf(change)}` : ""}`
    : sale.payment_status === "partial" ? `Paid: ${how} · owes ${rwf(total - paid)}` : `On credit · owes ${rwf(total)}`;
  const seller = await firstName(by);
  const url = `/sales?receipt=${sale.id}`;
  return action === "sale"
    ? broadcast("sales", {
        title: `New sale · ${rwf(total)}${currencies(parts)}`,
        body: `${who} bought ${items}. Sold by ${seller}. ${payment}${sale.source === "temp_stock" ? " (from temporary stock)" : ""}`,
        url, tag: `sale-${sale.id}`,
      }, by)
    : broadcast("sale_cancelled", {
        title: `Sale cancelled · ${rwf(total)}`,
        body: `Receipt #${String(sale.receipt_no).padStart(5, "0")} (${items}) was cancelled by ${seller}${sale.void_reason ? `: ${sale.void_reason}` : ""}.`,
        url, tag: `sale-${sale.id}`,
      }, by);
}

async function lowStockAlert(itemId: string, actor: string | null) {
  const { data: item } = await db.from("stock_items").select("id, name, quantity, min_quantity, status").eq("id", itemId).maybeSingle();
  if (!item || item.status === "in_stock") return { sent: 0 };
  return broadcast("low_stock", {
    title: item.status === "out_of_stock" ? `Sold out: ${item.name}` : `Running low: ${item.name}`,
    body: item.status === "out_of_stock"
      ? `${item.name} has no pieces left. Restock or order from a supplier.`
      : `Only ${plural(item.quantity, "piece")} left (you asked to be warned below ${item.min_quantity}). Time to restock.`,
    url: `/stock?q=${encodeURIComponent(item.name)}`, tag: `stock-${item.id}`,
  }, null); // everyone who wants stock alerts, including whoever made the sale
}

async function orderAlert(orderId: string, actor: string | null) {
  const { data: o } = await db.from("purchase_orders")
    .select("id, po_no, status, supplier_name, purchase_order_lines(quantity_ordered, quantity_received)").eq("id", orderId).maybeSingle();
  if (!o) return { sent: 0 };
  const got = (o.purchase_order_lines ?? []).reduce((s: number, l: { quantity_received: number }) => s + l.quantity_received, 0);
  const all = (o.purchase_order_lines ?? []).reduce((s: number, l: { quantity_ordered: number }) => s + l.quantity_ordered, 0);
  return broadcast("orders", {
    title: o.status === "received" ? `Order #${o.po_no} arrived` : `Part of order #${o.po_no} arrived`,
    body: `${got} of ${all} pieces${o.supplier_name ? ` from ${o.supplier_name}` : ""} checked in by ${await firstName(actor)} and added to stock.`,
    url: "/orders", tag: `order-${o.id}`,
  }, actor);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const variantLabel = (size?: string | null, color?: string | null) => {
  const v = [size, color].filter(Boolean).join(", ");
  return v ? ` (${v})` : "";
};
const list = (parts: string[], max = 3) =>
  `${parts.slice(0, max).join(", ")}${parts.length > max ? ` +${parts.length - max} more` : ""}`;
const money = (v: unknown) => (v == null ? "no price" : rwf(Number(v)));

interface LogRow { id: string; user_id: string | null; entity_id: string | null; details: Record<string, unknown>; created_at: string }
async function log(id: string | undefined) {
  if (!id) return null;
  const { data } = await db.from("activity_logs").select("id, user_id, entity_id, details, created_at").eq("id", id).maybeSingle();
  return data as LogRow | null;
}

interface ActivityBody {
  kind?: string; log_id?: string; item_id?: string; order_id?: string; checkout_id?: string;
  customer_id?: string; user_id?: string; at?: string;
}

/** Every action that isn't a sale: one clear message each */
async function activityAlert(b: ActivityBody, actor: string | null) {
  const who = await firstName(actor);
  switch (b.kind) {
    case "item_created": {
      const { data: item } = await db.from("stock_items")
        .select("id, name, quantity, stock_variants(size, color, default_price)").eq("id", b.item_id!).maybeSingle();
      if (!item) return { sent: 0 };
      const variants = (item.stock_variants ?? []) as { default_price: number | null }[];
      const prices = [...new Set(variants.map(v => v.default_price).filter(p => p != null))];
      return broadcast("stock_changes", {
        title: `New item: ${item.name}`,
        body: `${who} added ${plural(item.quantity, "piece")}${variants.length > 1 ? ` in ${variants.length} sizes/colours` : ""}${prices.length ? `, selling at ${prices.map(money).join(" / ")}` : ""}.`,
        url: `/stock?q=${encodeURIComponent(item.name)}`, tag: `item-${item.id}`,
      }, actor);
    }
    case "item_deleted": {
      const l = await log(b.log_id);
      if (!l) return { sent: 0 };
      const qty = Number(l.details.quantity ?? 0);
      return broadcast("stock_changes", {
        title: `Item deleted: ${l.details.name}`,
        body: `${who} deleted ${l.details.name}${qty ? ` (${plural(qty, "piece")} were still in stock)` : ""}.`,
        url: "/movements", tag: `item-${l.entity_id}`,
      }, actor);
    }
    case "item_edited": {
      // Saving an item can change its details and several prices one after another:
      // wait a moment, then only the latest change sends one alert that covers them all.
      await sleep(2500); // stays under the database's 5 s call timeout
      const l = await log(b.log_id);
      if (!l) return { sent: 0 };
      const since = new Date(new Date(l.created_at).getTime() - 60_000).toISOString();
      const { data: logs } = await db.from("activity_logs").select("id, details, created_at")
        .eq("action", "updated").eq("entity_type", "stock_item").eq("entity_id", l.entity_id!)
        .gte("created_at", since).order("created_at");
      const all = (logs ?? []) as { id: string; details: Record<string, unknown> }[];
      if (all.length && all[all.length - 1].id !== l.id) return { sent: 0, reason: "a newer change will be sent" };
      const changes: string[] = [];
      const prices: string[] = [];
      for (const { details: d } of all) {
        const pair = (k: string) => d[k] as [unknown, unknown] | undefined;
        if (pair("name")) changes.push(`renamed from "${pair("name")![0]}"`);
        if (pair("price")) prices.push(`${d.variant ? `${d.variant}: ` : ""}${money(pair("price")![0])} → ${money(pair("price")![1])}`);
        if (pair("cost")) changes.push(`cost ${money(pair("cost")![0])} → ${money(pair("cost")![1])}`);
        if (pair("min_quantity")) changes.push(`low-stock warning now at ${pair("min_quantity")![1]}`);
        if (d.category) changes.push("category changed");
        if (d.photo) changes.push("new photo");
        if (d.notes) changes.push("notes changed");
      }
      if (prices.length) changes.unshift(`price ${list(prices)}`);
      const name = String(all.at(-1)?.details.item ?? l.details.item ?? "An item");
      return broadcast("stock_changes", {
        title: prices.length ? `Price changed: ${name}` : `Item changed: ${name}`,
        body: `${who} changed ${name}: ${[...new Set(changes)].join("; ") || "details updated"}.`,
        url: `/stock?q=${encodeURIComponent(name)}`, tag: `edit-${l.entity_id}`,
      }, actor);
    }
    case "stock_moves": {
      const l = await log(b.log_id);
      if (!l) return { sent: 0 };
      const lines = (l.details.lines ?? []) as { item: string; size: string | null; color: string | null; quantity: number; type: string; note: string | null }[];
      if (!lines.length) return { sent: 0 };
      const pieces = lines.reduce((s, x) => s + x.quantity, 0);
      const isNew = lines.every(x => x.note === "Initial stock");
      const corrected = lines.some(x => x.type === "adjusted");
      return broadcast("stock_changes", {
        title: corrected ? "Stock corrected" : isNew ? "New size/colour added" : `Stock added · ${plural(pieces, "piece")}`,
        body: `${who} ${corrected ? "corrected" : "added"} ${list(lines.map(x => `${Math.abs(x.quantity)}× ${x.item}${variantLabel(x.size, x.color)}`))}${lines[0].note && !isNew ? `. Note: ${lines[0].note}` : ""}.`,
        url: `/stock?q=${encodeURIComponent(lines[0].item)}`, tag: `moves-${l.id}`,
      }, actor);
    }
    case "payment": {
      const { data: pays } = await db.from("debt_payments")
        .select("amount, method, debts(customer_id, customers(name))")
        .eq("created_at", b.at!).eq("is_initial", false);
      const rows = (pays ?? []) as unknown as { amount: number; method: string; debts: { customer_id: string | null; customers: { name: string } | null } | null }[];
      if (!rows.length) return { sent: 0 };
      const total = rows.reduce((s, r) => s + Number(r.amount), 0);
      // The parts as handed over (currency, amount) are in the activity log of this payment
      const { data: logRow } = await db.from("activity_logs").select("details")
        .eq("action", "debt_payment").eq("created_at", b.at!).limit(1).maybeSingle();
      const parts = ((logRow?.details as { payments?: Part[] } | null)?.payments ?? []) as Part[];
      const handed = parts.reduce((s, p) => s + Number(p.frw), 0);
      const how = parts.length
        ? `${describeParts(parts)}${handed > total ? ` · change ${rwf(handed - total)}` : ""}`
        : METHOD[rows[0].method] ?? rows[0].method;
      const name = rows[0].debts?.customers?.name ?? "A customer";
      const customerId = rows[0].debts?.customer_id;
      let still = "";
      if (customerId) {
        const { data: bal } = await db.from("debt_balances").select("balance").eq("customer_id", customerId);
        const left = (bal ?? []).reduce((s, x) => s + Number(x.balance), 0);
        still = left > 0 ? ` Still owes ${rwf(left)}.` : " All paid up now.";
      }
      return broadcast("payments", {
        title: `Payment received · ${rwf(total)}${currencies(parts)}`,
        body: `${name} paid ${rwf(total)}. Paid: ${how}. Recorded by ${who}.${still}`,
        url: "/debts", tag: `pay-${b.at}`,
      }, actor);
    }
    case "customer_added": {
      const { data: c } = await db.from("customers").select("id, name, phone").eq("id", b.customer_id!).maybeSingle();
      if (!c) return { sent: 0 };
      return broadcast("customers", {
        title: `New customer: ${c.name}`,
        body: `${who} added ${c.name}${c.phone ? ` (${c.phone})` : ""} to your customers.`,
        url: "/customers", tag: `customer-${c.id}`,
      }, actor);
    }
    case "temp_out":
    case "temp_returned": {
      const { data: t } = await db.from("temp_stock_checkouts")
        .select("id, customer_name, item_name, size, color, quantity, deposit, expected_return_date").eq("id", b.checkout_id!).maybeSingle();
      if (!t) return { sent: 0 };
      const what = `${t.quantity}× ${t.item_name}${variantLabel(t.size, t.color)}`;
      return broadcast("temp_stock", b.kind === "temp_out" ? {
        title: `Taken on approval: ${what}`,
        body: `${t.customer_name} took ${what}${Number(t.deposit) > 0 ? ` and left a deposit of ${rwf(Number(t.deposit))}` : ""}${t.expected_return_date ? `. Should decide by ${t.expected_return_date}` : ""}. Given by ${who}.`,
        url: "/temporary-stock", tag: `temp-${t.id}`,
      } : {
        title: `Brought back: ${what}`,
        body: `${t.customer_name} returned ${what}. It's back on the shelf. Checked in by ${who}.`,
        url: "/temporary-stock", tag: `temp-${t.id}`,
      }, actor);
    }
    case "temp_deleted": {
      const l = await log(b.log_id);
      if (!l) return { sent: 0 };
      const d = l.details;
      return broadcast("temp_stock", {
        title: "Temporary stock record deleted",
        body: `${who} deleted ${d.customer}'s record for ${d.quantity}× ${d.item}${d.status === "out" ? " (the clothes went back on the shelf)" : ""}.`,
        url: "/temporary-stock", tag: `temp-${l.entity_id}`,
      }, actor);
    }
    case "order_created":
    case "order_cancelled": {
      const { data: o } = await db.from("purchase_orders")
        .select("id, po_no, supplier_name, expected_on, purchase_order_lines(quantity_ordered, unit_cost)").eq("id", b.order_id!).maybeSingle();
      if (!o) return { sent: 0 };
      const lines = (o.purchase_order_lines ?? []) as { quantity_ordered: number; unit_cost: number | null }[];
      const pieces = lines.reduce((s, l) => s + l.quantity_ordered, 0);
      const cost = lines.reduce((s, l) => s + l.quantity_ordered * Number(l.unit_cost ?? 0), 0);
      const from = o.supplier_name ? ` from ${o.supplier_name}` : "";
      return broadcast("orders", b.kind === "order_created" ? {
        title: `New order #${o.po_no}${from}`,
        body: `${who} ordered ${plural(pieces, "piece")}${cost ? ` for ${rwf(cost)}` : ""}${o.expected_on ? `. Expected ${o.expected_on}` : ""}.`,
        url: "/orders", tag: `order-${o.id}`,
      } : {
        title: `Order #${o.po_no} cancelled`,
        body: `${who} cancelled order #${o.po_no}${from} (${plural(pieces, "piece")}).`,
        url: "/orders", tag: `order-${o.id}`,
      }, actor);
    }
    case "new_account": {
      const { data: p } = await db.from("profiles").select("full_name").eq("user_id", b.user_id!).maybeSingle();
      return broadcast("new_accounts", {
        title: "New account waiting for approval",
        body: `${p?.full_name ?? "Someone"} signed up. Open Settings → Team & Access to let them in.`,
        url: "/settings", tag: `account-${b.user_id}`,
      }, null);
    }
    default:
      return { error: "Unknown kind" };
  }
}

/** 08:00 reminders — each person gets only the kinds they chose */
async function daily() {
  const today = kigaliDate(), tomorrow = kigaliDate(1), yesterday = kigaliDate(-1);
  const people = [...(await recipients()).values()];
  const subs = await devices(people.map(p => p.user_id));
  if (!subs.length) return { sent: 0, reason: "no devices" };

  const [{ data: debts }, { data: orders }, { data: temp }, { data: low }, { data: sales }] = await Promise.all([
    db.from("debt_balances").select("customer_name, balance, due_date").gt("balance", 0),
    db.from("purchase_orders").select("po_no, supplier_name, expected_on, status").in("status", ["ordered", "in_transit", "partial"]),
    db.from("temp_stock_checkouts").select("customer_name, item_name, quantity, expected_return_date").eq("status", "out"),
    db.from("stock_items").select("name, quantity, status").neq("status", "in_stock"),
    db.from("sales").select("total, amount_paid").is("voided_at", null)
      .gte("sold_at", `${yesterday}T00:00:00+02:00`).lt("sold_at", `${today}T00:00:00+02:00`),
  ]);

  let sent = 0;
  for (const p of people) {
    const mine = subs.filter(s => s.user_id === p.user_id);
    if (!mine.length) continue;
    const out: Message[] = [];

    if (wants(p, "debt_due")) {
      const until = kigaliDate(p.debt_due_days);
      const soon = (debts ?? []).filter(d => d.due_date && d.due_date >= today && d.due_date <= until);
      if (soon.length) out.push({
        title: `${plural(soon.length, "payment")} due ${p.debt_due_days === 0 ? "today" : `in the next ${plural(p.debt_due_days, "day")}`}`,
        body: `${soon.slice(0, 3).map(d => `${d.customer_name} ${rwf(Number(d.balance))}${d.due_date === today ? " (today)" : ""}`).join(", ")}${soon.length > 3 ? ` +${soon.length - 3} more` : ""}. Total ${rwf(soon.reduce((s, d) => s + Number(d.balance), 0))}.`,
        url: "/debts", tag: "daily-debt-due",
      });
    }
    if (wants(p, "debt_overdue")) {
      const late = (debts ?? []).filter(d => d.due_date && d.due_date < today);
      if (late.length) out.push({
        title: `${plural(late.length, "customer")} late paying · ${rwf(late.reduce((s, d) => s + Number(d.balance), 0))}`,
        body: `${late.slice(0, 3).map(d => `${d.customer_name} ${rwf(Number(d.balance))}`).join(", ")}${late.length > 3 ? ` +${late.length - 3} more` : ""}. Tap to send reminders.`,
        url: "/debts", tag: "daily-debt-late",
      });
    }
    if (wants(p, "orders")) {
      const coming = (orders ?? []).filter(o => o.expected_on && (o.expected_on === today || o.expected_on === tomorrow));
      const lateOrders = (orders ?? []).filter(o => o.expected_on && o.expected_on < today);
      if (coming.length || lateOrders.length) out.push({
        title: coming.length ? `${plural(coming.length, "delivery", "deliveries")} expected ${coming.some(o => o.expected_on === today) ? "today" : "tomorrow"}` : `${plural(lateOrders.length, "delivery", "deliveries")} late`,
        body: [
          ...coming.map(o => `#${o.po_no}${o.supplier_name ? ` from ${o.supplier_name}` : ""} ${o.expected_on === today ? "today" : "tomorrow"}`),
          ...lateOrders.map(o => `#${o.po_no}${o.supplier_name ? ` from ${o.supplier_name}` : ""} is late`),
        ].slice(0, 4).join(" · "),
        url: "/orders", tag: "daily-orders",
      });
    }
    if (wants(p, "temp_stock")) {
      const due = (temp ?? []).filter(t => t.expected_return_date && t.expected_return_date <= today);
      if (due.length) out.push({
        title: `${plural(due.length, "customer")} should bring clothes back`,
        body: `${due.slice(0, 3).map(t => `${t.customer_name}: ${t.quantity}× ${t.item_name}${t.expected_return_date! < today ? " (late)" : ""}`).join(", ")}${due.length > 3 ? ` +${due.length - 3} more` : ""}.`,
        url: "/temporary-stock", tag: "daily-temp",
      });
    }
    if (wants(p, "low_stock") && (low ?? []).length) {
      const soldOut = (low ?? []).filter(i => i.status === "out_of_stock");
      out.push({
        title: `Restock reminder: ${plural((low ?? []).length, "item")}`,
        body: `${soldOut.length ? `Sold out: ${soldOut.slice(0, 3).map(i => i.name).join(", ")}. ` : ""}Low: ${(low ?? []).filter(i => i.status === "low_stock").slice(0, 3).map(i => `${i.name} (${i.quantity})`).join(", ") || "—"}.`,
        url: "/reports", tag: "daily-stock",
      });
    }
    if (wants(p, "daily_summary") && (sales ?? []).length) {
      const total = (sales ?? []).reduce((s, x) => s + Number(x.total), 0);
      const paid = (sales ?? []).reduce((s, x) => s + Number(x.amount_paid), 0);
      out.push({
        title: `Yesterday: ${rwf(total)} in sales`,
        body: `${plural((sales ?? []).length, "sale")}. Paid ${rwf(paid)}${total > paid ? `, on credit ${rwf(total - paid)}` : ""}.`,
        url: "/reports", tag: "daily-summary",
      });
    }
    for (const m of out) sent += await send(mine, m);
  }
  return { sent };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: ActivityBody & {
    action?: string; sale_id?: string; actor?: string | null;
    old_endpoint?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  try {
    const cfg = await config();

    if (body.action === "public_key") return json({ publicKey: cfg.vapid_public });

    if (body.action === "test") {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      const { data: { user } } = await userClient.auth.getUser(token);
      if (!user) return json({ error: "Log in first" }, 401);
      const sent = await send(await devices([user.id]), {
        title: "Alerts are on ✅",
        body: "You'll get notifications like this on this phone. Tap one to open the right page.",
        url: "/dashboard", tag: "test",
      });
      return json({ sent });
    }

    if (body.action === "resubscribe") {
      const sub = body.subscription;
      if (!body.old_endpoint || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return json({ error: "Bad subscription" }, 400);
      const { data, error } = await db.from("push_subscriptions")
        .update({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
        .eq("endpoint", body.old_endpoint).select("id");
      if (error) throw error;
      return json({ updated: data?.length ?? 0 });
    }

    // Everything below comes from the database
    if (req.headers.get("x-hook-secret") !== cfg.hook_secret) return json({ error: "Forbidden" }, 403);
    const actor = body.actor ?? null;
    switch (body.action) {
      case "sale":
      case "sale_cancelled":
        return json(body.sale_id ? await saleAlert(body.sale_id, body.action, actor) : { error: "sale_id required" });
      case "low_stock":
        return json(body.item_id ? await lowStockAlert(body.item_id, actor) : { error: "item_id required" });
      case "order_received":
        return json(body.order_id ? await orderAlert(body.order_id, actor) : { error: "order_id required" });
      case "daily":
        return json(await daily());
      case "activity":
        return json(await activityAlert(body, actor));
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
