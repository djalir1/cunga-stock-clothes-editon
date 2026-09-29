// Sends phone notifications (Web Push) about sales to the owner / supervisor.
//
// Actions (POST JSON):
//   { action: "public_key" }                  → the VAPID public key phones subscribe with (created on first use)
//   { action: "test" }                        → a test notification to the caller's own devices (needs their login)
//   { action: "sale" | "sale_cancelled", sale_id, actor }
//                                             → from the database trigger only (x-hook-secret header)
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

const rwf = (n: number) => `RWF ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;
const METHOD: Record<string, string> = { cash: "Cash", mobile_money: "Mobile Money", bank: "Bank", other: "Other" };

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

interface Sub { id: string; endpoint: string; p256dh: string; auth: string }

/** Send to each device; forget devices the browser says are gone. */
async function send(subs: Sub[], message: Record<string, unknown>) {
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
  const { data: sale, error } = await db
    .from("sales")
    .select("id, receipt_no, total, amount_paid, payment_status, payment_method, source, customer_name, created_by, void_reason, sale_items(item_name, size, color, quantity, set_name)")
    .eq("id", saleId).single();
  if (error || !sale) return { sent: 0, reason: "sale not found" };

  const by = actor ?? sale.created_by;
  const { data: seller } = by
    ? await db.from("profiles").select("full_name").eq("user_id", by).maybeSingle()
    : { data: null };
  const sellerName = seller?.full_name?.split(" ")[0] ?? "Staff";

  // Who hears about it: owner + supervisor
  const { data: roles } = await db.from("user_roles").select("user_id").in("role", ["owner", "admin"]);
  const recipients = (roles ?? []).map(r => r.user_id);
  if (!recipients.length) return { sent: 0, reason: "no owner" };

  const { data: subs } = await db.from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id, include_own").in("user_id", recipients);
  const targets = (subs ?? []).filter(s => s.user_id !== by || s.include_own);
  if (!targets.length) return { sent: 0, reason: "no devices" };

  const who = sale.customer_name ?? "A walk-in customer";
  const items = describeLines(sale.sale_items ?? []);
  const total = Number(sale.total), paid = Number(sale.amount_paid);
  const payment = sale.payment_status === "paid"
    ? `Paid · ${METHOD[sale.payment_method] ?? sale.payment_method}`
    : sale.payment_status === "partial" ? `Paid ${rwf(paid)} · owes ${rwf(total - paid)}` : `On credit · owes ${rwf(total)}`;

  const message = action === "sale"
    ? {
        title: `New sale · ${rwf(total)}`,
        body: `${who} bought ${items}. Sold by ${sellerName}. ${payment}${sale.source === "temp_stock" ? " (from temporary stock)" : ""}`,
        url: `/sales?receipt=${sale.id}`,
        tag: `sale-${sale.id}`,
      }
    : {
        title: `Sale cancelled · ${rwf(total)}`,
        body: `Receipt #${String(sale.receipt_no).padStart(5, "0")} (${items}) was cancelled by ${sellerName}${sale.void_reason ? `: ${sale.void_reason}` : ""}.`,
        url: `/sales?receipt=${sale.id}`,
        tag: `sale-${sale.id}`,
      };
  return { sent: await send(targets, message) };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { action?: string; sale_id?: string; actor?: string | null };
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  try {
    const cfg = await config();

    if (body.action === "public_key") return json({ publicKey: cfg.vapid_public });

    if (body.action === "test") {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      const { data: { user } } = await userClient.auth.getUser(token);
      if (!user) return json({ error: "Log in first" }, 401);
      const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id);
      const sent = await send(subs ?? [], {
        title: "Sale alerts are on ✅",
        body: "You'll get a notification like this on this phone whenever a sale is made. Tap it to open the receipt.",
        url: "/dashboard",
        tag: "test",
      });
      return json({ sent });
    }

    if (body.action === "sale" || body.action === "sale_cancelled") {
      if (req.headers.get("x-hook-secret") !== cfg.hook_secret) return json({ error: "Forbidden" }, 403);
      if (!body.sale_id) return json({ error: "sale_id required" }, 400);
      return json(await saleAlert(body.sale_id, body.action, body.actor ?? null));
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
