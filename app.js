/* LDB Budget. The page itself is public; every number lives in Supabase behind Row Level Security,
   which only lets in signed-in people whose email is on the members list (see setup.sql).
   The publishable key below is meant to be public: on its own it can read nothing. */
(function () {
  'use strict';
  var CFG = { url: 'https://hsuctliooiqsgjgtsqip.supabase.co', key: 'sb_publishable_WwN7eQxCNX2OCwQweO_b_g_lzvi_hrb' };
  var DEMO = /[?&]demo\b/.test(location.search);
  var PALETTE = ['#7FD1A8', '#6FB7E8', '#F29CB0', '#B79CF0', '#7ED9D2', '#E58C8C', '#C9A2E0', '#9BC48A', '#8FA8F0', '#A3B8C8', '#F0A27A', '#5FC4B8'];

  var $ = function (id) { return document.getElementById(id); };
  var S = { me: '', members: [], categories: [], tx: [], recurring: [], goals: [], month: firstOfMonth(new Date()), started: false };
  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  var money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmt(n) { return money.format(n || 0); }
  function fmt0(n) { return money0.format(Math.round(n || 0)); }
  function num(v) { return Math.round(parseFloat(v) * 100) / 100; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysIn(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
  function shortDate(s) { return parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function dayLabel(s) { var d = parse(s), t = today(), diff = Math.round((d - t) / 864e5); if (diff === 0) return 'Today'; if (diff === -1) return 'Yesterday'; return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function catById(id) { for (var i = 0; i < S.categories.length; i++) if (S.categories[i].id === id) return S.categories[i]; return null; }
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2400); }
  function isOwner() { return S.members.some(function (m) { return m.email === S.me && m.role === 'owner'; }); }
  function initials(email) { return (email || '?').charAt(0).toUpperCase(); }

  /* ---------------- data: Supabase, or an in-memory demo ---------------- */
  var sb = null, DB;
  if (DEMO) DB = demoDB();
  else {
    sb = window.supabase && window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
    DB = {
      list: function (t, o) {
        var q = sb.from(t).select('*');
        if (o && o.from) q = q.gte('date', o.from).lt('date', o.to);
        if (o && o.order) q = q.order(o.order, { ascending: !o.desc });
        return q.then(ok);
      },
      ins: function (t, row) { return sb.from(t).insert(row).select().then(ok); },
      upd: function (t, id, patch) { return sb.from(t).update(patch).eq('id', id).select().then(ok); },
      del: function (t, id, col) { return sb.from(t).delete().eq(col || 'id', id).then(ok); }
    };
  }
  function ok(r) { if (r.error) throw r.error; return r.data; }

  function monthRange() { var a = S.month, b = new Date(a.getFullYear(), a.getMonth() + 1, 1); return { from: iso(a), to: iso(b) }; }
  function loadAll() {
    var r = monthRange();
    return Promise.all([
      DB.list('members', { order: 'added_at' }), DB.list('categories', { order: 'sort' }),
      DB.list('transactions', { from: r.from, to: r.to, order: 'date', desc: true }),
      DB.list('recurring', { order: 'next_date' }), DB.list('goals', { order: 'created_at' })
    ]).then(function (a) {
      S.members = a[0]; S.categories = a[1]; S.tx = a[2].sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : y.id - x.id; }); S.recurring = a[3]; S.goals = a[4];
      renderAll();
    });
  }
  function reloadTx() {
    var r = monthRange();
    return DB.list('transactions', { from: r.from, to: r.to, order: 'date', desc: true }).then(function (rows) {
      S.tx = rows.sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : y.id - x.id; }); renderAll();
    });
  }
  function fail(e) { console.error(e); toast((e && e.message) ? 'Couldn’t save: ' + e.message : 'Something went wrong'); }

  /* ---------------- sign in ---------------- */
  function show(which) {
    ['gate', 'denied', 'loading', 'app'].forEach(function (id) { $(id).hidden = id !== which; });
    var inApp = which === 'app'; $('tabs').hidden = !inApp; $('hideBtn').hidden = !inApp; route();
  }
  function startFor(email) {
    if (S.started) return; S.started = true; S.me = (email || '').toLowerCase(); show('loading');
    DB.list('members').then(function (rows) {
      if (!rows.some(function (m) { return m.email === S.me; })) { S.started = false; $('deniedEmail').textContent = S.me; show('denied'); return; }
      return loadAll().then(function () { show('app'); live(); });
    }).catch(function (e) { S.started = false; console.error(e); $('gateErr').textContent = 'Couldn’t reach the budget: ' + (e.message || e) + '. If you just created the project, run setup.sql first.'; $('gateErr').hidden = false; show('gate'); });
  }
  function live() {
    if (!sb) return; var t;
    sb.channel('budget').on('postgres_changes', { event: '*', schema: 'public' }, function () { clearTimeout(t); t = setTimeout(function () { loadAll().catch(function () {}); }, 400); }).subscribe();
  }
  var pendingEmail = '';
  $('signin').addEventListener('submit', function (e) {
    e.preventDefault(); var email = $('email').value.trim().toLowerCase(); if (!email) return;
    var b = $('sendBtn'); b.disabled = true; b.textContent = 'Sending…'; $('gateErr').hidden = true;
    sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
      b.disabled = false; b.textContent = 'Email me a sign-in link';
      if (r.error) { $('gateErr').textContent = /rate|seconds/i.test(r.error.message) ? 'Too many emails just now. Wait a minute and try again.' : r.error.message; $('gateErr').hidden = false; return; }
      pendingEmail = email; $('sentTo').innerHTML = 'Check <b>' + esc(email) + '</b> and tap the link. It works once and expires after an hour.';
      $('signin').hidden = true; $('codeForm').hidden = false;
    });
  });
  $('codeForm').addEventListener('submit', function (e) {
    e.preventDefault(); var code = $('code').value.trim(); if (!code) return;
    sb.auth.verifyOtp({ email: pendingEmail, token: code, type: 'email' }).then(function (r) {
      if (r.error) { $('gateErr').textContent = 'That code didn’t work. Try the link in the email, or send a new one.'; $('gateErr').hidden = false; }
    });
  });
  $('backBtn').onclick = function () { $('signin').hidden = false; $('codeForm').hidden = true; $('gateErr').hidden = true; };
  document.querySelectorAll('[data-signout]').forEach(function (b) { b.onclick = function () { if (DEMO) { location.href = './'; return; } sb.auth.signOut().then(function () { location.reload(); }); }; });

  /* ---------------- tabs & month ---------------- */
  function route() {
    var tab = (location.hash || '#overview').slice(1); if (!document.querySelector('[data-view="' + tab + '"]')) tab = 'overview';
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.dataset.view !== tab; });
    document.querySelectorAll('#tabs a').forEach(function (a) { a.classList.toggle('on', a.dataset.tab === tab); });
    $('monthBox').hidden = $('app').hidden || !(tab === 'overview' || tab === 'transactions');
    if (tab === 'overview') requestAnimationFrame(drawPace);
  }
  addEventListener('hashchange', function () { route(); scrollTo(0, 0); });
  function setMonth(d) { S.month = firstOfMonth(d); $('monthLbl').textContent = S.month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  $('prevM').onclick = function () { setMonth(new Date(S.month.getFullYear(), S.month.getMonth() - 1, 1)); reloadTx().catch(fail); };
  $('nextM').onclick = function () { setMonth(new Date(S.month.getFullYear(), S.month.getMonth() + 1, 1)); reloadTx().catch(fail); };
  setMonth(S.month);
  try { if (localStorage.getItem('budget.hide') === '1') document.body.classList.add('hide'); } catch (e) {}
  $('hideBtn').onclick = function () { var h = document.body.classList.toggle('hide'); try { localStorage.setItem('budget.hide', h ? '1' : '0'); } catch (e) {} };
  $('themeBtn').onclick = function () { window.ldbToggleTheme(); };
  addEventListener('themechange', function () { drawPace(); });

  /* ---------------- render ---------------- */
  function sums() {
    var spent = 0, income = 0, byCat = {};
    S.tx.forEach(function (t) { var a = +t.amount; if (t.kind === 'income') income += a; else { spent += a; var k = t.category_id || 0; byCat[k] = (byCat[k] || 0) + a; } });
    var budget = S.categories.filter(function (c) { return c.kind === 'expense' && !c.archived; }).reduce(function (s, c) { return s + +c.budget; }, 0);
    return { spent: spent, income: income, byCat: byCat, budget: budget };
  }
  function renderAll() { renderOverview(); renderTx(); renderRec(); renderGoals(); renderSettings(); }

  function renderOverview() {
    var s = sums(), cur = iso(S.month) === iso(firstOfMonth(new Date())), nIn = S.tx.filter(function (t) { return t.kind === 'income'; }).length;
    $('tIncome').textContent = fmt(s.income); $('tIncomeSub').textContent = nIn ? nIn + (nIn === 1 ? ' deposit' : ' deposits') : 'Nothing logged yet';
    $('tSpent').textContent = fmt(s.spent); $('tSpentSub').textContent = s.budget ? Math.round(100 * s.spent / s.budget) + '% of ' + fmt0(s.budget) + ' budget' : 'No budgets set yet';
    if (s.budget) {
      var left = s.budget - s.spent; $('tLeft').textContent = fmt(left); $('tLeft').className = 'amt ' + (left < 0 ? 'neg' : '');
      var dl = daysIn(S.month) - today().getDate() + 1;
      $('tLeftSub').textContent = left < 0 ? 'Over budget' : cur ? fmt0(left / dl) + ' a day for ' + dl + (dl === 1 ? ' day' : ' days') : (S.month > today() ? 'Month hasn’t started' : 'Left unspent');
    } else { $('tLeft').textContent = '—'; $('tLeft').className = 'amt'; $('tLeftSub').innerHTML = '<a href="#settings" style="text-decoration:underline">Set budgets</a>'; }
    var net = s.income - s.spent; $('tNet').textContent = (net > 0 ? '+' : '') + fmt(net); $('tNet').className = 'amt ' + (net < 0 ? 'neg' : net > 0 ? 'pos' : '');
    $('tNetSub').textContent = s.income > 0 ? (net >= 0 ? 'Kept ' + Math.round(100 * net / s.income) + '% of income' : 'Spent more than came in') : 'Income minus spending';

    // category bars
    var rows = S.categories.filter(function (c) { return c.kind === 'expense' && (!c.archived || s.byCat[c.id]); }).map(function (c) { return { c: c, spent: s.byCat[c.id] || 0, budget: +c.budget }; });
    if (s.byCat[0]) rows.push({ c: { name: 'Uncategorized', color: '#A3B8C8' }, spent: s.byCat[0], budget: 0 });
    rows = rows.filter(function (r) { return r.spent > 0 || r.budget > 0; }).sort(function (a, b) { return (b.budget - a.budget) || (b.spent - a.spent); });
    $('cats').innerHTML = rows.length ? rows.map(function (r) {
      var over = r.budget > 0 && r.spent > r.budget, w = r.budget > 0 ? Math.min(100, 100 * r.spent / r.budget) : (r.spent ? 100 : 0);
      return '<div class="bar' + (over ? ' over' : '') + '"><div class="l"><b>' + esc(r.c.name) + '</b><span>' + fmt0(r.spent) + (r.budget ? ' of ' + fmt0(r.budget) : ' · no budget') + '</span></div><div class="track"><i style="width:' + w.toFixed(1) + '%;background:' + (over ? 'var(--neg)' : esc(r.c.color)) + ';opacity:' + (r.budget ? 1 : .45) + '"></i></div></div>';
    }).join('') : '<p class="empty">Set a monthly budget for your categories in Settings, then log what you spend.</p>';

    // coming up
    var t = today(), soon = new Date(t.getTime() + 30 * 864e5);
    var up = S.recurring.filter(function (r) { return r.active && parse(r.next_date) <= soon; }).sort(function (a, b) { return a.next_date < b.next_date ? -1 : 1; }).slice(0, 6);
    $('upcoming').innerHTML = up.length ? up.map(recRow).join('') : '<p class="empty">No bills due in the next 30 days.' + (S.recurring.length ? '' : ' Add them under Bills.') + '</p>';
    bindRec($('upcoming'));

    $('recent').innerHTML = S.tx.length ? S.tx.slice(0, 6).map(txRow).join('') : '<p class="empty">Nothing logged this month. Tap Add to log a purchase or a paycheck.</p>';
    bindTx($('recent'));
    var paceNote = '';
    if (s.budget && cur) { var exp = s.budget * today().getDate() / daysIn(S.month), d = s.spent - exp; paceNote = Math.abs(d) < 1 ? 'Right on pace' : fmt0(Math.abs(d)) + (d > 0 ? ' ahead of pace' : ' under pace'); }
    $('paceNote').textContent = paceNote;
    drawPace();
  }

  function drawPace() {
    var cv = $('pace'); if (!cv || cv.offsetParent === null) return;
    var css = getComputedStyle(document.documentElement), acc = css.getPropertyValue('--acc').trim(), t3 = css.getPropertyValue('--t3').trim(), ln = css.getPropertyValue('--ln').trim(), t2 = css.getPropertyValue('--t2').trim();
    var dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = 220; cv.width = W * dpr; cv.height = H * dpr; var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    var n = daysIn(S.month), s = sums(), cum = [], run = 0, byDay = {};
    S.tx.forEach(function (t) { if (t.kind !== 'income') { var d = parse(t.date).getDate(); byDay[d] = (byDay[d] || 0) + +t.amount; } });
    var cur = iso(S.month) === iso(firstOfMonth(new Date())), last = cur ? today().getDate() : (S.month > today() ? 0 : n);
    for (var d = 1; d <= last; d++) { run += byDay[d] || 0; cum.push(run); }
    var top = Math.max(s.budget, run, 1), mag = Math.pow(10, Math.floor(Math.log10(top / 3))), step = [1, 2, 2.5, 5, 10].map(function (k) { return k * mag; }).filter(function (v) { return v * 3 >= top; })[0] || mag * 10, maxY = step * 3 * 1.06, L = 52, R = 12, T = 12, B = 26, pw = W - L - R, ph = H - T - B;
    function X(d) { return L + (d - 1) / (n - 1) * pw; } function Y(v) { return T + ph - v / maxY * ph; }
    x.font = '11px "Geist Mono", ui-monospace, monospace'; x.fillStyle = t3; x.strokeStyle = ln; x.lineWidth = 1;
    for (var i = 0; i <= 3; i++) { var v = step * i, y = Math.round(Y(v)) + .5; x.beginPath(); x.moveTo(L, y); x.lineTo(W - R, y); x.stroke(); x.textAlign = 'right'; x.textBaseline = 'middle'; x.fillText(v >= 1000 ? '$' + (+(v / 1000).toFixed(1)) + 'k' : '$' + Math.round(v), L - 8, y); }
    x.textAlign = 'center'; x.textBaseline = 'top'; [1, 8, 15, 22, n].forEach(function (d) { x.fillText(String(d), X(d), H - B + 8); });
    if (s.budget) { x.setLineDash([4, 5]); x.strokeStyle = t3; x.beginPath(); x.moveTo(X(1), Y(0)); x.lineTo(X(n), Y(s.budget)); x.stroke(); x.setLineDash([]); }
    if (cum.length) {
      var g = x.createLinearGradient(0, T, 0, T + ph); g.addColorStop(0, acc + '55'); g.addColorStop(1, acc + '00');
      x.beginPath(); x.moveTo(X(1), Y(0)); cum.forEach(function (v, k) { x.lineTo(X(k + 1), Y(v)); }); x.lineTo(X(cum.length), Y(0)); x.closePath(); x.fillStyle = g; x.fill();
      x.beginPath(); cum.forEach(function (v, k) { if (k) x.lineTo(X(k + 1), Y(v)); else x.moveTo(X(1), Y(v)); }); x.strokeStyle = acc; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke();
      x.fillStyle = acc; x.beginPath(); x.arc(X(cum.length), Y(run), 3.5, 0, 7); x.fill();
    } else { x.fillStyle = t2; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '13px Manrope, sans-serif'; x.fillText(S.month > today() ? 'This month hasn’t started yet' : 'No spending logged', L + pw / 2, T + ph / 2); }
  }
  addEventListener('resize', function () { clearTimeout(drawPace.t); drawPace.t = setTimeout(drawPace, 120); });

  function txRow(t) {
    var c = catById(t.category_id), many = S.members.length > 1, inc = t.kind === 'income';
    return '<div class="it" data-tx="' + t.id + '"><i class="dot" style="background:' + esc(c ? c.color : '#A3B8C8') + '"></i><div class="tx"><b>' + esc(t.note || (c ? c.name : (inc ? 'Income' : 'Expense'))) + '</b><small>' + esc(c ? c.name : 'Uncategorized') + ' · ' + shortDate(t.date) + '</small></div>' + (many ? '<span class="who" title="' + esc(t.created_by) + '">' + esc(initials(t.created_by)) + '</span>' : '') + '<span class="am' + (inc ? ' in' : '') + '">' + (inc ? '+' : '−') + fmt(t.amount) + '</span></div>';
  }
  function bindTx(root) { root.querySelectorAll('[data-tx]').forEach(function (el) { el.onclick = function () { var id = +el.dataset.tx; txForm(S.tx.filter(function (t) { return t.id === id; })[0]); }; }); }

  function filteredTx() {
    var q = $('q').value.trim().toLowerCase(), fc = $('fcat').value;
    return S.tx.filter(function (t) { var c = catById(t.category_id); return (!fc || String(t.category_id || 0) === fc) && (!q || (t.note + ' ' + (c ? c.name : '')).toLowerCase().indexOf(q) >= 0); });
  }
  function renderTx() {
    var sel = $('fcat'), keep = sel.value;
    sel.innerHTML = '<option value="">All categories</option>' + S.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('') + '<option value="0">Uncategorized</option>';
    sel.value = keep;
    var rows = filteredTx(), html = '', last = '';
    rows.forEach(function (t) { if (t.date !== last) { html += '<div class="day">' + dayLabel(t.date) + '</div>'; last = t.date; } html += txRow(t); });
    $('txlist').innerHTML = html || '<p class="empty">' + (S.tx.length ? 'Nothing matches.' : 'No transactions this month.') + '</p>';
    bindTx($('txlist'));
  }
  $('q').oninput = renderTx; $('fcat').onchange = renderTx;
  $('csvBtn').onclick = function () {
    var rows = [['Date', 'Type', 'Amount', 'Category', 'Note', 'Added by']].concat(filteredTx().map(function (t) { var c = catById(t.category_id); return [t.date, t.kind, (+t.amount).toFixed(2), c ? c.name : '', t.note, t.created_by]; }));
    var csv = rows.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'budget-' + iso(S.month).slice(0, 7) + '.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };

  // bills
  function advance(s, cad) { var d = parse(s); if (cad === 'weekly') d.setDate(d.getDate() + 7); else if (cad === 'yearly') d.setFullYear(d.getFullYear() + 1); else { var day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1); d.setDate(Math.min(day, daysIn(d))); } return iso(d); }
  function dueText(s) { var diff = Math.round((parse(s) - today()) / 864e5); return diff < 0 ? '<span class="neg">' + (diff === -1 ? '1 day' : -diff + ' days') + ' overdue</span>' : diff === 0 ? 'due today' : 'due ' + shortDate(s) + (diff <= 14 ? ' · in ' + diff + (diff === 1 ? ' day' : ' days') : ''); }
  function recRow(r) {
    var c = catById(r.category_id), inc = r.kind === 'income';
    return '<div class="it" data-rec="' + r.id + '"><i class="dot" style="background:' + esc(c ? c.color : '#A3B8C8') + ';opacity:' + (r.active ? 1 : .35) + '"></i><div class="tx"><b>' + esc(r.name) + '</b><small>' + (r.active ? r.cadence.charAt(0).toUpperCase() + r.cadence.slice(1) + ' · ' + dueText(r.next_date) : 'Paused') + '</small></div><span class="am' + (inc ? ' in' : '') + '">' + fmt(r.amount) + '</span>' + (r.active ? '<button class="btn sm act" type="button" data-paid="' + r.id + '">' + (inc ? 'Received' : 'Paid') + '</button>' : '') + '</div>';
  }
  function bindRec(root) {
    root.querySelectorAll('[data-rec]').forEach(function (el) { el.onclick = function (e) { if (e.target.closest('[data-paid]')) return; var id = +el.dataset.rec; recForm(S.recurring.filter(function (r) { return r.id === id; })[0]); }; });
    root.querySelectorAll('[data-paid]').forEach(function (b) { b.onclick = function () { var id = +b.dataset.paid; markPaid(S.recurring.filter(function (r) { return r.id === id; })[0]); }; });
  }
  function markPaid(r) {
    if (!r) return;
    var inc = r.kind === 'income', c = catById(r.category_id), due = r.next_date, t = iso(today());
    openForm((inc ? 'Received ' : 'Paid ') + r.name + '?',
      '<p class="mut" style="margin:0">This logs ' + (inc ? 'an income' : 'a payment') + (c ? ' under ' + esc(c.name) : '') + ' and moves the next due date from <b>' + shortDate(due) + '</b> to <b>' + shortDate(advance(due, r.cadence)) + '</b>. Change the amount if this one was different.</p>' +
      '<div class="money amtbig"><input name="amount" inputmode="decimal" value="' + (+r.amount).toFixed(2) + '" aria-label="Amount"></div>' +
      '<label class="fld"><span>' + (inc ? 'Received on' : 'Paid on') + '</span><input type="date" name="date" value="' + (due < t ? due : t) + '"></label>',
      function () {
        var a = amountOk(val('amount')); if (a == null) return null; if (!val('date')) { formErr('Pick a date.'); return null; }
        return DB.ins('transactions', { date: val('date'), kind: r.kind, amount: a, category_id: r.category_id, note: r.name })
          .then(function () { return DB.upd('recurring', r.id, { next_date: advance(due, r.cadence) }); })
          .then(function () { toast('Logged ' + r.name + ' · ' + fmt(a)); });
      }, null, inc ? 'Confirm received' : 'Confirm paid');
  }
  function renderRec() {
    var monthly = S.recurring.filter(function (r) { return r.active && r.kind === 'expense'; }).reduce(function (s, r) { return s + +r.amount * (r.cadence === 'weekly' ? 52 / 12 : r.cadence === 'yearly' ? 1 / 12 : 1); }, 0);
    $('recTotal').textContent = S.recurring.length ? 'About ' + fmt0(monthly) + ' a month in bills and subscriptions. Tap Paid when one goes out to confirm it: it logs the payment and moves the due date on.' : '';
    var list = S.recurring.slice().sort(function (a, b) { return (b.active - a.active) || (a.next_date < b.next_date ? -1 : 1); });
    $('reclist').innerHTML = list.length ? list.map(recRow).join('') : '<p class="empty">Add rent, phone, streaming and other bills that repeat. You’ll see them coming up on the overview.</p>';
    bindRec($('reclist'));
  }

  // goals
  function renderGoals() {
    $('goallist').innerHTML = S.goals.length ? S.goals.map(function (g) {
      var p = Math.min(100, 100 * g.saved / g.target), left = Math.max(0, g.target - g.saved), extra = '';
      if (g.deadline && left > 0) { var m = (parse(g.deadline).getFullYear() - today().getFullYear()) * 12 + parse(g.deadline).getMonth() - today().getMonth(); extra = m > 0 ? ' · ' + fmt0(left / m) + '/mo to hit it by ' + parse(g.deadline).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ' · deadline passed'; }
      return '<div class="card goal" data-goal="' + g.id + '"><h2>' + esc(g.name) + '</h2><div class="big">' + fmt0(g.saved) + '</div><small class="mut">of ' + fmt0(g.target) + '</small><div class="track"><i style="width:' + p.toFixed(1) + '%;background:var(--acc)"></i></div><small class="mut">' + (left > 0 ? Math.round(p) + '% · ' + fmt0(left) + ' to go' + extra : 'Reached') + '</small></div>';
    }).join('') : '<div class="card"><p class="empty">Add something you’re saving for: an emergency fund, a trip, a car.</p></div>';
    document.querySelectorAll('[data-goal]').forEach(function (el) { el.onclick = function () { var id = +el.dataset.goal; goalForm(S.goals.filter(function (g) { return g.id === id; })[0]); }; });
  }

  // settings
  function renderSettings() {
    $('meEmail').textContent = S.me;
    var cats = S.categories.filter(function (c) { return !c.archived; });
    $('catlist').innerHTML = '<div class="crow head"><span></span><span>Name</span><span class="k">Type</span><span>Monthly</span><span></span></div>' + cats.map(function (c) {
      return '<div class="crow" data-cat="' + c.id + '"><input type="color" value="' + esc(c.color) + '" aria-label="Colour"><input value="' + esc(c.name) + '" data-f="name" aria-label="Name" maxlength="60"><span class="k">' + c.kind + '</span><div class="money"><input inputmode="decimal" data-f="budget" aria-label="Monthly ' + (c.kind === 'income' ? 'expected' : 'budget') + '" value="' + (+c.budget ? (+c.budget).toFixed(2).replace(/\.00$/, '') : '') + '" placeholder="0"></div><button class="ib" type="button" data-arch aria-label="Remove ' + esc(c.name) + '" title="Remove"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>';
    }).join('');
    $('catlist').querySelectorAll('[data-cat]').forEach(function (row) {
      var id = +row.dataset.cat;
      row.querySelector('[data-f="name"]').onchange = function () { var v = this.value.trim(); if (v) DB.upd('categories', id, { name: v }).then(loadAll).catch(fail); };
      row.querySelector('[data-f="budget"]').onchange = function () { var v = this.value.trim() === '' ? 0 : num(this.value.replace(/[$,]/g, '')); if (isNaN(v) || v < 0) { toast('Enter a number'); return; } DB.upd('categories', id, { budget: v }).then(function () { toast('Saved'); return loadAll(); }).catch(fail); };
      row.querySelector('input[type=color]').onchange = function () { DB.upd('categories', id, { color: this.value }).then(loadAll).catch(fail); };
      row.querySelector('[data-arch]').onclick = function () { if (confirmBox('Remove this category? Past transactions keep it in their history.')) DB.upd('categories', id, { archived: true }).then(loadAll).catch(fail); };
    });
    var own = isOwner();
    $('memlist').innerHTML = S.members.map(function (m) {
      return '<div class="it" style="cursor:default"><span class="who">' + esc(initials(m.email)) + '</span><div class="tx"><b>' + esc(m.email) + (m.email === S.me ? ' <span class="mut sm">(you)</span>' : '') + '</b><small>' + (m.role === 'owner' ? 'Owner' : 'Can view and edit') + '</small></div>' + (own && m.email !== S.me ? '<button class="btn sm danger" type="button" data-rm="' + esc(m.email) + '">Remove</button>' : '') + '</div>';
    }).join('');
    $('memlist').querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { var e = b.dataset.rm; if (confirmBox('Remove ' + e + '? They lose access straight away.')) DB.del('members', e, 'email').then(function () { toast('Removed ' + e); return loadAll(); }).catch(fail); }; });
    $('invite').hidden = !own;
    $('invNote').textContent = own ? 'Invited people sign in on this page with that email and can view and edit everything. Removing someone cuts off access straight away.' : 'Only the owner can invite or remove people.';
  }
  function confirmBox(m) { return window.confirm(m); }
  $('invite').addEventListener('submit', function (e) {
    e.preventDefault(); var em = $('invEmail').value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast('Enter a valid email'); return; }
    DB.ins('members', { email: em, role: 'member' }).then(function () { $('invEmail').value = ''; toast('Invited ' + em); return loadAll(); }).catch(function (er) { fail(/duplicate|unique/i.test(er.message || '') ? { message: 'already invited' } : er); });
  });

  /* ---------------- forms ---------------- */
  var formState = null;
  function catOptions(kind, sel) { return '<option value="">Uncategorized</option>' + S.categories.filter(function (c) { return c.kind === kind && (!c.archived || c.id === sel); }).map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join(''); }
  function seg(name, val, a, b) { return '<div class="seg"><label><input type="radio" name="' + name + '" value="' + a[0] + '"' + (val === a[0] ? ' checked' : '') + '>' + a[1] + '</label><label><input type="radio" name="' + name + '" value="' + b[0] + '"' + (val === b[0] ? ' checked' : '') + '>' + b[1] + '</label></div>'; }
  function openForm(title, html, onSave, onDelete, saveLabel) {
    formState = { onSave: onSave, onDelete: onDelete }; $('saveBtn').textContent = saveLabel || 'Save'; $('formTitle').textContent = title; $('formBody').innerHTML = html; $('formErr').hidden = true;
    $('delBtn').hidden = !onDelete; $('saveBtn').disabled = false; $('sheet').hidden = false;
    var f = $('formBody').querySelector('[autofocus]'); if (f && matchMedia('(pointer:fine)').matches) f.focus();
  }
  function closeForm() { $('sheet').hidden = true; formState = null; }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = closeForm; });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('sheet').hidden) closeForm(); });
  function formErr(m) { $('formErr').textContent = m; $('formErr').hidden = false; }
  function val(n) { var el = $('form').elements[n]; return el ? (el.value !== undefined ? el.value : '') : ''; }
  $('form').addEventListener('submit', function (e) {
    e.preventDefault(); if (!formState) return; var r = formState.onSave(); if (!r) return;
    $('saveBtn').disabled = true; r.then(function () { closeForm(); return loadAll(); }).catch(function (er) { $('saveBtn').disabled = false; formErr(er.message || 'Couldn’t save'); });
  });
  $('delBtn').onclick = function () { if (!formState || !formState.onDelete || !confirmBox('Delete this? This can’t be undone.')) return; formState.onDelete().then(function () { closeForm(); return loadAll(); }).catch(function (er) { formErr(er.message || 'Couldn’t delete'); }); };
  function amountOk(v, label) { var n = num(String(v).replace(/[$,]/g, '')); if (!(n > 0)) { formErr('Enter ' + (label || 'an amount') + ' above $0.'); return null; } return n; }

  function txForm(t) {
    var kind = t ? t.kind : 'expense', d = t ? t.date : (iso(S.month) === iso(firstOfMonth(new Date())) ? iso(today()) : iso(S.month));
    openForm(t ? 'Edit transaction' : 'Add transaction',
      seg('kind', kind, ['expense', 'Expense'], ['income', 'Income']) +
      '<div class="money amtbig"><input name="amount" inputmode="decimal" placeholder="0.00" autofocus value="' + (t ? (+t.amount).toFixed(2) : '') + '" aria-label="Amount"></div>' +
      '<div class="two"><label class="fld"><span>Date</span><input type="date" name="date" value="' + d + '" required></label><label class="fld"><span>Category</span><select name="category">' + catOptions(kind, t ? t.category_id : null) + '</select></label></div>' +
      '<label class="fld"><span>Note</span><input name="note" maxlength="200" placeholder="' + (kind === 'income' ? 'e.g. paycheck' : 'e.g. groceries at Costco') + '" value="' + esc(t ? t.note : '') + '"></label>',
      function () {
        var a = amountOk(val('amount')); if (a == null) return null; if (!val('date')) { formErr('Pick a date.'); return null; }
        var row = { kind: val('kind'), amount: a, date: val('date'), category_id: val('category') ? +val('category') : null, note: val('note').trim() };
        return t ? DB.upd('transactions', t.id, row) : DB.ins('transactions', row).then(function (x) { toast((row.kind === 'income' ? 'Added +' : 'Logged ') + fmt(a)); if (row.date.slice(0, 7) !== iso(S.month).slice(0, 7)) setMonth(parse(row.date)); return x; });
      }, t ? function () { return DB.del('transactions', t.id); } : null);
    $('formBody').querySelectorAll('input[name=kind]').forEach(function (r) { r.onchange = function () { $('form').elements.category.innerHTML = catOptions(r.value, null); }; });
  }
  $('fab').onclick = function () { txForm(null); };

  function recForm(r) {
    var kind = r ? r.kind : 'expense';
    openForm(r ? 'Edit bill' : 'Add a bill or subscription',
      seg('kind', kind, ['expense', 'Bill'], ['income', 'Income']) +
      '<label class="fld"><span>Name</span><input name="name" maxlength="60" placeholder="e.g. Rent, Spotify, phone" autofocus value="' + esc(r ? r.name : '') + '"></label>' +
      '<div class="two"><label class="fld"><span>Amount</span><div class="money"><input name="amount" inputmode="decimal" placeholder="0.00" value="' + (r ? (+r.amount).toFixed(2) : '') + '"></div></label><label class="fld"><span>Repeats</span><select name="cadence"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select></label></div>' +
      '<div class="two"><label class="fld"><span>Next due</span><input type="date" name="next" value="' + (r ? r.next_date : iso(today())) + '"></label><label class="fld"><span>Category</span><select name="category">' + catOptions(kind, r ? r.category_id : null) + '</select></label></div>' +
      (r ? '<label class="fld"><span>Status</span><select name="active"><option value="1">Active</option><option value="0"' + (r.active ? '' : ' selected') + '>Paused</option></select></label>' : ''),
      function () {
        if (!val('name').trim()) { formErr('Give it a name.'); return null; } var a = amountOk(val('amount')); if (a == null) return null; if (!val('next')) { formErr('Pick the next due date.'); return null; }
        var row = { kind: val('kind'), name: val('name').trim(), amount: a, cadence: val('cadence'), next_date: val('next'), category_id: val('category') ? +val('category') : null };
        if (r) row.active = val('active') !== '0';
        return r ? DB.upd('recurring', r.id, row) : DB.ins('recurring', row);
      }, r ? function () { return DB.del('recurring', r.id); } : null);
    $('form').elements.cadence.value = r ? r.cadence : 'monthly';
    $('formBody').querySelectorAll('input[name=kind]').forEach(function (x) { x.onchange = function () { $('form').elements.category.innerHTML = catOptions(x.value, null); }; });
  }
  $('addRec').onclick = function () { recForm(null); };

  function goalForm(g) {
    openForm(g ? g.name : 'New savings goal',
      (g ? '<label class="fld"><span>Add to it (or a negative number to take out)</span><div class="money amtbig"><input name="add" inputmode="decimal" placeholder="0.00" autofocus></div></label>' : '') +
      '<label class="fld"><span>Name</span><input name="name" maxlength="60" placeholder="e.g. Emergency fund" ' + (g ? '' : 'autofocus ') + 'value="' + esc(g ? g.name : '') + '"></label>' +
      '<div class="two"><label class="fld"><span>Target</span><div class="money"><input name="target" inputmode="decimal" placeholder="0" value="' + (g ? +g.target : '') + '"></div></label><label class="fld"><span>Saved so far</span><div class="money"><input name="saved" inputmode="decimal" placeholder="0" value="' + (g ? +g.saved : '') + '"></div></label></div>' +
      '<label class="fld"><span>Target date (optional)</span><input type="date" name="deadline" value="' + (g && g.deadline ? g.deadline : '') + '"></label>',
      function () {
        if (!val('name').trim()) { formErr('Give it a name.'); return null; } var tg = amountOk(val('target'), 'a target'); if (tg == null) return null;
        var sv = val('saved').trim() ? num(val('saved').replace(/[$,]/g, '')) : 0, add = g && val('add').trim() ? num(val('add').replace(/[$,]/g, '')) : 0;
        if (isNaN(sv) || isNaN(add)) { formErr('Amounts must be numbers.'); return null; }
        var row = { name: val('name').trim(), target: tg, saved: Math.max(0, sv + add), deadline: val('deadline') || null };
        return g ? DB.upd('goals', g.id, row) : DB.ins('goals', row);
      }, g ? function () { return DB.del('goals', g.id); } : null);
  }
  $('addGoal').onclick = function () { goalForm(null); };

  $('addCat').onclick = function () {
    openForm('New category', seg('kind', 'expense', ['expense', 'Expense'], ['income', 'Income']) +
      '<label class="fld"><span>Name</span><input name="name" maxlength="60" autofocus placeholder="e.g. Gym"></label><label class="fld"><span>Monthly budget</span><div class="money"><input name="budget" inputmode="decimal" placeholder="0"></div></label>',
      function () {
        if (!val('name').trim()) { formErr('Give it a name.'); return null; } var b = val('budget').trim() ? num(val('budget').replace(/[$,]/g, '')) : 0; if (isNaN(b) || b < 0) { formErr('Budget must be a number.'); return null; }
        return DB.ins('categories', { name: val('name').trim(), kind: val('kind'), budget: b, color: PALETTE[S.categories.length % PALETTE.length], sort: S.categories.length + 1 });
      });
  };

  /* ---------------- start ---------------- */
  if (DEMO) { $('demoBar').hidden = false; startFor('you@demo.test'); }
  else if (!sb) { $('gateErr').textContent = 'Couldn’t load the sign-in library. Check your connection and reload.'; $('gateErr').hidden = false; show('gate'); }
  else {
    sb.auth.getSession().then(function (r) { var s = r.data && r.data.session; if (s) startFor(s.user.email); else show('gate'); });
    sb.auth.onAuthStateChange(function (ev, s) { if (s && (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION')) startFor(s.user.email); });
  }

  /* ---------------- demo data (made up, only with ?demo) ---------------- */
  function demoDB() {
    var t = today(), y = t.getFullYear(), m = t.getMonth(), seq = 100, T = {};
    function d(day, mo) { var x = new Date(y, m + (mo || 0), Math.min(day, daysIn(new Date(y, m + (mo || 0), 1)))); return iso(x); }
    T.members = [{ email: 'you@demo.test', role: 'owner', added_at: '2026-01-01' }, { email: 'partner@demo.test', role: 'member', added_at: '2026-01-02' }];
    var cats = [['Housing', 'expense', 1400], ['Groceries', 'expense', 450], ['Dining out', 'expense', 200], ['Transport', 'expense', 160], ['Utilities', 'expense', 140], ['Subscriptions', 'expense', 60], ['Shopping', 'expense', 150], ['Entertainment', 'expense', 100], ['Travel', 'expense', 0], ['Other', 'expense', 80], ['Paycheck', 'income', 0], ['Other income', 'income', 0]];
    T.categories = cats.map(function (c, i) { return { id: i + 1, name: c[0], kind: c[1], budget: c[2], color: PALETTE[i % 10], sort: i + 1, archived: false }; });
    var tx = [[1, 1, 1400, 'Rent', 0], [1, 11, 1850, 'Paycheck', 0, 'income'], [15, 11, 1850, 'Paycheck', 0, 'income'], [2, 2, 86.4, 'Groceries', 1], [5, 2, 112.3, 'Costco', 0], [9, 2, 64.9, 'Groceries', 1], [3, 3, 38.5, 'Dinner out', 0], [7, 3, 22, 'Coffee + bagels', 1], [12, 3, 54, 'Sushi', 0], [4, 4, 45, 'Gas', 0], [10, 4, 12.5, 'Parking', 1], [6, 5, 74.2, 'Electric', 0], [8, 5, 55, 'Internet', 0], [3, 6, 11.99, 'Spotify', 0], [6, 6, 15.49, 'Netflix', 1], [11, 7, 68, 'Shoes', 0], [13, 8, 32, 'Movie night', 1], [14, 10, 18, 'Haircut', 0]];
    T.transactions = [];
    [-1, 0].forEach(function (mo) { tx.forEach(function (r) { if (mo === 0 && r[0] > t.getDate()) return; T.transactions.push({ id: ++seq, date: d(r[0], mo), kind: r[5] || 'expense', amount: mo ? Math.round(r[2] * (0.85 + 0.3 * ((r[0] * 7) % 10) / 10) * 100) / 100 : r[2], category_id: r[1], note: r[3], created_by: T.members[r[4]].email }); }); });
    T.recurring = [{ id: 1, name: 'Rent', kind: 'expense', amount: 1400, category_id: 1, cadence: 'monthly', next_date: d(1, 1), active: true }, { id: 2, name: 'Phone', kind: 'expense', amount: 45, category_id: 5, cadence: 'monthly', next_date: d(Math.min(28, t.getDate() + 3)), active: true }, { id: 3, name: 'Spotify', kind: 'expense', amount: 11.99, category_id: 6, cadence: 'monthly', next_date: d(3, 1), active: true }, { id: 4, name: 'Car insurance', kind: 'expense', amount: 640, category_id: 4, cadence: 'yearly', next_date: d(20, 2), active: true }, { id: 5, name: 'Paycheck', kind: 'income', amount: 1850, category_id: 11, cadence: 'monthly', next_date: d(Math.min(28, t.getDate() + 9)), active: true }];
    T.goals = [{ id: 1, name: 'Emergency fund', target: 6000, saved: 2350, deadline: d(1, 10), created_at: '1' }, { id: 2, name: 'Summer trip', target: 1800, saved: 640, deadline: d(1, 7), created_at: '2' }];
    var P = function (v) { return Promise.resolve(JSON.parse(JSON.stringify(v))); };
    return {
      list: function (tb, o) { var rows = T[tb]; if (o && o.from) rows = rows.filter(function (r) { return r.date >= o.from && r.date < o.to; }); return P(rows); },
      ins: function (tb, row) { row = Object.assign({ id: ++seq, created_by: 'you@demo.test', active: true, archived: false, saved: 0, added_at: iso(today()) }, row); T[tb].push(row); return P([row]); },
      upd: function (tb, id, p) { T[tb].forEach(function (r) { if (r.id === id) Object.assign(r, p); }); return P([]); },
      del: function (tb, id, col) { T[tb] = T[tb].filter(function (r) { return r[col || 'id'] !== id; }); return P([]); }
    };
  }
})();
