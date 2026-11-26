/* CPS IE Studio — Workflow ต่อสถานี (6 ขั้น) + Flow อนุมัติ 5 ฝ่าย (ชื่อ+PIN)
   1 Time Study → 2 วิเคราะห์งาน → 3 Confirm ปรับปรุง? → 4 Line Balance → 5 New OIS Auto → 6 ส่งอนุมัติ
*/
(() => {
  const U = () => window.CPS.util;
  const D = () => window.CPS.data;
  let host = null, stationId = null, onBack = null;

  const FLOWS = [
    { key: 'reviewer', name: 'Flow 1 · ผู้ตรวจสอบ' },
    { key: 'safety', name: 'Flow 2 · ฝ่ายความปลอดภัย' },
    { key: 'quality', name: 'Flow 3 · ฝ่ายคุณภาพ' },
    { key: 'process', name: 'Flow 4 · ฝ่ายกระบวนการ' },
    { key: 'manager', name: 'Flow 5 · ผู้จัดการฝ่าย' },
  ];

  const rec = () => D().listStations().find(x => x.id === stationId);
  function wf() { const r = rec(); if (!r.wf) r.wf = { improve: null, lineBalance: null, newOis: null, approval: { submitted: false, by: '', flows: {} } }; return r.wf; }
  const saveRec = () => D().upsert('stations', rec());

  const G = () => D().group;
  function group() { const r = rec(); return G().aggregate(G().roundsOf(r.station)); }
  function matchStudy() { const g = group(); return g ? g.latest : null; }
  function matchJob() { const r = rec(); const k = String(r.station || '').trim().toLowerCase(); return k ? D().listJobs().find(j => G().key(j) === k) : null; }

  // ชื่อจากการล็อกอินผ่านพอร์ทัล (SSO) · ไม่มีก็ให้พิมพ์
  const ssoName = () => { const u = window.CPS_USER; return u ? String(u.name || u.username || '') : ''; };
  const loadOf = r => { const j = U().num(r.jph); return j ? D().ctOf(r) / (3600 / j) * 100 : 0; };
  function stepStatus() {
    const r = rec(), w = wf();
    const s1 = !!matchStudy();
    const job = matchJob();
    const s2 = !!job;
    const s3 = w.improve !== null && w.improve !== undefined && !(w.improve === false && loadOf(r) > 100);   // ปิดแบบไม่ปรับปรุงแต่ยังเกิน TAKT = ยังไม่เสร็จ
    const s4 = !w.improve ? null : !!(w.lineBalance && w.lineBalance.saved);
    const s5 = !w.improve ? null : !!(w.newOis && w.newOis.code && (w.newOis.reviewed || (w.approval && w.approval.submitted)));
    const approved = D().approvalOf(w).n >= FLOWS.length;   // นับเฉพาะการอนุมัติที่ใช้ได้
    const s6 = !w.improve ? null : approved;
    return { s1, s2, s3, s4, s5, s6, job, approved };
  }

  function open(id, container, back, opt) {
    stationId = id; host = container; onBack = back;
    const tt = document.getElementById('toast'); if (tt && !tt.classList.contains('has-action')) tt.classList.remove('show');
    render(); scrollTo(0, 0);
    if (!(opt && opt.top)) requestAnimationFrame(() => { const p = [...host.querySelectorAll('.wf-panel')].find(x => !x.querySelector('.wf-badge.ok') && !x.querySelector('.wf-lock')); if (p && p !== host.querySelector('.wf-panel')) p.scrollIntoView({ block: 'start' }); });
  }

  function render() {
    const r = rec(); if (!r) { onBack && onBack(); return; }
    const { esc, fmt } = U(); const can = D().canEdit(); const w = wf(); const st = stepStatus();
    const steps = [
      { n: 1, t: 'Time Study', done: st.s1 },
      { n: 2, t: 'วิเคราะห์งาน', done: st.s2 },
      { n: 3, t: 'ยืนยันปรับปรุง', done: st.s3 },
      { n: 4, t: 'Line Balance', done: st.s4 },
      { n: 5, t: 'OIS ใหม่', done: st.s5 },
      { n: 6, t: 'ส่งอนุมัติ', done: st.s6 },
    ];
    const ended = st.s3 && w.improve === false, over = loadOf(r) > 100;
    host.innerHTML = `
      <div class="page-head">
        <div><h1>${esc(r.station || 'สถานี')} <span class="muted">· ${esc(r.ois || '')}</span></h1><p class="muted wf-sub">Workflow · ${esc(r.model || '')} / ${esc(r.submodel || '')}</p></div>
        <button class="ghost" id="wf-back">← กลับตารางสถานี</button>
      </div>
      <div class="wf-steps" role="list">${steps.map((s, si) => `<div role="listitem" aria-label="ขั้น ${s.n} ${esc(s.t)} · ${s.done === true ? 'เสร็จ' : s.done === null ? 'ข้าม' : 'รอดำเนินการ'}" class="wf-step ${s.done === true ? 'done' : s.done === null ? 'skip' : ''}${si === steps.findIndex(x => x.done === false) ? ' now' : ''}"><span class="wf-dot">${s.done === true ? '✓' : s.n}</span><small>${esc(s.t)}</small></div>`).join('<i class="wf-sep"></i>')}</div>
      ${ended ? (over ? `<div class="ro-banner" style="background:#fdecea;border-color:#f3c4bd;color:#a12a1d">⚠ บันทึกไว้ว่า “ไม่ปรับปรุง” แต่สถานีนี้ยังเกิน TAKT (ภาระ ${fmt(loadOf(r))}%) — ควรกลับไปเลือก “ปรับปรุง” ในขั้น 3</div>` : '<div class="ro-banner" style="background:#e6f5ef;border-color:#bfe6d4;color:#14684e">✓ สรุป: ไม่ปรับปรุง — ปิดงานสถานีนี้แล้ว (ขั้น 4–6 ไม่ต้องทำ)</div>') : ''}
      <div id="wf-body"></div>`;
    host.querySelector('#wf-back').onclick = () => onBack && onBack();
    const body = host.querySelector('#wf-body');
    body.appendChild(panelStep1(st));
    body.appendChild(panelStep2(st));
    body.appendChild(panelStep3(st, can));
    if (w.improve) {
      body.appendChild(panelStep4(st, can));
      body.appendChild(panelStep5(st, can));
      body.appendChild(panelStep6(st, can));
    }
  }

  function panel(title, bodyNode, badge) {
    const done = /wf-badge ok/.test(badge || '');   // ขั้นที่เสร็จแล้วพับเหลือบรรทัดเดียว กดหัวข้อเพื่อเปิดดู
    const p = document.createElement('details'); p.className = 'panel wf-panel'; p.open = !done;
    p.innerHTML = `<summary class="panelhead"><h2>${title}</h2>${badge || ''}</summary>`;
    p.appendChild(bodyNode); return p;
  }
  const badgeDone = ok => ok ? '<span class="wf-badge ok">เสร็จ</span>' : '<span class="wf-badge">รอดำเนินการ</span>';

  // ---- Step 1 ----
  function panelStep1(st) {
    const { esc, fmt } = U(); const study = matchStudy();
    const d = document.createElement('div'); d.className = 'wf-pad';
    if (study) {
      const g = group();
      d.innerHTML = `<p>พบ Time Study <b>${g.n}</b> รอบ · CT เฉลี่ย <b>${fmt(g.ctAvg)}</b> วิ · สูงสุด <b>${fmt(g.ctMax)}</b> · ต่ำสุด <b>${fmt(g.ctMin)}</b> · VA ${fmt(g.vaPct)}%</p>`;
    } else d.innerHTML = `<p class="muted">ยังไม่มี Time Study ของสถานีนี้ (บันทึก Time Study โดยใส่รหัสสถานี “${esc(rec().station)}”)</p>`;
    const b = el('button', study ? 'ghost' : 'primary', study ? 'เปิด Time Study' : 'ไปบันทึก Time Study');
    b.onclick = () => window.CPSTimeStudy.showFor(rec().station);
    d.appendChild(b);
    return panel('1 · Time Study', d, badgeDone(st.s1));
  }
  // ---- Step 2 ----
  function panelStep2(st) {
    const { esc, fmt } = U(); const job = st.job;
    const d = document.createElement('div'); d.className = 'wf-pad';
    if (job) {
      const b = { ct: D().beforeOf(job).ct }, a = U().totals(job.after);
      d.innerHTML = `<p>งานวิเคราะห์: <b>${U().ud(job.name)}</b> · Before (รอบสูงสุด) ${fmt(b.ct)} วิ · After ${a.count ? fmt(a.ct) + ' วิ' + (job.autoAfter ? ' (ร่างอัตโนมัติ)' : '') : 'ยังไม่มี'}</p>`;
    } else d.innerHTML = `<p class="muted">ยังไม่มีงานวิเคราะห์ของสถานีนี้ — กดปุ่มด้านล่างเพื่อสร้างจาก Time Study</p>`;
    const hasStudy = !!matchStudy();
    const b = el('button', st.s2 ? 'ghost' : 'primary', st.s2 ? 'เปิดงานวิเคราะห์ของ ' + rec().station : 'สร้างงานวิเคราะห์ของ ' + rec().station);
    if (!st.s2 && rec().wf && rec().wf.improve === false && loadOf(rec()) > 100) b.hidden = true;   // ใช้ปุ่มเดียวในขั้น 3
    if (!st.s2 && !hasStudy) { b.disabled = true; b.title = 'ต้องมี Time Study ของสถานีนี้ก่อน'; }
    b.onclick = () => { let jb = st.job; if (!jb) { G().flow(G().key(rec())); jb = matchJob(); } if (jb) window.CPSAnalysis.openJob(jb.id); };
    d.appendChild(b);
    return panel('2 · วิเคราะห์งาน', d, badgeDone(st.s2));
  }
  // ---- Step 3 ----
  function panelStep3(st, can) {
    const { esc } = U(); const w = wf(); const r = rec();
    const d = document.createElement('div'); d.className = 'wf-pad';
    const lock3 = !!(w.approval && w.approval.submitted); if (lock3) can = false;
    if (can && w.improve === false && loadOf(r) > 100) {   // เกิน TAKT ปิดแบบไม่ปรับปรุงไม่ได้: สร้างงานวิเคราะห์แล้วตัดสินใจใหม่ในปุ่มเดียว
      d.innerHTML = `<div class="wf-advise block"><b>⚠ สถานีนี้ยังเกิน TAKT (${U().fmt(loadOf(r))}%) — ปิดแบบไม่ปรับปรุงไม่ได้</b><p>สร้างงานวิเคราะห์จาก Time Study แล้วตัดสินใจใหม่</p></div>`;
      const go = el('button', 'primary', st.s2 ? '↺ เปิดการตัดสินใจใหม่' : 'สร้างงานวิเคราะห์ + เปิดการตัดสินใจใหม่');
      if (!st.s1) { go.disabled = true; go.title = 'ต้องมี Time Study ของสถานีนี้ก่อน'; }
      go.onclick = () => { if (!matchJob()) G().flow(G().key(r)); w.improve = null; saveRec(); render(); };
      d.appendChild(go); return panel('3 · ยืนยันการปรับปรุง', d, badgeDone(false));
    }
    if (!st.s1 || !st.s2) { d.innerHTML = '<p class="muted">ทำขั้น 1–2 ให้เสร็จก่อนจึงจะยืนยันการปรับปรุงได้</p>'; return panel('3 · ยืนยันการปรับปรุง', d, badgeDone(false)); }
    const adv = D().advise(r);
    d.innerHTML = `<div class="wf-advise ${adv.status === 'improve' ? 'wait' : adv.status}"><b>ระบบแนะนำ: ${adv.status === 'improve' ? 'ควรปรับปรุง' : 'ยังไม่จำเป็นต้องปรับปรุง'}</b>${adv.reasons.length ? `<ul>${adv.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>ภาระงาน สัดส่วน NVA และคะแนนความง่าย อยู่ในเกณฑ์</p>'}</div><p>ยืนยันตามคำแนะนำ หรือเลือกเองได้</p>`;
    if (can && w.improve === false && loadOf(r) > 100) { const ro = el('button', 'primary', '↺ เปิดการตัดสินใจใหม่ (ยังเกิน TAKT)'); ro.onclick = () => { w.improve = null; saveRec(); render(); }; d.appendChild(ro); return panel('3 · ยืนยันการปรับปรุง', d, badgeDone(st.s3)); }
    if (!can) { if (lock3) d.innerHTML = d.innerHTML.replace('<p>ยืนยันตามคำแนะนำ หรือเลือกเองได้</p>', ''); if (lock3) d.insertAdjacentHTML('afterbegin', '<p class="wf-lock">🔒 ล็อกแล้ว — OIS ส่งอนุมัติไปแล้ว เปลี่ยนการตัดสินใจได้เมื่อถอนการส่งหรือถูกส่งกลับแก้ไข</p>'); d.innerHTML += `<p class="muted">สถานะ: ${w.improve === true ? 'จะปรับปรุง' : w.improve === false ? 'ไม่ปรับปรุง' : 'ยังไม่ตัดสิน'}</p>`; return panel('3 · ยืนยันการปรับปรุง', d, badgeDone(st.s3)); }
    const row = el('div', 'wf-btnrow');
    const yes = el('button', adv.status === 'improve' ? 'primary' : 'ghost', '✓ ปรับปรุง (ไปต่อ)');
    const no = el('button', adv.status === 'improve' ? 'ghost' : 'primary', '✕ ไม่ปรับปรุง (จบงาน)');
    if (w.improve === true) yes.classList.add('active-choice');
    if (w.improve === false) no.classList.add('active-choice');
    yes.onclick = () => {
      w.improve = true; saveRec();
      // ร่าง After ให้อัตโนมัติถ้ายังไม่มี: คัดลอก Before แล้วตัดขั้นตอน NVA ออก (คนแก้ต่อได้)
      const job = matchJob();
      if (job && !(job.after || []).length) { job.after = (D().beforeOf(job).els || []).filter(e => e.type !== 'NVA').map(e => ({ ...e, id: U().uid() })); job.autoAfter = true; D().upsert('jobs', job); U().toast('ร่าง After ให้แล้ว (ตัดขั้นตอน NVA ออก) — แก้ได้ที่วิเคราะห์งาน'); }
      render();
    };
    const over = loadOf(r) > 100;
    if (over) { no.disabled = true; no.title = 'สถานีนี้ภาระเกิน 100% ของ TAKT — ต้องปรับปรุง ปิดงานแบบไม่ปรับปรุงไม่ได้'; }
    no.onclick = async () => { if (over) return; if (await U().ask('ยืนยันว่าไม่ปรับปรุงและปิดงานสถานีนี้? (ขั้น 4–6 จะถูกข้าม)', [], { ok: 'ไม่ปรับปรุง · ปิดงาน', cancel: 'ยังไม่ตัดสิน' })) { w.improve = false; saveRec(); render(); } };
    row.append(yes, no); d.appendChild(row);
    if (over) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'สถานีนี้ภาระเกิน TAKT (' + U().fmt(loadOf(r)) + '%) จึงต้องปรับปรุง — ปุ่ม “ไม่ปรับปรุง” ปิดไว้'; d.appendChild(p); }
    return panel('3 · ยืนยันการปรับปรุง', d, badgeDone(st.s3));
  }
  // ---- Step 4: Line Balance (ระบบเสนอให้ คนตรวจแล้วยืนยัน) ----
  function lbItems() {
    const r = rec(); const job = matchJob();
    const peers = D().listStations().filter(x => x.model === r.model && x.submodel === r.submodel && x.team === r.team && x.group === r.group && x.workshop === r.workshop)
      .sort((x, y) => String(x.station).localeCompare(String(y.station), undefined, { numeric: true }));
    return peers.map(p => {
      const g = G().aggregate(G().roundsOf(p.station));
      const ci = D().ctInfo(p), pj = ci.src === 'after' ? D().listJobs().find(j => G().key(j) === G().key(p) && (j.after || []).length) : null;
      return { id: p.id, station: p.station, now: ci.ct, ct: ci.ct, els: pj ? pj.after : (g ? g.elements : []), improved: ci.src === 'after', locked: p.id !== r.id && !!(p.wf && p.wf.approval && p.wf.approval.submitted) };
    });
  }
  function panelStep4(st, can) {
    const { esc, fmt, num } = U(); const w = wf(); const r = rec();
    const d = document.createElement('div'); d.className = 'wf-pad';
    const locked = !!(w.approval && w.approval.submitted);   // ส่งอนุมัติแล้ว: Line Balance ล็อกให้ตรงกับ OIS ที่ส่ง
    if (locked) { can = false; d.insertAdjacentHTML('beforeend', '<p class="wf-lock">🔒 ล็อกแล้ว — OIS ส่งอนุมัติไปแล้ว แก้ Line Balance ได้เมื่อถอนการส่งหรือถูกส่งกลับแก้ไข</p>'); }
    const lineJph = (D().listStations().find(x => x.model === r.model && x.submodel === r.submodel && x.team === r.team && num(x.jph)) || {}).jph;
    const lb = w.lineBalance || (w.lineBalance = { targetJph: r.jph || lineJph || 22, limit: 90, rows: {}, auto: true });
    if (lb.limit == null) lb.limit = 90;
    if (locked) {
      const allL = lbItems(), rowsL = lb.rows || {};
      if (lb.saved && lb.confirmedAt) d.insertAdjacentHTML('beforeend', `<p class="wf-okline">✓ ยืนยันแล้ว · จาก ${esc(lb.confirmedFrom || '')} · ${esc(U().dateTxt(lb.confirmedAt, true))}</p>`);
      else if (!lb.saved) d.insertAdjacentHTML('beforeend', '<p class="muted">ไม่มี Line Balance ที่ยืนยันไว้ตอนส่ง OIS</p>');
      if (lb.saved && (lb.moveList || []).length) d.insertAdjacentHTML('beforeend', `<ul class="wf-moves">${lb.moveList.map(m => `<li>${esc(m.from)} → ${esc(m.to)} · ${fmt(m.sec)} วิ</li>`).join('')}</ul>`);
      if (lb.saved && !allL.some(it => rowsL[it.id] != null)) d.insertAdjacentHTML('beforeend', '<p class="muted">ไม่มีค่า CT หลังปรับที่ยืนยันไว้ตอนส่ง OIS — แสดงเฉพาะ CT ที่ใช้</p>');
      const tL = document.createElement('div'); tL.className = 'table-scroll';
      tL.innerHTML = `<table class="sb-table lb-table"><thead><tr><th>สถานี</th><th>CT ที่ใช้</th><th>CT หลังปรับ (ที่ยืนยัน)</th></tr></thead><tbody>${allL.map(it => `<tr><td class="sb-st" data-l="สถานี">${esc(it.station)}${it.locked || it.id === r.id ? ' 🔒' : ''}</td><td data-l="CT ที่ใช้">${fmt(it.ct)} วิ</td><td data-l="CT หลังปรับ (ที่ยืนยัน)">${lb.saved && rowsL[it.id] != null ? fmt(num(rowsL[it.id])) + ' วิ' : '—'}</td></tr>`).join('')}</tbody></table>`;
      d.appendChild(tL);
      return panel('4 · Line Balance', d, badgeDone(st.s4));
    }
    const all = lbItems(), items = all.filter(it => !it.locked);   // สถานีที่ส่ง OIS แล้ว: คงที่ ไม่ย้ายงานเข้า/ออก
    const takt = num(lb.targetJph) ? 3600 / num(lb.targetJph) : 0;
    // สถานีที่ล็อกเป็น "กำแพง": เกลี่ยงานเฉพาะในช่วงสถานีติดกันที่ยังไม่ล็อก (ย้ายงานได้เฉพาะสถานีข้างเคียงจริง)
    const segs = []; let seg = [];
    all.forEach(it => { if (it.locked) { if (seg.length) segs.push(seg); seg = []; } else seg.push(it); }); if (seg.length) segs.push(seg);
    const parts = segs.map(sg => D().balance(sg, takt, lb.limit));
    const propOf = {}; parts.forEach((pp, k) => segs[k].forEach((it, i) => { propOf[it.id] = pp.proposed[i]; }));
    const whole = D().balance(all, takt, lb.limit);
    const prop = Object.assign({}, whole, { proposed: items.map(it => propOf[it.id]), moves: [].concat(...parts.map(pp => pp.moves)),
      feasible: items.every(it => num(propOf[it.id]) <= whole.limit + 1), shortage: U().round1(items.reduce((a, it) => a + Math.max(0, num(propOf[it.id]) - whole.limit), 0)) });
    // การย้ายที่ทำให้สถานีปลายทางเกินเพดาน ใช้ไม่ได้ — ถ้าไม่มีการย้ายที่ใช้ได้เลย ข้อเสนอ = คงงานเดิม
    const recvOver = m => { const t = all.find(x => x.station === m.to); return !!t && num(propOf[t.id]) > whole.limit + 1; };
    const badMoves = prop.moves.filter(recvOver), noValid = prop.moves.length > 0 && badMoves.length === prop.moves.length;
    if (noValid) { items.forEach((it, i) => { propOf[it.id] = it.ct; prop.proposed[i] = it.ct; }); prop.moves = []; }
    const applyProp = () => { lb.rows = {}; items.forEach((it, i) => lb.rows[it.id] = prop.proposed[i]); lb.auto = true; };
    if (can && !lb.saved && (lb.auto !== false || !Object.keys(lb.rows).length)) applyProp();

    const overT = all.filter(it => !it.locked && takt && num(propOf[it.id]) > takt + 0.05);
    if (overT.length) {
      const walls = it => { const i = all.indexOf(it), nb = [all[i - 1], all[i + 1]].filter(Boolean); return nb.length && nb.every(x => x.locked) ? nb : null; };
      const lead = el('div', 'wf-advise block wf-lead');
      lead.innerHTML = `<b>ไลน์นี้ยังถึง TAKT ไม่ได้จนกว่า Kaizen ของ <span translate="no">${esc(overT.map(it => it.station).join(', '))}</span> จะลดงานได้</b>` +
        overT.map(it => { const w2 = walls(it); return w2 ? `<p><span translate="no">${esc(it.station)}</span> อยู่ระหว่างสถานีที่ส่ง OIS แล้ว (<span translate="no">${esc(w2.map(x => x.station).join(', '))}</span>) — ย้ายงานออกไม่ได้ ต้องลดงานใน Kaizen ของสถานีนั้น</p>` : `<p><span translate="no">${esc(it.station)}</span> ${fmt(num(propOf[it.id]) / takt * 100)}% ยังเกิน TAKT หลังเกลี่ยงาน</p>`; }).join('');
      const lrow = el('div', 'wf-btnrow');
      overT.forEach(it => { const b = el('button', it.id === r.id ? 'primary' : 'ghost', it.id === r.id ? 'ลดงานในงานวิเคราะห์ของสถานีนี้ (ขั้น 2)' : 'เปิดขั้นตอนของ ' + it.station + ' →');
        b.onclick = () => { if (it.id === r.id) { const jb = matchJob(); if (jb) window.CPSAnalysis.openJob(jb.id); } else open(it.id, host, onBack, { top: true }); }; lrow.appendChild(b); });
      lead.appendChild(lrow); d.appendChild(lead);
    }
    const head = el('div', 'wf-lbhead');
    head.innerHTML = `<label class="field"><span>JPH เป้าหมาย (TAKT = ${fmt(takt)} วิ)</span><input id="lb-jph" type="number" min="1" value="${esc(lb.targetJph)}" ${can ? '' : 'disabled'}></label>
      <label class="field"><span title="ภาระสูงสุดที่ยอมให้แต่ละสถานีตอนเกลี่ยงาน (% ของ TAKT เช่น 90%) เผื่อไว้ไม่ให้ชน TAKT">เพดานภาระต่อสถานี (%) ⓘ</span><input id="lb-limit" type="number" min="50" max="100" value="${esc(lb.limit)}" ${can ? '' : 'disabled'}></label>`;
    d.appendChild(head);

    const box = el('div', 'wf-advise ' + (prop.feasible && !noValid ? 'ok' : 'info'));
    const mvLi = m => `<li>ย้ายงานจาก <b translate="no">${esc(m.from)}</b> → <b translate="no">${esc(m.to)}</b> · <b>${fmt(m.sec)} วิ</b>${m.pick.names && m.pick.names.length ? ' · ขั้นตอนที่เสนอ: ' + U().ud(m.pick.names.map(n => String(n).replace(/\s*\([\d.]+\s*วิ\)\s*$/, '')).join(', ')) : m.pick.split ? ' · ต้องแบ่งขั้นตอน “' + U().ud(m.pick.split) + '” (' + fmt(m.pick.splitSec) + ' วิ)' : ''}${recvOver(m) ? ` <small class="wf-warn">→ <span translate="no">${esc(m.to)}</span> จะเกินเพดาน — ต้องลดงานก่อน</small>` : ''}</li>`;
    const nLock = all.length - items.length;
    const facts = `<div class="lb-facts"><div><span>งานรวม</span><b>${fmt(prop.total)} วิ</b></div><div><span>เพดานต่อสถานี (${fmt(lb.limit)}%)</span><b>${fmt(prop.limit)} วิ</b></div><div><span>สถานีที่ต้องใช้</span><b>${prop.minStations} <small>/ ใช้อยู่ ${all.length}</small></b></div><div><span>สถานีที่ยังย้ายงานได้</span><b>${items.length}${nLock ? ` <small>(ล็อก ${nLock})</small>` : ''}</b></div></div>`;
    const alts = `<p class="lb-alts">ทางเลือก: ลดงานใน Kaizen ของสถานีที่เกิน · เพิ่มสถานี/คน · ปรับ JPH เป้าหมาย</p>`;
    box.innerHTML = `<b>ข้อเสนอของระบบ</b>` + facts +
      (noValid ? `<p class="lb-verdict"><b>ไม่มีการย้ายงานที่ทำได้</b> — ทุกการย้ายจะทำให้สถานีปลายทางเกินเพดาน ระบบจึงคงงานเดิมไว้</p>${alts}<details class="lb-tried"><summary>การย้ายที่ระบบลองแล้วใช้ไม่ได้ (${badMoves.length})</summary><ul>${badMoves.map(mvLi).join('')}</ul></details>`
        : (prop.feasible ? `<p class="lb-verdict">เกลี่ยงานให้ทุกสถานีอยู่ในเพดานได้</p>` : `<p class="lb-verdict"><b>เกลี่ยไม่ลงภายใน ${items.length} สถานี</b> — ยังเกินอยู่ ${fmt(prop.shortage)} วิ</p>${alts}`) +
          (prop.moves.length ? `<ul>${prop.moves.map(mvLi).join('')}</ul>` : '<p>ทุกสถานีอยู่ในเพดานแล้ว ไม่ต้องย้ายงาน</p>'));
    if (lb.saved && lb.confirmedAt) box.insertAdjacentHTML('afterbegin', `<p class="wf-okline">✓ ยืนยันแล้วทั้งไลน์ · จาก ${esc(lb.confirmedFrom || '')} · ${esc(U().dateTxt(lb.confirmedAt, true))}</p>`);
    d.appendChild(box);

    const tbl = document.createElement('div'); tbl.className = 'table-scroll';
    const loadCell = v => { const load = takt ? (num(v) / takt) * 100 : 0; const col = load > 100 ? '#c0392b' : load > num(lb.limit || 90) ? '#9a5b00' : '#15856b'; return `<div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(load, 100)}%;background:${col}"></i></div><span style="color:${col}">${fmt(load)}%</span></div>`; };
    tbl.innerHTML = `<table class="sb-table"><thead><tr><th>สถานี</th><th>CT ที่ใช้</th><th>ระบบเสนอ</th><th>CT หลังปรับ</th><th>ภาระใหม่</th></tr></thead><tbody>${all.map((it, i) => {
      const after = lb.rows[it.id] != null ? lb.rows[it.id] : it.ct;
      return `<tr data-pid="${it.id}"><td class="sb-st">${esc(it.station)}${it.improved ? ' <small class="muted">(ใช้ค่า After)</small>' : ''}${it.locked ? ' <small class="wf-lk">🔒 OIS รออนุมัติ</small>' : ''}</td><td>${fmt(it.now)} วิ</td><td>${(v => fmt(v) + ' วิ' + (!it.locked && v > whole.limit + 1 ? ' <small class="wf-warn">เกินเพดาน</small>' : ''))(num(it.locked ? it.ct : lb.saved && lb.proposed && lb.proposed[it.id] != null ? lb.proposed[it.id] : propOf[it.id]))}</td>
        <td><input class="lb-ct" aria-label="CT หลังปรับ ${esc(it.station)}" type="number" min="0" step="0.1" value="${esc(U().round1(num(after)))}" style="max-width:90px" ${can && !it.locked ? '' : 'disabled'}></td><td class="lb-load">${loadCell(after)}</td></tr>`;
    }).join('')}</tbody></table>`;
    tbl.querySelectorAll('tr[data-pid]').forEach(tr => { const i = tr.querySelector('.lb-ct'); i.oninput = () => { lb.rows[tr.dataset.pid] = i.value; lb.auto = false; tr.querySelector('.lb-load').innerHTML = loadCell(i.value); }; });
    { const hd = [...tbl.querySelectorAll('th')].map(th => th.textContent); tbl.querySelector('table').classList.add('lb-table'); tbl.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => { td.dataset.l = hd[i] || ''; })); }
    if (all.length > items.length) d.insertAdjacentHTML('beforeend', `<p class="muted">🔒 ${all.length - items.length} สถานีส่ง OIS แล้ว — ไม่นำมาเกลี่ยงาน</p>`);
    d.appendChild(tbl);

    if (can) {
      head.querySelector('#lb-jph').onchange = e => { lb.targetJph = e.target.value; lb.saved = false; saveRec(); render(); };
      head.querySelector('#lb-limit').onchange = e => { lb.limit = e.target.value; lb.saved = false; saveRec(); render(); };
      const row = el('div', 'wf-btnrow'); row.style.marginTop = '12px';
      const use = el('button', 'ghost', noValid ? '↺ คืนค่า CT เดิม' : '↺ ใช้ข้อเสนอของระบบ'); use.onclick = () => { applyProp(); lb.saved = false; saveRec(); render(); };
      if (noValid) use.title = 'ไม่มีการย้ายงานที่ใช้ได้ — ปุ่มนี้คืนค่า CT หลังปรับเป็นค่าเดิมของทุกสถานี';
      const ok = el('button', 'primary', lb.saved ? '✓ ยืนยัน Line Balance อีกครั้ง' : '✓ ยืนยัน Line Balance');
      ok.onclick = async () => {
        const others = D().listStations().filter(p => p.id !== r.id && p.model === r.model && p.submodel === r.submodel && p.team === r.team && p.group === r.group && p.workshop === r.workshop);
        const upd = [r.station].concat(others.filter(p => !(p.wf && p.wf.approval && p.wf.approval.submitted)).map(p => p.station)), skip = others.filter(p => p.wf && p.wf.approval && p.wf.approval.submitted).map(p => p.station);
        const aft = it => num(it.locked ? it.ct : (lb.rows[it.id] != null ? lb.rows[it.id] : it.ct));
        const oT = all.filter(it => takt && aft(it) > takt + 0.05), oC = all.filter(it => !it.locked && aft(it) > whole.limit + 1 && !oT.includes(it));
        const res = `หลังยืนยัน: เกิน TAKT ${oT.length}${oT.length ? ' (' + oT.map(it => it.station + ' ' + fmt(aft(it) / takt * 100) + '%').join(', ') + ')' : ''} · เกินเพดาน ${oC.length}${oC.length ? ' (' + oC.map(it => it.station).join(', ') + ')' : ''}`;
        if (!(await U().ask(`ยืนยัน Line Balance ทั้งไลน์? อัปเดต: ${upd.join(', ')}${skip.length ? ' · ข้าม (ส่ง OIS แล้ว): ' + skip.join(', ') : ''} — ${res}`, [], { ok: 'ยืนยันทั้งไลน์', cancel: 'ยกเลิก' }))) return;
        lb.saved = true; lb.moves = prop.moves.map(m => `${m.from} → ${m.to}: ${m.sec} วิ`);
        lb.moveList = prop.moves.map(m => ({ from: m.from, to: m.to, sec: m.sec, names: (m.pick && m.pick.names) || [], split: m.pick && m.pick.split ? { name: m.pick.split, sec: m.pick.splitSec } : null }));
        lb.proposed = {}; all.forEach(it => { lb.proposed[it.id] = it.locked ? it.ct : propOf[it.id]; });
        lb.confirmedFrom = r.station; lb.confirmedAt = Date.now();
        // Line Balance เป็นของทั้งไลน์: ยืนยันครั้งเดียวแล้วทุกสถานีในไลน์ใช้ร่วมกัน (ยกเว้นสถานีที่ส่ง OIS แล้ว)
        let skipped = 0;
        D().listStations().filter(p => p.id !== r.id && p.model === r.model && p.submodel === r.submodel && p.team === r.team && p.group === r.group && p.workshop === r.workshop).forEach(p => {
          if (p.wf && p.wf.approval && p.wf.approval.submitted) { skipped++; return; }
          p.wf = p.wf || { improve: null, lineBalance: null, newOis: null, approval: { submitted: false, by: '', flows: {} } };
          p.wf.lineBalance = JSON.parse(JSON.stringify(lb)); D().upsert('stations', p);
        });
        const sent = w.approval && w.approval.submitted;
        if (!sent) makeOis();   // ร่าง OIS ใหม่ให้ตรวจในขั้น 5 · ยังไม่ส่งอนุมัติ
        saveRec(); U().toast(sent ? 'บันทึก Line Balance แล้ว (OIS ส่งอนุมัติไปแล้ว ไม่ได้สร้างใหม่)' : 'ยืนยัน Line Balance แล้ว — ตรวจร่าง OIS ในขั้น 5 ก่อนส่งอนุมัติ'); render();
        setTimeout(() => { const p = host.querySelectorAll('.wf-panel')[4]; if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
      };
      row.append(ok, use); d.appendChild(row);
    }
    return panel('4 · Line Balance', d, badgeDone(st.s4));
  }
  // ---- Step 5: New OIS Auto ----
  function panelStep5(st, can) {
    const { esc, fmt, num } = U(); const w = wf(); const r = rec();
    const d = document.createElement('div'); d.className = 'wf-pad';
    if (!st.s4) { d.innerHTML = '<p class="muted">ทำ Line Balance (ขั้น 4) ให้เสร็จก่อน</p>'; return panel('5 · ตรวจ OIS ใหม่', d, badgeDone(false)); }
    if (w.newOis && w.newOis.code) {
      const o = w.newOis;
      d.innerHTML = `<p>รหัส OIS ใหม่: <b>${esc(o.code)}</b> · สร้างเมื่อ ${esc(U().dateTxt(o.generatedAt, true))}</p>
        <p class="muted">CT ตาม OIS ${fmt((o.steps || []).reduce((t, x) => t + num(x.sec), 0))} วิ${o.lbCt ? ` · เป้าจาก Line Balance ${fmt(o.lbCt)} วิ` : ''}</p>
        <table class="el-table"><thead><tr><th>#</th><th>ขั้นตอน</th><th>วิ</th><th>ประเภท</th></tr></thead><tbody>${(o.steps || []).map((s, i) => `<tr><td class="idx">${i + 1}</td><td>${U().ud(s.name)}</td><td>${fmt(num(s.sec))}</td><td>${esc(s.type)}</td></tr>`).join('')}</tbody></table>`;
      const sent = w.approval && w.approval.submitted;
      if (sent) d.insertAdjacentHTML('beforeend', '<p class="muted">ส่งอนุมัติแล้ว — แก้ OIS ไม่ได้ระหว่างรออนุมัติ (ถอนการส่งได้ถ้ายังไม่มีใครอนุมัติ หรือให้ฝ่ายอนุมัติกด “ส่งกลับแก้ไข”)</p>');
      else if (o.reviewed) d.insertAdjacentHTML('beforeend', '<p class="wf-okline">✓ ตรวจแล้ว — ส่งอนุมัติได้ในขั้น 6</p>');
      else d.insertAdjacentHTML('beforeend', '<p class="wf-todo">ตรวจขั้นตอนและเวลาในร่าง OIS ด้านบน แล้วกด “ตรวจแล้ว” ก่อนส่งอนุมัติ</p>');
      if (can && !sent) { const row = el('div', 'wf-btnrow');
        if (!o.reviewed) { const okb = el('button', 'primary', '✓ ตรวจแล้ว ใช้ OIS นี้'); okb.onclick = () => { o.reviewed = true; saveRec(); render(); }; row.appendChild(okb); }
        const re = el('button', 'ghost', '↻ สร้างร่างใหม่จากวิธีล่าสุด'); re.onclick = () => genOis(); row.appendChild(re); d.appendChild(row); }
    } else {
      d.innerHTML = `<p class="muted">สร้างเอกสาร OIS มาตรฐานใหม่อัตโนมัติจากวิธีที่ปรับปรุงแล้ว</p>`;
      if (can) { const g = el('button', 'primary', '⚙ สร้าง OIS ใหม่อัตโนมัติ'); g.onclick = () => genOis(); d.appendChild(g); }
    }
    return panel('5 · ตรวจ OIS ใหม่', d, badgeDone(st.s5));
  }
  function makeOis() {
    const r = rec(), w = wf(); const job = matchJob(); const study = matchStudy();
    const g = group(); const src = job && (job.after || []).length ? job.after : (g ? g.elements : []);
    const cur = String(r.ois || ''), m = cur.match(/-R(\d+)$/i);
    const code = (cur ? cur.replace(/-R\d+$/i, '') : 'OIS-' + String(r.station || '').toUpperCase()) + '-R' + (m ? Number(m[1]) + 1 : 2);   // แก้ไขครั้งถัดไปของ OIS เดิม
    let steps = (src || []).map(e => ({ name: e.name, sec: U().round1(U().num(e.sec)), type: e.type }));
    const lbs = w.lineBalance;
    if (lbs && lbs.saved && lbs.moveList) {   // งานที่ Line Balance ย้ายเข้า/ออกจากสถานีนี้
      const items = lbItems();
      const fi = st => items.find(it => it.station === st), r1 = U().round1, num = U().num;
      lbs.moveList.forEach(m => {
        const names = (m.names || []).map(n => String(n).replace(/\s*\([\d.]+\s*วิ\)\s*$/, ''));   // ชื่อในข้อเสนอมีเวลาต่อท้าย "(27.8 วิ)"
        if (names.length) {
          if (m.from === r.station) steps = steps.filter(x => !names.includes(x.name));
          if (m.to === r.station) ((fi(m.from) || {}).els || []).filter(e => names.includes(e.name)).forEach(e => steps.push({ name: e.name + ' (ย้ายจาก ' + m.from + ')', sec: r1(num(e.sec)), type: e.type }));
        }
        if (m.split) {   // แบ่งบางส่วนของขั้นตอนไปสถานีถัดไป
          if (m.from === r.station) { const x = steps.find(s => s.name === m.split.name); if (x) { x.sec = r1(Math.max(0, num(x.sec) - num(m.sec))); x.name += ' (ส่วน ' + r1(num(m.sec)) + ' วิ ย้ายไป ' + m.to + ')'; } }
          if (m.to === r.station) { const e = ((fi(m.from) || {}).els || []).find(e => e.name === m.split.name); steps.push({ name: m.split.name + ' (ส่วนที่ย้ายจาก ' + m.from + ')', sec: r1(num(m.sec)), type: e ? e.type : 'VA' }); }
        }
      });
    }
    w.newOis = { code, generatedAt: Date.now(), steps, lbCt: lbs && lbs.saved && lbs.rows ? U().num(lbs.rows[r.id]) || null : null };
    return w.newOis;
  }
  function genOis() { const o = makeOis(); saveRec(); U().toast('สร้าง OIS ใหม่: ' + o.code); render(); }
  // ---- Step 6: Approval ----
  function panelStep6(st, can) {
    const { esc } = U(); const w = wf(); const ap = w.approval || (w.approval = { submitted: false, by: '', flows: {} });
    const d = document.createElement('div'); d.className = 'wf-pad';
    if (!st.s5) { d.innerHTML = '<p class="muted">ตรวจร่าง OIS (ขั้น 5) ให้เสร็จก่อนจึงส่งอนุมัติได้</p>'; return panel('6 · ส่งอนุมัติ', d, badgeDone(false)); }
    if (!ap.submitted) {
      const back = (ap.history || []).filter(h => h.type === 'return').slice(-1)[0];
      d.innerHTML = (back ? `<div class="wf-advise wait"><b>↩ ถูกส่งกลับแก้ไข</b><p>${esc(back.flowName)} · ${U().ud(back.by)} · ${esc(U().dateTxt(back.at, true))}</p><p>เหตุผล: ${U().ud(back.reason)}</p></div>` : '') +
        `<p>ส่งเอกสาร OIS <b>${esc(w.newOis.code)}</b> เข้าสู่ขั้นตอนอนุมัติ 5 ฝ่าย</p>`;
      if (can) { const b = el('button', 'primary', '📤 ส่งอนุมัติ'); b.onclick = async () => {
        let me = ssoName();
        const a = await U().ask(`ส่ง OIS ${w.newOis.code} (${(w.newOis.steps || []).length} ขั้นตอน) ให้ 5 ฝ่ายอนุมัติ${me ? ' ในชื่อ ' + me : ''}?`, me ? [] : [{ name: 'by', label: 'ชื่อผู้จัดทำ (ผู้ส่งอนุมัติ)' }], { ok: 'ส่งอนุมัติ', cancel: 'ยังไม่ส่ง' });
        if (!a) return; if (!me) me = String(a.by || '').trim(); if (!me) { U().toast('ใส่ชื่อผู้จัดทำก่อนส่ง'); return; }
        const jb0 = matchJob(); if (jb0) { const bo = D().beforeOf(jb0); ap.before = { ct: bo.ct, els: (bo.els || []).map(e => ({ name: e.name, sec: e.sec, type: e.type })) }; }
        const ci = D().ctInfo(rec()); ap.ct = { ct: ci.ct, before: ci.before || null, src: ci.src };
        ap.submitted = true; ap.by = me; ap.submittedAt = Date.now(); saveRec(); U().toast('ส่งอนุมัติแล้ว — รอผู้อนุมัติ 5 ฝ่าย'); render(); }; d.appendChild(b); }
      return panel('6 · ส่งอนุมัติ', d, badgeDone(false));
    }
    const flowsWrap = el('div', 'wf-flows');
    const av = D().approvalOf(w);
    const waiting = FLOWS.filter(f => !av.valid[f.key]).map(f => f.name.split('·').pop().trim());
    const firstPending = av.firstPending, online = window.CPS.sheet.configured();
    flowsWrap.innerHTML = `<div class="wf-maker">👤 ผู้จัดทำ: <b>${U().ud(ap.by)}</b>${waiting.length ? ` · รอ: ${esc(waiting.join(', '))}` : ''}</div>` + FLOWS.map((f, i) => {
      const s = ap.flows[f.key], ok = !!av.valid[f.key], why = av.why[f.key];
      const actions = ok ? '' : (can ? (i === firstPending ? `<span class="wf-acts"><button class="wf-approve" data-flow="${f.key}"${online ? '' : ' disabled title="ต้องเชื่อมข้อมูลกลางก่อนจึงอนุมัติได้"'}>อนุมัติ</button><button class="ghost wf-return" type="button"${online ? '' : ' disabled title="ต้องเชื่อมข้อมูลกลางก่อนจึงส่งกลับได้"'}>↩ ส่งกลับแก้ไข</button></span>` : `<small class="muted">รอ Flow ${firstPending + 1}</small>`) : '');
      const note = !s || !s.by ? '<small class="muted">ยังไม่อนุมัติ</small>'
        : ok ? `<small>อนุมัติโดย ${U().ud(s.by)} · ${esc(U().dateTxt(s.at, true))}</small>`
        : `<small><s>อนุมัติโดย ${U().ud(s.by)} · ${esc(U().dateTxt(s.at, true))}</s> <span class="wf-old">ต้องอนุมัติใหม่ — ${why === 'stale' ? 'อนุมัติก่อน OIS ฉบับนี้' : 'คนเดียวกับฝ่ายก่อนหน้า'}</span></small>`;
      return `<div class="wf-flow ${ok ? 'approved' : why ? 'redo' : ''}"><div class="wf-flow-no">${ok ? '✓' : i + 1}</div>
        <div class="wf-flow-body"><b>${esc(f.name)}</b>${note}</div>
        ${actions}</div>`;
    }).join('');
    d.appendChild(flowsWrap);
    if (can) flowsWrap.querySelectorAll('.wf-approve').forEach(b => b.onclick = () => approve(b.dataset.flow));
    if (can) flowsWrap.querySelectorAll('.wf-return').forEach(b => b.onclick = returnForRevision);
    if (can && !online) d.insertAdjacentHTML('afterbegin', '<div class="wf-advise wait"><b>ยังอนุมัติหรือส่งกลับจากเครื่องนี้ไม่ได้</b><p>เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — เปิดแอปจากลิงก์สำหรับทีมแล้วจึงอนุมัติได้</p></div>');
    if ((ap.history || []).length) d.insertAdjacentHTML('beforeend', `<details class="wf-hist"><summary>ประวัติการส่งกลับ (${ap.history.length})</summary><ul>${ap.history.map(h => `<li>${esc(U().dateTxt(h.at, true))} · ${esc(h.flowName)} · ${U().ud(h.by)} — ${U().ud(h.reason)}</li>`).join('')}</ul></details>`);
    if (can && av.n === 0) {
      const wd = el('button', 'ghost', '↶ ถอนการส่ง (ยังไม่มีใครอนุมัติ)');
      wd.onclick = async () => { if (await U().ask('ถอนการส่งอนุมัติ OIS นี้? แก้ OIS แล้วค่อยส่งใหม่ได้', [], { ok: 'ถอนการส่ง', cancel: 'ไม่ถอน', danger: true })) { ap.submitted = false; ap.by = ''; delete ap.before; delete ap.ct; if (w.newOis) w.newOis.reviewed = false; saveRec(); render(); } };
      d.appendChild(wd);
    }
    return panel('6 · ส่งอนุมัติ', d, st.approved ? badgeDone(true) : `<span class="wf-badge">อนุมัติแล้ว ${av.n}/${FLOWS.length}${av.firstPending >= 0 ? ' · รอ Flow ' + (av.firstPending + 1) : ''}${D().approvalDots(w)}</span>`);
  }
  async function approve(flowKey) {
    // PIN กลาง: ตรวจที่ server (ผู้ดูแลตั้งที่หน้าหลังบ้าน) ใช้ได้ทุกเครื่อง · PIN ผิดแล้วกล่องเปิดค้างพร้อมข้อความเดิม
    const S = window.CPS.sheet;
    if (!S.configured()) { U().toast('เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — ขอลิงก์สำหรับทีมจากผู้ดูแลระบบ'); return; }
    const f = FLOWS.find(x => x.key === flowKey);
    const av0 = D().approvalOf(wf()), fp = av0.firstPending;
    if (FLOWS.indexOf(f) !== fp) { U().toast('อนุมัติตามลำดับ — รอ ' + FLOWS[fp].name + ' ก่อน'); return; }
    const sn = ssoName(), w0 = wf(), ci = (w0.approval && w0.approval.ct) || D().ctInfo(rec());
    if (sn) { const d0 = FLOWS.find(x => x.key !== flowKey && av0.valid[x.key] && w0.approval.flows[x.key].by === sn); if (d0) { U().toast(`${sn} อนุมัติ ${d0.name} ไปแล้ว — คนเดียวกันอนุมัติได้ฝ่ายเดียว`); return; } }
    const what = `${w0.newOis ? w0.newOis.code + ' · ' + (w0.newOis.steps || []).length + ' ขั้นตอน · ' : ''}CT ${ci.src === 'after' ? U().fmt(ci.before) + ' → ' : ''}${U().fmt(ci.ct)} วิ`;
    let prev = {}, err = '';
    for (;;) {
      const a = await U().ask((err ? '⚠ ' + err + ' — ' : '') + 'อนุมัติ · ' + f.name + ' — ' + what + (sn ? ' (ในชื่อ ' + sn + ')' : ' · หนึ่งคนอนุมัติได้ฝ่ายเดียว'),
        (sn ? [] : [{ name: 'by', label: 'ชื่อผู้อนุมัติ', value: prev.by }]).concat([{ name: 'pin', label: 'PIN ของฝ่าย', type: 'password' }]), { ok: 'อนุมัติ', cancel: 'ยกเลิก' });
      if (!a) return; prev = a; a.by = sn || String(a.by || '').trim();
      if (!a.by) { err = 'ใส่ชื่อผู้อนุมัติ'; continue; }
      const dup = FLOWS.find(x => x.key !== flowKey && av0.valid[x.key] && w0.approval.flows[x.key].by === a.by);
      if (dup) { err = `${a.by} อนุมัติ ${dup.name} ไปแล้ว — คนเดียวกันอนุมัติได้ฝ่ายเดียว`; continue; }
      let r;
      try { r = await S.call({ action: 'approve' }, { flow: flowKey, pin: String(a.pin || '') }); } catch (e) { err = 'ตรวจ PIN ไม่สำเร็จ: ' + e.message; continue; }
      if (!r || !r.ok) { err = 'ตรวจ PIN ไม่สำเร็จ'; continue; }
      if (!r.set) { err = 'ยังไม่ได้ตั้ง PIN ของฝ่ายนี้ — ให้ผู้ดูแลระบบตั้งที่หน้าหลังบ้าน'; continue; }
      if (r.locked) { U().toast('ใส่ PIN ผิดหลายครั้ง — ล็อกฝ่ายนี้ 10 นาที'); return; }
      if (!r.valid) { err = 'PIN ไม่ถูกต้อง'; continue; }
      const w = wf(); w.approval.flows[flowKey] = { by: a.by, at: Date.now() };
      saveRec(); U().toast('อนุมัติแล้ว · ' + f.name); render();
      return;
    }
  }

  // ฝ่ายใดก็ส่งกลับแก้ไขได้ (PIN ของฝ่าย + เหตุผล): ล้างการอนุมัติทุกฝ่าย เก็บเหตุผลในประวัติ
  async function returnForRevision() {
    const S = window.CPS.sheet;
    if (!S.configured()) { U().toast('เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — ขอลิงก์สำหรับทีมจากผู้ดูแลระบบ'); return; }
    const sn = ssoName(); let prev = {}, err = '';
    const fpf = FLOWS[D().approvalOf(wf()).firstPending];
    for (;;) {   // PIN ผิดแล้วไม่ต้องพิมพ์ใหม่: เปิดกล่องเดิมพร้อมข้อความที่พิมพ์ไว้
      const a = await U().ask((err ? '⚠ ' + err + ' — ' : '') + 'ส่งกลับแก้ไข — การอนุมัติทุกฝ่ายจะถูกล้าง ผู้จัดทำแก้แล้วส่งใหม่',
        [{ name: 'flow', label: 'ฝ่ายที่ส่งกลับ', value: prev.flow, options: [fpf].filter(Boolean).map(f => ({ value: f.key, label: f.name })) }]
          .concat(sn ? [] : [{ name: 'by', label: 'ชื่อผู้ส่งกลับ', value: prev.by }])
          .concat([{ name: 'reason', label: 'เหตุผล / สิ่งที่ต้องแก้', value: prev.reason }, { name: 'pin', label: 'PIN ของฝ่าย', type: 'password' }]),
        { ok: 'ส่งกลับแก้ไข', cancel: 'ยกเลิก', danger: true });
      if (!a) return; prev = a;
      const by = sn || String(a.by || '').trim(), reason = String(a.reason || '').trim();
      if (!by || !reason) { err = 'ใส่ชื่อและเหตุผลก่อนส่งกลับ'; continue; }
      let r; try { r = await S.call({ action: 'approve' }, { flow: a.flow, pin: String(a.pin || '') }); } catch (e) { err = 'ตรวจ PIN ไม่สำเร็จ: ' + e.message; continue; }
      if (!r || !r.ok) { err = 'ตรวจ PIN ไม่สำเร็จ'; continue; }
      if (!r.set) { err = 'ยังไม่ได้ตั้ง PIN ของฝ่ายนี้ — ให้ผู้ดูแลระบบตั้งที่หน้าหลังบ้าน'; continue; }
      if (r.locked) { U().toast('ใส่ PIN ผิดหลายครั้ง — ล็อกฝ่ายนี้ 10 นาที'); return; }
      if (!r.valid) { err = 'PIN ไม่ถูกต้อง'; continue; }
      const w = wf(), ap = w.approval, f = FLOWS.find(x => x.key === a.flow);
      ap.history = (ap.history || []).concat({ type: 'return', flow: a.flow, flowName: f ? f.name : a.flow, by, reason, at: Date.now() });
      ap.flows = {}; ap.submitted = false; ap.by = ''; delete ap.ct; delete ap.before; if (w.newOis) w.newOis.reviewed = false;
      saveRec(); U().toast('ส่งกลับแก้ไขแล้ว — ผู้จัดทำแก้แล้วส่งใหม่ได้'); render();
      return;
    }
  }
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (tag === 'button') e.type = 'button'; return e; }

  window.CPSWorkflow = { FLOWS, open, isOpen: () => !!(host && stationId && host.querySelector('.wf-steps') && rec()), refresh: () => render() };
})();
