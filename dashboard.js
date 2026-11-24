// CPS IE Studio — Dashboard รายสัปดาห์ / รายเดือน (ไทย / English / 中文 ผ่าน dash-i18n.js)
// กราฟทุกตัวใช้แกน Y เดียว (หน่วยเดียวกัน) — กราฟ combination = แท่ง + เส้นในหน่วยเดียวกัน ไม่ใช้สองแกน
(function () {
  const U = () => window.CPS.util, D = () => window.CPS.data, I = () => window.CPSDashI18n;
  const t = (k, ...a) => I().t(k, ...a);
  const PKEY = 'cps-ie-dash-period';
  let mode = 'week';
  try { mode = localStorage.getItem(PKEY) === 'month' ? 'month' : 'week'; } catch (e) {}
  // categorical slots (validated, fixed order) + ink/grid tokens of the app
  const C = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#eda100', s5: '#e87ba4', ink: '#17324b', muted: '#60788d', grid: '#e6edf3', base: '#c9d6e2' };
  const SYM = [['O', '○', C.s1], ['T', '⇨', C.s2], ['D', 'D', C.s3], ['H', '▽', C.s4], ['I', '□', C.s5]];
  const lbrColor = v => v >= 85 ? '#15856b' : v >= 70 ? '#e08a00' : '#c0392b';

  // ---------- periods ----------
  const parseD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  const dt = (d, o) => d.toLocaleDateString(I().locale(), o);
  function buckets(m) {
    const out = [], now = new Date(); now.setHours(0, 0, 0, 0);
    if (m === 'week') {
      const s = new Date(now); s.setDate(s.getDate() - (s.getDay() + 6) % 7);
      for (let i = 11; i >= 0; i--) {
        const a = new Date(s); a.setDate(a.getDate() - 7 * i); const b = new Date(a); b.setDate(b.getDate() + 7); const e = new Date(b); e.setDate(e.getDate() - 1);
        out.push({ a, b, label: dt(a, { day: 'numeric', month: 'short' }), long: t('weekOf', dt(a, { day: 'numeric', month: 'short' }) + ' – ' + dt(e, { day: 'numeric', month: 'short', year: 'numeric' })) });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        out.push({ a, b, label: dt(a, { month: 'short' }), long: dt(a, { month: 'long', year: 'numeric' }) });
      }
    }
    return out;
  }
  const idxOf = (bs, s) => { const d = parseD(s); if (!d) return -1; for (let i = 0; i < bs.length; i++) if (d >= bs[i].a && d < bs[i].b) return i; return -1; };
  const rangeText = B => mode === 'week'
    ? dt(B[0].a, { day: 'numeric', month: 'short' }) + ' – ' + dt(new Date(B[B.length - 1].b - 864e5), { day: 'numeric', month: 'short', year: 'numeric' })
    : B[0].long + ' – ' + B[B.length - 1].long;

  // ---------- data per period ----------
  function compute(m) {
    const { num, totals } = U();
    const studies = D().listStudies(), jobs = D().listJobs(), stations = D().listStations();
    const bs = buckets(m);
    const sk = r => [r.workshop, r.group, r.team, r.station].join('§');
    const jphOf = new Map(); stations.forEach(r => { if (num(r.jph)) jphOf.set(sk(r), num(r.jph)); });
    const B = bs.map(b => ({ ...b, st: [], jobs: [], VA: 0, NNVA: 0, NVA: 0, ct: 0, tk: [], red: 0, before: 0, after: 0, L: {}, R: {}, both: 0, els: 0 }));
    studies.forEach(s => {
      const i = idxOf(bs, s.date); if (i < 0) return;
      const tt = totals(s.elements), b = B[i]; if (!tt.ct) return;
      b.st.push(s); b.VA += tt.VA; b.NNVA += tt.NNVA; b.NVA += tt.NVA; b.ct += tt.ct;
      const j = jphOf.get(sk(s)); if (j) b.tk.push(3600 / j);
      (s.elements || []).forEach(e => {
        const l = e.lh && e.lh.s, r = e.rh && e.rh.s; if (!l && !r) return;
        b.els++; if (l) b.L[l] = (b.L[l] || 0) + 1; if (r) b.R[r] = (b.R[r] || 0) + 1; if (l === 'O' && r === 'O') b.both++;
      });
    });
    const kaizen = [];
    jobs.forEach(j => {
      if (!(j.after || []).length || !(j.before || []).length) return;
      const i = idxOf(bs, j.date); if (i < 0) return;
      const bf = totals(j.before).ct, af = totals(j.after).ct; if (!bf) return;
      const b = B[i]; b.jobs.push(j); b.red += bf - af; b.before += bf; b.after += af;
      kaizen.push({ j, bf, af, red: bf - af, pct: (bf - af) / bf * 100, i });
    });
    // LBR ณ สิ้นแต่ละช่วง: CT จาก Time Study ล่าสุดของแต่ละสถานี · ไลน์ = ทีม + รุ่น/รุ่นย่อย
    const lineOf = new Map(); stations.forEach(r => lineOf.set(sk(r), [r.workshop, r.group, r.team, r.model || '-', r.submodel || '-'].join('§')));
    const byStation = new Map();
    studies.forEach(s => { const d = parseD(s.date), ct = num(s.ct) || totals(s.elements).ct; if (!d || !ct || !lineOf.has(sk(s))) return; (byStation.get(sk(s)) || byStation.set(sk(s), []).get(sk(s))).push({ d, ct }); });
    byStation.forEach(v => v.sort((a, b) => a.d - b.d));
    B.forEach(b => {
      const lines = new Map();
      byStation.forEach((v, k) => { let ct = 0; for (const x of v) { if (x.d < b.b) ct = x.ct; else break; } if (ct) (lines.get(lineOf.get(k)) || lines.set(lineOf.get(k), []).get(lineOf.get(k))).push(ct); });
      let S = 0, Dn = 0, n = 0;
      lines.forEach(cts => { if (cts.length < 2) return; S += cts.reduce((a, c) => a + c, 0); Dn += cts.length * Math.max(...cts); n++; });
      b.lbr = Dn ? S / Dn * 100 : null; b.lines = n;
    });
    // ตัดช่วงว่างด้านหน้าออก (เหลืออย่างน้อย 4 ช่วง)
    let first = B.findIndex(b => b.st.length || b.jobs.length); if (first < 0) first = B.length - 4;
    first = Math.max(0, Math.min(first, B.length - 4));
    kaizen.forEach(k => k.i -= first);
    return { B: B.slice(first), kaizen, studies, jobs };
  }

  // ---------- SVG chart (one y-axis) ----------
  const reg = {};
  function niceScale(lo, hi) {
    if (hi <= lo) hi = lo + 1;
    const raw = (hi - lo) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
  }
  function chart(id, W, o) {
    const { esc, fmt } = U();
    const H = o.h || 260, n = o.labels.length, padL = 46, padR = o.padR || 14, padT = 14, padB = 30;
    const pw = Math.max(10, W - padL - padR), ph = H - padT - padB, band = pw / n;
    const stack = o.stack || [], lines = o.lines || [];
    let hi = 0; const lo = o.yMin != null ? o.yMin : 0;
    for (let i = 0; i < n; i++) {
      hi = Math.max(hi, stack.reduce((a, s) => a + (s.vals[i] || 0), 0));
      lines.forEach(l => { if (l.vals[i] != null) hi = Math.max(hi, l.vals[i]); });
    }
    (o.refs || []).forEach(r => hi = Math.max(hi, r.v));
    if (o.yMax != null) hi = o.yMax;
    const sc = niceScale(lo, hi * (o.yMax != null ? 1 : 1.08));
    const y = v => padT + ph - (v - sc.lo) / (sc.hi - sc.lo) * ph, x = i => padL + band * i + band / 2;
    let g = '';
    for (let v = sc.lo; v <= sc.hi + 1e-9; v += sc.step) g += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}"/><text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" class="ax">${fmt(v)}${o.unitTick || ''}</text>`;
    g += `<line x1="${padL}" x2="${W - padR}" y1="${y(sc.lo)}" y2="${y(sc.lo)}" stroke="${C.base}"/>`;
    const every = Math.ceil(n / Math.max(1, Math.floor(pw / 52)));
    for (let i = 0; i < n; i++) if ((n - 1 - i) % every === 0) g += `<text x="${x(i)}" y="${H - 9}" text-anchor="middle" class="ax">${esc(o.labels[i])}</text>`;
    (o.refs || []).forEach(r => g += `<line x1="${padL}" x2="${W - padR}" y1="${y(r.v)}" y2="${y(r.v)}" stroke="${r.color}" stroke-dasharray="5 4" stroke-width="1.5"/><text x="${padL + 6}" y="${y(r.v) - 5}" text-anchor="start" class="ax" style="fill:${r.color}">${esc(r.label)}</text>`);
    // bars (stacked, 2px gaps, 4px rounded top)
    const bw = Math.min(34, band * 0.62);
    for (let i = 0; i < n; i++) {
      let acc = sc.lo; const segs = stack.map(s => s.vals[i] || 0); const top = segs.reduce((a, v, k) => v > 0 ? k : a, -1);
      stack.forEach((s, k) => {
        const v = segs[k]; if (v <= 0) return;
        const y0 = y(acc), y1 = y(acc + v); acc += v;
        const hgt = Math.max(1, y0 - y1 - (k === top ? 0 : 2)), yt = y0 - hgt;
        const r = k === top ? Math.min(4, hgt, bw / 2) : 0, x0 = x(i) - bw / 2;
        g += r ? `<path d="M${x0},${yt + hgt}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${yt + hgt}Z" fill="${s.color}"/>`
          : `<rect x="${x0}" y="${yt}" width="${bw}" height="${hgt}" fill="${s.color}"/>`;
      });
    }
    // lines (2px) + markers with surface ring
    lines.forEach(l => {
      let d = '', pen = false;
      for (let i = 0; i < n; i++) { const v = l.vals[i]; if (v == null) { pen = false; continue; } d += (pen ? 'L' : 'M') + x(i) + ',' + y(v); pen = true; }
      g += `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="2" ${l.dash ? 'stroke-dasharray="6 4"' : ''} stroke-linejoin="round"/>`;
      if (!l.dash) for (let i = 0; i < n; i++) if (l.vals[i] != null) g += `<circle cx="${x(i)}" cy="${y(l.vals[i])}" r="4" fill="${l.color}" stroke="#fff" stroke-width="2"/>`;
      if (l.endLabel) { let k = n - 1; while (k >= 0 && l.vals[k] == null) k--; if (k >= 0) g += `<text x="${Math.min(x(k), W - padR - 2)}" y="${y(l.vals[k]) - 10}" text-anchor="${x(k) > W - padR - 40 ? 'end' : 'middle'}" class="dl">${esc(l.endLabel(l.vals[k]))}</text>`; }
    });
    // hover bands
    g += `<line class="xh" x1="0" x2="0" y1="${padT}" y2="${padT + ph}" stroke="${C.muted}" stroke-width="1" visibility="hidden"/>`;
    for (let i = 0; i < n; i++) g += `<rect class="hit" data-c="${id}" data-i="${i}" data-x="${x(i)}" x="${padL + band * i}" y="${padT}" width="${band}" height="${ph}" fill="transparent"/>`;
    reg[id] = o.tip;
    const legend = [...stack.map(s => ({ name: s.name, color: s.color, kind: 'bar' })), ...lines.map(l => ({ name: l.name, color: l.color, kind: l.dash ? 'dash' : 'line' }))];
    return (legend.length > 1 ? `<div class="dz-legend">${legend.map(l => `<span><i class="k-${l.kind}" style="--c:${l.color}"></i>${esc(l.name)}</span>`).join('')}</div>` : '') +
      `<svg class="dz-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || '')}">${g}</svg>`;
  }
  // tooltip (one for the page)
  function tipEl() { let e = document.getElementById('dz-tip'); if (!e) { e = document.createElement('div'); e.id = 'dz-tip'; e.hidden = true; document.body.appendChild(e); } return e; }
  function wireTips(root) {
    root.querySelectorAll('svg.dz-svg').forEach(svg => {
      const xh = svg.querySelector('.xh');
      svg.addEventListener('pointermove', e => {
        const r = e.target.closest && e.target.closest('rect.hit'); const tp = tipEl();
        if (!r) { tp.hidden = true; if (xh) xh.setAttribute('visibility', 'hidden'); return; }
        const f = reg[r.dataset.c]; if (!f) return;
        tp.innerHTML = f(+r.dataset.i); tp.hidden = false;
        if (xh) { xh.setAttribute('x1', r.dataset.x); xh.setAttribute('x2', r.dataset.x); xh.setAttribute('visibility', 'visible'); }
        const w = tp.offsetWidth, h = tp.offsetHeight; let L = e.clientX + 14, T = e.clientY - h - 10;
        if (L + w > innerWidth - 8) L = e.clientX - w - 14; if (T < 8) T = e.clientY + 16;
        tp.style.left = L + 'px'; tp.style.top = T + 'px';
      });
      svg.addEventListener('pointerleave', () => { tipEl().hidden = true; if (xh) xh.setAttribute('visibility', 'hidden'); });
    });
  }
  const tipRow = (color, name, val, kind) => `<div class="tr"><i class="k-${kind || 'bar'}" style="--c:${color}"></i><span>${U().esc(name)}</span><b>${val}</b></div>`;

  // ---------- page ----------
  let ctxSaved = null;
  function render(el, ctx) {
    ctxSaved = ctx;
    const { esc, fmt } = U();
    const scope = D().scope, s = t('s');
    document.documentElement.lang = I().lang === 'zh' ? 'zh-CN' : I().lang;
    const P = compute(mode), B = P.B, n = B.length, last = B[n - 1];
    const avg = b => b.st.length ? b.ct / b.st.length : null;
    const lastWith = f => { for (let i = n - 1; i >= 0; i--) if (f(B[i])) return i; return -1; };
    const iCt = lastWith(b => b.st.length), iPrev = iCt > 0 ? (() => { for (let i = iCt - 1; i >= 0; i--) if (B[i].st.length) return i; return -1; })() : -1;
    const totRed = B.reduce((a, b) => a + b.red, 0), totBf = B.reduce((a, b) => a + b.before, 0), nJob = B.reduce((a, b) => a + b.jobs.length, 0);
    const nSt = B.reduce((a, b) => a + b.st.length, 0);
    const sumT = B.reduce((a, b) => ({ VA: a.VA + b.VA, ct: a.ct + b.ct }), { VA: 0, ct: 0 });
    const vaOf = b => b && b.ct ? b.VA / b.ct * 100 : null;
    const lb = ctx.lineBalance();
    const delta = (cur, prev, unit, goodDown) => {
      if (cur == null || prev == null) return '';
      const d = cur - prev; if (Math.abs(d) < 0.05) return `<span class="dz-d">${t('same')}</span>`;
      const good = goodDown ? d < 0 : d > 0;
      return `<span class="dz-d ${good ? 'up' : 'down'}">${d < 0 ? '▼' : '▲'} ${fmt(Math.abs(d))}${unit} ${t('vsPrev', mode)}</span>`;
    };
    const kpi = (label, val, unit, sub, color) => `<div class="stat"><small>${esc(label)}</small><strong${color ? ` style="color:${color}"` : ''}>${val}<em>${unit ? ' ' + esc(unit) : ''}</em></strong>${sub ? `<span>${sub}</span>` : ''}</div>`;
    const title = scope.team || scope.group || scope.workshop || t('allAreas');
    const levelLabel = t('level_' + (scope.level || 'team'));
    const subT = [scope.workshop, scope.group].filter(Boolean).join(' / ') || levelLabel;
    const trained = P.jobs.reduce((a, j) => a + (j.training || []).reduce((x, r) => x + U().num(r.count), 0), 0);

    el.innerHTML = `
      <div class="page-head dz-head"><div><p class="eyebrow">${esc(levelLabel)}</p><h1>${esc(title)}</h1><p class="muted">${esc(subT)}</p></div>
        <div class="dz-actions">
          <div class="dz-lang" role="group" aria-label="Language">${I().LANGS.map(([k, l]) => `<button type="button" data-lang="${k}" lang="${k}" class="${I().lang === k ? 'active' : ''}" aria-pressed="${I().lang === k}">${l}</button>`).join('')}</div>
          <button class="dz-ppt" data-ppt title="${esc(t('pptTip'))}">${esc(t('ppt'))}</button>
          <div class="dz-tabs" role="tablist">${[['week', t('weekly')], ['month', t('monthly')]].map(([k, x]) => `<button role="tab" data-mode="${k}" class="${mode === k ? 'active' : ''}" aria-selected="${mode === k}">${esc(x)}</button>`).join('')}</div>
        </div></div>
      ${!D().canEdit() ? `<div class="ro-banner">${esc(t('roBanner'))}</div>` : ''}
      <p class="muted dz-range">${esc(t('range', n, mode, rangeText(B)))}</p>
      <div class="cards dz-cards">
        ${kpi('Time Study', nSt, t('items'), esc(t('latestCount', mode, last.st.length)))}
        ${kpi(t('avgCt'), iCt >= 0 ? fmt(avg(B[iCt])) : '—', t('sec'), iCt >= 0 ? (delta(avg(B[iCt]), iPrev >= 0 ? avg(B[iPrev]) : null, ' ' + s, true) || esc(B[iCt].long)) : esc(t('noStudy')))}
        ${kpi(t('ctReduced'), totRed ? '−' + fmt(totRed) : '0', s, esc(nJob ? t('jobsAvg', nJob, fmt(totBf ? totRed / totBf * 100 : 0)) : t('noJobs')), totRed ? '#15856b' : '')}
        ${kpi('VA', sumT.ct ? fmt(sumT.VA / sumT.ct * 100) : '—', '%', iCt >= 0 ? delta(vaOf(B[iCt]), iPrev >= 0 ? vaOf(B[iPrev]) : null, '%', false) : '')}
        ${lb.lines.length ? kpi('Line Balance Rate', fmt(lb.lbr) + '%', '', esc(t('linesLow', lb.lines.length, lb.low)), lbrColor(lb.lbr)) : kpi('Line Balance Rate', '—', '', esc(t('noStation')))}
        ${kpi(t('trained'), trained, t('people'))}
      </div>
      <section class="panel"><div class="panelhead"><h2>${esc(t('redTitle', mode))}</h2><small class="muted">${esc(t('redNote', mode))}</small></div><div class="dz-body" data-chart="red"></div></section>
      <div class="dz-grid">
        <section class="panel"><div class="panelhead"><h2>${esc(t('ctTitle'))}</h2><small class="muted">${esc(t('ctNote'))}</small></div><div class="dz-body" data-chart="ct"></div></section>
        <section class="panel"><div class="panelhead"><h2>${esc(t('lbrTitle', mode))}</h2><small class="muted" title="${esc(t('lbrHelp', mode))}">${esc(t('lbrNote', mode))}</small></div><div class="dz-body" data-chart="lbr"></div></section>
        <section class="panel"><div class="panelhead"><h2>${esc(t('handsTitle'))}</h2><small class="muted">${esc(t('handsNote', n, mode))}</small></div><div class="dz-body" data-chart="hands"></div></section>
        <section class="panel"><div class="panelhead"><h2>${esc(t('topTitle'))}</h2><small class="muted">${esc(t('topNote', nJob))}</small></div><div class="dz-body dz-top">${topList(P.kaizen)}</div></section>
      </div>
      ${lineBalanceTable(lb)}
      ${D().canEdit() ? `<div class="dash-links">
        <button class="bigbtn" data-go="timestudy"><b>${esc(t('goTs'))}</b><span>${esc(t('goTsSub'))}</span></button>
        <button class="bigbtn" data-go="analysis"><b>${esc(t('goAn'))}</b><span>${esc(t('goAnSub'))}</span></button>
      </div>` : ''}
      ${recent(P.studies, P.jobs)}`;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => window.CPS.showTab(b.dataset.go));
    el.querySelector('[data-ppt]').onclick = e => downloadPpt(e.currentTarget, ctx);
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; try { localStorage.setItem(PKEY, mode); } catch (e) {} render(el, ctx); });
    el.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => { I().set(b.dataset.lang); render(el, ctx); });
    drawCharts(el, B);
  }

  function drawCharts(el, B) {
    const { fmt, esc } = U(), s = t('s');
    const labels = B.map(b => b.label), wOf = k => { const d = el.querySelector(`[data-chart="${k}"]`); return d ? [d, Math.max(260, d.clientWidth - 24)] : [null, 0]; };
    // 1) combination: CT reduced per period (bars) + cumulative (line), one axis in seconds
    let cum = 0; const cumV = B.map(b => (cum += b.red));
    let [d, W] = wOf('red');
    if (d) d.innerHTML = B.some(b => b.jobs.length) ? chart('red', W, {
      labels, h: 270, aria: t('redTitle', mode),
      stack: [{ name: t('redSeries', mode), color: C.s1, vals: B.map(b => b.red) }],
      lines: [{ name: t('cumSeries'), color: C.s2, vals: cumV, endLabel: v => t('cumLabel', fmt(v)) }],
      tip: i => `<b>${esc(B[i].long)}</b>${tipRow(C.s1, t('reduced'), '−' + fmt(B[i].red) + ' ' + s)}${tipRow(C.s2, t('cumulative'), '−' + fmt(cumV[i]) + ' ' + s, 'line')}<div class="tr muted">${esc(t('jobsN', B[i].jobs.length))}${B[i].before ? esc(t('reducePct', fmt(B[i].red / B[i].before * 100))) : ''}</div>`,
    }) : `<div class="blank">${esc(t('noJobsPeriod'))}</div>`;
    // 2) CT stacked by VA/NNVA/NVA + avg TAKT (same unit)
    [d, W] = wOf('ct');
    const TY = U().TYPES, avg = (b, k) => b.st.length ? b[k] / b.st.length : 0;
    const tk = B.map(b => b.tk.length ? b.tk.reduce((a, v) => a + v, 0) / b.tk.length : null);
    if (d) d.innerHTML = B.some(b => b.st.length) ? chart('ct', W, {
      labels, aria: t('ctTitle'),
      stack: TY.map(x => ({ name: x.k, color: x.color, vals: B.map(b => avg(b, x.k)) })),
      lines: tk.some(v => v != null) ? [{ name: t('taktAvg'), color: C.ink, vals: tk, dash: true }] : [],
      tip: i => { const b = B[i]; if (!b.st.length) return `<b>${esc(b.long)}</b><div class="tr muted">${esc(t('noStudy'))}</div>`;
        return `<b>${esc(b.long)}</b>${TY.map(x => tipRow(x.color, x.k, fmt(avg(b, x.k)) + ' ' + s)).join('')}<div class="tr"><span>${esc(t('avgCt'))}</span><b>${fmt(b.ct / b.st.length)} ${s}</b></div>${tk[i] != null ? tipRow(C.ink, t('taktAvg'), fmt(tk[i]) + ' ' + s, 'dash') : ''}<div class="tr muted">${b.st.length} Time Study · VA ${fmt(b.VA / b.ct * 100)}%</div>`; },
    }) : `<div class="blank">${esc(t('noStudyPeriod'))}</div>`;
    // 3) LBR trend
    [d, W] = wOf('lbr');
    const lv = B.map(b => b.lbr), mn = Math.min(...lv.filter(v => v != null), 100);
    if (d) d.innerHTML = lv.some(v => v != null) ? chart('lbr', W, {
      labels, aria: t('lbrTitle', mode), yMin: Math.min(60, Math.floor((mn - 5) / 10) * 10), yMax: 100, unitTick: '%',
      lines: [{ name: 'Line Balance Rate', color: C.s1, vals: lv, endLabel: v => fmt(v) + '%' }],
      refs: [{ v: 85, label: t('target85'), color: '#15856b' }, { v: 70, label: '70%', color: '#c0392b' }],
      tip: i => `<b>${esc(B[i].long)}</b>${B[i].lbr != null ? tipRow(C.s1, 'Line Balance Rate', fmt(B[i].lbr) + '%', 'line') + `<div class="tr muted">${esc(t('linesN', B[i].lines))} · Balance loss ${fmt(100 - B[i].lbr)}%</div>` : `<div class="tr muted">${esc(t('noData'))}</div>`}`,
    }) : `<div class="blank">${esc(t('noLineStudy'))}</div>`;
    // 4) two-hand overview: 100% stacked horizontal bars L / R + legend table
    [d] = wOf('hands');
    if (d) d.innerHTML = handsBlock(B);
    wireTips(el);
  }

  function handsBlock(B) {
    const { fmt, esc } = U(), sym = t('sym');
    const L = {}, R = {}; let els = 0, both = 0;
    B.forEach(b => { els += b.els; both += b.both; SYM.forEach(([k]) => { L[k] = (L[k] || 0) + (b.L[k] || 0); R[k] = (R[k] || 0) + (b.R[k] || 0); }); });
    if (!els) return `<div class="blank">${esc(t('noHands'))}</div>`;
    const tot = o => SYM.reduce((a, [k]) => a + (o[k] || 0), 0) || 1, tL = tot(L), tR = tot(R);
    const bar = (o, tt, name) => `<div class="dz-hrow"><b>${esc(name)}</b><div class="dz-hbar">${SYM.map(([k, , c]) => o[k] ? `<i style="width:${o[k] / tt * 100}%;background:${c}" title="${esc(sym[k])} ${fmt(o[k] / tt * 100)}%"></i>` : '').join('')}</div></div>`;
    const pct = (o, tt, k) => fmt((o[k] || 0) / tt * 100) + '%';
    const idle = k => ((L[k] || 0) + (R[k] || 0)) / (tL + tR) * 100;
    return `<div class="dz-hands">
      <div class="dz-hstats"><div><strong>${fmt(both / els * 100)}%</strong><span>${esc(t('both'))}</span></div><div><strong>${fmt(idle('H'))}%</strong><span>${esc(t('hold'))}</span></div><div><strong>${fmt(idle('D'))}%</strong><span>${esc(t('wait'))}</span></div></div>
      ${bar(L, tL, t('left'))}${bar(R, tR, t('right'))}
      <table class="dz-htable"><thead><tr><th>${esc(t('symbol'))}</th><th>L.H</th><th>R.H</th></tr></thead><tbody>
      ${SYM.map(([k, g, c]) => `<tr><td><i class="k-bar" style="--c:${c}"></i>${g} ${esc(sym[k])}</td><td>${pct(L, tL, k)} <small>(${L[k] || 0})</small></td><td>${pct(R, tR, k)} <small>(${R[k] || 0})</small></td></tr>`).join('')}
      </tbody></table><p class="muted">${esc(t('elsNote', els.toLocaleString(I().locale())))}</p></div>`;
  }

  function topList(kz) {
    const { esc, fmt } = U(), s = t('s');
    if (!kz.length) return `<div class="blank">${esc(t('noJobsPeriod'))}</div>`;
    const top = kz.slice().sort((a, b) => b.red - a.red).slice(0, 6), mx = Math.max(...top.map(k => k.red), 1);
    return `<ol class="dz-toplist">${top.map(k => `<li><div><b>${esc(k.j.name || k.j.station || '—')}</b><small class="muted">${esc([k.j.team, k.j.station].filter(Boolean).join(' · '))} · ${esc(k.j.date || '')}</small></div>
      <div class="dz-topbar"><i style="width:${Math.max(2, k.red / mx * 100)}%"></i></div>
      <span><b>−${fmt(k.red)} ${s}</b><small>${fmt(k.bf)} → ${fmt(k.af)} ${s} (−${fmt(k.pct)}%)</small></span></li>`).join('')}</ol>`;
  }

  const areaOf = l => { const L = D().scope.level; return [L === 'team' ? '' : l.ws, L === 'team' || L === 'group' ? '' : l.group, L === 'team' ? '' : l.team].filter(Boolean).join(' / ') || l.team || '—'; };
  function lineBalanceTable(lb) {
    const { esc, fmt } = U(), c = t('cols'), s = t('s');
    if (!lb.lines.length) return '';
    const show = lb.lines.slice(0, 15);
    return `<section class="panel"><div class="panelhead"><h2>${esc(t('lbrTable'))}</h2><small class="muted" title="${esc(t('lbrFormula'))}">${esc(t('sortedLow', lb.lines.length))}</small></div>
      <div class="table-scroll"><table class="sb-table lbr-table"><thead><tr><th>${c.line}</th><th>${c.model}</th><th>${c.st}</th><th>${c.sum}</th><th>${c.neck}</th><th>${c.over}</th><th>${c.eff}</th><th>${c.lbr}</th></tr></thead><tbody>
      ${show.map(l => `<tr><td><b>${esc(areaOf(l))}</b></td><td>${esc(l.model)} · ${esc(l.sub)}</td><td>${l.n}</td><td>${fmt(l.sum)} ${s}</td>
        <td>${esc(l.neck)} <small class="muted">${fmt(l.max)} ${s}</small></td><td>${l.over ? `<b style="color:#c0392b">${l.over}</b>` : '0'}</td><td>${l.tk ? fmt(l.eff) + '%' : '—'}</td>
        <td><div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(100, l.lbr)}%;background:${lbrColor(l.lbr)}"></i></div><span style="color:${lbrColor(l.lbr)}">${fmt(l.lbr)}%</span></div></td></tr>`).join('')}
      </tbody></table></div>${lb.lines.length > show.length ? `<p class="muted" style="padding:8px 16px">${esc(t('showLowest', show.length, lb.lines.length))}</p>` : ''}</section>`;
  }
  function recent(studies, jobs) {
    const { esc, fmt } = U();
    const rows = [...studies.slice(0, 5).map(x => ({ tg: 'Time Study', n: x.name, d: x.date, ct: x.ct })), ...jobs.slice(0, 5).map(j => ({ tg: t('tagJob'), n: j.name, d: j.date }))];
    if (!rows.length) return `<div class="blank">${esc(t('noArea'))}</div>`;
    return `<section class="panel"><div class="panelhead"><h2>${esc(t('recent'))}</h2></div><div class="recent">${rows.map(r => `<div class="recent-row"><span class="tag">${esc(r.tg)}</span><b>${esc(r.n || '—')}</b><small>${esc(r.d || '')}</small>${r.ct != null ? `<em>${fmt(r.ct)} ${t('s')}</em>` : ''}</div>`).join('')}</div></section>`;
  }

  // ---------- PPT report (แม่แบบ CHANGAN Confidential 16:9) ----------
  const PPTX_CDN = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js', JSZIP_CDN = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  function loadScript(src) {
    return new Promise((ok, fail) => { const e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = () => fail(new Error(t('loadFail'))); document.head.appendChild(e); });
  }
  function reportData(ctx) {
    const { num } = U(), f = U().fmt, s = t('s');
    const scope = D().scope, P = compute(mode), B = P.B, n = B.length;
    const lb = ctx.lineBalance();
    let cum = 0; const cumV = B.map(b => (cum += b.red));
    const avgK = (b, k) => b.st.length ? b[k] / b.st.length : 0;
    const withSt = B.map((b, i) => i).filter(i => B[i].st.length), iL = withSt[withSt.length - 1], iP = withSt[withSt.length - 2];
    const ctL = iL != null ? B[iL].ct / B[iL].st.length : null, ctP = iP != null ? B[iP].ct / B[iP].st.length : null;
    const totRed = B.reduce((a, b) => a + b.red, 0), totBf = B.reduce((a, b) => a + b.before, 0), nJob = B.reduce((a, b) => a + b.jobs.length, 0);
    const sumVA = B.reduce((a, b) => a + b.VA, 0), sumCt = B.reduce((a, b) => a + b.ct, 0), nStudy = B.reduce((a, b) => a + b.st.length, 0);
    const best = B.reduce((m, b) => b.red > (m ? m.red : 0) ? b : m, null);
    const L = {}, Rh = {}; let els = 0, both = 0;
    B.forEach(b => { els += b.els; both += b.both; Object.keys(b.L).forEach(k => L[k] = (L[k] || 0) + b.L[k]); Object.keys(b.R).forEach(k => Rh[k] = (Rh[k] || 0) + b.R[k]); });
    const tH = (Object.values(L).reduce((a, v) => a + v, 0) + Object.values(Rh).reduce((a, v) => a + v, 0)) || 1;
    const area = scope.team ? [scope.workshop, scope.group, scope.team].join(' / ') : scope.group ? scope.workshop + ' / ' + scope.group : (scope.workshop || t('allAreas'));
    const now = new Date(), pad = x => String(x).padStart(2, '0');
    const trained = P.jobs.reduce((a, j) => a + (j.training || []).reduce((x, r) => x + num(r.count), 0), 0);
    const kz = P.kaizen.slice().sort((a, b) => b.red - a.red);
    const delta = ctL != null && ctP != null ? (ctL <= ctP ? '▼ ' : '▲ ') + f(Math.abs(ctL - ctP)) + ' ' + s + ' ' + t('vsPrev', mode) : '';
    const ins = [];
    if (nJob) ins.push(t('ins_red', f(totRed), nJob, f(totBf ? totRed / totBf * 100 : 0)));
    if (kz[0]) ins.push(t('ins_best', kz[0].j.name || kz[0].j.station, f(kz[0].red), f(kz[0].pct)));
    if (ctL != null) ins.push(t('ins_ct', mode, f(ctL), ctP != null ? f(Math.abs(ctL - ctP)) : null, ctP != null && ctL <= ctP));
    if (sumCt) ins.push(t('ins_va', f(sumVA / sumCt * 100)));
    if (lb.lines.length) ins.push(t('ins_lbr', f(lb.lbr), lb.lbr >= 85, f(85 - lb.lbr), areaOf(lb.lines[0]), f(lb.lines[0].lbr)));
    if (els) ins.push(t('ins_hold', f(((L.H || 0) + (Rh.H || 0)) / tH * 100)));
    const sym = t('sym');
    return {
      lang: I().lang, mode, area, levelLabel: t('level_' + (scope.level || 'team')), modeTitle: t(mode === 'week' ? 'weekly' : 'monthly'),
      rangeText: rangeText(B),
      generated: now.toLocaleDateString(I().locale(), { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
      stamp: now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()),
      labels: B.map(b => b.label), red: B.map(b => b.red), cum: cumV,
      va: B.map(b => avgK(b, 'VA')), nnva: B.map(b => avgK(b, 'NNVA')), nva: B.map(b => avgK(b, 'NVA')),
      takt: B.map(b => b.tk.length ? b.tk.reduce((a, v) => a + v, 0) / b.tk.length : null), lbr: B.map(b => b.lbr),
      totRed, nJob, avgPct: totBf ? totRed / totBf * 100 : 0, bestLabel: best ? best.label : '', bestRed: best ? best.red : 0,
      ctLast: ctL, ctDelta: delta, vaPct: sumCt ? sumVA / sumCt * 100 : 0, nStudy, lbrNow: lb.lbr,
      lines: lb.lines.map(l => ({ area: areaOf(l), model: l.model + ' · ' + l.sub, n: l.n, neck: l.neck, max: l.max, lbr: l.lbr })),
      hands: { L, R: Rh, els, bothPct: els ? both / els * 100 : 0, holdPct: ((L.H || 0) + (Rh.H || 0)) / tH * 100, waitPct: ((L.D || 0) + (Rh.D || 0)) / tH * 100 },
      top: kz.map(k => ({ name: k.j.name || k.j.station || '—', where: [k.j.team, k.j.station].filter(Boolean).join(' · '), date: k.j.date || '', bf: k.bf, af: k.af, red: k.red, pct: k.pct })),
      kpis: [
        { label: 'Time Study', value: nStudy + ' ' + t('items'), sub: t('periods', n, mode) },
        { label: t('r_ctLatest', mode), value: ctL != null ? f(ctL) + ' ' + s : '—', sub: delta },
        { label: t('ctReduced'), value: totRed ? '−' + f(totRed) + ' ' + s : '0', sub: t('jobsN', nJob), color: totRed ? '15856B' : null },
        { label: 'VA', value: sumCt ? f(sumVA / sumCt * 100) + '%' : '—', sub: t('r_vaSub') },
        { label: 'Line Balance Rate', value: lb.lines.length ? f(lb.lbr) + '%' : '—', sub: lb.lines.length ? t('linesLow', lb.lines.length, lb.low) : null, color: lb.lines.length ? lbrColor(lb.lbr).slice(1).toUpperCase() : null },
        { label: t('trained'), value: trained + ' ' + t('people'), sub: null },
      ],
      insights: ins.length ? ins : [t('ins_none')],
      // ข้อความคงที่ของสไลด์ในภาษาที่เลือก
      tx: {
        s, sec: t('sec'), generated: t('r_generated', ''), summary: t('r_summary', mode), key: t('r_key'),
        redTitle: t('redTitle', mode), redSeries: t('redSeries', mode), cumSeries: t('cumSeries'), totRed: t('r_totRed'), jobsN: t('jobsN', nJob),
        avgJob: t('r_avgJob'), vsBefore: t('r_vsBefore'), best: t('r_best', mode), noJobs: t('noJobsPeriod'),
        ctTitle: t('ctTitleBy', mode), takt: t('taktAvg') + ' (' + t('sec') + ')', ctLatest: t('r_ctLatest', mode), vaAvg: t('r_vaAvg'), vaSub: t('r_vaSub'), inPeriod: t('r_inPeriod'), noStudy: t('noStudyPeriod'),
        target: t('target85'), lbrCols: t('r_lbrCols'), overall: t('r_overall', f(lb.lbr), lb.lines.length), noStation: t('noStation'),
        handsTitle: t('handsTitle'), symbol: t('symbol'), left: t('left'), right: t('right'),
        sym: { O: '○ ' + sym.O, T: '→ ' + sym.T, D: 'D ' + sym.D, H: '▽ ' + sym.H, I: '□ ' + sym.I },
        both: t('both'), hold: t('hold'), wait: t('wait'), holdSub: t('r_holdSub'), waitSub: t('r_waitSub'), elements: t('elsNote', els.toLocaleString('en-US')), noHands: t('noHands'),
        topTitle: t('topTitle'), topCols: t('r_topCols'),
      },
    };
  }
  async function downloadPpt(btn, ctx) {
    const label = btn.textContent; btn.disabled = true; btn.textContent = t('building');
    try {
      if (!window.PptxGenJS) await loadScript(PPTX_CDN);
      const R = reportData(ctx);
      const pptx = window.CPSPptReport.build(window.PptxGenJS, R, new URL('ppt/', location.href).href);
      if (!window.JSZip) await loadScript(JSZIP_CDN);
      const blob = await window.CPSPptReport.toBlob(pptx, window.JSZip);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = window.CPSPptReport.fileName(R);
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      U().toast(t('pptDone'));
    } catch (e) { U().toast(t('pptFail', e.message)); }
    finally { btn.disabled = false; btn.textContent = label; }
  }
  window.__cpsReportData = () => reportData(ctxSaved);   // ใช้ทดสอบ

  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const el = document.getElementById('tab-dashboard'); if (el && !el.hidden && ctxSaved && el.querySelector('.dz-body')) render(el, ctxSaved); }, 200); });
  window.CPSDashboard = { render };
})();
