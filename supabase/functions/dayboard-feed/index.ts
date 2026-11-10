// dayboard-feed: read-only schedule + to-do feed for the TV Dayboard, plus one write (mark a to-do done).
// Auth: ?key=<secret>. Only the SHA-256 hash of the key is stored, in public.dayboard_feed_keys
// (RLS on, no policies, so only this function's service role can read it). Deployed with verify_jwt = false.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TZ = "America/Chicago";
const DAYS_AHEAD = 120;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function localToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
// Date-only arithmetic on YYYY-MM-DD strings, done in UTC so DST never shifts a day.
function addDays(ds: string, n: number) { const d = new Date(ds + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dow(ds: string) { return new Date(ds + "T00:00:00Z").getUTCDay(); }
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const hhmm = (v: unknown) => { const t = s(v); if (!t) return null; const [h, m] = t.split(":"); return h.padStart(2, "0") + ":" + (m || "00").slice(0, 2); };

type Ev = Record<string, any>;
function occursOn(e: Ev, ds: string) {
  if (Array.isArray(e.skip) && e.skip.includes(ds)) return false;
  if (e.date === ds) return true;
  if (!e.date || ds < e.date || !e.repeat || e.repeat === "none") return false;
  if (e.until && ds > e.until) return false;
  const w = dow(ds);
  if (e.repeat === "daily") return true;
  if (e.repeat === "weekdays") return w > 0 && w < 6;
  if (e.repeat === "weekly") return dow(e.date) === w;
  return false;
}

async function userFor(key: string | null) {
  if (!key || key.length < 20) return null;
  const { data } = await db.from("dayboard_feed_keys").select("user_id").eq("key_hash", await sha256(key)).maybeSingle();
  return data?.user_id ?? null;
}

async function feed(uid: string) {
  const { data, error } = await db.from("items").select("collection,id,data").eq("user_id", uid).in("collection", ["todos", "events", "classes", "settings"]);
  if (error) throw error;
  const rows = data ?? [];
  const today = localToday(), last = addDays(today, DAYS_AHEAD);
  const isToday = (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso); if (isNaN(+d)) return false;
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d) === today;
  };

  const todos = rows.filter((r) => r.collection === "todos").map((r) => {
    const x = r.data || {};
    const p = ["high", "normal", "low"].includes(x.priority) ? x.priority : "normal";
    return { id: r.id, title: String(x.title ?? ""), notes: s(x.notes), due_date: s(x.due_date), due_time: x.due_date ? hhmm(x.due_time) : null, priority: p, list: s(x.list), done: !!x.done, done_at: x.done ? s(x.done_at) : null };
  }).filter((t) => !t.done || isToday(t.done_at))
    .sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || ((a.due_date || "9999") + (a.due_time || "99")).localeCompare((b.due_date || "9999") + (b.due_time || "99")));

  const events: Ev[] = [];
  for (const r of rows.filter((r) => r.collection === "events")) {
    const e = r.data || {};
    if (!e.date) continue;
    const recurring = e.repeat && e.repeat !== "none";
    const from = recurring ? (e.date > today ? e.date : today) : e.date;
    const to = recurring ? (e.until && e.until < last ? e.until : last) : e.date;
    if (!recurring && (e.date < today || e.date > last)) continue;
    for (let ds = from; ds <= to; ds = addDays(ds, 1)) {
      if (!occursOn(e, ds)) continue;
      const start = hhmm(e.time) ?? "00:00";
      let end = hhmm(e.end);
      if (!end || end <= start) end = e.time ? (String((+start.slice(0, 2) + 1) % 24).padStart(2, "0") + start.slice(2)) : "23:59";
      if (end < start) end = "23:59";
      events.push({ id: recurring ? `${r.id}_${ds}` : r.id, date: ds, start, end, title: String(e.title ?? ""), location: s(e.place), group: s(e.group) });
    }
  }
  events.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const t = rows.find((r) => r.collection === "settings" && r.id === "term")?.data;
  let term: Ev | null = null;
  if (t && t.start && t.end && t.end >= today) {
    const classes = rows.filter((r) => r.collection === "classes").map((r) => {
      const c = r.data || {};
      return { id: r.id, code: String(c.code ?? ""), name: String(c.name ?? ""), days: (Array.isArray(c.days) ? c.days : []).map(Number).filter((n: number) => n >= 1 && n <= 5).sort(), start: hhmm(c.start) ?? "00:00", end: hhmm(c.end) ?? "00:00", room: s(c.room), until: s(c.until) };
    }).sort((a, b) => (a.days[0] ?? 9) - (b.days[0] ?? 9) || a.start.localeCompare(b.start));
    term = { name: String(t.name || "Term"), start: t.start, end: t.end, skip: Array.isArray(t.skip) ? [...t.skip].sort() : [], classes };
  }
  return { version: 1, updated: new Date().toISOString(), todos, events, term };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const uid = await userFor(new URL(req.url).searchParams.get("key"));
    if (!uid) return json({ error: "unauthorized" }, 401);

    if (req.method === "GET") return json(await feed(uid));

    if (req.method === "POST") {
      let body: any;
      try { body = JSON.parse(await req.text()); } catch { return json({ ok: false, error: "body must be JSON" }, 400); }
      if (!body || body.action !== "set_done" || typeof body.id !== "string" || typeof body.done !== "boolean") return json({ ok: false, error: "expected {action:'set_done', id, done}" }, 400);
      const { data: row, error } = await db.from("items").select("data").eq("user_id", uid).eq("collection", "todos").eq("id", body.id).maybeSingle();
      if (error) throw error;
      if (!row) return json({ ok: false, error: "to-do not found" }, 404);
      const data = { ...(row.data || {}), done: body.done, done_at: body.done ? new Date().toISOString() : null };
      const up = await db.from("items").update({ data }).eq("user_id", uid).eq("collection", "todos").eq("id", body.id);
      if (up.error) throw up.error;
      return json({ ok: true });
    }
    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: "server error" }, 500);
  }
});
