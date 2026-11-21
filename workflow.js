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

  function stepStatus() {
    const r = rec(), w = wf();
    const s1 = !!matchStudy();
    const job = matchJob();
    const s2 = !!job;
    const s3 = w.improve !== null && w.improve !== undefined;
    const s4 = !w.improve ? null : !!(w.lineBalance && w.lineBalance.saved);
    const s5 = !w.improve ? null : !!(w.newOis && w.newOis.code);
    const approved = w.approval && w.approval.flows && FLOWS.every(f => w.approval.flows[f.key] && w.approval.flows[f.key].by);
    const s6 = !w.improve ? null : approved;
    return { s1, s2, s3, s4, s5, s6, job, approved };
  }

  function open(id, container, back) {
    stationId = id; host = container; onBack = back;
    render();
  }

  function render() {
    const r = rec(); if (!r) { onBack && onBack(); return; }
    const { esc, fmt } = U(); const can = D().canEdit(); const w = wf(); const st = stepStatus();
    const steps = [
      { n: 1, t: 'Time Study', done: st.s1 },
      { n: 2, t: 'วิเคราะห์งาน', done: st.s2 },
      { n: 3, t: 'Confirm ปรับปรุง', done: st.s3 },
      { n: 4, t: 'Line Balance', done: st.s4 },
      { n: 5, t: 'New OIS', done: st.s5 },
      { n: 6, t: 'ส่งอนุมัติ', done: st.s6 },
    ];
    const ended = st.s3 && w.improve === false;
    host.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">WORKFLOW · ${esc(r.model || '')}/${esc(r.submodel || '')}</p>
          <h1>${esc(r.station || 'สถานี')} <span class="muted">· ${esc(r.ois || '')}</span></h1></div>
        <button class="ghost" id="wf-back">← กลับตารางสถานี</button>
      </div>
      <div class="wf-steps">${steps.map(s => `<div class="wf-step ${s.done === true ? 'done' : s.done === null ? 'skip' : ''}"><span class="wf-dot">${s.done === true ? '✓' : s.n}</span><small>${esc(s.t)}</small></div>`).join('<i class="wf-sep"></i>')}</div>
      ${ended ? '<div class="ro-banner" style="background:#e6f5ef;border-color:#bfe6d4;color:#14684e">✓ สรุป: ไม่ปรับปรุง — ปิดงานสถานีนี้แล้ว</div>' : ''}
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
    const p = document.createElement('section'); p.className = 'panel wf-panel';
    p.innerHTML = `<div class="panelhead"><h2>${title}</h2>${badge || ''}</div>`;
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
    b.onclick = () => window.CPS.showTab('timestudy');
    d.appendChild(b);
    return panel('1 · Time Study', d, badgeDone(st.s1));
  }
  // ---- Step 2 ----
  function panelStep2(st) {
    const { esc, fmt } = U(); const job = st.job;
    const d = document.createElement('div'); d.className = 'wf-pad';
    if (job) {
      const b = U().totals(job.before), a = U().totals(job.after);
      d.innerHTML = `<p>งานวิเคราะห์: <b>${esc(job.name)}</b> · Before CT ${fmt(b.ct)} วิ · After ${a.count ? fmt(a.ct) + ' วิ' + (job.autoAfter ? ' (ร่างอัตโนมัติ)' : '') : 'ยังไม่มี'}</p>`;
    } else d.innerHTML = `<p class="muted">ยังไม่มีงานวิเคราะห์ของสถานีนี้ (ระบบจะสร้างให้เองเมื่อบันทึก Time Study ของสถานีนี้)</p>`;
    const b = el('button', st.s2 ? 'ghost' : 'primary', st.s2 ? 'เปิดวิเคราะห์งาน' : 'ไปทำวิเคราะห์งาน');
    b.onclick = () => window.CPS.showTab('analysis');
    d.appendChild(b);
    return panel('2 · วิเคราะห์งาน', d, badgeDone(st.s2));
  }
  // ---- Step 3 ----
  function panelStep3(st, can) {
    const { esc } = U(); const w = wf(); const r = rec();
    const d = document.createElement('div'); d.className = 'wf-pad';
    if (!st.s1 || !st.s2) { d.innerHTML = '<p class="muted">ทำขั้น 1–2 ให้เสร็จก่อนจึงจะยืนยันการปรับปรุงได้</p>'; return panel('3 · ยืนยันการปรับปรุง', d, badgeDone(false)); }
    const adv = D().advise(r);
    d.innerHTML = `<div class="wf-advise ${adv.status}"><b>ระบบแนะนำ: ${adv.status === 'improve' ? 'ควรปรับปรุง' : 'ยังไม่จำเป็นต้องปรับปรุง'}</b>${adv.reasons.length ? `<ul>${adv.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>ภาระงาน สัดส่วน NVA และคะแนนความง่าย อยู่ในเกณฑ์</p>'}</div><p>ยืนยันตามคำแนะนำ หรือเลือกเองได้</p>`;
    if (!can) { d.innerHTML += `<p class="muted">สถานะ: ${w.improve === true ? 'จะปรับปรุง' : w.improve === false ? 'ไม่ปรับปรุง' : 'ยังไม่ตัดสิน'}</p>`; return panel('3 · ยืนยันการปรับปรุง', d, badgeDone(st.s3)); }
    const row = el('div', 'wf-btnrow');
    const yes = el('button', adv.status === 'improve' ? 'primary' : 'ghost', '✓ ปรับปรุง (ไปต่อ)');
    const no = el('button', adv.status === 'improve' ? 'ghost' : 'primary', '✕ ไม่ปรับปรุง (จบงาน)');
    if (w.improve === true) yes.classList.add('active-choice');
    if (w.improve === false) no.classList.add('active-choice');
    yes.onclick = () => {
      w.improve = true; saveRec();
      // ร่าง After ให้อัตโนมัติถ้ายังไม่มี: คัดลอก Before แล้วตัดขั้นตอน NVA ออก (คนแก้ต่อได้)
      const job = matchJob();
      if (job && !(job.after || []).length) { job.after = (job.before || []).filter(e => e.type !== 'NVA').map(e => ({ ...e, id: U().uid() })); job.autoAfter = true; D().upsert('jobs', job); U().toast('ร่าง After ให้แล้ว (ตัดขั้นตอน NVA ออก) — แก้ได้ที่วิเคราะห์งาน'); }
      render();
    };
    no.onclick = () => { if (confirm('ยืนยันว่าไม่ปรับปรุงและปิดงานสถานีนี้?')) { w.improve = false; saveRec(); render(); } };
    row.append(yes, no); d.appendChild(row);
    return panel('3 · ยืนยันการปรับปรุง', d, badgeDone(st.s3));
  }
  // ---- Step 4: Line Balance (ระบบเสนอให้ คนตรวจแล้วยืนยัน) ----
  function lbItems() {
    const r = rec(); const job = matchJob();
    const peers = D().listStations().filter(x => x.model === r.model && x.submodel === r.submodel)
      .sort((x, y) => String(x.station).localeCompare(String(y.station), undefined, { numeric: true }));
    return peers.map(p => {
      const g = G().aggregate(G().roundsOf(p.station));
      const mine = p.id === r.id && job && (job.after || []).length;
      return { id: p.id, station: p.station, now: U().num(p.ct), ct: mine ? U().totals(job.after).ct : U().num(p.ct), els: mine ? job.after : (g ? g.elements : []), improved: !!mine };
    });
  }
  function panelStep4(st, can) {
    const { esc, fmt, num } = U(); const w = wf(); const r = rec();
    const d = document.createElement('div'); d.className = 'wf-pad';
    const lb = w.lineBalance || (w.lineBalance = { targetJph: r.jph || 22, limit: 90, rows: {}, auto: true });
    if (lb.limit == null) lb.limit = 90;
    const items = lbItems();
    const takt = num(lb.targetJph) ? 3600 / num(lb.targetJph) : 0;
    const prop = D().balance(items, takt, lb.limit);
    const applyProp = () => { lb.rows = {}; items.forEach((it, i) => lb.rows[it.id] = prop.proposed[i]); lb.auto = true; };
    if (can && !lb.saved && (lb.auto !== false || !Object.keys(lb.rows).length)) applyProp();

    const head = el('div', 'wf-lbhead');
    head.innerHTML = `<label class="field"><span>JPH เป้าหมาย (TAKT = ${fmt(takt)} วิ)</span><input id="lb-jph" type="number" min="1" value="${esc(lb.targetJph)}" ${can ? '' : 'disabled'}></label>
      <label class="field"><span>เพดานภาระต่อสถานี (%)</span><input id="lb-limit" type="number" min="50" max="100" value="${esc(lb.limit)}" ${can ? '' : 'disabled'}></label>`;
    d.appendChild(head);

    const box = el('div', 'wf-advise ' + (prop.feasible ? 'ok' : 'improve'));
    box.innerHTML = `<b>ข้อเสนอของระบบ</b><p>งานรวม ${fmt(prop.total)} วิ · ${items.length} สถานี · เพดาน ${fmt(prop.limit)} วิ/สถานี · ต้องใช้อย่างน้อย ${prop.minStations} สถานี</p>` +
      (prop.feasible ? '' : `<p><b>เกลี่ยไม่ลงภายใน ${items.length} สถานี</b> ยังเกินอยู่ ${fmt(prop.shortage)} วิ → ต้องลดงานเพิ่ม เพิ่มสถานี/คน หรือปรับ JPH</p>`) +
      (prop.moves.length ? `<ul>${prop.moves.map(m => `<li>ย้ายงาน <b>${fmt(m.sec)} วิ</b> จาก <b>${esc(m.from)}</b> → <b>${esc(m.to)}</b>${m.pick.names && m.pick.names.length ? ' · ขั้นตอนที่เสนอ: ' + esc(m.pick.names.join(', ')) : m.pick.split ? ' · ต้องแบ่งขั้นตอน “' + esc(m.pick.split) + '” (' + fmt(m.pick.splitSec) + ' วิ)' : ''}</li>`).join('')}</ul>` : '<p>ทุกสถานีอยู่ในเพดานแล้ว ไม่ต้องย้ายงาน</p>');
    d.appendChild(box);

    const tbl = document.createElement('div'); tbl.className = 'table-scroll';
    const loadCell = v => { const load = takt ? (num(v) / takt) * 100 : 0; const col = load > 100 ? '#c0392b' : load >= 90 ? '#e08a00' : '#15856b'; return `<div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(load, 100)}%;background:${col}"></i></div><span style="color:${col}">${fmt(load)}%</span></div>`; };
    tbl.innerHTML = `<table class="sb-table"><thead><tr><th>Station</th><th>CT ปัจจุบัน</th><th>ระบบเสนอ</th><th>CT หลังปรับ</th><th>ภาระใหม่</th></tr></thead><tbody>${items.map((it, i) => {
      const after = lb.rows[it.id] != null ? lb.rows[it.id] : it.ct;
      return `<tr data-pid="${it.id}"><td class="sb-st">${esc(it.station)}${it.improved ? ' <small class="muted">(ใช้ค่า After)</small>' : ''}</td><td>${fmt(it.now)} วิ</td><td>${fmt(prop.proposed[i])} วิ</td>
        <td><input class="lb-ct" type="number" min="0" step="0.1" value="${esc(after)}" style="max-width:90px" ${can ? '' : 'disabled'}></td><td class="lb-load">${loadCell(after)}</td></tr>`;
    }).join('')}</tbody></table>`;
    tbl.querySelectorAll('tr[data-pid]').forEach(tr => { const i = tr.querySelector('.lb-ct'); i.oninput = () => { lb.rows[tr.dataset.pid] = i.value; lb.auto = false; tr.querySelector('.lb-load').innerHTML = loadCell(i.value); }; });
    d.appendChild(tbl);

    if (can) {
      head.querySelector('#lb-jph').onchange = e => { lb.targetJph = e.target.value; lb.saved = false; saveRec(); render(); };
      head.querySelector('#lb-limit').onchange = e => { lb.limit = e.target.value; lb.saved = false; saveRec(); render(); };
      const row = el('div', 'wf-btnrow'); row.style.marginTop = '12px';
      const use = el('button', 'ghost', '↺ ใช้ข้อเสนอของระบบ'); use.onclick = () => { applyProp(); lb.saved = false; saveRec(); render(); };
      const ok = el('button', 'primary', '✓ ยืนยัน → สร้าง OIS และส่งอนุมัติอัตโนมัติ');
      ok.onclick = async () => {
        lb.saved = true; lb.moves = prop.moves.map(m => `${m.from} → ${m.to}: ${m.sec} วิ`);
        makeOis();
        let me = ''; try { me = localStorage.getItem('cps-ie-me') || ''; } catch (e) {}
        if (!me) { const a = await U().ask('ชื่อผู้จัดทำ (ถามครั้งเดียว ระบบจะจำไว้ในเครื่องนี้)', [{ name: 'by', label: 'ชื่อผู้จัดทำ' }]); me = (a && a.by.trim()) || ''; if (me) try { localStorage.setItem('cps-ie-me', me); } catch (e) {} }
        const ap = w.approval || (w.approval = { submitted: false, by: '', flows: {} });
        if (me && !ap.submitted) { ap.submitted = true; ap.by = me; ap.submittedAt = Date.now(); }
        saveRec(); U().toast(me ? 'สร้าง OIS และส่งอนุมัติแล้ว — รอผู้อนุมัติ 5 ฝ่าย' : 'สร้าง OIS แล้ว — ยังไม่ได้ส่งอนุมัติ (ไม่มีชื่อผู้จัดทำ)'); render();
      };
      row.append(ok, use); d.appendChild(row);
    }
    return panel('4 · Line Balance', d, badgeDone(st.s4));
  }
  // ---- Step 5: New OIS Auto ----
  function panelStep5(st, can) {
    const { esc, fmt, num } = U(); const w = wf(); const r = rec();
    const d = document.createElement('div'); d.className = 'wf-pad';
    if (!st.s4) { d.innerHTML = '<p class="muted">ทำ Line Balance (ขั้น 4) ให้เสร็จก่อน</p>'; return panel('5 · New OIS อัตโนมัติ', d, badgeDone(false)); }
    if (w.newOis && w.newOis.code) {
      const o = w.newOis;
      d.innerHTML = `<p>รหัส OIS ใหม่: <b>${esc(o.code)}</b> · สร้างเมื่อ ${esc(new Date(o.generatedAt).toLocaleString('th-TH'))}</p>
        <table class="el-table"><thead><tr><th>#</th><th>ขั้นตอน</th><th>วิ</th><th>ประเภท</th></tr></thead><tbody>${(o.steps || []).map((s, i) => `<tr><td class="idx">${i + 1}</td><td>${esc(s.name)}</td><td>${fmt(num(s.sec))}</td><td>${esc(s.type)}</td></tr>`).join('')}</tbody></table>`;
      if (can) { const re = el('button', 'ghost', 'สร้างใหม่อีกครั้ง'); re.onclick = () => genOis(); d.appendChild(re); }
    } else {
      d.innerHTML = `<p class="muted">สร้างเอกสาร OIS มาตรฐานใหม่อัตโนมัติจากวิธีที่ปรับปรุงแล้ว</p>`;
      if (can) { const g = el('button', 'primary', '⚙ สร้าง OIS ใหม่อัตโนมัติ'); g.onclick = () => genOis(); d.appendChild(g); }
    }
    return panel('5 · New OIS อัตโนมัติ', d, badgeDone(st.s5));
  }
  function makeOis() {
    const r = rec(), w = wf(); const job = matchJob(); const study = matchStudy();
    const g = group(); const src = job && (job.after || []).length ? job.after : (g ? g.elements : []);
    const code = ['OIS', 'CATH', r.workshop, r.model, r.team, r.station].filter(Boolean).join('-').toUpperCase();
    w.newOis = { code, generatedAt: Date.now(), steps: (src || []).map(e => ({ name: e.name, sec: U().round1(U().num(e.sec)), type: e.type })) };
    return w.newOis;
  }
  function genOis() { const o = makeOis(); saveRec(); U().toast('สร้าง OIS ใหม่: ' + o.code); render(); }
  // ---- Step 6: Approval ----
  function panelStep6(st, can) {
    const { esc } = U(); const w = wf(); const ap = w.approval || (w.approval = { submitted: false, by: '', flows: {} });
    const d = document.createElement('div'); d.className = 'wf-pad';
    if (!st.s5) { d.innerHTML = '<p class="muted">สร้าง New OIS (ขั้น 5) ให้เสร็จก่อนจึงส่งอนุมัติได้</p>'; return panel('6 · ส่งอนุมัติ', d, badgeDone(false)); }
    if (!ap.submitted) {
      d.innerHTML = `<p>ส่งเอกสาร OIS <b>${esc(w.newOis.code)}</b> เข้าสู่ขั้นตอนอนุมัติ 5 ฝ่าย</p>`;
      if (can) { const b = el('button', 'primary', '📤 ส่งอนุมัติ'); b.onclick = async () => { const a = await U().ask('ส่งอนุมัติ', [{ name: 'by', label: 'ชื่อผู้จัดทำ (ผู้ส่งอนุมัติ)' }]); if (!a || !a.by.trim()) return; ap.submitted = true; ap.by = a.by.trim(); ap.submittedAt = Date.now(); saveRec(); render(); }; d.appendChild(b); }
      return panel('6 · ส่งอนุมัติ', d, badgeDone(false));
    }
    const flowsWrap = el('div', 'wf-flows');
    flowsWrap.innerHTML = `<div class="wf-maker">👤 ผู้จัดทำ: <b>${esc(ap.by)}</b></div>` + FLOWS.map((f, i) => {
      const s = ap.flows[f.key];
      return `<div class="wf-flow ${s && s.by ? 'approved' : ''}"><div class="wf-flow-no">${s && s.by ? '✓' : i + 1}</div>
        <div class="wf-flow-body"><b>${esc(f.name)}</b>${s && s.by ? `<small>อนุมัติโดย ${esc(s.by)} · ${esc(new Date(s.at).toLocaleString('th-TH'))}</small>` : '<small class="muted">ยังไม่อนุมัติ</small>'}</div>
        ${s && s.by ? '' : (can ? `<button class="wf-approve" data-flow="${f.key}">อนุมัติ</button>` : '')}</div>`;
    }).join('');
    d.appendChild(flowsWrap);
    if (can) flowsWrap.querySelectorAll('.wf-approve').forEach(b => b.onclick = () => approve(b.dataset.flow));
    return panel('6 · ส่งอนุมัติ', d, badgeDone(st.approved));
  }
  async function approve(flowKey) {
    const cfg = D().approval.get(); const pin = cfg[flowKey];
    if (!pin) { U().toast('ยังไม่ได้ตั้ง PIN ของฝ่ายนี้ — ไปตั้งที่ ⚙ ตั้งค่า'); return; }
    const f = FLOWS.find(x => x.key === flowKey);
    const a = await U().ask('อนุมัติ · ' + f.name, [{ name: 'by', label: 'ชื่อผู้อนุมัติ' }, { name: 'pin', label: 'PIN ของฝ่าย', type: 'password' }]);
    if (!a || !a.by.trim()) return;
    if (String(a.pin).trim() !== String(pin).trim()) { U().toast('PIN ไม่ถูกต้อง'); return; }
    const w = wf(); w.approval.flows[flowKey] = { by: a.by.trim(), at: Date.now() };
    saveRec(); U().toast('อนุมัติแล้ว'); render();
  }

  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (tag === 'button') e.type = 'button'; return e; }

  window.CPSWorkflow = { open };
})();
