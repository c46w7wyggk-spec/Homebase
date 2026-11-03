
(function () {
  var TABS = [["today","Today"],["schedule","Schedule"],["meals","Meals"],["goals","Goals"],["faith","Faith"],["fitness","Fitness"]];
  var COLS = ["events","meals","grocery","goals","checkins","prayers","readings","workouts","weights","settings"];
  var state = {}; COLS.forEach(function (c) { state[c] = []; });
  var pending = false;
  var DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var SLOTS = [["breakfast","Breakfast"],["lunch","Lunch"],["dinner","Dinner"],["snack","Snack"]];
  var WORKOUTS = ["Lift","Run","Walk","Bike","Swim","Mobility","Other"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function mondayOf(d) { var x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function longDate(s) { return parse(s).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }); }
  function time12(t) { if (!t) return "All day"; var p = t.split(":"), h = +p[0]; return ((h % 12) || 12) + ":" + p[1] + (h < 12 ? " AM" : " PM"); }
  function today() { return ymd(new Date()); }
  function byId(c, id) { return state[c].filter(function (x) { return x.id === id; })[0]; }
  function newId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  function fail(e) { document.getElementById("notice").innerHTML = '<div class="notice">Could not save: ' + esc(e && e.message || e) + '</div>'; }

  /* ---------- schedule logic ---------- */
  function occursOn(e, ds) {
    if (e.date === ds) return true;
    if (ds < e.date) return false;
    if (e.until && ds > e.until) return false;
    if (e.repeat === "daily") return true;
    if (e.repeat === "weekly") return parse(e.date).getDay() === parse(ds).getDay();
    return false;
  }
  function meta(e) {
    var p = []; if (e.end) p.push("until " + time12(e.end)); if (e.place) p.push(esc(e.place));
    return p.length ? '<div class="small muted">' + p.join(" · ") + '</div>' : "";
  }
  function eventsOn(ds) {
    return state.events.filter(function (e) { return occursOn(e, ds); })
      .sort(function (a, b) { return (a.time || "") < (b.time || "") ? -1 : 1; });
  }

  /* ---------- goals logic ---------- */
  function checkedSet() { var s = {}; state.checkins.forEach(function (c) { s[c.id] = true; }); return s; }
  function streak(goalId, set) {
    var d = new Date(), n = 0;
    if (!set[goalId + "_" + ymd(d)]) d = addDays(d, -1);
    while (set[goalId + "_" + ymd(d)]) { n++; d = addDays(d, -1); }
    return n;
  }
  function weekCount(goalId, set) {
    var m = mondayOf(new Date()), n = 0;
    for (var i = 0; i < 7; i++) if (set[goalId + "_" + ymd(addDays(m, i))]) n++;
    return n;
  }

  /* ---------- views ---------- */
  var views = {};

  function stamp(ds, t) { var p = ds.split("-"), q = (t || "00:00").split(":"); return new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1]); }
  function upNext() {
    var now = new Date();
    for (var i = 0; i < 15; i++) {
      var ds = ymd(addDays(now, i)), evs = eventsOn(ds);
      for (var k = 0; k < evs.length; k++) {
        var e = evs[k], st = stamp(ds, e.time), en = e.end ? stamp(ds, e.end) : new Date(st.getTime() + 3600000);
        if (e.time && st <= now && now < en) return { e: e, ds: ds, now: true, end: en };
        if (e.time ? st > now : i > 0) return { e: e, ds: ds, start: st };
      }
    }
    return null;
  }
  function upNextCard() {
    var n = upNext(), h = '<div class="card upnext"><h3>Up next</h3>';
    if (!n) return h + '<div class="empty">Nothing coming up in the next two weeks.</div></div>';
    var e = n.e, when;
    if (n.now) when = "Happening now · until " + time12(e.end || ymd(n.end).slice(0, 0) + pad(n.end.getHours()) + ":" + pad(n.end.getMinutes()));
    else if (n.ds === today()) { var m = Math.max(1, Math.round((n.start - new Date()) / 60000)); when = "In " + (m >= 60 ? Math.floor(m / 60) + "h " : "") + (m % 60 ? m % 60 + "m" : "") + " · " + time12(e.time); }
    else when = longDate(n.ds) + " · " + time12(e.time);
    return h + '<div class="big">' + esc(e.title) + '</div><div class="when">' + when + '</div>' + meta(e).replace(/until [^·<]*·? ?/, "") + '</div>';
  }

  views.today = function () {
    var t = today(), set = checkedSet();
    var evs = eventsOn(t);
    var habits = state.goals.filter(function (g) { return g.kind === "habit"; });
    var rd = byId("readings", t);
    var meals = SLOTS.map(function (s) { var m = byId("meals", t + "_" + s[0]); return m && m.text ? [s[1], m.text] : null; }).filter(Boolean);
    var wk = state.workouts.filter(function (w) { return w.date === t; });
    var open = state.prayers.filter(function (p) { return p.status !== "answered"; });
    var h = '<section class="view">' + upNextCard();
    h += '<div class="card"><h3>On the calendar</h3>' + (evs.length ? '<div class="list">' + evs.map(function (e) {
      return '<div class="row"><span class="time">' + esc(time12(e.time)) + '</span><span class="grow">' + esc(e.title) + (e.ref ? ' <span class="pill ref">Reference</span>' : "") + meta(e) + '</span></div>'; }).join("") + '</div>'
      : '<div class="empty">Nothing scheduled today. Add events in Schedule.</div>') + '</div>';
    h += '<div class="card"><h3>Habits</h3>' + (habits.length ? '<div class="list">' + habits.map(function (g) {
      var on = set[g.id + "_" + t];
      return '<div class="row"><button class="check' + (on ? " on" : "") + '" data-act="habit" data-id="' + g.id + '" aria-label="Mark ' + esc(g.title) + ' done" aria-pressed="' + !!on + '"></button><span class="grow">' + esc(g.title) + '</span><span class="pill">' + streak(g.id, set) + ' day streak</span></div>'; }).join("") + '</div>'
      : '<div class="empty">No habits yet. Add one under Goals.</div>') + '</div>';
    h += '<div class="grid2">';
    h += '<div class="card"><h3>Meals today</h3>' + (meals.length ? '<div class="list">' + meals.map(function (m) {
      return '<div class="row"><span class="time" style="width:76px">' + m[0] + '</span><span class="grow">' + esc(m[1]) + '</span></div>'; }).join("") + '</div>'
      : '<div class="empty">No meals planned. Plan the week in Meals.</div>') + '</div>';
    h += '<div class="card"><h3>Fitness</h3>' + (wk.length ? wk.map(function (w) {
      return '<div class="row"><span class="grow">' + esc(w.type) + (+w.miles ? " · " + (Math.round(w.miles * 100) / 100) + " mi" : "") + (w.minutes ? " · " + esc(w.minutes) + " min" : "") + '</span><span class="pill">Logged</span></div>'; }).join("")
      : '<div class="empty">No run or workout logged yet today.</div>') + '</div>';
    h += '</div>';
    h += '<div class="card"><h3>Faith</h3><div class="row"><button class="check' + (rd && rd.done ? " on" : "") + '" data-act="readdone" aria-label="Mark reading done" aria-pressed="' + !!(rd && rd.done) + '"></button><span class="grow">' +
      (rd && rd.reading ? esc(rd.reading) : '<span class="muted">No reading set for today</span>') + '</span><span class="pill">' + open.length + ' open prayers</span></div></div>';
    return h + signoutRow() + '</section>';
  };

  views.schedule = function () {
    var t = today(), h = '<section class="view"><div class="card"><h2>Next 14 days</h2>', any = false;
    for (var i = 0; i < 14; i++) {
      var ds = ymd(addDays(new Date(), i)), evs = eventsOn(ds);
      if (!evs.length) continue; any = true;
      h += '<div class="day">' + (i === 0 ? "Today" : i === 1 ? "Tomorrow" : longDate(ds)) + '</div><div class="list">' + evs.map(function (e) {
        return '<div class="row"><span class="time">' + esc(time12(e.time)) + '</span><span class="grow">' + esc(e.title) + (e.ref ? ' <span class="pill ref">Reference</span>' : "") + (e.repeat && e.repeat !== "none" ? ' <span class="pill">' + e.repeat + (e.until ? " until " + parse(e.until).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "") + '</span>' : "") + meta(e) + '</span><button class="ghost" data-act="delev" data-id="' + e.id + '" aria-label="Delete ' + esc(e.title) + '">Delete</button></div>'; }).join("") + '</div>';
    }
    if (!any) h += '<div class="empty">Nothing in the next two weeks. Add your first event below.</div>';
    h += '</div><div class="card"><form class="add" id="f-event" data-label="Add event"><input type="text" id="ev-title" placeholder="Title" required>' +
      '<input type="date" id="ev-date" value="' + t + '" required><input type="time" id="ev-time" aria-label="Start time"><input type="time" id="ev-end" aria-label="End time"><input type="text" id="ev-place" placeholder="Location">' +
      '<select id="ev-repeat" aria-label="Repeat"><option value="none">One time</option><option value="daily">Every day</option><option value="weekly">Every week</option></select>' +
      '<label class="small muted row" style="flex-basis:100%"><input type="checkbox" id="ev-ref"> Already in my calendar (class, work). Keep for reference, leave out of the export.</label>' +
      '<label class="small muted row" style="flex-basis:100%">Repeat until (optional) <input type="date" id="ev-until"></label>' +
      '<button class="primary" type="submit">Add</button></form></div>' +
      '<div class="card"><h2>Export to calendar</h2><p class="small muted" style="margin:0 0 10px">Downloads an .ics file with every event for the chosen week, repeats included. Reference events are left out.</p>' +
      '<div class="row" style="flex-wrap:wrap"><select id="ics-week" aria-label="Week"><option value="0">This week</option><option value="1" selected>Next week</option><option value="2">In two weeks</option></select>' +
      '<button class="primary" data-act="exportics">Export week (.ics)</button></div><div class="small muted" id="ics-msg" style="margin-top:8px"></div></div></section>';
    return h;
  };

  views.meals = function () {
    var mon = mondayOf(new Date()), t = today();
    var h = '<section class="view"><div class="card"><h2>This week</h2><div class="meal-week">';
    for (var i = 0; i < 7; i++) {
      var ds = ymd(addDays(mon, i));
      h += '<div class="meal-day"><div class="dname' + (ds === t ? " today" : "") + '">' + DAYS[(i + 1) % 7].slice(0, 3) + '<div class="small muted">' + parse(ds).getDate() + '</div></div>';
      SLOTS.forEach(function (s) {
        var m = byId("meals", ds + "_" + s[0]);
        h += '<label>' + s[1] + '<input type="text" data-act="meal" data-key="' + ds + "_" + s[0] + '" data-date="' + ds + '" data-slot="' + s[0] + '" value="' + esc(m ? m.text : "") + '"></label>';
      });
      h += '</div>';
    }
    h += '</div></div><div class="card"><h2>Grocery list</h2>';
    var g = state.grocery.slice().sort(function (a, b) { return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.created || 0) - (b.created || 0); });
    h += g.length ? '<div class="list">' + g.map(function (x) {
      return '<div class="row"><button class="check' + (x.done ? " on" : "") + '" data-act="grocery" data-id="' + x.id + '" aria-label="Toggle ' + esc(x.text) + '" aria-pressed="' + !!x.done + '"></button><span class="grow"' + (x.done ? ' style="text-decoration:line-through;color:var(--muted)"' : "") + '>' + esc(x.text) + '</span><button class="ghost" data-act="delgrocery" data-id="' + x.id + '" aria-label="Remove ' + esc(x.text) + '">Remove</button></div>'; }).join("") + '</div>'
      : '<div class="empty">Your grocery list is empty.</div>';
    h += '<form class="add" id="f-grocery"><input type="text" id="gr-text" placeholder="Add an item" required><button class="primary" type="submit">Add</button>' +
      (g.some(function (x) { return x.done; }) ? '<button type="button" data-act="cleargrocery">Clear checked</button>' : "") + '</form></div></section>';
    return h;
  };

  views.goals = function () {
    var set = checkedSet(), t = today();
    var habits = state.goals.filter(function (g) { return g.kind === "habit"; });
    var targets = state.goals.filter(function (g) { return g.kind !== "habit"; });
    var h = '<section class="view"><div class="card"><h2>Daily habits</h2>';
    h += habits.length ? '<div class="list">' + habits.map(function (g) {
      var on = set[g.id + "_" + t], wc = weekCount(g.id, set);
      return '<div class="row"><button class="check' + (on ? " on" : "") + '" data-act="habit" data-id="' + g.id + '" aria-label="Mark ' + esc(g.title) + ' done today" aria-pressed="' + !!on + '"></button><div class="grow">' + esc(g.title) +
        '<div class="small muted">' + wc + ' of 7 days this week</div></div><span class="pill">' + streak(g.id, set) + ' day streak</span><button class="ghost" data-act="delgoal" data-id="' + g.id + '" aria-label="Delete ' + esc(g.title) + '">Delete</button></div>'; }).join("") + '</div>'
      : '<div class="empty">No habits yet.</div>';
    h += '<form class="add" id="f-habit" data-label="New habit"><input type="text" id="hb-title" placeholder="New daily habit" required><button class="primary" type="submit">Add habit</button></form></div>';
    h += '<div class="card"><h2>Goals</h2>';
    h += targets.length ? '<div class="list">' + targets.map(function (g) {
      var p = +g.progress || 0, late = g.due && g.due < t && p < 100;
      return '<div class="row" style="align-items:stretch;flex-direction:column;gap:6px"><div class="row"><div class="grow"><strong>' + esc(g.title) + '</strong>' +
        (g.due ? '<div class="small ' + (late ? "" : "muted") + '"' + (late ? ' style="color:var(--warn)"' : "") + '>Due ' + longDate(g.due) + '</div>' : "") + '</div><span class="pill' + (late ? " warn" : "") + '">' + p + '%</span>' +
        '<button class="ghost" data-act="delgoal" data-id="' + g.id + '" aria-label="Delete ' + esc(g.title) + '">Delete</button></div>' +
        '<div class="bar" aria-hidden="true"><i style="width:' + p + '%"></i></div>' +
        '<input type="range" min="0" max="100" step="5" value="' + p + '" data-act="progress" data-id="' + g.id + '" aria-label="Progress for ' + esc(g.title) + '" style="width:100%;accent-color:var(--accent)"></div>'; }).join("") + '</div>'
      : '<div class="empty">No goals yet. Add one with a due date to keep it in view.</div>';
    h += '<form class="add" id="f-goal" data-label="New goal"><input type="text" id="gl-title" placeholder="New goal" required><input type="date" id="gl-due" aria-label="Due date"><button class="primary" type="submit">Add goal</button></form></div></section>';
    return h;
  };

  function signoutRow() { return '<div class="row" style="justify-content:center"><button class="ghost" data-act="signout">Sign out</button></div>'; }

  views.faith = function () {
    var t = today(), rd = byId("readings", t) || {};
    var open = state.prayers.filter(function (p) { return p.status !== "answered"; });
    var ans = state.prayers.filter(function (p) { return p.status === "answered"; });
    var h = '<section class="view"><div class="card"><h2>Today\'s reading</h2><div class="row"><button class="check' + (rd.done ? " on" : "") + '" data-act="readdone" aria-label="Mark reading done" aria-pressed="' + !!rd.done + '"></button>' +
      '<input type="text" id="rd-ref" class="grow" placeholder="Passage, such as Psalm 23" value="' + esc(rd.reading || "") + '"></div>' +
      '<div style="margin-top:10px"><textarea id="rd-note" placeholder="What stood out? Notes and reflection">' + esc(rd.note || "") + '</textarea></div></div>';
    h += '<div class="card"><h2>Prayer list</h2>' + (open.length ? '<div class="list">' + open.map(function (p) {
      return '<div class="row"><div class="grow">' + esc(p.text) + '<div class="small muted">Since ' + longDate(p.date) + '</div></div><button data-act="answered" data-id="' + p.id + '">Answered</button><button class="ghost" data-act="delprayer" data-id="' + p.id + '" aria-label="Delete prayer">Delete</button></div>'; }).join("") + '</div>'
      : '<div class="empty">No open prayer requests.</div>') +
      '<form class="add" id="f-prayer" data-label="Add prayer request"><input type="text" id="pr-text" placeholder="Add a prayer request" required><button class="primary" type="submit">Add</button></form></div>';
    if (ans.length) h += '<div class="card"><h3>Answered (' + ans.length + ')</h3><div class="list">' + ans.map(function (p) {
      return '<div class="row"><span class="pill">Answered</span><span class="grow">' + esc(p.text) + '</span><button class="ghost" data-act="delprayer" data-id="' + p.id + '" aria-label="Delete prayer">Delete</button></div>'; }).join("") + '</div></div>';
    var done = state.readings.filter(function (r) { return r.done; }).length;
    h += '<div class="card"><h3>Reading days completed</h3><div class="stat">' + done + '</div></div></section>';
    return h;
  };

  function spark(points) {
    if (points.length < 2) return '<div class="empty">Log two or more weigh-ins to see a trend.</div>';
    var W = 320, H = 90, L = 30, vals = points.map(function (p) { return p.v; });
    var lo = Math.floor(Math.min.apply(null, vals) - 1), hi = Math.ceil(Math.max.apply(null, vals) + 1);
    var xs = function (i) { return L + (W - L - 8) * i / (points.length - 1); };
    var ys = function (v) { return 8 + (H - 22) * (1 - (v - lo) / (hi - lo)); };
    var d = points.map(function (p, i) { return (i ? "L" : "M") + xs(i).toFixed(1) + " " + ys(p.v).toFixed(1); }).join(" ");
    var last = points[points.length - 1];
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Weight trend, latest ' + last.v + '">' +
      '<line x1="' + L + '" x2="' + (W - 8) + '" y1="' + ys(hi) + '" y2="' + ys(hi) + '" stroke="var(--line)"/><line x1="' + L + '" x2="' + (W - 8) + '" y1="' + ys(lo) + '" y2="' + ys(lo) + '" stroke="var(--line)"/>' +
      '<text x="0" y="' + (ys(hi) + 3) + '">' + hi + '</text><text x="0" y="' + (ys(lo) + 3) + '">' + lo + '</text>' +
      '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="2"/><circle cx="' + xs(points.length - 1) + '" cy="' + ys(last.v) + '" r="4" fill="var(--accent)"/>' +
      '<text x="' + L + '" y="' + (H - 2) + '">' + points[0].d.slice(5) + '</text><text x="' + (W - 8) + '" y="' + (H - 2) + '" text-anchor="end">' + last.d.slice(5) + '</text></svg>';
  }

  function paceStr(mi, min) { if (!(mi > 0) || !(min > 0)) return ""; var sec = Math.round(min * 60 / mi); return Math.floor(sec / 60) + ":" + pad(sec % 60) + " /mi"; }
  function miles(w) { return w.type === "Run" ? (+w.miles || 0) : 0; }
  function weekBars(weeks) {
    var W = 320, H = 110, L = 28, mx = Math.max(5, Math.ceil(Math.max.apply(null, weeks.map(function (w) { return w.mi; })) / 5) * 5);
    var bw = (W - L - 6) / weeks.length, out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Weekly running mileage, last 8 weeks">';
    [0, mx / 2, mx].forEach(function (v) { var y = 8 + (H - 30) * (1 - v / mx); out += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + y + '" y2="' + y + '" stroke="var(--line)"/><text x="0" y="' + (y + 3) + '">' + v + '</text>'; });
    weeks.forEach(function (w, i) {
      var h = (H - 30) * w.mi / mx, x = L + i * bw + 4, y = 8 + (H - 30) - h;
      out += '<rect x="' + x + '" y="' + y + '" width="' + (bw - 8) + '" height="' + Math.max(h, 0) + '" rx="3" fill="' + (i === weeks.length - 1 ? "var(--accent)" : "var(--accent-soft)") + '" stroke="var(--accent)" stroke-width="1"/>';
      out += '<text x="' + (x + (bw - 8) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + w.label + '</text>';
    });
    return out + '</svg>';
  }

  views.fitness = function () {
    var t = today(), mon = mondayOf(new Date()), monS = ymd(mon);
    var st = byId("settings", "fitness") || {}, goal = +st.weeklyMiles || 20;
    var runs = state.workouts.filter(function (w) { return w.type === "Run"; });
    var wkRuns = runs.filter(function (w) { return w.date >= monS; });
    var mi = wkRuns.reduce(function (a, w) { return a + miles(w); }, 0), mins = wkRuns.reduce(function (a, w) { return a + (+w.minutes || 0); }, 0);
    var other = state.workouts.filter(function (w) { return w.type !== "Run" && w.date >= monS; }).length;
    var weeks = [];
    for (var k = 7; k >= 0; k--) {
      var s0 = ymd(addDays(mon, -7 * k)), s1 = ymd(addDays(mon, -7 * k + 7));
      weeks.push({ label: parse(s0).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
        mi: runs.filter(function (w) { return w.date >= s0 && w.date < s1; }).reduce(function (a, w) { return a + miles(w); }, 0) });
    }
    var longest = runs.reduce(function (a, w) { return Math.max(a, miles(w)); }, 0);
    var bestPace = runs.filter(function (w) { return miles(w) >= 1 && +w.minutes > 0; }).reduce(function (a, w) { var p = w.minutes / w.miles; return a === null || p < a ? p : a; }, null);
    var recent = state.workouts.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).slice(0, 12);
    var wts = state.weights.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(-30).map(function (w) { return { d: w.date, v: +w.value }; });
    var h = '<section class="view"><div class="card"><h2>Running this week</h2><div class="row" style="gap:22px;align-items:flex-end;flex-wrap:wrap"><div><div class="stat">' + (Math.round(mi * 10) / 10) + '<span class="muted" style="font-size:18px"> / ' + goal + ' mi</span></div><div class="small muted">weekly mileage</div></div>' +
      '<div><div class="stat">' + wkRuns.length + '</div><div class="small muted">runs</div></div><div><div class="stat">' + (paceStr(mi, mins) ? paceStr(mi, mins).replace(" /mi", "") : "–") + '</div><div class="small muted">avg pace /mi</div></div>' + (other ? '<div><div class="stat">' + other + '</div><div class="small muted">other sessions</div></div>' : "") + '</div>' +
      '<div class="bar" style="margin:12px 0 8px" aria-hidden="true"><i style="width:' + Math.min(100, Math.round(100 * mi / goal)) + '%"></i></div>' +
      '<label class="small muted">Weekly mileage goal <input type="number" id="ft-miles" min="1" max="200" value="' + goal + '" style="width:72px;margin-left:6px"> mi</label></div>';
    h += '<div class="card"><h2>Mileage by week</h2>' + weekBars(weeks) + '<div class="row small muted" style="gap:18px;flex-wrap:wrap;margin-top:6px"><span>Longest run: <strong>' + (longest ? (Math.round(longest * 10) / 10) + " mi" : "–") + '</strong></span><span>Best pace: <strong>' + (bestPace ? paceStr(1, bestPace) : "–") + '</strong></span></div></div>';
    h += '<div class="card"><form class="add" id="f-workout" data-label="Log a workout" style="margin-top:0"><input type="date" id="wk-date" value="' + t + '" required>' +
      '<select id="wk-type" aria-label="Type"><option>Run</option><option>Strength</option><option>Cross-train</option><option>Mobility</option><option>Other</option></select>' +
      '<select id="wk-kind" aria-label="Run type"><option>Easy</option><option>Long</option><option>Tempo</option><option>Intervals</option><option>Race</option></select>' +
      '<input type="number" id="wk-mi" min="0" step="0.01" placeholder="Miles" style="width:88px"><input type="number" id="wk-min" min="1" step="0.1" placeholder="Minutes" style="width:96px">' +
      '<input type="text" id="wk-note" placeholder="Notes: route, splits, how it felt"><button class="primary" type="submit">Log</button></form></div>';
    h += '<div class="card"><h2>Recent workouts</h2>' + (recent.length ? '<div class="list">' + recent.map(function (w) {
      var run = w.type === "Run", pc = run ? paceStr(+w.miles, +w.minutes) : "";
      return '<div class="row"><span class="time" style="width:64px">' + parse(w.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + '</span><div class="grow"><strong>' + (run ? (w.kind || "Run") + " run" : esc(w.type)) + '</strong>' +
        (run && +w.miles ? ' · ' + (Math.round(w.miles * 100) / 100) + ' mi' : "") + (w.minutes ? ' · ' + esc(w.minutes) + ' min' : "") + (pc ? ' · ' + pc : "") +
        (w.note ? '<div class="small muted">' + esc(w.note) + '</div>' : "") + '</div><button class="ghost" data-act="delworkout" data-id="' + w.id + '" aria-label="Delete workout">Delete</button></div>'; }).join("") + '</div>'
      : '<div class="empty">No workouts logged yet. Your first run starts the chart.</div>') + '</div>';
    h += '<div class="card"><h2>Body weight</h2>' + spark(wts) + '<form class="add" id="f-weight" data-label="Log weight"><input type="date" id="bw-date" value="' + t + '" required><input type="number" id="bw-val" step="0.1" min="1" placeholder="Weight" required style="width:110px"><button class="primary" type="submit">Add</button></form></div></section>';
    return h;
  };

  /* ---------- render + routing ---------- */
  var view = document.getElementById("view");
  function current() { var h = location.hash.replace("#", ""); return views[h] ? h : "today"; }
  function typing() { var a = document.activeElement; return a && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "range"; }
  function render(force) {
    if (!force && typing()) { pending = true; return; }
    pending = false;
    var tab = current();
    document.getElementById("tabs").innerHTML = TABS.map(function (t) {
      return '<a href="#' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : "") + '>' + t[1] + '</a>'; }).join("");
    view.innerHTML = views[tab]();
    hero(tab);
    Array.prototype.forEach.call(view.querySelectorAll("form.add[data-label]"), function (f) {
      var d = document.createElement("details"); d.className = "adder"; if (openForms[f.id]) d.open = true;
      var sm = document.createElement("summary"); sm.textContent = f.dataset.label;
      f.parentNode.insertBefore(d, f); d.appendChild(sm); d.appendChild(f);
    });
  }
  var openForms = {};
  view.addEventListener("toggle", function (ev) { var f = ev.target.querySelector && ev.target.querySelector("form.add"); if (f) openForms[f.id] = ev.target.open; }, true);
  function hero(tab) {
    var now = new Date(), hr = now.getHours(), dstr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    var title = { today: hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening", schedule: "Schedule", meals: "Meals", goals: "Goals", faith: "Faith", fitness: "Running & fitness" }[tab];
    var sub = dstr;
    if (tab === "today") {
      var t = today(), set = checkedSet(), habits = state.goals.filter(function (g) { return g.kind === "habit"; });
      var done = habits.filter(function (g) { return set[g.id + "_" + t]; }).length;
      var parts = [eventsOn(t).length + " on the calendar"];
      if (habits.length) parts.push(done + " of " + habits.length + " habits");
      sub = dstr + " · " + parts.join(" · ");
    }
    document.getElementById("hero-title").textContent = title;
    document.getElementById("hero-sub").textContent = sub;
  }
  function schedule() { if (!scheduled) { scheduled = true; setTimeout(function () { scheduled = false; render(false); }, 30); } }
  var scheduled = false;
  setInterval(function () { if (current() === "today" && !document.hidden) render(false); }, 60000);
  window.addEventListener("hashchange", function () { render(true); window.scrollTo(0, 0); });
  view.addEventListener("focusout", function () { setTimeout(function () { if (pending && !typing()) render(false); }, 120); });

  /* ---------- actions ---------- */
  function val(id) { var e = document.getElementById(id); return e ? e.value.trim() : ""; }
  view.addEventListener("submit", function (ev) {
    ev.preventDefault(); var id = ev.target.id, t = today();
    if (id === "f-event") save("events", newId(), { title: val("ev-title"), date: val("ev-date"), time: val("ev-time"), end: val("ev-end"), place: val("ev-place"), until: val("ev-until"), repeat: val("ev-repeat"), ref: !!document.getElementById("ev-ref").checked });
    if (id === "f-grocery") save("grocery", newId(), { text: val("gr-text"), done: false, created: Date.now() });
    if (id === "f-habit") save("goals", newId(), { title: val("hb-title"), kind: "habit", created: Date.now() });
    if (id === "f-goal") save("goals", newId(), { title: val("gl-title"), kind: "goal", due: val("gl-due"), progress: 0, created: Date.now() });
    if (id === "f-prayer") save("prayers", newId(), { text: val("pr-text"), status: "open", date: t });
    if (id === "f-workout") save("workouts", newId(), { date: val("wk-date"), type: val("wk-type"), kind: val("wk-type") === "Run" ? val("wk-kind") : "", miles: +val("wk-mi") || 0, minutes: val("wk-min"), note: val("wk-note") });
    if (id === "f-weight") save("weights", val("bw-date"), { date: val("bw-date"), value: +val("bw-val") });
    document.activeElement && document.activeElement.blur();
    ev.target.reset && ev.target.reset();
  });
  view.addEventListener("change", function (ev) {
    var el = ev.target, act = el.dataset && el.dataset.act, t = today();
    if (act === "meal") save("meals", el.dataset.key, { date: el.dataset.date, slot: el.dataset.slot, text: el.value.trim() });
    if (act === "progress") { var g = byId("goals", el.dataset.id); if (g) save("goals", g.id, Object.assign({}, g, { id: undefined, progress: +el.value })); }
    if (el.id === "ft-miles") save("settings", "fitness", { weeklyMiles: Math.max(1, Math.min(200, +el.value || 20)) });
    if (el.id === "rd-ref" || el.id === "rd-note") {
      var cur = byId("readings", t) || {};
      save("readings", t, { date: t, reading: val("rd-ref"), note: document.getElementById("rd-note").value.trim(), done: !!cur.done });
    }
  });
  view.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-act]"); if (!b || b.tagName === "INPUT") return;
    var act = b.dataset.act, id = b.dataset.id, t = today();
    if (act === "habit") { var k = id + "_" + t; checkedSet()[k] ? del("checkins", k) : save("checkins", k, { goalId: id, date: t }); }
    if (act === "signout") { signOut(); return; }
    if (act === "delev") del("events", id);
    if (act === "exportics") exportIcs();
    if (act === "delgoal") { del("goals", id); }
    if (act === "grocery") { var x = byId("grocery", id); if (x) save("grocery", id, { text: x.text, done: !x.done, created: x.created }); }
    if (act === "delgrocery") del("grocery", id);
    if (act === "cleargrocery") state.grocery.filter(function (x) { return x.done; }).forEach(function (x) { del("grocery", x.id); });
    if (act === "answered") { var p = byId("prayers", id); if (p) save("prayers", id, { text: p.text, date: p.date, status: "answered" }); }
    if (act === "delprayer") del("prayers", id);
    if (act === "delworkout") del("workouts", id);
    if (act === "readdone") {
      var r = byId("readings", t) || {};
      var rr = document.getElementById("rd-ref"), nn = document.getElementById("rd-note");
      save("readings", t, { date: t, reading: rr ? rr.value.trim() : r.reading || "", note: nn ? nn.value.trim() : r.note || "", done: !r.done });
    }
  });

  /* ---------- ICS export ---------- */
  function icsText(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function exportIcs() {
    var msg = document.getElementById("ics-msg"), off = +document.getElementById("ics-week").value;
    var start = addDays(mondayOf(new Date()), 7 * off), L = [], n = 0;
    var stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    L.push("BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Homebase//Weekly export//EN", "CALSCALE:GREGORIAN");
    for (var i = 0; i < 7; i++) {
      var day = addDays(start, i), ds = ymd(day), dc = ds.replace(/-/g, "");
      eventsOn(ds).filter(function (e) { return !e.ref; }).forEach(function (e) {
        n++; L.push("BEGIN:VEVENT", "UID:" + e.id + "-" + dc + "@homebase", "DTSTAMP:" + stamp, "SUMMARY:" + icsText(e.title));
        if (e.place) L.push("LOCATION:" + icsText(e.place));
        if (e.time) {
          var p = e.time.split(":");
          var q = e.end && e.end > e.time ? e.end.split(":") : [pad((+p[0] + 1) % 24), p[1]];
          L.push("DTSTART:" + dc + "T" + p[0] + p[1] + "00", "DTEND:" + dc + "T" + q[0] + q[1] + "00");
        } else {
          L.push("DTSTART;VALUE=DATE:" + dc, "DTEND;VALUE=DATE:" + ymd(addDays(day, 1)).replace(/-/g, ""));
        }
        L.push("END:VEVENT");
      });
    }
    L.push("END:VCALENDAR");
    if (!n) { msg.textContent = "No exportable events that week. Reference events are left out."; return; }
    var text = L.join("\r\n") + "\r\n", fname = "homebase-week-" + ymd(start) + ".ics";
    var done = function () { msg.textContent = n + " event" + (n === 1 ? "" : "s") + " exported."; };
    var download = function () {
      var url = URL.createObjectURL(new Blob([text], { type: "text/calendar" })), a = document.createElement("a");
      a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000); done();
    };
    try {
      var file = new File([text], fname, { type: "text/calendar" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: "Homebase week" }).then(done).catch(function (e) { if (!e || e.name !== "AbortError") download(); });
        return;
      }
    } catch (e) {}
    download();
  }

  /* ---------- data: local-first with Supabase sync ---------- */
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
  function enqueue(q) {
    queue = queue.filter(function (x) { return !(x.c === q.c && x.id === q.id); });
    queue.push(q); persist(); schedule(); return flush();
  }
  function save(c, id, data) { var d = Object.assign({}, data); delete d.id; localSet(c, id, d); return enqueue({ op: "set", c: c, id: id, data: d }); }
  function del(c, id) { localDel(c, id); return enqueue({ op: "del", c: c, id: id }); }
  function netError(r) { return r.status === 0 || /fetch|network|load failed/i.test(r.error.message || ""); }
  function setStatus() {
    var n = document.getElementById("notice");
    if (!navigator.onLine) n.innerHTML = '<div class="notice">Offline. Your changes are saved on this device and will sync when you reconnect.</div>';
    else if (queue.length) n.innerHTML = '<div class="notice">Syncing ' + queue.length + ' change' + (queue.length === 1 ? "" : "s") + '…</div>';
    else n.innerHTML = "";
  }
  function flush() {
    if (!sb || !session || flushing || !navigator.onLine) { setStatus(); return Promise.resolve(); }
    flushing = true;
    return (async function () {
      while (queue.length) {
        var q = queue[0], r;
        if (q.op === "set") r = await sb.from("items").upsert({ user_id: uid, collection: q.c, id: q.id, data: q.data }, { onConflict: "user_id,collection,id" });
        else r = await sb.from("items").delete().eq("collection", q.c).eq("id", q.id);
        if (r.error) { if (netError(r)) break; fail(r.error); }
        queue.shift(); persist();
      }
    })().catch(function () {}).then(function () { flushing = false; setStatus(); if (!queue.length) pull(); });
  }
  function pull() {
    if (!sb || !session || !navigator.onLine || queue.length) return Promise.resolve();
    return sb.from("items").select("collection,id,data").limit(10000).then(function (r) {
      if (r.error) { if (!netError(r)) fail(r.error); return; }
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
  function showLogin(msg) {
    document.getElementById("appwrap").hidden = true; document.getElementById("tabbar").hidden = true;
    document.getElementById("login").hidden = false;
    document.getElementById("login-msg").textContent = msg || "";
  }
  function showApp() {
    document.getElementById("appwrap").hidden = false; document.getElementById("tabbar").hidden = false;
    document.getElementById("login").hidden = true; render(true);
  }
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
  document.getElementById("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = document.getElementById("lg-email").value.trim(), pw = document.getElementById("lg-pw").value;
    var up = ev.submitter && ev.submitter.dataset.mode === "signup";
    document.getElementById("login-msg").textContent = up ? "Creating account…" : "Signing in…";
    (up ? sb.auth.signUp({ email: email, password: pw }) : sb.auth.signInWithPassword({ email: email, password: pw })).then(function (r) {
      if (r.error) { document.getElementById("login-msg").textContent = r.error.message; return; }
      if (!r.data.session) document.getElementById("login-msg").textContent = "Check your email to confirm your account, then sign in.";
    });
  });
  window.addEventListener("online", function () { setStatus(); flush(); pull(); });
  window.addEventListener("offline", setStatus);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { flush(); pull(); render(false); } });

  if (!window.supabase || !CFG) { showLogin("Could not load the sync library. Check your connection and reload."); }
  else {
    sb = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true } });
    sb.auth.onAuthStateChange(function (ev, s) {
      if (s && (!session || session.user.id !== s.user.id)) { session = s; start(); }
      else if (s) session = s;
      else if (session && ev === "SIGNED_OUT") { session = null; }
    });
    sb.auth.getSession().then(function (r) {
      session = r.data.session;
      if (session) { if (!booted) start(); return; }
      var last = lsGet("hb-last-uid");
      if (last && !navigator.onLine && loadCache(last)) { uid = last; booted = true; showApp(); setStatus(); }
      else showLogin("");
    });
  }
})();
