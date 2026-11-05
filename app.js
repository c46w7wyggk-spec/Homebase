(function () {
  "use strict";

  /* ================= utilities ================= */
  var COLS = ["events", "meals", "grocery", "goals", "checkins", "prayers", "readings", "workouts", "weights", "settings"];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var SLOTS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function mondayOf(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function today() { return ymd(new Date()); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function shortDate(s) { return parse(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  function longDate(s) { return parse(s).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); }
  function time24(t) { if (!t) return "All day"; var p = t.split(":"); return ("0" + (+p[0])).slice(-2) + ":" + p[1]; }
  function stamp(ds, t) { var p = ds.split("-"), q = (t || "00:00").split(":"); return new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1]); }
  function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function half(x) { return Math.max(0, Math.round(x * 2) / 2); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function secs(str) { if (!str) return 0; var p = String(str).trim().split(":").map(Number); if (p.some(isNaN)) return 0; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 60; }
  function mmss(sec) { sec = Math.round(sec); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s); }
  function paceOf(mi, min) { return mi > 0 && min > 0 ? mmss(min * 60 / mi) : ""; }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  var ICON = {
    today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    schedule: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
    meals: '<svg viewBox="0 0 24 24"><path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9"/></svg>',
    goals: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
    faith: '<svg viewBox="0 0 24 24"><path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/></svg>',
    fitness: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" style="stroke:currentColor;fill:none;stroke-width:2"><path d="M9 6l6 6-6 6"/></svg>'
  };
  var TABS = [["today", "Today"], ["schedule", "Schedule"], ["goals", "Goals"], ["faith", "Faith"], ["fitness", "Run"]];

  /* ================= state ================= */
  var state = {}; COLS.forEach(function (c) { state[c] = []; });
  var ui = { schedDate: today(), mealWeek: 0, planWeek: 0, fit: "plan" };
  function byId(c, id) { for (var i = 0; i < state[c].length; i++) if (state[c][i].id === id) return state[c][i]; return null; }
  function setting(id) { return byId("settings", id) || {}; }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }

  /* ================= schedule logic ================= */
  function occursOn(e, ds) {
    if (e.skip && e.skip.indexOf(ds) >= 0) return false;
    if (e.date === ds) return true;
    if (ds < e.date || !e.repeat || e.repeat === "none") return false;
    if (e.until && ds > e.until) return false;
    var dow = parse(ds).getDay();
    if (e.repeat === "daily") return true;
    if (e.repeat === "weekdays") return dow > 0 && dow < 6;
    if (e.repeat === "weekly") return parse(e.date).getDay() === dow;
    return false;
  }
  function eventsOn(ds) {
    return state.events.filter(function (e) { return occursOn(e, ds); })
      .sort(function (a, b) { return (a.time || "") < (b.time || "") ? -1 : (a.time || "") > (b.time || "") ? 1 : 0; });
  }
  function endOf(ds, e) { return e.end ? stamp(ds, e.end) : new Date(stamp(ds, e.time).getTime() + 3600000); }
  function upNext() {
    var now = new Date();
    for (var i = 0; i < 15; i++) {
      var ds = ymd(addDays(now, i)), evs = eventsOn(ds);
      for (var k = 0; k < evs.length; k++) {
        var e = evs[k], st = stamp(ds, e.time);
        if (e.time && st <= now && now < endOf(ds, e)) return { e: e, ds: ds, now: true };
        if (e.time ? st > now : i > 0) return { e: e, ds: ds, start: st };
      }
    }
    return null;
  }
  function whenText(n) {
    var e = n.e;
    if (n.now) return "Happening now · until " + time24(e.end || "");
    if (n.ds === today()) {
      var m = Math.max(1, Math.round((n.start - new Date()) / 60000));
      return "In " + (m >= 60 ? Math.floor(m / 60) + "h " : "") + (m % 60 ? (m % 60) + "m" : "") + " · " + time24(e.time);
    }
    var tmr = ymd(addDays(new Date(), 1)) === n.ds;
    return (tmr ? "Tomorrow" : longDate(n.ds)) + " · " + time24(e.time);
  }

  /* ================= habits ================= */
  function checked() { var s = {}; state.checkins.forEach(function (c) { s[c.id] = true; }); return s; }
  function streak(id, set) {
    var d = new Date(), n = 0;
    if (!set[id + "_" + ymd(d)]) d = addDays(d, -1);
    while (set[id + "_" + ymd(d)]) { n++; d = addDays(d, -1); }
    return n;
  }
  function habits() { return state.goals.filter(function (g) { return g.kind === "habit"; }).sort(function (a, b) { return (a.created || 0) - (b.created || 0); }); }
  function goalsOnly() { return state.goals.filter(function (g) { return g.kind !== "habit"; }).sort(function (a, b) { return (a.due || "9") < (b.due || "9") ? -1 : 1; }); }
  function goalProgress(g) {
    var ms = g.milestones || [];
    if (ms.length) return Math.round(100 * ms.filter(function (m) { return m.done; }).length / ms.length);
    return +g.progress || 0;
  }

  /* ================= Bible reading plan ================= */
  var BOOKS = [["Genesis",50],["Exodus",40],["Leviticus",27],["Numbers",36],["Deuteronomy",34],["Joshua",24],["Judges",21],["Ruth",4],["1 Samuel",31],["2 Samuel",24],["1 Kings",22],["2 Kings",25],["1 Chronicles",29],["2 Chronicles",36],["Ezra",10],["Nehemiah",13],["Esther",10],["Job",42],["Psalms",150],["Proverbs",31],["Ecclesiastes",12],["Song of Solomon",8],["Isaiah",66],["Jeremiah",52],["Lamentations",5],["Ezekiel",48],["Daniel",12],["Hosea",14],["Joel",3],["Amos",9],["Obadiah",1],["Jonah",4],["Micah",7],["Nahum",3],["Habakkuk",3],["Zephaniah",3],["Haggai",2],["Zechariah",14],["Malachi",4],["Matthew",28],["Mark",16],["Luke",24],["John",21],["Acts",28],["Romans",16],["1 Corinthians",16],["2 Corinthians",13],["Galatians",6],["Ephesians",6],["Philippians",4],["Colossians",4],["1 Thessalonians",5],["2 Thessalonians",3],["1 Timothy",6],["2 Timothy",4],["Titus",3],["Philemon",1],["Hebrews",13],["James",5],["1 Peter",5],["2 Peter",3],["1 John",5],["2 John",1],["3 John",1],["Jude",1],["Revelation",22]];
  function stepPos(p) { var b = p.b, c = p.c + 1; if (c > BOOKS[b][1]) { b = (b + 1) % BOOKS.length; c = 1; } return { b: b, c: c }; }
  function passage(p, n) {
    var groups = [], cur = { b: p.b, c: p.c };
    for (var i = 0; i < n; i++) {
      var g = groups[groups.length - 1];
      if (g && g.b === cur.b) g.to = cur.c; else groups.push({ b: cur.b, from: cur.c, to: cur.c });
      cur = stepPos(cur);
    }
    return { text: groups.map(function (g) { return BOOKS[g.b][0] + " " + g.from + (g.to !== g.from ? "–" + g.to : ""); }).join("; "), next: cur };
  }
  function readingPlan() { var f = setting("faith"); return f.perDay ? f : null; }
  function todaysReading() {
    var rp = readingPlan(), t = today(), r = byId("readings", t);
    if (r && r.done && r.reading) return { text: r.reading, done: true, r: r };
    if (!rp) return r && r.reading ? { text: r.reading, done: !!(r && r.done), r: r } : null;
    return { text: passage({ b: rp.b, c: rp.c }, rp.perDay).text, done: false, r: r };
  }
  function readingStreak() {
    var s = {}; state.readings.forEach(function (r) { if (r.done) s[r.id] = 1; });
    var d = new Date(), n = 0; if (!s[ymd(d)]) d = addDays(d, -1);
    while (s[ymd(d)]) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ================= running: paces and plan ================= */
  var DIST = { "1mi": 1, "5k": 3.1069, "10k": 6.2137, "half": 13.1094, "marathon": 26.2188 };
  var GOAL_LABEL = { "5k": "5K", "10k": "10K", "half": "Half marathon", "marathon": "Marathon", "base": "Comeback build" };
  function riegel(t, d1, d2) { return t * Math.pow(d2 / d1, 1.06); }
  function paces(inp) {
    var d = DIST[inp.raceDist], t = secs(inp.raceTime);
    if (!d || !t) return null;
    var p5 = riegel(t, d, DIST["5k"]) / DIST["5k"];
    var out = { easy: [p5 * 1.24, p5 * 1.36], tempo: p5 * 1.07, i5k: p5, p10: riegel(t, d, DIST["10k"]) / DIST["10k"],
      ph: riegel(t, d, DIST.half) / DIST.half, pm: riegel(t, d, DIST.marathon) / DIST.marathon };
    if (inp.goalTime && DIST[inp.goal]) out.goal = secs(inp.goalTime) / DIST[inp.goal];
    else out.goal = { "5k": out.i5k, "10k": out.p10, "half": out.ph, "marathon": out.pm }[inp.goal];
    return out;
  }
  function pc(x) { return x ? " (" + mmss(x) + "/mi)" : ""; }

  function genPlan(inp) {
    var goal = inp.goal || "base", days = clamp(+inp.days || 5, 3, 7), L = +inp.longDay; if (isNaN(L)) L = 6;
    var P = paces(inp) || {};
    var start = mondayOf(new Date()), race = inp.raceDate || "";
    var nWeeks = race ? Math.floor((mondayOf(parse(race)) - start) / 604800000) + 1 : 12;
    nWeeks = clamp(nWeeks, 3, 30);
    var taper = { marathon: 3, half: 2, "10k": 1, "5k": 1, base: 0 }[goal]; if (nWeeks < 8) taper = Math.min(taper, 1);
    var cur = Math.max(5, +inp.current || 10), peak = Math.max(cur, +inp.peak || Math.round(cur * 1.6));
    var cap = { "5k": 9, "10k": 11, half: 14, marathon: 20, base: 12 }[goal];
    var build = nWeeks - taper, prev = cur, weeks = [], i;
    for (i = 0; i < build; i++) {
      var w;
      if (i === 0) w = cur;
      else if ((i + 1) % 4 === 0 && i < build - 1) w = prev * 0.8;
      else { w = Math.min(peak, prev * 1.08 + 0.5); prev = w; }
      var f = i / Math.max(1, build);
      weeks.push({ miles: half(w), phase: goal === "base" ? (f < 0.5 ? "base" : "build") : f < 0.4 ? "base" : f < 0.8 ? "build" : "peak" });
    }
    var tf = { marathon: [0.75, 0.6, 0.4], half: [0.7, 0.45], "10k": [0.55], "5k": [0.55], base: [] }[goal].slice(-taper);
    tf.forEach(function (x) { weeks.push({ miles: half(prev * x), phase: "taper" }); });

    var order = [0, -4, -2, -5, -1, -3, -6].map(function (o) { return (L + o + 14) % 7; });
    var runDays = order.slice(0, days), Q1 = (L + 3) % 7, Q2 = (L + 5) % 7;
    var nQ = days >= 5 ? 2 : 1;
    var lib = {
      q2: { "5k": ["8×400 m at 5K pace or a bit faster, 400 m jog", "6×800 m at 5K pace, 400 m jog", "5×1000 m at 5K pace, 400 m jog"],
        "10k": ["6×800 m at 5K pace, 400 m jog", "5×1000 m at 10K pace, 400 m jog", "4×1 mi at 10K pace, 400 m jog"],
        half: ["5×1 mi at 10K pace, 2 min jog", "3×2 mi at half-marathon pace, 3 min jog", "6×1000 m at 10K pace, 400 m jog"],
        marathon: ["2×3 mi at marathon pace, 1 mi easy between", "5×1 mi at half-marathon pace, 2 min jog", "6 mi at marathon pace"],
        base: ["Fartlek: 8×1 min hard / 2 min easy", "6×800 m at 5K effort, 400 m jog", "Fartlek: 6×2 min hard / 2 min easy"] },
      peak: { "5k": ["5×1000 m at 5K pace, 400 m jog", "3×1 mi at 5K pace, 3 min jog"], "10k": ["3×2 mi at 10K pace, 3 min jog", "2×3 mi at 10K pace, 3 min jog"],
        half: ["2×4 mi at half-marathon pace, 3 min jog", "8 mi with the middle 5 at half-marathon pace"], marathon: ["10 mi with 8 at marathon pace", "12 mi with the last 6 at marathon pace"],
        base: ["Tempo: 4 mi continuous", "Cruise intervals: 4×1 mi at tempo, 1 min jog"] }
    };
    var goalPace = { "5k": P.i5k, "10k": P.p10, half: P.ph, marathon: P.pm }[goal] || P.goal;
    if (P.goal) goalPace = P.goal;
    var out = {}, raceDs = race;
    weeks.forEach(function (wk, wi) {
      var ws = addDays(start, wi * 7), W = wk.miles;
      var longMi = half(clamp(W * 0.3, 3, cap)), q1 = half(clamp(W * 0.18, 3, 10)), q2 = half(clamp(W * 0.15, 3, 9));
      var quality = nQ === 2 && wk.phase !== "taper" ? 2 : 1;
      var easyN = days - 1 - quality, rest = W - longMi - q1 - (quality === 2 ? q2 : 0);
      var easyMi = easyN > 0 ? half(Math.max(2, rest / easyN)) : 0;
      wk.start = ymd(ws);
      for (var d = 0; d < 7; d++) {
        var date = addDays(ws, d), ds = ymd(date), dow = date.getDay(), it;
        if (runDays.indexOf(dow) < 0) it = { type: "rest", miles: 0, title: "Rest or cross-train", detail: "Easy walk, mobility, or an easy bike or swim." };
        else if (dow === L) {
          var lt = "Easy and conversational" + pc(P.easy && P.easy[1]) + ".";
          if ((goal === "half" || goal === "marathon") && wk.phase !== "base" && wk.phase !== "taper" && wi % 2 === 1)
            lt = "Run the last " + (goal === "marathon" ? clamp(Math.round(longMi * 0.3), 3, 8) : clamp(Math.round(longMi * 0.25), 2, 4)) + " mi at goal pace" + pc(goalPace) + ", the rest easy.";
          it = { type: "long", miles: longMi, title: "Long run", detail: lt };
        } else if (dow === Q1) {
          if (wk.phase === "base") it = { type: "easy", miles: q1, title: "Easy + strides", detail: "Easy run, then 6×20 s strides: quick and relaxed, full recovery." };
          else if (wk.phase === "taper") it = { type: "pace", miles: q1, title: "Sharpener", detail: "1.5 mi warm-up, " + (wi === weeks.length - 1 ? "2" : "3") + "×1 mi at goal pace" + pc(goalPace) + " with 3 min jog, 1 mi cool-down." };
          else if (wk.phase === "peak") { var pk = lib.peak[goal]; it = { type: "pace", miles: q1, title: "Race-specific", detail: "1.5 mi warm-up, " + pk[wi % pk.length] + pc(goalPace) + ", 1 mi cool-down." }; }
          else { var x = clamp(Math.round(q1 * 0.45), 2, 7); it = { type: "tempo", miles: q1, title: "Tempo", detail: "1.5 mi warm-up, " + (wi % 3 === 1 ? Math.max(3, x) + "×1 mi at tempo, 1 min jog" : x + " mi steady at tempo") + pc(P.tempo) + ", 1 mi cool-down. Tempo feels comfortably hard." }; }
        } else if (dow === Q2 && quality === 2) {
          if (wk.phase === "base") it = { type: "easy", miles: q2, title: "Hill strides", detail: "Easy run with 6–8×45 s uphill at strong effort, jog back down." };
          else if (wk.phase === "peak") it = { type: "tempo", miles: q2, title: "Tempo", detail: "1.5 mi warm-up, 3 mi at tempo" + pc(P.tempo) + ", 1 mi cool-down." };
          else { var q = lib.q2[goal]; it = { type: "intervals", miles: q2, title: "Intervals", detail: "1.5 mi warm-up, " + q[wi % q.length] + ", 1 mi cool-down." + (P.i5k ? " 5K pace" + pc(P.i5k) + "." : "") }; }
        } else it = { type: "easy", miles: easyMi, title: "Easy run", detail: "Conversational effort" + pc(P.easy && P.easy[0]) + "." };
        if (inp.strength && it.type === "easy" && (dow === (L + 2) % 7 || dow === (L + 5) % 7)) it.detail += " Add 20–30 min of strength afterwards.";
        out[ds] = it;
      }
      if (raceDs && raceDs >= wk.start && raceDs <= ymd(addDays(ws, 6))) {
        Object.keys(out).forEach(function (k) {
          if (k < wk.start || k > ymd(addDays(ws, 6))) return;
          if (k === raceDs) out[k] = { type: "race", miles: r1(DIST[goal] || 3.1), title: "Race day: " + GOAL_LABEL[goal], detail: "Warm up 1–2 mi easy with a few strides. Start controlled" + pc(goalPace) + "." };
          else if (k === ymd(addDays(parse(raceDs), -1))) out[k] = { type: "easy", miles: 2, title: "Shakeout", detail: "2 mi very easy with 4 strides." };
          else if (out[k].type === "long" && k > raceDs) out[k] = { type: "easy", miles: 3, title: "Recovery jog", detail: "Very easy, or rest." };
          else if (out[k].type === "long") out[k] = { type: "easy", miles: half(out[k].miles * 0.5), title: "Easy run", detail: "Keep it short and easy before race day." };
        });
      }
    });
    return { inputs: inp, weeks: weeks, days: out, created: Date.now() };
  }
  function plan() { var p = setting("plan"); return p.days ? p : null; }
  function runsOn(ds) { return state.workouts.filter(function (w) { return w.date === ds; }); }
  function miles(w) { return w.type === "Run" ? (+w.miles || 0) : 0; }

  /* ================= toast & sheet ================= */
  var toastTimer = null, undoFn = null;
  function toast(msg, undo) {
    $("toast-msg").textContent = msg; undoFn = undo || null; $("toast-undo").hidden = !undo;
    $("toast").classList.add("show"); clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $("toast").classList.remove("show"); undoFn = null; }, undo ? 5000 : 2200);
  }
  $("toast-undo").addEventListener("click", function () { if (undoFn) undoFn(); undoFn = null; $("toast").classList.remove("show"); });
  function delUndo(c, id, label) {
    var prev = byId(c, id); if (!prev) return;
    prev = copy(prev); del(c, id);
    toast(label + " deleted", function () { save(c, id, prev); });
  }

  var sheetCfg = null;
  function openSheet(cfg) {
    sheetCfg = cfg;
    $("sheet-title").textContent = cfg.title;
    $("sheet-body").innerHTML = cfg.html;
    $("scrim").hidden = false; $("sheet").hidden = false;
    requestAnimationFrame(function () { $("scrim").classList.add("open"); $("sheet").classList.add("open"); });
    if (cfg.onOpen) cfg.onOpen($("sheet-body"));
  }
  function closeSheet() {
    if (!sheetCfg) return; sheetCfg = null;
    $("scrim").classList.remove("open"); $("sheet").classList.remove("open");
    if (document.activeElement) document.activeElement.blur();
    setTimeout(function () { if (!sheetCfg) { $("scrim").hidden = true; $("sheet").hidden = true; $("sheet-body").innerHTML = ""; } }, 280);
  }
  $("scrim").addEventListener("click", closeSheet);
  $("sheet-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
  $("sheet-body").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (!sheetCfg) return;
    var form = ev.target, btn = ev.submitter, act = btn && btn.dataset.sact;
    var v = function (n) { var el = form.elements[n]; if (!el) return ""; if (el.type === "checkbox") return el.checked; return String(el.value).trim(); };
    var res = act && sheetCfg.actions && sheetCfg.actions[act] ? sheetCfg.actions[act](v, form) : sheetCfg.submit ? sheetCfg.submit(v, form) : null;
    if (res !== false) closeSheet();
  });
  $("sheet-body").addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-sclick]"); if (!b || !sheetCfg || !sheetCfg.clicks) return;
    sheetCfg.clicks[b.dataset.sclick](b, $("sheet-body"));
  });
  function field(label, inner) { return '<label class="field"><span>' + label + '</span>' + inner + '</label>'; }
  function input(name, val, attrs) { return '<input name="' + name + '" value="' + esc(val == null ? "" : val) + '" ' + (attrs || 'type="text"') + '>'; }
  function select(name, opts, val) { return '<select name="' + name + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? " selected" : "") + '>' + esc(o[1]) + '</option>'; }).join("") + '</select>'; }
  function primary(label) { return '<button class="btn primary block" type="submit">' + label + '</button>'; }
  function sbtn(label, act, cls) { return '<button class="btn ' + (cls || "") + ' block" type="submit" data-sact="' + act + '" formnovalidate>' + label + '</button>'; }

  /* ================= sheets ================= */
  function eventSheet(id, onDate) {
    var e = id ? byId("events", id) : null, d = e || { date: onDate || ui.schedDate, repeat: "none" };
    var recurring = e && e.repeat && e.repeat !== "none";
    var html = field("Title", input("title", d.title, 'type="text" required placeholder="What is it?"')) +
      '<div class="grid2">' + field("Date", input("date", d.date, 'type="date" required')) + field("Location", input("place", d.place, 'type="text" placeholder="Optional"')) + '</div>' +
      '<div class="grid2">' + field("Starts", input("time", d.time, 'type="time"')) + field("Ends", input("end", d.end, 'type="time"')) + '</div>' +
      '<div class="grid2">' + field("Repeats", select("repeat", [["none", "Never"], ["daily", "Every day"], ["weekdays", "Weekdays"], ["weekly", "Every week"]], d.repeat || "none")) +
      field("Until", input("until", d.until, 'type="date"')) + '</div>' +
      '<label class="toggle"><input type="checkbox" name="ref"' + (d.ref ? " checked" : "") + '> Already in my calendar (leave out of the export)</label>' +
      field("Notes", '<textarea name="notes" placeholder="Optional">' + esc(d.notes || "") + '</textarea>') +
      primary(e ? "Save" : "Add event");
    if (recurring && onDate) html += sbtn("Skip only " + shortDate(onDate), "skip") + sbtn("End series before " + shortDate(onDate), "endhere");
    if (e) html += sbtn(recurring ? "Delete whole series" : "Delete event", "delete", "danger");
    openSheet({
      title: e ? "Edit event" : "New event", html: html,
      submit: function (v) {
        if (!v("title") || !v("date")) { toast("Add a title and date"); return false; }
        var data = { title: v("title"), date: v("date"), time: v("time"), end: v("end"), place: v("place"), repeat: v("repeat"), until: v("until"), ref: v("ref"), notes: v("notes"), skip: (e && e.skip) || [] };
        save("events", id || newId(), data); ui.schedDate = data.date; toast(e ? "Saved" : "Event added");
      },
      actions: {
        skip: function () { var s = (e.skip || []).concat([onDate]); save("events", id, Object.assign(copy(e), { skip: s })); toast("Skipped " + shortDate(onDate), function () { save("events", id, e); }); },
        endhere: function () { var prev = copy(e); save("events", id, Object.assign(copy(e), { until: ymd(addDays(parse(onDate), -1)) })); toast("Series ends before " + shortDate(onDate), function () { save("events", id, prev); }); },
        "delete": function () { delUndo("events", id, "Event"); }
      }
    });
  }

  function mealSheet(ds, slot) {
    var key = ds + "_" + slot, m = byId("meals", key) || {}, label = SLOTS.filter(function (s) { return s[0] === slot; })[0][1];
    openSheet({
      title: label + " · " + shortDate(ds),
      html: field("Meal", input("text", m.text, 'type="text" placeholder="What are you eating?" autofocus')) +
        field("Add ingredients to grocery list", input("ingredients", "", 'type="text" placeholder="Comma separated, optional"')) +
        primary("Save") + (m.text ? sbtn("Clear meal", "clear", "danger") : ""),
      submit: function (v) {
        if (v("text")) save("meals", key, { date: ds, slot: slot, text: v("text") }); else if (m.text) del("meals", key);
        var ing = v("ingredients").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        ing.forEach(function (t, i) { save("grocery", newId(), { text: t, done: false, created: Date.now() + i }); });
        toast(ing.length ? "Saved · " + plural(ing.length, "item") + " added to groceries" : "Saved");
      },
      actions: { clear: function () { delUndo("meals", key, "Meal"); } }
    });
  }

  function habitSheet(id) {
    var h = id ? byId("goals", id) : null;
    openSheet({
      title: h ? "Edit habit" : "New habit",
      html: field("Habit", input("title", h && h.title, 'type="text" required placeholder="e.g. Stretch 10 minutes"')) + primary(h ? "Save" : "Add habit") + (h ? sbtn("Delete habit", "delete", "danger") : ""),
      submit: function (v) { if (!v("title")) return false; save("goals", id || newId(), Object.assign(h ? copy(h) : { kind: "habit", created: Date.now() }, { title: v("title") })); toast(h ? "Saved" : "Habit added"); },
      actions: { "delete": function () { delUndo("goals", id, "Habit"); } }
    });
  }

  function goalSheet(id) {
    var g = id ? copy(byId("goals", id)) : { kind: "goal", milestones: [], progress: 0, created: Date.now() };
    g.milestones = g.milestones || [];
    function msHtml() {
      return g.milestones.map(function (m, i) {
        return '<label class="toggle"><input type="checkbox" name="ms' + i + '"' + (m.done ? " checked" : "") + '> <span style="flex:1">' + esc(m.t) + '</span><button type="button" class="btn ghost" data-sclick="rmms" data-i="' + i + '">Remove</button></label>';
      }).join("");
    }
    openSheet({
      title: id ? "Edit goal" : "New goal",
      html: field("Goal", input("title", g.title, 'type="text" required placeholder="What do you want to achieve?"')) +
        '<div class="grid2">' + field("Target date", input("due", g.due, 'type="date"')) + field("Progress (if no steps)", input("progress", g.progress || 0, 'type="number" min="0" max="100" inputmode="numeric"')) + '</div>' +
        '<div class="field"><span>Steps</span><div id="ms-list" style="display:flex;flex-direction:column;gap:8px">' + msHtml() + '</div><div class="quick">' + input("newms", "", 'type="text" placeholder="Add a step"') + '<button type="button" class="btn" data-sclick="addms">Add</button></div></div>' +
        field("Why it matters", '<textarea name="why" placeholder="Optional">' + esc(g.why || "") + '</textarea>') +
        primary(id ? "Save" : "Add goal") + (id ? sbtn("Delete goal", "delete", "danger") : ""),
      clicks: {
        addms: function (b, form) { var el = form.elements.newms; if (!el.value.trim()) return; syncMs(form); g.milestones.push({ t: el.value.trim(), done: false }); el.value = ""; $("ms-list").innerHTML = msHtml(); el.focus(); },
        rmms: function (b, form) { syncMs(form); g.milestones.splice(+b.dataset.i, 1); $("ms-list").innerHTML = msHtml(); }
      },
      submit: function (v, form) {
        if (!v("title")) return false;
        syncMs(form); if (v("newms")) g.milestones.push({ t: v("newms"), done: false });
        g.title = v("title"); g.due = v("due"); g.progress = clamp(+v("progress") || 0, 0, 100); g.why = v("why");
        var gid = id || newId(); delete g.id; save("goals", gid, g); toast(id ? "Saved" : "Goal added");
      },
      actions: { "delete": function () { delUndo("goals", id, "Goal"); } }
    });
    function syncMs(form) { g.milestones.forEach(function (m, i) { var el = form.elements["ms" + i]; if (el) m.done = el.checked; }); }
  }

  function prayerSheet(id) {
    var p = id ? byId("prayers", id) : null;
    openSheet({
      title: p ? "Prayer request" : "New prayer request",
      html: field("Request", input("text", p && p.text, 'type="text" required placeholder="Who or what are you praying for?"')) +
        field("Notes", '<textarea name="notes" placeholder="Optional">' + esc((p && p.notes) || "") + '</textarea>') +
        (p && p.status === "answered" ? field("How it was answered", '<textarea name="answer">' + esc(p.answer || "") + '</textarea>') : "") +
        primary(p ? "Save" : "Add request") +
        (p && p.status !== "answered" ? sbtn("Mark answered", "answered") : "") + (p && p.status === "answered" ? sbtn("Move back to open", "reopen") : "") +
        (p ? sbtn("Delete", "delete", "danger") : ""),
      submit: function (v) { if (!v("text")) return false; save("prayers", id || newId(), Object.assign(p ? copy(p) : { status: "open", date: today() }, { text: v("text"), notes: v("notes"), answer: v("answer") || (p && p.answer) || "" })); toast(p ? "Saved" : "Request added"); },
      actions: {
        answered: function (v) { save("prayers", id, Object.assign(copy(p), { text: v("text"), notes: v("notes"), status: "answered", answeredOn: today() })); toast("Marked answered"); },
        reopen: function () { save("prayers", id, Object.assign(copy(p), { status: "open" })); },
        "delete": function () { delUndo("prayers", id, "Prayer request"); }
      }
    });
  }

  function readingSetupSheet() {
    var rp = readingPlan() || { b: 39, c: 1, perDay: 1 };
    openSheet({
      title: "Reading plan",
      html: '<p class="s" style="margin:0;color:var(--muted)">Pick where to start and how many chapters a day. Each time you mark a day done, the plan moves forward.</p>' +
        field("Book", select("b", BOOKS.map(function (b, i) { return [i, b[0]]; }), rp.b)) +
        '<div class="grid2">' + field("Chapter", input("c", rp.c, 'type="number" min="1" inputmode="numeric"')) + field("Chapters a day", select("perDay", [[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]], rp.perDay)) + '</div>' +
        primary("Save plan"),
      submit: function (v) { var b = +v("b"); save("settings", "faith", { b: b, c: clamp(+v("c") || 1, 1, BOOKS[b][1]), perDay: +v("perDay") || 1 }); toast("Reading plan saved"); }
    });
  }
  function readingNoteSheet(ds) {
    var r = byId("readings", ds) || {};
    openSheet({
      title: (r.reading || "Reading") + " · " + shortDate(ds),
      html: field("Reflection", '<textarea name="note" rows="6" placeholder="What stood out? What are you taking with you?">' + esc(r.note || "") + '</textarea>') + primary("Save"),
      submit: function (v) { save("readings", ds, Object.assign(copy(r), { date: ds, note: v("note") })); toast("Saved"); }
    });
  }

  function runSheet(id, preset) {
    var w = id ? byId("workouts", id) : null, d = w || Object.assign({ date: today(), type: "Run", kind: "Easy" }, preset || {});
    var ts = Math.round(d.seconds || (d.minutes ? d.minutes * 60 : 0)), th = ts ? Math.floor(ts / 3600) : "", tm = ts ? Math.floor(ts % 3600 / 60) : "", tsec = ts ? ts % 60 : "";
    var num = 'type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"';
    openSheet({
      title: w ? "Edit workout" : "Log workout",
      html: '<div class="grid2">' + field("Date", input("date", d.date, 'type="date" required')) + field("Type", select("type", [["Run", "Run"], ["Strength", "Strength"], ["Cross-train", "Cross-train"], ["Mobility", "Mobility"], ["Other", "Other"]], d.type)) + '</div>' +
        '<div class="grid2">' + field("Run type", select("kind", [["Easy", "Easy"], ["Long", "Long"], ["Tempo", "Tempo"], ["Intervals", "Intervals"], ["Race", "Race"], ["Recovery", "Recovery"]], d.kind || "Easy")) + field("Effort (1–10)", select("rpe", [["", "–"]].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return [n, n]; })), d.rpe || "")) + '</div>' +
        '<div class="grid2">' + field("Miles", input("miles", d.miles || "", 'type="text" inputmode="decimal" autocomplete="off" placeholder="3.25"')) + '<div class="field"><span>Pace</span><div class="pace-out" id="pace-out">–</div></div></div>' +
        '<div class="field"><span>Time</span><div class="time3">' + input("th", th || "", num + ' placeholder="hr" aria-label="Hours"') + input("tm", tm === "" ? "" : tm, num + ' placeholder="min" aria-label="Minutes"') + input("tsec", tsec === "" ? "" : tsec, num + ' placeholder="sec" aria-label="Seconds"') + '</div></div>' +
        field("Notes", '<textarea name="note" placeholder="Route, splits, how it felt">' + esc(d.note || "") + '</textarea>') +
        primary(w ? "Save" : "Log it") + (w ? sbtn("Delete workout", "delete", "danger") : ""),
      onOpen: function (f) {
        var upd = function () { var t = timeOf(f), mi = milesOf(f.elements.miles.value); $("pace-out").textContent = t && mi ? mmss(t / mi) + " /mi" : "–"; };
        f.addEventListener("input", upd); upd();
      },
      submit: function (v, f) {
        var t = timeOf(f), mi = milesOf(v("miles"));
        save("workouts", id || newId(), { date: v("date"), type: v("type"), kind: v("type") === "Run" ? v("kind") : "", miles: mi, seconds: t || "", minutes: t ? t / 60 : "", rpe: v("rpe"), note: v("note") });
        toast(w ? "Saved" : "Workout logged");
      },
      actions: { "delete": function () { delUndo("workouts", id, "Workout"); } }
    });
  }
  function milesOf(str) { var n = parseFloat(String(str || "").replace(",", ".")); return n > 0 ? Math.round(n * 100) / 100 : 0; }
  function timeOf(f) { var g = function (n) { return parseInt(f.elements[n].value, 10) || 0; }; return g("th") * 3600 + g("tm") * 60 + g("tsec"); }
  function weightSheet(id) {
    var w = id ? byId("weights", id) : null;
    openSheet({ title: w ? "Edit weigh-in" : "Log weight", html: '<div class="grid2">' + field("Date", input("date", w ? w.date : today(), 'type="date" required')) + field("Weight (lbs)", input("val", w ? w.value : "", 'type="text" inputmode="decimal" autocomplete="off" placeholder="165.4"')) + '</div>' + primary("Save") + (w ? sbtn("Delete weigh-in", "delete", "danger") : ""),
      submit: function (v) { var n = milesOf(v("val")); if (!n) return false; if (w && w.date !== v("date")) del("weights", id); save("weights", v("date"), { date: v("date"), value: r1(n) }); toast("Saved"); },
      actions: { "delete": function () { delUndo("weights", id, "Weigh-in"); } } });
  }
  function weightCard() {
    var wts = state.weights.filter(function (w) { return +w.value > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!wts.length) return card("Body weight", '<div class="empty">No weigh-ins yet. Tap Log to add one.</div>', linkBtn("Log", "newweight"));
    var last = wts[wts.length - 1], cur = +last.value;
    var delta = function (days) {
      var cut = ymd(addDays(parse(last.date), -days)), base = null;
      for (var i = wts.length - 1; i >= 0; i--) if (wts[i].date <= cut) { base = wts[i]; break; }
      if (!base) { var inWin = wts.filter(function (w) { return w.date > cut && w.date < last.date; }); base = inWin[0] || null; }
      if (!base) return "–";
      var d = r1(cur - base.value); return (d > 0 ? "+" : d < 0 ? "−" : "±") + Math.abs(d);
    };
    var rng = ui.wRange || "month", days = { week: 7, month: 30, year: 365, all: 99999 }[rng];
    var from = ymd(addDays(parse(last.date), -days)), pts = wts.filter(function (w) { return w.date >= from; });
    var h = '<div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px"><div class="stat"><b>' + cur + '</b><span>lbs now</span></div><div class="stat"><b>' + delta(7) + '</b><span>past week</span></div><div class="stat"><b>' + delta(30) + '</b><span>past month</span></div><div class="stat"><b>' + delta(365) + '</b><span>past year</span></div></div>';
    h += '<div class="seg" role="tablist" style="margin-bottom:8px">' + [["week", "Week"], ["month", "Month"], ["year", "Year"], ["all", "All"]].map(function (x) { return '<button role="tab" class="' + (rng === x[0] ? "on" : "") + '" data-act="wrange" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join("") + '</div>';
    h += pts.length > 1 ? weightChart(pts) : '<div class="empty">Log one more weigh-in in this range to see the graph.</div>';
    h += '<div class="list" style="margin-top:8px">' + wts.slice(-5).reverse().map(function (w) { return '<div class="item tap" data-act="editweight" data-id="' + w.id + '"><span class="time">' + shortDate(w.date) + '</span><div class="main t">' + w.value + ' lbs</div>' + ICON.chev + '</div>'; }).join("") + '</div>';
    return card("Body weight", h, linkBtn("Log", "newweight"));
  }
  function weightChart(pts) {
    var W = 320, H = 130, L = 34, T = 8, B = 22;
    var vals = pts.map(function (p) { return +p.value; }), lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 2) { var mid = (hi + lo) / 2; lo = mid - 1; hi = mid + 1; }
    var pad = (hi - lo) * 0.1; lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
    var t0 = parse(pts[0].date).getTime(), t1 = parse(pts[pts.length - 1].date).getTime(), span = Math.max(1, t1 - t0);
    var X = function (p) { return L + (W - L - 8) * (parse(p.date).getTime() - t0) / span; }, Y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Body weight over time">';
    [lo, (lo + hi) / 2, hi].forEach(function (v) { var y = Y(v); s += '<line x1="' + L + '" x2="' + (W - 8) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)"/><text x="0" y="' + (y + 3) + '">' + r1(v) + '</text>'; });
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + X(p).toFixed(1) + " " + Y(+p.value).toFixed(1); }).join(" ");
    s += '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    if (pts.length <= 40) pts.forEach(function (p) { s += '<circle cx="' + X(p).toFixed(1) + '" cy="' + Y(+p.value).toFixed(1) + '" r="3" fill="var(--accent)"/>'; });
    var lab = function (p, anchor) { return '<text x="' + X(p).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + anchor + '">' + shortDate(p.date) + '</text>'; };
    s += lab(pts[0], "start") + lab(pts[pts.length - 1], "end");
    return s + '</svg>';
  }

  function planDaySheet(ds) {
    var p = plan(), it = p.days[ds], done = runsOn(ds).filter(function (w) { return w.type === "Run"; });
    openSheet({
      title: it.title + " · " + shortDate(ds),
      html: '<div><span class="type ' + it.type + '">' + it.type + '</span>' + (it.miles ? '<b>' + it.miles + ' mi</b>' : "") + '</div><p style="margin:0">' + esc(it.detail) + '</p>' +
        (done.length ? '<div class="pill good" style="align-self:flex-start">Logged: ' + done.map(function (w) { return r2(w.miles) + " mi"; }).join(", ") + '</div>' : "") +
        (it.type !== "rest" ? primary(done.length ? "Log another" : "Log this run") : ""),
      submit: function () { setTimeout(function () { runSheet(null, { date: ds, type: "Run", kind: { long: "Long", tempo: "Tempo", intervals: "Intervals", pace: "Tempo", race: "Race" }[it.type] || "Easy", miles: it.miles }); }, 300); }
    });
  }

  function settingsSheet() {
    openSheet({
      title: "Settings",
      html: '<div class="field"><span>Export to your calendar</span><div class="grid2"><button type="button" class="btn" data-sclick="ics" data-off="0">This week</button><button type="button" class="btn" data-sclick="ics" data-off="1">Next week</button></div>' +
        '<span style="font-weight:400">Events marked "already in my calendar" are left out.</span></div>' +
        '<button type="button" class="btn block" data-sclick="update">Check for app update</button>' +
        '<button type="button" class="btn danger block" data-sclick="signout">Sign out</button>' +
        '<p class="s" style="margin:0;color:var(--muted);text-align:center">Homebase · version 2</p>',
      clicks: {
        ics: function (b) { exportIcs(+b.dataset.off); },
        update: function () { if (navigator.serviceWorker) navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.update(); }); toast("Checking for updates…"); setTimeout(function () { location.reload(); }, 1200); },
        signout: function () { closeSheet(); signOut(); }
      }
    });
  }
  function quickMenu(items) {
    openSheet({
      title: "Add",
      html: '<div class="grid2">' + items.map(function (it, i) { return '<button type="button" class="btn" data-sclick="go" data-i="' + i + '">' + it[0] + '</button>'; }).join("") + '</div>',
      clicks: { go: function (b) { var f = items[+b.dataset.i][1]; closeSheet(); setTimeout(f, 280); } }
    });
  }

  /* ================= views ================= */
  var views = {};
  function card(title, body, link) { return '<section class="card"><div class="card-h"><h2>' + title + '</h2>' + (link || "") + '</div>' + body + '</section>'; }
  function linkBtn(label, act, extra) { return '<button class="link" data-act="' + act + '"' + (extra || "") + '>' + label + '</button>'; }
  function eventRow(e, ds) {
    var past = ds === today() && e.time && endOf(ds, e) < new Date();
    var sub = []; if (e.end) sub.push("until " + time24(e.end)); if (e.place) sub.push(esc(e.place));
    return '<div class="item tap' + (past ? " past" : "") + '" data-act="editev" data-id="' + e.id + '" data-date="' + ds + '"><span class="time">' + time24(e.time) + '</span><div class="main"><div class="t">' + esc(e.title) + '</div>' +
      (sub.length ? '<div class="s">' + sub.join(" · ") + '</div>' : "") + '</div>' + (e.ref ? '<span class="pill muted">Class</span>' : "") + '</div>';
  }

  views.today = function () {
    var t = today(), n = upNext(), h = "", set = checked();
    var hr = new Date().getHours();
    h += '<div class="hero"><div class="eyebrow">' + longDate(t) + (n ? " · Up next" : "") + '</div>' +
      (n ? '<div class="big">' + esc(n.e.title) + '</div><div class="when">' + whenText(n) + '</div>' + (n.e.place ? '<div class="where">' + esc(n.e.place) + '</div>' : "")
        : '<div class="big">' + (hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening") + '</div><div class="where">Nothing else on the calendar.</div>') + '</div>';
    var now = new Date(), evs = eventsOn(t).filter(function (e) { return !e.time || endOf(t, e) >= now; });
    h += card("Today", evs.length ? '<div class="list">' + evs.map(function (e) { return eventRow(e, t); }).join("") + '</div>' : '<div class="empty">Nothing else today.</div>', linkBtn("Week", "goto", ' data-tab="schedule"'));
    var p = plan(), it = p && p.days[t], ran = runsOn(t);
    if (it || ran.length) {
      var body = "";
      if (it) body += '<div class="item tap" data-act="planday" data-date="' + t + '"><div class="main"><div class="t"><span class="type ' + it.type + '">' + it.type + '</span>' + esc(it.title) + (it.miles ? " · " + it.miles + " mi" : "") + '</div><div class="s">' + esc(it.detail) + '</div></div>' + ICON.chev + '</div>';
      ran.forEach(function (w) { body += '<div class="item tap" data-act="editrun" data-id="' + w.id + '"><span class="pill good">Done</span><div class="main">' + esc(w.type === "Run" ? (w.kind || "Run") + " run" : w.type) + (w.miles ? " · " + r2(w.miles) + " mi" : "") + (w.minutes ? " · " + mmss(w.minutes * 60) : "") + '</div></div>'; });
      if (it && it.type !== "rest" && !ran.length) body += '<button class="btn primary block" style="margin-top:8px" data-act="logplan" data-date="' + t + '">Log this run</button>';
      h += card("Training", body, linkBtn("Plan", "goto", ' data-tab="fitness"'));
    }
    var hs = habits();
    if (hs.length) h += card("Habits", '<div class="list">' + hs.map(function (g) {
      var on = set[g.id + "_" + t];
      return '<div class="item"><button class="check' + (on ? " on" : "") + '" data-act="habit" data-id="' + g.id + '" data-date="' + t + '" aria-pressed="' + !!on + '" aria-label="' + esc(g.title) + '"></button><div class="main t">' + esc(g.title) + '</div><span class="pill' + (streak(g.id, set) ? "" : " muted") + '">' + streak(g.id, set) + 'd</span></div>';
    }).join("") + '</div>');
    var tr = todaysReading();
    h += card("Reading", tr ? '<div class="item"><button class="check' + (tr.done ? " on" : "") + '" data-act="readdone" aria-pressed="' + tr.done + '" aria-label="Mark reading done"></button><div class="main"><div class="t">' + esc(tr.text) + '</div><div class="s">' + (tr.done ? "Done today" : "Today's reading") + '</div></div></div>'
      : '<div class="empty">Set up a reading plan to see today\'s passage here.</div>', linkBtn(tr ? "Reflect" : "Set up", tr ? "note" : "readsetup", ' data-date="' + t + '"'));
    return h;
  };

  function strip(sel, act, dotFn) {
    var mon = mondayOf(parse(sel)), t = today(), h = '<div class="strip"><button class="nav" data-act="' + act + '" data-date="' + ymd(addDays(mon, -7)) + '" aria-label="Previous week">‹</button>';
    for (var i = 0; i < 7; i++) {
      var d = addDays(mon, i), ds = ymd(d);
      h += '<button data-act="' + act + '" data-date="' + ds + '" class="' + (ds === sel ? "sel " : "") + (ds === t ? "today" : "") + '"><small>' + DAYS[d.getDay()].slice(0, 2) + '</small><b>' + d.getDate() + '</b><span class="dot' + (dotFn(ds) ? "" : " none") + '"></span></button>';
    }
    return h + '<button class="nav" data-act="' + act + '" data-date="' + ymd(addDays(mon, 7)) + '" aria-label="Next week">›</button></div>';
  }

  views.schedule = function () {
    var sel = ui.schedDate, evs = eventsOn(sel), t = today();
    var h = '<section class="card">' + strip(sel, "sday", function (ds) { return eventsOn(ds).length; }) + '</section>';
    h += card(sel === t ? "Today" : longDate(sel), evs.length ? '<div class="list">' + evs.map(function (e) { return eventRow(e, sel); }).join("") + '</div>' : '<div class="empty">Nothing on this day.</div>',
      sel !== t ? linkBtn("Jump to today", "sday", ' data-date="' + t + '"') : "");
    var mon = mondayOf(parse(sel)), n = 0;
    for (var i = 0; i < 7; i++) n += eventsOn(ymd(addDays(mon, i))).filter(function (e) { return !e.ref; }).length;
    h += card("Export this week", '<p class="s" style="margin:0 0 10px;color:var(--muted)">' + plural(n, "event") + ' for ' + shortDate(ymd(mon)) + '–' + shortDate(ymd(addDays(mon, 6))) + '. Classes and other events already in your calendar are left out.</p><button class="btn block" data-act="icssel">Download .ics</button>');
    return h;
  };

  views.meals = function () {
    var mon = addDays(mondayOf(new Date()), 7 * ui.mealWeek), t = today(), h = "", any = false;
    var body = '<div class="row" style="margin-bottom:6px"><button class="btn ghost" data-act="mweek" data-d="-1" aria-label="Previous week">‹</button><div class="grow" style="text-align:center;font-weight:600">' +
      (ui.mealWeek === 0 ? "This week" : ui.mealWeek === 1 ? "Next week" : shortDate(ymd(mon)) + "–" + shortDate(ymd(addDays(mon, 6)))) + '</div><button class="btn ghost" data-act="mweek" data-d="1" aria-label="Next week">›</button></div>';
    for (var i = 0; i < 7; i++) {
      var ds = ymd(addDays(mon, i));
      body += '<div class="label" style="margin-top:12px' + (ds === t ? ';color:var(--accent)' : '') + '">' + longDate(ds) + '</div><div class="list">';
      SLOTS.forEach(function (s) {
        var m = byId("meals", ds + "_" + s[0]); if (m) any = true;
        if (s[0] === "snack" && !m) return;
        body += '<div class="item tap" data-act="meal" data-date="' + ds + '" data-slot="' + s[0] + '"><span class="time">' + s[1] + '</span><div class="main t' + (m ? "" : " s") + '">' + (m ? esc(m.text) : "Add") + '</div></div>';
      });
      body += '</div>';
    }
    h += card("Meal plan", body, !any ? linkBtn("Copy last week", "copyweek") : "");
    var g = state.grocery.slice().sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.created || 0) - (b.created || 0); });
    var gl = '<form class="quick" id="gform"><input type="text" id="gtext" placeholder="Add an item" enterkeyhint="done" autocomplete="off"><button class="btn primary" type="submit">Add</button></form>';
    gl += g.length ? '<div class="list" style="margin-top:6px">' + g.map(function (x) {
      return '<div class="item"><button class="check' + (x.done ? " on" : "") + '" data-act="gtoggle" data-id="' + x.id + '" aria-pressed="' + !!x.done + '" aria-label="' + esc(x.text) + '"></button><div class="main t"' + (x.done ? ' style="text-decoration:line-through;color:var(--muted)"' : "") + '>' + esc(x.text) + '</div><button class="btn ghost" data-act="gdel" data-id="' + x.id + '" aria-label="Remove">✕</button></div>';
    }).join("") + '</div>' : '<div class="empty">Your list is empty.</div>';
    h += card("Groceries" + (g.length ? ' <span class="pill muted">' + g.filter(function (x) { return !x.done; }).length + '</span>' : ""), gl, g.some(function (x) { return x.done; }) ? linkBtn("Clear checked", "gclear") : "");
    return h;
  };

  views.goals = function () {
    var set = checked(), t = today(), hs = habits(), gs = goalsOnly(), h = "";
    var mon = new Date(); var days = []; for (var i = 6; i >= 0; i--) days.push(addDays(mon, -i));
    h += card("Habits", hs.length ? '<div class="list">' + hs.map(function (g) {
      return '<div class="item" style="flex-wrap:wrap"><div class="main tap" data-act="edithabit" data-id="' + g.id + '"><div class="t">' + esc(g.title) + '</div><div class="s">' + streak(g.id, set) + ' day streak</div></div><div class="dots">' + days.map(function (d) {
        var ds = ymd(d), on = set[g.id + "_" + ds];
        return '<button class="' + (on ? "on " : "") + (ds === t ? "today" : "") + '" data-act="habit" data-id="' + g.id + '" data-date="' + ds + '" aria-pressed="' + !!on + '" aria-label="' + esc(g.title) + " " + ds + '">' + DAYS[d.getDay()][0] + '</button>';
      }).join("") + '</div></div>';
    }).join("") + '</div>' : '<div class="empty">Build a routine: add a daily habit and check it off here or on Today.</div>', linkBtn("New", "newhabit"));
    h += card("Goals", gs.length ? '<div class="list">' + gs.map(function (g) {
      var p = goalProgress(g), ms = g.milestones || [], late = g.due && g.due < t && p < 100;
      return '<div class="item tap" data-act="editgoal" data-id="' + g.id + '" style="flex-direction:column;align-items:stretch;gap:6px"><div class="row"><div class="grow t"><b>' + esc(g.title) + '</b></div><span class="pill' + (p >= 100 ? " good" : "") + '">' + p + '%</span></div>' +
        '<div class="bar"><i style="width:' + p + '%"></i></div><div class="s"' + (late ? ' style="color:var(--warn)"' : "") + '>' + [ms.length ? ms.filter(function (m) { return m.done; }).length + " of " + ms.length + " steps" : "", g.due ? (late ? "Overdue · " : "Due ") + shortDate(g.due) : ""].filter(Boolean).join(" · ") + '</div></div>';
    }).join("") + '</div>' : '<div class="empty">Add a goal and break it into steps to track progress.</div>', linkBtn("New", "newgoal"));
    return h;
  };

  views.faith = function () {
    var t = today(), tr = todaysReading(), rp = readingPlan(), h = "", r = byId("readings", t) || {};
    var body = tr ? '<div class="item"><button class="check' + (tr.done ? " on" : "") + '" data-act="readdone" aria-pressed="' + tr.done + '" aria-label="Mark reading done"></button><div class="main"><div class="t" style="font-size:20px;font-family:var(--font-display)">' + esc(tr.text) + '</div><div class="s">' + (tr.done ? "Done today" : "Mark done when you finish") + '</div></div></div>'
      : '<div class="empty">Choose a book and pace, and Homebase will hand you the next passage each day.</div><button class="btn primary block" data-act="readsetup">Set up reading plan</button>';
    if (tr) body += '<div class="field" style="margin-top:10px"><span>Reflection</span><textarea id="refl" data-date="' + t + '" placeholder="What stood out today?">' + esc(r.note || "") + '</textarea></div>';
    var stats = '<div class="stats" style="margin-top:12px"><div class="stat"><b>' + readingStreak() + '</b><span>day streak</span></div><div class="stat"><b>' + state.readings.filter(function (x) { return x.done; }).length + '</b><span>days read</span></div><div class="stat"><b>' + (rp ? rp.perDay : "–") + '</b><span>chapters a day</span></div></div>';
    h += card("Today's reading", body + (tr ? stats : ""), rp ? linkBtn("Change", "readsetup") : "");
    var hist = state.readings.filter(function (x) { return x.id !== t && (x.reading || x.note); }).sort(function (a, b) { return a.id < b.id ? 1 : -1; }).slice(0, 7);
    if (hist.length) h += card("Recent", '<div class="list">' + hist.map(function (x) { return '<div class="item tap" data-act="note" data-date="' + x.id + '"><span class="time">' + shortDate(x.id) + '</span><div class="main"><div class="t">' + esc(x.reading || "Reading") + '</div>' + (x.note ? '<div class="s">' + esc(x.note.slice(0, 90)) + (x.note.length > 90 ? "…" : "") + '</div>' : "") + '</div></div>'; }).join("") + '</div>');
    var open = state.prayers.filter(function (p) { return p.status !== "answered"; }), ans = state.prayers.filter(function (p) { return p.status === "answered"; });
    h += card("Prayer list", open.length ? '<div class="list">' + open.map(function (p) { return '<div class="item tap" data-act="editprayer" data-id="' + p.id + '"><div class="main"><div class="t">' + esc(p.text) + '</div><div class="s">Since ' + shortDate(p.date) + (p.notes ? " · " + esc(p.notes.slice(0, 60)) : "") + '</div></div>' + ICON.chev + '</div>'; }).join("") + '</div>' : '<div class="empty">No open requests. Tap + to add one.</div>', linkBtn("New", "newprayer"));
    if (ans.length) h += card("Answered", '<div class="list">' + ans.sort(function (a, b) { return (a.answeredOn || "") < (b.answeredOn || "") ? 1 : -1; }).map(function (p) { return '<div class="item tap" data-act="editprayer" data-id="' + p.id + '"><span class="pill good">' + (p.answeredOn ? shortDate(p.answeredOn) : "Yes") + '</span><div class="main"><div class="t">' + esc(p.text) + '</div>' + (p.answer ? '<div class="s">' + esc(p.answer) + '</div>' : "") + '</div></div>'; }).join("") + '</div>');
    return h;
  };

  function weekMiles(startDs) { var e = ymd(addDays(parse(startDs), 7)); return state.workouts.filter(function (w) { return w.date >= startDs && w.date < e; }).reduce(function (a, w) { return a + miles(w); }, 0); }
  function chart(weeks) {
    var W = 320, H = 120, L = 28, mx = Math.max(5, Math.ceil(Math.max.apply(null, weeks.map(function (w) { return Math.max(w.mi, w.plan || 0); })) / 5) * 5), bw = (W - L - 6) / weeks.length;
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Weekly mileage">';
    [0, mx / 2, mx].forEach(function (v) { var y = 8 + (H - 30) * (1 - v / mx); s += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)"/><text x="0" y="' + (y + 3) + '">' + v + '</text>'; });
    weeks.forEach(function (w, i) {
      var x = L + i * bw + 4, bwid = bw - 8, base = 8 + (H - 30);
      if (w.plan) { var ph = (H - 30) * w.plan / mx; s += '<rect x="' + x + '" y="' + (base - ph) + '" width="' + bwid + '" height="' + ph + '" rx="3" fill="none" stroke="var(--muted)" stroke-dasharray="3 3"/>'; }
      var hh = (H - 30) * w.mi / mx; s += '<rect x="' + x + '" y="' + (base - hh) + '" width="' + bwid + '" height="' + hh + '" rx="3" fill="' + (i === weeks.length - 1 ? "var(--accent)" : "var(--hero2)") + '" opacity="' + (i === weeks.length - 1 ? 1 : .55) + '"/>';
      s += '<text x="' + (x + bwid / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + w.label + '</text>';
    });
    return s + '</svg>';
  }

  views.fitness = function () {
    var h = '<div class="seg" role="tablist">' + [["plan", "Plan"], ["log", "Log"], ["stats", "Stats"]].map(function (s) { return '<button role="tab" class="' + (ui.fit === s[0] ? "on" : "") + '" data-act="fit" data-v="' + s[0] + '">' + s[1] + '</button>'; }).join("") + '</div>';
    var p = plan(), t = today(), mon = mondayOf(new Date());
    if (ui.fit === "plan") {
      if (!p) return h + card("Training plan", '<div class="empty">No plan yet. Ask Claude in chat and it will build one for you.</div>');
      var ws = addDays(mon, 7 * ui.planWeek), wsS = ymd(ws), wi = p.weeks.findIndex(function (w) { return w.start === wsS; });
      var wk = p.weeks[wi], planned = 0, done = weekMiles(wsS), rows = "";
      for (var i = 0; i < 7; i++) {
        var ds = ymd(addDays(ws, i)), it = p.days[ds]; if (!it) continue; planned += it.miles;
        var ran = runsOn(ds).filter(function (w) { return w.type === "Run"; }), ok = ran.length > 0;
        rows += '<div class="plan-day tap' + (ds === t ? " today" : "") + '" data-act="planday" data-date="' + ds + '"><div class="d">' + DAYS[parse(ds).getDay()] + '<b>' + parse(ds).getDate() + '</b></div><div style="min-width:0"><div><span class="type ' + it.type + '">' + it.type + '</span>' + esc(it.title) + '</div><div class="s" style="font-size:13px;color:var(--muted)">' + (it.miles ? it.miles + " mi" : "") + (ok ? " · ran " + r1(ran.reduce(function (a, w) { return a + (+w.miles || 0); }, 0)) + " mi" : "") + '</div></div>' +
          (it.type === "rest" ? "" : ok ? '<span class="pill good">✓</span>' : ds < t ? '<span class="pill muted">–</span>' : "") + '</div>';
      }
      var head = '<div class="row" style="margin-bottom:8px"><button class="btn ghost" data-act="pweek" data-d="-1" aria-label="Previous week">‹</button><div class="grow" style="text-align:center"><b>' + (wk ? "Week " + (wi + 1) + " of " + p.weeks.length : shortDate(wsS)) + '</b><div class="s" style="font-size:13px;color:var(--muted)">' + (wk ? wk.phase.charAt(0).toUpperCase() + wk.phase.slice(1) + " phase · " : "") + r1(done) + " of " + r1(planned) + ' mi</div></div><button class="btn ghost" data-act="pweek" data-d="1" aria-label="Next week">›</button></div>' +
        '<div class="bar" style="margin-bottom:6px"><i style="width:' + (planned ? Math.min(100, Math.round(100 * done / planned)) : 0) + '%"></i></div>';
      h += card(GOAL_LABEL[p.inputs.goal] + (p.inputs.raceDate ? " · " + shortDate(p.inputs.raceDate) : ""), head + (rows || '<div class="empty">This week is outside your plan.</div>'));
      var P = paces(p.inputs);
      if (P) h += card("Your paces", '<div class="list">' + [["Easy and long", mmss(P.easy[0]) + "–" + mmss(P.easy[1])], ["Tempo", mmss(P.tempo)], ["5K pace", mmss(P.i5k)], ["10K pace", mmss(P.p10)], ["Half marathon", mmss(P.ph)], ["Marathon", mmss(P.pm)]].concat(P.goal && p.inputs.goal !== "base" ? [["Goal pace", mmss(P.goal)]] : []).map(function (x) { return '<div class="item"><div class="main">' + x[0] + '</div><b style="font-variant-numeric:tabular-nums">' + x[1] + ' /mi</b></div>'; }).join("") + '</div><p class="s" style="margin:8px 0 0;color:var(--muted);font-size:13px">' + (p.custom ? 'Target paces for a ' + esc(p.inputs.goalTime || p.inputs.raceTime) + ' 5K.' : 'Estimated from your ' + esc({ "1mi": "mile", "5k": "5K", "10k": "10K", half: "half marathon", marathon: "marathon" }[p.inputs.raceDist]) + ' time of ' + esc(p.inputs.raceTime) + '.') + ' Run by feel on hot or hilly days.</p>');
      return h;
    }
    if (ui.fit === "log") {
      var recent = state.workouts.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).slice(0, 30);
      return h + card("Workouts", recent.length ? '<div class="list">' + recent.map(function (w) {
        var run = w.type === "Run", pace = run ? paceOf(+w.miles, +w.minutes) : "";
        return '<div class="item tap" data-act="editrun" data-id="' + w.id + '"><span class="time">' + shortDate(w.date) + '</span><div class="main"><div class="t">' + esc(run ? (w.kind || "Run") + " run" : w.type) + (run && +w.miles ? " · " + r2(w.miles) + " mi" : "") + '</div><div class="s">' + [w.minutes ? mmss(w.minutes * 60) : "", pace ? pace + " /mi" : "", w.rpe ? "effort " + w.rpe : "", esc(w.note || "")].filter(Boolean).join(" · ") + '</div></div></div>';
      }).join("") + '</div>' : '<div class="empty">No workouts yet. Tap + to log your first run.</div>', linkBtn("Log", "newrun"));
    }
    var weeks = []; for (var k = 7; k >= 0; k--) { var s0 = ymd(addDays(mon, -7 * k)), pw = p && p.weeks.filter(function (w) { return w.start === s0; })[0]; weeks.push({ label: parse(s0).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }), mi: weekMiles(s0), plan: pw ? pw.miles : 0 }); }
    var runs = state.workouts.filter(function (w) { return w.type === "Run" && +w.miles > 0; });
    var longest = runs.reduce(function (a, w) { return Math.max(a, +w.miles); }, 0);
    var best = runs.filter(function (w) { return +w.miles >= 3 && +w.minutes > 0; }).sort(function (a, b) { return a.minutes / a.miles - b.minutes / b.miles; })[0];
    var total30 = runs.filter(function (w) { return w.date >= ymd(addDays(new Date(), -30)); }).reduce(function (a, w) { return a + +w.miles; }, 0);
    h += card("Mileage", '<div class="stats" style="margin-bottom:10px"><div class="stat"><b>' + r1(weekMiles(ymd(mon))) + '</b><span>this week</span></div><div class="stat"><b>' + r1(total30) + '</b><span>last 30 days</span></div><div class="stat"><b>' + (longest ? r1(longest) : "–") + '</b><span>longest run</span></div></div>' + chart(weeks) +
      '<p class="s" style="margin:6px 0 0;color:var(--muted);font-size:13px">' + (p ? "Dashed outline shows planned miles. " : "") + (best ? "Fastest 3+ mile run: " + paceOf(+best.miles, +best.minutes) + " /mi on " + shortDate(best.date) + "." : "") + '</p>');
    h += weightCard();
    return h;
  };

  /* ================= render ================= */
  var view = $("view"), lastHtml = "", lastTab = "";
  function current() { var hsh = location.hash.replace("#", ""); return views[hsh] && TABS.some(function (x) { return x[0] === hsh; }) ? hsh : "today"; }
  function typing() { var a = document.activeElement; return a && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
  var pending = false;
  function render(force) {
    if (!force && typing()) { pending = true; return; }
    pending = false;
    var tab = current();
    if (tab !== lastTab) {
      $("tabs").innerHTML = TABS.map(function (t) { return '<a href="#' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : "") + '>' + ICON[t[0]] + t[1] + '</a>'; }).join("");
      $("title").textContent = { today: "Today", schedule: "Schedule", meals: "Meals", goals: "Goals", faith: "Faith", fitness: "Running" }[tab];
    }
    var html = views[tab]();
    if (html !== lastHtml || tab !== lastTab) { view.innerHTML = html; lastHtml = html; }
    if (tab !== lastTab) { window.scrollTo(0, 0); lastTab = tab; }
  }
  var scheduled = false;
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(function () { scheduled = false; render(false); }); } }
  window.addEventListener("hashchange", function () { render(true); });
  view.addEventListener("focusout", function () { setTimeout(function () { if (pending && !typing()) render(false); }, 150); });
  setInterval(function () { if (!document.hidden && current() === "today") render(false); }, 30000);

  /* ================= interactions ================= */
  view.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act]"); if (!b) return;
    var a = b.dataset.act, id = b.dataset.id, ds = b.dataset.date, t = today();
    switch (a) {
      case "goto": location.hash = b.dataset.tab; break;
      case "editev": eventSheet(id, ds); break;
      case "sday": ui.schedDate = ds; render(true); break;
      case "icssel": exportIcs(Math.round((mondayOf(parse(ui.schedDate)) - mondayOf(new Date())) / 604800000)); break;
      case "habit": var k = id + "_" + ds; if (checked()[k]) del("checkins", k); else { save("checkins", k, { goalId: id, date: ds }); if (navigator.vibrate) navigator.vibrate(10); } break;
      case "edithabit": habitSheet(id); break;
      case "newhabit": habitSheet(); break;
      case "editgoal": goalSheet(id); break;
      case "newgoal": goalSheet(); break;
      case "meal": mealSheet(ds, b.dataset.slot); break;
      case "mweek": ui.mealWeek += +b.dataset.d; render(true); break;
      case "copyweek": copyWeek(); break;
      case "gtoggle": var g = byId("grocery", id); if (g) save("grocery", id, Object.assign(copy(g), { done: !g.done })); break;
      case "gdel": delUndo("grocery", id, "Item"); break;
      case "gclear": var gone = state.grocery.filter(function (x) { return x.done; }).map(copy); gone.forEach(function (x) { del("grocery", x.id); }); toast(plural(gone.length, "item") + " cleared", function () { gone.forEach(function (x) { var i = x.id; delete x.id; save("grocery", i, x); }); }); break;
      case "readdone": toggleReading(); break;
      case "readsetup": readingSetupSheet(); break;
      case "note": readingNoteSheet(ds || t); break;
      case "editprayer": prayerSheet(id); break;
      case "newprayer": prayerSheet(); break;
      case "fit": ui.fit = b.dataset.v; render(true); break;
      case "planday": planDaySheet(ds); break;
      case "logplan": var it = plan().days[ds]; runSheet(null, { date: ds, type: "Run", kind: { long: "Long", tempo: "Tempo", intervals: "Intervals", pace: "Tempo", race: "Race" }[it.type] || "Easy", miles: it.miles }); break;
      case "pweek": ui.planWeek += +b.dataset.d; render(true); break;
      case "editrun": runSheet(id); break;
      case "newrun": runSheet(); break;
      case "newweight": weightSheet(); break;
      case "editweight": weightSheet(b.dataset.id); break;
      case "wrange": ui.wRange = b.dataset.v; render(true); break;
    }
  });
  view.addEventListener("submit", function (ev) {
    if (ev.target.id !== "gform") return;
    ev.preventDefault();
    var el = $("gtext"), v = el.value.trim(); if (!v) return;
    v.split(",").map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (s, i) { save("grocery", newId(), { text: s, done: false, created: Date.now() + i }); });
    el.value = ""; el.focus();
  });
  view.addEventListener("change", function (ev) {
    if (ev.target.id === "refl") { var ds = ev.target.dataset.date, r = byId("readings", ds) || {}; save("readings", ds, Object.assign(copy(r), { date: ds, note: ev.target.value.trim() })); toast("Reflection saved"); }
  });
  function toggleReading() {
    var t = today(), r = byId("readings", t), rp = readingPlan();
    if (r && r.done) {
      var back = copy(r); back.done = false;
      save("readings", t, back);
      if (r.prevPos && rp) save("settings", "faith", Object.assign(copy(rp), r.prevPos));
      return;
    }
    if (rp) {
      var ps = passage({ b: rp.b, c: rp.c }, rp.perDay);
      save("readings", t, Object.assign(r ? copy(r) : {}, { date: t, reading: ps.text, done: true, prevPos: { b: rp.b, c: rp.c } }));
      save("settings", "faith", Object.assign(copy(rp), { b: ps.next.b, c: ps.next.c }));
    } else if (r) save("readings", t, Object.assign(copy(r), { done: true }));
    else { readingSetupSheet(); return; }
    if (navigator.vibrate) navigator.vibrate(10);
    toast("Nice work. Reading done.");
  }
  function copyWeek() {
    var mon = addDays(mondayOf(new Date()), 7 * ui.mealWeek), n = 0;
    for (var i = 0; i < 7; i++) {
      var from = ymd(addDays(mon, i - 7)), to = ymd(addDays(mon, i));
      SLOTS.forEach(function (s) { var m = byId("meals", from + "_" + s[0]); if (m) { save("meals", to + "_" + s[0], { date: to, slot: s[0], text: m.text }); n++; } });
    }
    toast(n ? plural(n, "meal") + " copied" : "Last week has no meals to copy");
  }

  $("fab").addEventListener("click", function () {
    var tab = current();
    if (tab === "schedule") return eventSheet(null, ui.schedDate);
    if (tab === "faith") return prayerSheet();
    if (tab === "fitness") return runSheet();
    if (tab === "goals") return quickMenu([["Habit", function () { habitSheet(); }], ["Goal", function () { goalSheet(); }]]);
    if (tab === "meals") return quickMenu([["Meal today", function () { mealSheet(today(), new Date().getHours() < 11 ? "breakfast" : new Date().getHours() < 16 ? "lunch" : "dinner"); }], ["Grocery item", function () { var el = $("gtext"); if (el) el.focus(); }]]);
    quickMenu([["Event", function () { eventSheet(null, today()); }], ["Workout", function () { runSheet(); }], ["Prayer request", function () { prayerSheet(); }], ["Habit", function () { habitSheet(); }], ["Goal", function () { goalSheet(); }]]);
  });
  $("settings-btn").addEventListener("click", settingsSheet);

  /* ================= calendar export ================= */
  function icsText(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function exportIcs(off) {
    var start = addDays(mondayOf(new Date()), 7 * off), L = [], n = 0;
    var dt = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    L.push("BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Homebase//Weekly export//EN", "CALSCALE:GREGORIAN");
    for (var i = 0; i < 7; i++) {
      var day = addDays(start, i), ds = ymd(day), dc = ds.replace(/-/g, "");
      eventsOn(ds).filter(function (e) { return !e.ref; }).forEach(function (e) {
        n++; L.push("BEGIN:VEVENT", "UID:" + e.id + "-" + dc + "@homebase", "DTSTAMP:" + dt, "SUMMARY:" + icsText(e.title));
        if (e.place) L.push("LOCATION:" + icsText(e.place));
        if (e.notes) L.push("DESCRIPTION:" + icsText(e.notes));
        if (e.time) {
          var p = e.time.split(":"), q = e.end && e.end > e.time ? e.end.split(":") : [pad((+p[0] + 1) % 24), p[1]];
          L.push("DTSTART:" + dc + "T" + p[0] + p[1] + "00", "DTEND:" + dc + "T" + q[0] + q[1] + "00");
        } else L.push("DTSTART;VALUE=DATE:" + dc, "DTEND;VALUE=DATE:" + ymd(addDays(day, 1)).replace(/-/g, ""));
        L.push("END:VEVENT");
      });
    }
    L.push("END:VCALENDAR");
    if (!n) { toast("No events to export that week"); return; }
    var text = L.join("\r\n") + "\r\n", fname = "homebase-week-" + ymd(start) + ".ics";
    var done = function () { toast(plural(n, "event") + " exported"); };
    var download = function () {
      var url = URL.createObjectURL(new Blob([text], { type: "text/calendar" })), a = document.createElement("a");
      a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000); done();
    };
    try {
      var file = new File([text], fname, { type: "text/calendar" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: "Homebase week" }).then(done).catch(function (e) { if (!e || e.name !== "AbortError") download(); }); return; }
    } catch (e) {}
    download();
  }

  /* ================= data: local-first with Supabase sync ================= */
  var CFG = window.HB_CONFIG, sb = null, session = null, uid = null, queue = [], flushing = false, booted = false;
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function persist() { if (!uid) return; lsSet("hb-cache-" + uid, state); lsSet("hb-queue-" + uid, queue); }
  function localSet(c, id, data) {
    var arr = state[c], row = Object.assign({ id: id }, data);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i] = row; return; }
    arr.push(row);
  }
  function localDel(c, id) { state[c] = state[c].filter(function (x) { return x.id !== id; }); }
  function pendingFor(c, id) { return queue.some(function (q) { return q.c === c && q.id === id; }); }
  function enqueue(q) { queue = queue.filter(function (x) { return !(x.c === q.c && x.id === q.id); }); queue.push(q); persist(); schedule(); return flush(); }
  function save(c, id, data) { var d = copy(data); delete d.id; localSet(c, id, d); return enqueue({ op: "set", c: c, id: id, data: d }); }
  function del(c, id) { localDel(c, id); return enqueue({ op: "del", c: c, id: id }); }
  function netError(r) { return r.status === 0 || /fetch|network|load failed/i.test((r.error && r.error.message) || ""); }
  var statusEl = null;
  function setStatus() {
    if (!statusEl) { statusEl = document.createElement("div"); statusEl.className = "notice"; statusEl.style.cssText = "position:fixed;left:16px;right:16px;top:calc(env(safe-area-inset-top) + 62px);z-index:25;max-width:608px;margin:0 auto;text-align:center"; document.body.appendChild(statusEl); }
    var msg = !navigator.onLine ? "Offline. Changes are saved here and sync when you reconnect." : queue.length > 2 ? "Syncing " + plural(queue.length, "change") + "…" : "";
    statusEl.textContent = msg; statusEl.hidden = !msg || !uid;
  }
  function flush() {
    if (!sb || !session || flushing || !navigator.onLine) { setStatus(); return Promise.resolve(); }
    flushing = true;
    return (async function () {
      while (queue.length) {
        var q = queue[0], r;
        if (q.op === "set") r = await sb.from("items").upsert({ user_id: uid, collection: q.c, id: q.id, data: q.data }, { onConflict: "user_id,collection,id" });
        else r = await sb.from("items").delete().eq("collection", q.c).eq("id", q.id);
        if (r.error) { if (netError(r)) break; toast("Could not save: " + r.error.message); }
        queue.shift(); persist();
      }
    })().catch(function () {}).then(function () { flushing = false; setStatus(); if (!queue.length) pull(); });
  }
  var lastPull = 0;
  function pull() {
    if (!sb || !session || !navigator.onLine || queue.length) return Promise.resolve();
    lastPull = Date.now();
    return sb.from("items").select("collection,id,data").limit(10000).then(function (r) {
      if (r.error) return;
      if (queue.length) return;
      var next = {}; COLS.forEach(function (c) { next[c] = []; });
      r.data.forEach(function (row) { if (next[row.collection]) next[row.collection].push(Object.assign({ id: row.id }, row.data)); });
      state = next; persist(); schedule();
    });
  }
  function listen() {
    sb.channel("items-" + uid).on("postgres_changes", { event: "*", schema: "public", table: "items" }, function (p) {
      var rec = p.eventType === "DELETE" ? p.old : p.new;
      if (!rec || !state[rec.collection] || pendingFor(rec.collection, rec.id)) return;
      if (p.eventType === "DELETE") localDel(rec.collection, rec.id); else localSet(rec.collection, rec.id, rec.data);
      persist(); schedule();
    }).subscribe();
  }
  function showLogin(msg) { $("app").hidden = true; $("login").hidden = false; $("login-msg").textContent = msg || ""; if (statusEl) statusEl.hidden = true; }
  function showApp() { $("login").hidden = true; $("app").hidden = false; lastTab = ""; render(true); }
  function loadCache(id) {
    var c = lsGet("hb-cache-" + id);
    if (c) COLS.forEach(function (k) { state[k] = Array.isArray(c[k]) ? c[k] : []; });
    queue = lsGet("hb-queue-" + id) || [];
    return !!c;
  }
  function start() {
    var first = !booted; booted = true;
    uid = session.user.id; lsSet("hb-last-uid", uid);
    if (first) loadCache(uid);
    showApp(); listen(); flush(); pull();
  }
  function signOut() {
    var id = uid;
    sb.auth.signOut().then(function () {
      try { localStorage.removeItem("hb-cache-" + id); localStorage.removeItem("hb-queue-" + id); localStorage.removeItem("hb-last-uid"); } catch (e) {}
      COLS.forEach(function (c) { state[c] = []; }); queue = []; uid = null; session = null; booted = false; showLogin("");
    });
  }
  $("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    $("login-msg").textContent = "Signing in…";
    sb.auth.signInWithPassword({ email: $("lg-email").value.trim(), password: $("lg-pw").value }).then(function (r) {
      $("login-msg").textContent = r.error ? r.error.message : "";
    });
  });
  window.addEventListener("online", function () { setStatus(); flush(); pull(); });
  window.addEventListener("offline", setStatus);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { if (Date.now() - lastPull > 15000) { flush(); pull(); } render(false); } });

  if (!window.supabase || !CFG) showLogin("Could not load the sync library. Check your connection and reload.");
  else {
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
    sb.auth.onAuthStateChange(function (ev, s) {
      if (s && (!session || session.user.id !== s.user.id)) { session = s; start(); }
      else if (s) session = s;
    });
    sb.auth.getSession().then(function (r) {
      session = r.data.session;
      if (session) { if (!booted) start(); return; }
      var last = lsGet("hb-last-uid");
      if (last && loadCache(last)) { uid = last; booted = true; showApp(); setStatus(); if (navigator.onLine) showLogin("Your session expired. Sign in again to sync."); }
      else showLogin("");
    });
  }
  window.__hb = { genPlan: genPlan, passage: passage, state: function () { return state; } };
})();
