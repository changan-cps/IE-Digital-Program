// CPS IE Studio — Dashboard รายสัปดาห์ / รายเดือน
// กราฟทุกตัวใช้แกน Y เดียว (หน่วยเดียวกัน) — กราฟ combination = แท่ง + เส้นในหน่วยเดียวกัน ไม่ใช้สองแกน
(function () {
  const U = () => window.CPS.util, D = () => window.CPS.data;
  const PKEY = 'cps-ie-dash-period';
  let mode = 'week';
  try { mode = localStorage.getItem(PKEY) === 'month' ? 'month' : 'week'; } catch (e) {}
  // categorical slots (validated, fixed order) + ink/grid tokens of the app
  const C = { s1: '#2a78d6', s2: '#eb6834', s3: '#1baf7a', s4: '#eda100', s5: '#e87ba4', ink: '#17324b', muted: '#60788d', grid: '#e6edf3', base: '#c9d6e2' };
  const SYM = [['O', '○', 'ทำงาน', C.s1], ['T', '⇨', 'เคลื่อนย้าย', C.s2], ['D', 'D', 'รอ', C.s3], ['H', '▽', 'ถือค้าง', C.s4], ['I', '□', 'ตรวจสอบ', C.s5]];
  const lbrColor = v => v >= 85 ? '#15856b' : v >= 70 ? '#e08a00' : '#c0392b';

  // ---------- periods ----------
  const parseD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  const th = (d, o) => d.toLocaleDateString('th-TH', o);
  function buckets(m) {
    const out = [], now = new Date(); now.setHours(0, 0, 0, 0);
    if (m === 'week') {
      const s = new Date(now); s.setDate(s.getDate() - (s.getDay() + 6) % 7);
      for (let i = 11; i >= 0; i--) {
        const a = new Date(s); a.setDate(a.getDate() - 7 * i); const b = new Date(a); b.setDate(b.getDate() + 7); const e = new Date(b); e.setDate(e.getDate() - 1);
        out.push({ a, b, label: th(a, { day: 'numeric', month: 'short' }), long: 'สัปดาห์ ' + th(a, { day: 'numeric', month: 'short' }) + ' – ' + th(e, { day: 'numeric', month: 'short', year: 'numeric' }) });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        out.push({ a, b, label: th(a, { month: 'short' }), long: th(a, { month: 'long', year: 'numeric' }) });
      }
    }
    return out;
  }
  const idxOf = (bs, s) => { const d = parseD(s); if (!d) return -1; for (let i = 0; i < bs.length; i++) if (d >= bs[i].a && d < bs[i].b) return i; return -1; };

  // ---------- data per period ----------
  function compute(m) {
    const { num, totals } = U();
    const studies = D().listStudies(), jobs = D().listJobs(), stations = D().listStations();
    let bs = buckets(m);
    const sk = r => [r.workshop, r.group, r.team, r.station].join('§');
    const jphOf = new Map(); stations.forEach(r => { if (num(r.jph)) jphOf.set(sk(r), num(r.jph)); });
    const B = bs.map(b => ({ ...b, st: [], jobs: [], VA: 0, NNVA: 0, NVA: 0, ct: 0, tk: [], red: 0, before: 0, after: 0, L: {}, R: {}, both: 0, els: 0 }));
    studies.forEach(s => {
      const i = idxOf(bs, s.date); if (i < 0) return;
      const t = totals(s.elements), b = B[i]; if (!t.ct) return;
      b.st.push(s); b.VA += t.VA; b.NNVA += t.NNVA; b.NVA += t.NVA; b.ct += t.ct;
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
    const shift = first;
    kaizen.forEach(k => k.i -= shift);
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
    let hi = 0, lo = o.yMin != null ? o.yMin : 0;
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
        const hgt = Math.max(1, y0 - y1 - (k === top ? 0 : 2)), yt = y0 - hgt - (k === 0 ? 0 : 0);
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
  function tipEl() { let t = document.getElementById('dz-tip'); if (!t) { t = document.createElement('div'); t.id = 'dz-tip'; t.hidden = true; document.body.appendChild(t); } return t; }
  function wireTips(root) {
    root.querySelectorAll('svg.dz-svg').forEach(svg => {
      const xh = svg.querySelector('.xh');
      svg.addEventListener('pointermove', e => {
        const r = e.target.closest && e.target.closest('rect.hit'); const t = tipEl();
        if (!r) { t.hidden = true; if (xh) xh.setAttribute('visibility', 'hidden'); return; }
        const f = reg[r.dataset.c]; if (!f) return;
        t.innerHTML = f(+r.dataset.i); t.hidden = false;
        if (xh) { xh.setAttribute('x1', r.dataset.x); xh.setAttribute('x2', r.dataset.x); xh.setAttribute('visibility', 'visible'); }
        const w = t.offsetWidth, h = t.offsetHeight; let L = e.clientX + 14, T = e.clientY - h - 10;
        if (L + w > innerWidth - 8) L = e.clientX - w - 14; if (T < 8) T = e.clientY + 16;
        t.style.left = L + 'px'; t.style.top = T + 'px';
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
    const scope = D().scope;
    const P = compute(mode), B = P.B, n = B.length, last = B[n - 1], word = mode === 'week' ? 'สัปดาห์' : 'เดือน';
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
      const d = cur - prev; if (Math.abs(d) < 0.05) return `<span class="dz-d">เท่าเดิม</span>`;
      const good = goodDown ? d < 0 : d > 0;
      return `<span class="dz-d ${good ? 'up' : 'down'}">${d < 0 ? '▼' : '▲'} ${fmt(Math.abs(d))}${unit} เทียบ${word}ก่อน</span>`;
    };
    const kpi = (label, val, unit, sub, color) => `<div class="stat"><small>${esc(label)}</small><strong${color ? ` style="color:${color}"` : ''}>${val}<em>${unit ? ' ' + esc(unit) : ''}</em></strong>${sub ? `<span>${sub}</span>` : ''}</div>`;
    const title = scope.team || scope.group || scope.workshop || 'ทุกพื้นที่';
    const subT = [scope.workshop, scope.group].filter(Boolean).join(' / ') || ctx.levelLabel;
    const trained = P.jobs.reduce((s, j) => s + (j.training || []).reduce((a, r) => a + U().num(r.count), 0), 0);
    const range = B[0].long.replace(/^สัปดาห์ /, '') + ' → ' + last.long.replace(/^สัปดาห์ /, '');

    el.innerHTML = `
      <div class="page-head dz-head"><div><p class="eyebrow">${esc(ctx.levelLabel || 'พื้นที่')}</p><h1>${esc(title)}</h1><p class="muted">${esc(subT)}</p></div>
        <div class="dz-tabs" role="tablist">${[['week', 'รายสัปดาห์'], ['month', 'รายเดือน']].map(([k, t]) => `<button role="tab" data-mode="${k}" class="${mode === k ? 'active' : ''}" aria-selected="${mode === k}">${t}</button>`).join('')}</div></div>
      ${!D().canEdit() ? '<div class="ro-banner">👁️ โหมดวิเคราะห์ — แสดงข้อมูลรวมของพื้นที่นี้ (อ่านอย่างเดียว บันทึกได้เฉพาะระดับทีม)</div>' : ''}
      <p class="muted dz-range">ช่วงข้อมูล ${n} ${word}: ${esc(range)}</p>
      <div class="cards dz-cards">
        ${kpi('Time Study', nSt, 'รายการ', `${word}ล่าสุด ${last.st.length} รายการ`)}
        ${kpi('CT เฉลี่ย', iCt >= 0 ? fmt(avg(B[iCt])) : '—', 'วินาที', iCt >= 0 ? (delta(avg(B[iCt]), iPrev >= 0 ? avg(B[iPrev]) : null, ' วิ', true) || esc(B[iCt].long)) : 'ยังไม่มี Time Study')}
        ${kpi('CT ที่ลดได้ (สะสม)', totRed ? '−' + fmt(totRed) : '0', 'วิ', nJob ? `${nJob} งาน · ลดเฉลี่ย ${fmt(totBf ? totRed / totBf * 100 : 0)}%` : 'ยังไม่มีงานปรับปรุง', totRed ? '#15856b' : '')}
        ${kpi('VA', sumT.ct ? fmt(sumT.VA / sumT.ct * 100) : '—', '%', iCt >= 0 ? delta(vaOf(B[iCt]), iPrev >= 0 ? vaOf(B[iPrev]) : null, '%', false) : '')}
        ${lb.lines.length ? kpi('Line Balance Rate', fmt(lb.lbr) + '%', '', `${lb.lines.length} ไลน์ · ต่ำกว่า 70% ${lb.low} ไลน์`, lbrColor(lb.lbr)) : kpi('Line Balance Rate', '—', '', 'ยังไม่มีข้อมูลสถานี')}
        ${kpi('อบรมสะสม', trained, 'คน')}
      </div>
      <section class="panel"><div class="panelhead"><h2>การลด CT ราย${word}</h2><small class="muted">แท่ง = CT ที่ลดได้ใน${word}นั้น · เส้น = ลดสะสม (หน่วยวินาทีเดียวกัน)</small></div><div class="dz-body" data-chart="red"></div></section>
      <div class="dz-grid">
        <section class="panel"><div class="panelhead"><h2>CT เฉลี่ย &amp; VA / NNVA / NVA</h2><small class="muted">เฉลี่ยต่อ Time Study · เส้นประ = TAKT เฉลี่ย</small></div><div class="dz-body" data-chart="ct"></div></section>
        <section class="panel"><div class="panelhead"><h2>Line Balance Rate ราย${word}</h2><small class="muted" title="ΣCT ÷ (จำนวนสถานี × CT สูงสุด) × 100 จาก Time Study ล่าสุดของแต่ละสถานี ณ สิ้น${word}">ณ สิ้น${word} · เป้า ≥ 85%</small></div><div class="dz-body" data-chart="lbr"></div></section>
        <section class="panel"><div class="panelhead"><h2>Two-Hand Operation ภาพรวม</h2><small class="muted">สัดส่วนจำนวน element ของมือซ้าย/ขวา · ${n} ${word}</small></div><div class="dz-body" data-chart="hands"></div></section>
        <section class="panel"><div class="panelhead"><h2>งานที่ลด CT ได้มากที่สุด</h2><small class="muted">${nJob} งานในช่วงนี้</small></div><div class="dz-body dz-top">${topList(P.kaizen, B)}</div></section>
      </div>
      ${ctx.lineBalanceTable(lb)}
      ${D().canEdit() ? `<div class="dash-links">
        <button class="bigbtn" data-go="timestudy"><b>⏱️ บันทึก Time Study</b><span>จับเวลา element จากวิดีโอ เก็บเฉพาะค่า</span></button>
        <button class="bigbtn" data-go="analysis"><b>🔧 วิเคราะห์งาน Before/After</b><span>เทียบก่อน/หลัง + อบรม + รายงานอัตโนมัติ</span></button>
      </div>` : ''}
      ${ctx.recent(P.studies, P.jobs)}`;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => window.CPS.showTab(b.dataset.go));
    el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; try { localStorage.setItem(PKEY, mode); } catch (e) {} render(el, ctx); });
    drawCharts(el, B, word);
  }

  function drawCharts(el, B, word) {
    const { fmt, esc } = U();
    const labels = B.map(b => b.label), wOf = k => { const d = el.querySelector(`[data-chart="${k}"]`); return d ? [d, Math.max(260, d.clientWidth - 24)] : [null, 0]; };
    // 1) combination: CT reduced per period (bars) + cumulative (line), one axis in seconds
    let cum = 0; const cumV = B.map(b => (cum += b.red));
    let [d, W] = wOf('red');
    if (d) d.innerHTML = B.some(b => b.jobs.length) ? chart('red', W, {
      labels, h: 270, aria: 'CT ที่ลดได้ราย' + word,
      stack: [{ name: 'CT ที่ลดได้ใน' + word + 'นั้น (วินาที)', color: C.s1, vals: B.map(b => b.red) }],
      lines: [{ name: 'ลดสะสม (วินาที)', color: C.s2, vals: cumV, endLabel: v => 'สะสม −' + fmt(v) + ' วิ' }],
      tip: i => `<b>${esc(B[i].long)}</b>${tipRow(C.s1, 'ลดได้', '−' + fmt(B[i].red) + ' วิ')}${tipRow(C.s2, 'ลดสะสม', '−' + fmt(cumV[i]) + ' วิ', 'line')}<div class="tr muted">${B[i].jobs.length} งาน${B[i].before ? ' · ลด ' + fmt(B[i].red / B[i].before * 100) + '%' : ''}</div>`,
    }) : '<div class="blank">ยังไม่มีงานวิเคราะห์ Before/After ในช่วงนี้</div>';
    // 2) CT stacked by VA/NNVA/NVA + avg TAKT (same unit)
    [d, W] = wOf('ct');
    const TY = U().TYPES, avg = (b, k) => b.st.length ? b[k] / b.st.length : 0;
    const tk = B.map(b => b.tk.length ? b.tk.reduce((a, v) => a + v, 0) / b.tk.length : null);
    if (d) d.innerHTML = B.some(b => b.st.length) ? chart('ct', W, {
      labels, aria: 'CT เฉลี่ยราย' + word,
      stack: TY.map(t => ({ name: t.k, color: t.color, vals: B.map(b => avg(b, t.k)) })),
      lines: tk.some(v => v != null) ? [{ name: 'TAKT เฉลี่ย', color: C.ink, vals: tk, dash: true }] : [],
      tip: i => { const b = B[i]; if (!b.st.length) return `<b>${esc(b.long)}</b><div class="tr muted">ไม่มี Time Study</div>`;
        return `<b>${esc(b.long)}</b>${TY.map(t => tipRow(t.color, t.k, fmt(avg(b, t.k)) + ' วิ')).join('')}<div class="tr"><span>CT เฉลี่ย</span><b>${fmt(b.ct / b.st.length)} วิ</b></div>${tk[i] != null ? tipRow(C.ink, 'TAKT เฉลี่ย', fmt(tk[i]) + ' วิ', 'dash') : ''}<div class="tr muted">${b.st.length} Time Study · VA ${fmt(b.VA / b.ct * 100)}%</div>`; },
    }) : '<div class="blank">ยังไม่มี Time Study ในช่วงนี้</div>';
    // 3) LBR trend
    [d, W] = wOf('lbr');
    const lv = B.map(b => b.lbr), mn = Math.min(...lv.filter(v => v != null), 100);
    if (d) d.innerHTML = lv.some(v => v != null) ? chart('lbr', W, {
      labels, aria: 'Line Balance Rate ราย' + word, yMin: Math.min(60, Math.floor((mn - 5) / 10) * 10), yMax: 100, unitTick: '%',
      lines: [{ name: 'Line Balance Rate', color: C.s1, vals: lv, endLabel: v => fmt(v) + '%' }],
      refs: [{ v: 85, label: 'เป้า 85%', color: '#15856b' }, { v: 70, label: '70%', color: '#c0392b' }],
      tip: i => `<b>${esc(B[i].long)}</b>${B[i].lbr != null ? tipRow(C.s1, 'Line Balance Rate', fmt(B[i].lbr) + '%', 'line') + `<div class="tr muted">${B[i].lines} ไลน์ · Balance loss ${fmt(100 - B[i].lbr)}%</div>` : '<div class="tr muted">ยังไม่มีข้อมูล</div>'}`,
    }) : '<div class="blank">ยังไม่มี Time Study ที่ผูกกับสถานีในไลน์</div>';
    // 4) two-hand overview: 100% stacked horizontal bars L / R + legend table
    [d] = wOf('hands');
    if (d) d.innerHTML = handsBlock(B);
    wireTips(el);
  }

  function handsBlock(B) {
    const { fmt } = U();
    const L = {}, R = {}; let els = 0, both = 0;
    B.forEach(b => { els += b.els; both += b.both; SYM.forEach(([k]) => { L[k] = (L[k] || 0) + (b.L[k] || 0); R[k] = (R[k] || 0) + (b.R[k] || 0); }); });
    if (!els) return '<div class="blank">ยังไม่มีข้อมูล Two-Handed ในช่วงนี้</div>';
    const tot = o => SYM.reduce((a, [k]) => a + (o[k] || 0), 0) || 1, tL = tot(L), tR = tot(R);
    const bar = (o, t, name) => `<div class="dz-hrow"><b>${name}</b><div class="dz-hbar">${SYM.map(([k, , lab, c]) => o[k] ? `<i style="width:${o[k] / t * 100}%;background:${c}" title="${lab} ${fmt(o[k] / t * 100)}%"></i>` : '').join('')}</div></div>`;
    const pct = (o, t, k) => fmt((o[k] || 0) / t * 100) + '%';
    const idle = k => ((L[k] || 0) + (R[k] || 0)) / (tL + tR) * 100;
    return `<div class="dz-hands">
      <div class="dz-hstats"><div><strong>${fmt(both / els * 100)}%</strong><span>สองมือทำงานพร้อมกัน (○ + ○)</span></div><div><strong>${fmt(idle('H'))}%</strong><span>มือถือค้าง ▽</span></div><div><strong>${fmt(idle('D'))}%</strong><span>มือรอ D</span></div></div>
      ${bar(L, tL, 'มือซ้าย (L.H)')}${bar(R, tR, 'มือขวา (R.H)')}
      <table class="dz-htable"><thead><tr><th>สัญลักษณ์</th><th>L.H</th><th>R.H</th></tr></thead><tbody>
      ${SYM.map(([k, s, lab, c]) => `<tr><td><i class="k-bar" style="--c:${c}"></i>${s} ${lab}</td><td>${pct(L, tL, k)} <small>(${L[k] || 0})</small></td><td>${pct(R, tR, k)} <small>(${R[k] || 0})</small></td></tr>`).join('')}
      </tbody></table><p class="muted">${els.toLocaleString('th-TH')} element จาก Time Study ในช่วงนี้</p></div>`;
  }

  function topList(kz, B) {
    const { esc, fmt } = U();
    if (!kz.length) return '<div class="blank">ยังไม่มีงานวิเคราะห์ Before/After ในช่วงนี้</div>';
    const top = kz.slice().sort((a, b) => b.red - a.red).slice(0, 6), mx = Math.max(...top.map(k => k.red), 1);
    return `<ol class="dz-toplist">${top.map(k => `<li><div><b>${esc(k.j.name || k.j.station || '—')}</b><small class="muted">${esc([k.j.team, k.j.station].filter(Boolean).join(' · '))} · ${esc(k.j.date || '')}</small></div>
      <div class="dz-topbar"><i style="width:${Math.max(2, k.red / mx * 100)}%"></i></div>
      <span><b>−${fmt(k.red)} วิ</b><small>${fmt(k.bf)} → ${fmt(k.af)} วิ (−${fmt(k.pct)}%)</small></span></li>`).join('')}</ol>`;
  }

  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const el = document.getElementById('tab-dashboard'); if (el && !el.hidden && ctxSaved && el.querySelector('.dz-body')) render(el, ctxSaved); }, 200); });
  window.CPSDashboard = { render };
})();
