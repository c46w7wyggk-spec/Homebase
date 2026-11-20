// dayboard-feed: schedule, to-do and routine feed for the TV Dayboard, plus two writes (mark a to-do done, mark a routine block done).
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
  const { data, error } = await db.from("items").select("collection,id,data").eq("user_id", uid).in("collection", ["todos", "events", "classes", "settings", "routine_done", "study", "workouts"]);
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
  const th = rows.find((r) => r.collection === "settings" && r.id === "dayboard")?.data?.theme;
  const theme = ["dynamic", "dark", "light", "christmas"].includes(th) ? th : "dynamic";
  return { version: 1, updated: new Date().toISOString(), todos, events, term, routine: routineFeed(rows, today), settings: { theme } };
}

// Routine: settings/routine {targets, blocks:{break,school}, pausedUntil}. School blocks apply inside the term dates.
// Done marks are routine_done/<blockId>_<date>; study sessions are study/<id> {date, cls, minutes}.
function routineFeed(rows: Ev[], today: string) {
  const set = (id: string) => rows.find((r) => r.collection === "settings" && r.id === id)?.data;
  const r = set("routine");
  if (!r || !r.blocks) return null;
  const t = set("term");
  const modeOn = (ds: string) => (t && t.start && t.end && ds >= t.start && ds <= t.end ? "school" : "break");
  const mode = modeOn(today);
  const paused = !!(r.pausedUntil && today <= r.pausedUntil);
  const done = new Set(rows.filter((x) => x.collection === "routine_done").map((x) => x.id));
  const plan = set("plan")?.days?.[today];
  const blocks = paused ? [] : (Array.isArray(r.blocks[mode]) ? r.blocks[mode] : [])
    .filter((b: Ev) => Array.isArray(b.days) && b.days.includes(dow(today)))
    .map((b: Ev) => {
      const id = `${b.id}_${today}`;
      const detail = b.kind === "run" && plan ? (plan.type === "rest" ? "Plan says rest today" : `${plan.title}${plan.miles ? ` · ${plan.miles} mi` : ""}`) : null;
      return { id, kind: String(b.kind || "other"), title: String(b.title || b.kind || ""), start: hhmm(b.start) ?? "00:00", end: hhmm(b.end) ?? hhmm(b.start) ?? "00:00", done: done.has(id), detail };
    }).sort((a: Ev, b: Ev) => a.start.localeCompare(b.start));
  const mon = addDays(today, -((dow(today) + 6) % 7)), sun = addDays(mon, 6);
  const inWeek = (ds: unknown) => typeof ds === "string" && ds >= mon && ds <= sun;
  const studyMin = rows.filter((x) => x.collection === "study" && inWeek(x.data?.date)).reduce((a, x) => a + (+x.data.minutes || 0), 0);
  const runDays = new Set<string>();
  rows.forEach((x) => { const d = x.data || {}; if (((x.collection === "workouts" && d.type === "Run") || (x.collection === "routine_done" && d.kind === "run")) && inWeek(d.date)) runDays.add(d.date); });
  const cook = rows.filter((x) => x.collection === "routine_done" && x.data?.kind === "cook" && inWeek(x.data?.date)).length;
  const tg = (r.targets && r.targets[mode]) || {};
  const tm = set("timer");
  const cls = (id: string) => { const c = rows.find((x) => x.collection === "classes" && x.id === id)?.data; return c ? String(c.code || c.name) : "General"; };
  return {
    mode, paused, paused_until: paused ? r.pausedUntil : null,
    today: blocks,
    week: { start: mon, study_hours: Math.round(studyMin / 6) / 10, study_target: +tg.study || 0, runs: runDays.size, runs_target: +tg.runs || 0, cook: cook, cook_target: +tg.cook || 0 },
    timer: tm && tm.start ? { started_at: new Date(+tm.start).toISOString(), class: cls(tm.cls) } : null,
  };
}

async function setBlockDone(uid: string, id: string, done: boolean) {
  const i = id.lastIndexOf("_"), bid = id.slice(0, i), ds = id.slice(i + 1);
  if (i < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) return json({ ok: false, error: "bad block id" }, 400);
  const { data: rs, error } = await db.from("items").select("data").eq("user_id", uid).eq("collection", "settings").eq("id", "routine").maybeSingle();
  if (error) throw error;
  const all = [...(rs?.data?.blocks?.break ?? []), ...(rs?.data?.blocks?.school ?? [])];
  const b = all.find((x: Ev) => x.id === bid);
  if (!b) return json({ ok: false, error: "block not found" }, 404);
  if (done) {
    const up = await db.from("items").upsert({ user_id: uid, collection: "routine_done", id, data: { block: bid, date: ds, kind: b.kind, via: "dayboard" } }, { onConflict: "user_id,collection,id" });
    if (up.error) throw up.error;
    // A study block checked off on the TV counts its planned length toward the weekly study hours.
    if (b.kind === "study") {
      const m = Math.max(0, (+b.end.slice(0, 2) * 60 + +b.end.slice(3, 5)) - (+b.start.slice(0, 2) * 60 + +b.start.slice(3, 5))) || 30;
      const st = await db.from("items").upsert({ user_id: uid, collection: "study", id: `tv-${id}`, data: { date: ds, cls: "other", minutes: m, block: id } }, { onConflict: "user_id,collection,id" });
      if (st.error) throw st.error;
    }
  } else {
    const d1 = await db.from("items").delete().eq("user_id", uid).eq("collection", "routine_done").eq("id", id);
    if (d1.error) throw d1.error;
    const d2 = await db.from("items").delete().eq("user_id", uid).eq("collection", "study").eq("id", `tv-${id}`);
    if (d2.error) throw d2.error;
  }
  return json({ ok: true });
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
      if (body && body.action === "set_block_done" && typeof body.id === "string" && typeof body.done === "boolean") return await setBlockDone(uid, body.id, body.done);
      if (!body || body.action !== "set_done" || typeof body.id !== "string" || typeof body.done !== "boolean") return json({ ok: false, error: "expected {action:'set_done'|'set_block_done', id, done}" }, 400);
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
