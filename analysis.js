/* CPS IE Studio — วิเคราะห์งาน (Before/After + อบรมรายเดือน + รายงานอัตโนมัติ) */
(() => {
  const U = () => window.CPS.util;
  const D = () => window.CPS.data;
  let editing = null;
  let host = null;
  // งานที่ยังไม่บันทึกไม่หาย: ร่างเก็บในเครื่อง กู้คืนได้จากหน้ารายการ (แบบเดียวกับ Time Study)
  const DRAFT = 'cps-ie-an-draft-v1';
  const snaps = new WeakMap();
  const scopeId = () => { const sc = D().scope || {}; return [sc.workshop, sc.group, sc.team].join('§'); };
  const hasContent = j => !!j && (String(j.name || j.station || j.problem || '').trim() !== '' || (j.before || []).some(e => String(e.name || '').trim() || U().num(e.sec) > 0) || (j.after || []).length > 0);
  const isDirty = () => !!editing && hasContent(editing) && !lockedBy(editing) && snaps.has(editing) && snaps.get(editing) !== JSON.stringify(editing);
  function saveDraft() { if (!isDirty()) return; try { localStorage.setItem(DRAFT, JSON.stringify({ at: Date.now(), scope: scopeId(), j: editing })); } catch (e) {} }
  function readDraft() { try { const d = JSON.parse(localStorage.getItem(DRAFT)); return d && d.j && d.scope === scopeId() ? d : null; } catch (e) { return null; } }
  const dropDraft = () => { try { localStorage.removeItem(DRAFT); } catch (e) {} };
  function leave() { saveDraft(); editing = null; }

  const thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  function blankEl() { return { id: U().uid(), name: '', sec: '', type: 'VA', note: '' }; }
  function blankJob() {
    return { id: U().uid(), name: '', line: '', operator: '', analyst: '', date: new Date().toISOString().slice(0, 10), problem: '', target: '', before: [blankEl()], after: [], training: [] };
  }

  // งานที่สถานีของมันส่ง OIS เข้าอนุมัติแล้ว: ห้ามแก้/ลบ (CT ที่ผู้อนุมัติเห็นต้องไม่เปลี่ยน)
  const lockedBy = j => { if (!j) return null; const k = D().group.key(j); return k ? D().listStations().find(r => D().group.key(r) === k && r.wf && r.wf.approval && r.wf.approval.submitted) || null : null; };
  function render(container) {
    host = container;
    if (!host.dataset.anDraft) { host.dataset.anDraft = '1'; const later = () => setTimeout(saveDraft, 0); host.addEventListener('input', later); host.addEventListener('change', later); host.addEventListener('click', later); }
    editing ? renderEditor() : renderList();
  }

  function renderList() {
    const { esc, fmt } = U();
    const can = D().canEdit();
    const jobs = D().listJobs().slice().sort((x, y) => String(x.station || x.name || '').localeCompare(String(y.station || y.name || ''), undefined, { numeric: true }));
    const dr = can ? readDraft() : null;
    host.innerHTML = `
      ${dr ? `<div class="ts-draft" role="status"><span>มีร่างงานวิเคราะห์ที่ยังไม่ได้บันทึก · ${esc(dr.j.name || 'ไม่มีชื่อ')} · ${U().dateTxt(dr.at, true)}</span><button class="primary" id="an-draft-go">กู้คืนร่าง</button><button id="an-draft-drop">ทิ้งร่าง</button></div>` : ''}
      <div class="page-head"><div><h1>วิเคราะห์งาน Before / After</h1></div>
        ${can ? '<button class="primary" id="an-new">＋ งานใหม่</button>' : ''}</div>
      ${!can ? '<div class="ro-banner">👁️ โหมดวิเคราะห์ (อ่านอย่างเดียว) — รวมข้อมูลหลายทีม</div>' : ''}
      ${!jobs.length ? `<div class="blank">ยังไม่มีงานวิเคราะห์ในพื้นที่นี้${can ? '<br><small>กด “＋ งานใหม่” เพื่อเริ่มเอง หรือบันทึก Time Study ของสถานี แล้วระบบจะสร้างงานวิเคราะห์ให้อัตโนมัติ</small>' : ''}</div>` :
        `${jobs.length > 3 ? '<label class="list-search"><span class="vh">ค้นหา</span><input type="search" id="an-q" placeholder="ค้นหาชื่องาน / สถานี"></label>' : ''}<section class="panel"><div class="recent">${jobs.map(j => {
          const b = { ct: D().beforeOf(j).ct }, a = U().totals(j.after);
          const saved = b.ct - a.ct, has = a.count > 0;
          return `<div class="recent-row"><b>${j.name ? U().ud(j.name) : 'ไม่มีชื่อ'}</b><small>${esc([j.station, j.line, U().dateTxt(j.date)].filter(Boolean).join(' · '))}${can ? '' : ' · ' + esc([j.workshop, j.group, j.team].filter(Boolean).join('/'))}</small>
            <em>${has ? 'ลด ' + fmt(saved) + ' วิ' : 'ยังไม่มี After'}${lockedBy(j) ? ' · 🔒' : ''}</em>
            <span class="row-btns"><button data-edit="${j.id}" aria-label="${can ? 'เปิด' : 'ดู'} ${esc(j.name || '')}">${can ? 'เปิด' : 'ดู'}</button>${can ? `<button class="del" data-del="${j.id}" aria-label="ลบ ${esc(j.name || '')}"${lockedBy(j) ? ' disabled title="ล็อก: OIS รออนุมัติ"' : ''}>ลบ</button>` : ''}</span></div>`;
        }).join('')}</div></section>`}`;
    const nb = host.querySelector('#an-new'); if (nb) nb.onclick = () => { editing = blankJob(); renderEditor(); };
    const q = host.querySelector('#an-q'); if (q) q.oninput = () => { const v = q.value.trim().toLowerCase(); host.querySelectorAll('.recent-row').forEach(r => r.hidden = !!v && !r.textContent.toLowerCase().includes(v)); };
    const dg = host.querySelector('#an-draft-go'); if (dg) dg.onclick = () => { const d = readDraft(); if (!d) return renderList(); editing = d.j; snaps.set(editing, ''); renderEditor(); };
    const dd = host.querySelector('#an-draft-drop'); if (dd) dd.onclick = async () => { if (await U().ask('ทิ้งร่างงานวิเคราะห์นี้? ข้อมูลในร่างจะหายถาวร', [], { ok: 'ทิ้งร่าง', cancel: 'เก็บไว้', danger: true })) { dropDraft(); renderList(); } };
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editing = structuredClone(D().listJobs().find(j => j.id === b.dataset.edit)); renderEditor(); });
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const jb = D().listJobs().find(x => x.id === b.dataset.del); if (lockedBy(jb)) { U().toast('งานนี้ผูกกับ OIS ที่รออนุมัติ — ถอนการส่งหรือให้ฝ่ายอนุมัติส่งกลับแก้ไขก่อน', 6000); return; } D().removeUndo('jobs', b.dataset.del, 'ลบงานวิเคราะห์แล้ว', renderList); });
  }

  function renderEditor() {
    const { esc } = U(); const j = editing;
    if (j.autoBefore !== false) { const bo = D().beforeOf(j); if (bo.src === 'study') { j.before = bo.els.map(e => ({ id: U().uid(), name: e.name, sec: U().round1(U().num(e.sec)), type: e.type, note: '' })); j.autoBefore = true; } }   // Before = รอบที่ CT สูงสุด
    host.innerHTML = `
      <div class="page-head"><div><h1>วิเคราะห์งาน</h1></div>
        <div class="head-btns"><button id="an-back" class="ghost">← กลับ</button><button id="an-ai" class="ghost">🤖 AI ร่างข้อเสนอ</button><button id="an-print" class="ghost">พิมพ์/PDF</button><button id="an-save" class="primary">บันทึก</button></div></div>
      <section class="panel"><div class="panelhead"><h2>ข้อมูลงาน</h2></div>
        <div class="field-grid">
          ${fld('ชื่องาน', 'name', j.name, 'เช่น ประกอบฝาปั๊ม')}
          ${stationPick(j)}
          ${fld('ทีม / ไลน์', 'line', j.line, 'เช่น CA-A')}
          ${fld('ผู้ปฏิบัติงาน', 'operator', j.operator)}
          ${fld('ผู้วิเคราะห์', 'analyst', j.analyst)}
          ${fld('วันที่', 'date', j.date, '', 'date')}
          ${fld('ปัญหา', 'problem', j.problem, 'เช่น รอบเวลานาน เดินหยิบซ้ำ')}
          <label class="field wide"><span>เป้าหมายการปรับปรุง</span><textarea data-f="target" rows="2" placeholder="เช่น ลดรอบเวลา 20%">${esc(j.target)}</textarea></label>
        </div></section>
      <div class="two-col">
        <div id="ph-before"></div>
        <div id="ph-after"></div>
      </div>
      <section id="an-report" class="panel"></section>
      <section id="an-obs" class="panel"></section>
      <section id="an-4m" class="panel"></section>
      <section id="an-target" class="panel"></section>
      <section id="an-train" class="panel"></section>`;
    host.querySelectorAll('[data-f]').forEach(inp => inp.oninput = inp.onchange = () => { j[inp.dataset.f] = inp.value; if (inp.dataset.f === 'station' && typeof observe === 'function') observe(); });
    host.querySelector('#an-back').onclick = async () => {
      if (isDirty() && !(await U().ask('ยังไม่ได้บันทึกงานวิเคราะห์นี้ — ออกโดยไม่บันทึก? (ร่างยังเก็บไว้ในเครื่อง กู้คืนได้จากหน้ารายการ)', [], { ok: 'ออก (เก็บร่างไว้)', cancel: 'อยู่ต่อ' }))) return;
      leave(); renderList();
    };
    const lk = lockedBy(editing); if (lk) host.querySelector('.page-head').insertAdjacentHTML('afterend', `<div class="ro-banner">🔒 งานนี้ผูกกับ OIS ของ ${esc(lk.station)} ที่รออนุมัติ — แก้ได้เฉพาะการอบรม ส่วนอื่นแก้ได้เมื่อถอนการส่งหรือถูกส่งกลับแก้ไข</div>`);
    host.querySelector('#an-save').onclick = () => { if (lockedBy(editing)) { const strip = o => JSON.stringify(Object.assign({}, o, { training: null, updatedAt: null, before: null, autoBefore: null })); const orig = D().listJobs().find(x => x.id === editing.id); if (!orig || strip(orig) !== strip(editing)) { U().toast('งานนี้ผูกกับ OIS ที่รออนุมัติ — แก้ได้เฉพาะการอบรม จนกว่าจะถอนการส่งหรือถูกส่งกลับแก้ไข', 6000); return; } } D().upsert('jobs', editing); dropDraft(); U().toast('บันทึกงานแล้ว'); editing = null; renderList(); };
    host.querySelector('#an-print').onclick = printReport;
    host.querySelector('#an-ai').onclick = aiDraft;
    phase('before', 'ก่อนปรับปรุง (Before)');
    phase('after', 'หลังปรับปรุง (After)');
    report(); observe(); suggest(); targets(); training();
    if (!snaps.has(j)) snaps.set(j, JSON.stringify(j));   // หลังทุกส่วนเติมค่าเริ่มต้นแล้ว งานที่ยังไม่แตะจึงไม่นับว่าแก้
    if (lockedBy(j)) host.querySelectorAll('input, select, textarea, button').forEach(x => { if (['an-back', 'an-print', 'an-save'].includes(x.id) || x.closest('#an-train')) return; if (x.tagName === 'BUTTON') x.hidden = true; else x.disabled = true; });   // อ่านอย่างเดียว ยกเว้นบันทึกการอบรม   // ล็อกจริง: อ่านอย่างเดียว
  }

  // ---- AI ร่างข้อสังเกต ข้อเสนอ 4M1E และเป้าหมายคะแนน (ส่งเฉพาะตัวเลข/ข้อความ ไม่ส่งภาพ) ----
  let aiBusy = false;
  async function aiDraft() {
    if (aiBusy) return;
    if (!window.CPS.sheet.configured()) { U().toast('เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — ขอลิงก์สำหรับทีมจากผู้ดูแลระบบ'); return; }
    const j = editing; const G = D().group; const k = G.key(j);
    const agg = G.aggregate(G.roundsOf(k));
    const st = D().listStations().find(r => String(r.station || '').trim().toLowerCase() === k);
    const adv = st ? D().advise(st) : null;
    const b = U().totals(j.before), a = U().totals(j.after);
    const r1 = x => Math.round(x * 10) / 10;
    const body = {
      station: j.station || j.name || '', name: j.name || '', line: j.line || '', problem: j.problem || '', target: j.target || '',
      takt_sec: st && U().num(st.jph) ? r1(3600 / U().num(st.jph)) : null, load_pct: adv ? r1(adv.load) : null, system_flags: adv ? adv.reasons : [],
      rounds: agg ? agg.n : 0, ct_avg: agg ? agg.ctAvg : r1(b.ct), ct_max: agg ? agg.ctMax : null,
      before: (j.before || []).map(e => ({ name: e.name, sec: U().num(e.sec), type: e.type })), before_ct: r1(b.ct), before_va_pct: r1(b.vaPct),
      after: (j.after || []).map(e => ({ name: e.name, sec: U().num(e.sec), type: e.type })), after_ct: a.count ? r1(a.ct) : null,
      step_scores: agg ? (agg.latest.elements || []).map(e => ({ name: e.name, t: +e.t || 0, u: +e.u || 0, v: +e.v || 0, w: +e.w || 0 })) : [],
      ease_now: agg && agg.ease.avg ? { t: r1(agg.ease.t), u: r1(agg.ease.u), v: r1(agg.ease.v), w: r1(agg.ease.w), avg: r1(agg.ease.avg) } : null,
      ergo: agg && agg.latest.ergo ? { risk: agg.latest.ergo.risk || '', notes: agg.latest.ergo.notes || '' } : null
    };
    if (!body.before.length) { U().toast('ยังไม่มีข้อมูล Before ให้ AI วิเคราะห์'); return; }
    const has = (j.observe || []).length || (j.suggest || []).length || Object.values(j.targets || {}).some(t => t && (t.goal || t.act));
    if (!await U().ask(has ? 'ส่งข้อมูลตัวเลขของงานนี้ (ไม่มีภาพ) ให้ Google Gemini ร่าง แล้วแทนที่ข้อสังเกต ข้อเสนอ และเป้าหมายที่มีอยู่?' : 'ส่งข้อมูลตัวเลขของงานนี้ (ไม่มีภาพ) ให้ Google Gemini ร่างข้อสังเกต ข้อเสนอ 4M1E และเป้าหมายคะแนน?', [])) return;
    aiBusy = true; const btn = host.querySelector('#an-ai'); const label = btn.textContent; btn.disabled = true; btn.textContent = 'AI กำลังร่าง…';
    try {
      const res = await window.CPS.sheet.call({ action: 'aisuggest' }, body);
      if (!res.ok) throw new Error(res.error || 'AI ตอบกลับผิดปกติ');
      const s = v => String(v == null ? '' : v).trim();
      const cats = CATS.map(c => c[0]), prios = PRIOS.map(p => p[0]);
      j.observe = (res.observe || []).map(o => ({ id: U().uid(), item: s(o.item), now: s(o.now), effect: s(o.effect), ai: true })).filter(o => o.item || o.now);
      j.suggest = (res.suggest || []).map(x => ({ id: U().uid(), cat: cats.includes(x.cat) ? x.cat : 'method', text: s(x.text), prio: prios.includes(x.prio) ? x.prio : 'P2', ai: true })).filter(x => x.text);
      const tg = j.targets || (j.targets = {});
      TDIMS.forEach(([dk]) => {
        const now = body.ease_now ? body.ease_now[dk] : 0; const t = (res.targets || {})[dk];
        if (!now && !t) return;
        const row = tg[dk] || (tg[dk] = { now: '', goal: '', act: '' });
        if (now && !row.now) row.now = String(now);
        if (t) { let g = parseFloat(t.goal); if (Number.isFinite(g)) { if (now) g = Math.max(g, now); row.goal = String(Math.min(5, Math.round(g * 100) / 100)); } if (s(t.act)) row.act = s(t.act); }
      });
      j.aiSuggestAt = Date.now();
      observe(); suggest(); targets();
      U().toast(`AI ร่างให้ ${j.observe.length} ข้อสังเกต · ${j.suggest.length} ข้อเสนอ — ตรวจแก้แล้วกดบันทึก`);
    } catch (e) { U().toast('AI ร่างไม่สำเร็จ: ' + e.message); }
    aiBusy = false; btn.disabled = false; btn.textContent = label;
  }

  // ---- สังเกตหน้างาน: หัวข้อ / สภาพปัจจุบัน / ผลต่อความง่ายในการทำงาน ----
  function observe() {
    const list = editing.observe || (editing.observe = []);
    const el = host.querySelector('#an-obs');
    el.innerHTML = `<div class="panelhead"><h2>สังเกตหน้างาน <span>${list.length}</span></h2><button class="add ghost" type="button">＋ ข้อสังเกต</button></div><div class="tbl"></div>`;
    const tbl = el.querySelector('.tbl');
    if (!list.length) tbl.innerHTML = '<div class="empty-row"><p>กด ＋ ข้อสังเกต เพื่อบันทึกสภาพหน้างาน เช่น การวางชิ้นส่วน ชั้นวางงาน อุปกรณ์สถานี ความปลอดภัย การจัดงาน</p></div>';
    else {
      tbl.innerHTML = `<table class="el-table"><thead><tr><th>หัวข้อ</th><th>สภาพปัจจุบัน</th><th>ผลต่อความง่ายในการทำงาน</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = tbl.querySelector('tbody');
      list.forEach(o => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><input class="o-item" placeholder="เช่น การวางชิ้นส่วน"></td><td><input class="o-now" placeholder="สภาพที่พบ"></td><td><input class="o-effect" placeholder="ผลกระทบ"></td><td><button class="r-del" type="button">✕</button></td>`;
        [['o-item', 'item'], ['o-now', 'now'], ['o-effect', 'effect']].forEach(([c, f]) => { const i = tr.querySelector('.' + c); i.value = o[f] || ''; i.oninput = () => o[f] = i.value; });
        tr.querySelector('.r-del').onclick = () => { list.splice(list.indexOf(o), 1); observe(); };
        tb.appendChild(tr);
      });
    }
    el.querySelector('.add').onclick = () => { list.push({ id: U().uid(), item: '', now: '', effect: '' }); observe(); };
  }

  // ---- เป้าหมายคะแนนความง่าย ก่อน/หลัง รายมิติ ----
  const TDIMS = [['t', 'หมุนตัว'], ['u', 'ยกแขน'], ['v', 'ก้มหลัง'], ['w', 'ของหนัก'], ['avg', 'รวม']];
  function matchStudyEase() {
    const G = D().group; const agg = G.aggregate(G.roundsOf(G.key(editing)));
    return agg && agg.ease.avg ? agg.ease : null;
  }
  function targets() {
    const tg = editing.targets || (editing.targets = {});
    const el = host.querySelector('#an-target');
    el.innerHTML = `<div class="panelhead"><h2>เป้าหมายคะแนนความง่าย (ก่อน → หลัง)</h2><button class="pull ghost" type="button">ดึงคะแนนปัจจุบันจาก Time Study</button></div>
      <div class="tbl"><table class="el-table"><thead><tr><th>มิติ</th><th>คะแนนปัจจุบัน</th><th>เป้าหมาย</th><th>มาตรการหลัก</th></tr></thead><tbody>${TDIMS.map(([k, l]) => `<tr data-k="${k}"><td><b>${l}</b></td><td><input class="g-now r-sec" type="number" min="1" max="5" step="0.01"></td><td><input class="g-goal r-sec" type="number" min="1" max="5" step="0.01"></td><td><input class="g-act" placeholder="มาตรการที่จะทำ"></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">คะแนน 1 = ยากสุด, 5 = ง่ายสุด · เลือกสถานีในข้อมูลงานเพื่อดึงคะแนนปัจจุบันจาก Time Study อัตโนมัติ</p>`;
    el.querySelectorAll('tr[data-k]').forEach(tr => {
      const k = tr.dataset.k; const row = tg[k] || (tg[k] = { now: '', goal: '', act: '' });
      [['g-now', 'now'], ['g-goal', 'goal'], ['g-act', 'act']].forEach(([c, f]) => { const i = tr.querySelector('.' + c); i.value = row[f] ?? ''; i.oninput = () => row[f] = i.value; });
    });
    el.querySelector('.pull').onclick = () => {
      const e = matchStudyEase();
      if (!e) { U().toast('ไม่พบ Time Study ชื่อเดียวกับงานนี้ที่มีคะแนนแล้ว'); return; }
      TDIMS.forEach(([k]) => { const v = e[k]; if (v) (tg[k] || (tg[k] = {})).now = (Math.round(v * 100) / 100).toString(); });
      targets(); U().toast('ดึงคะแนนปัจจุบันแล้ว');
    };
  }

  // ---- ข้อเสนอปรับปรุง 4M1E (คน-เครื่อง-วัสดุ-วิธี-สภาพแวดล้อม) + ลำดับความสำคัญ ----
  const CATS = [['man', 'คน (Man)'], ['machine', 'เครื่อง (Machine)'], ['material', 'วัสดุ (Material)'], ['method', 'วิธี (Method)'], ['env', 'สภาพแวดล้อม (Environment)']];
  const PRIOS = [['P1', 'P1 · ทำได้เร็ว'], ['P2', 'P2 · ระยะกลาง'], ['P3', 'P3 · ระยะยาว']];
  const catLabel = k => (CATS.find(c => c[0] === k) || [k, k])[1];
  function suggest() {
    const list = editing.suggest || (editing.suggest = []);
    const el = host.querySelector('#an-4m');
    el.innerHTML = `<div class="panelhead"><h2>ข้อเสนอปรับปรุง (4M1E) <span>${list.length}</span></h2><button class="add ghost" type="button">＋ ข้อเสนอ</button></div><div class="tbl"></div>`;
    const tbl = el.querySelector('.tbl');
    if (!list.length) tbl.innerHTML = '<div class="empty-row"><p>กด ＋ ข้อเสนอ เพื่อบันทึกแนวทางปรับปรุงแยกตาม คน / เครื่อง / วัสดุ / วิธี / สภาพแวดล้อม</p></div>';
    else {
      tbl.innerHTML = `<table class="el-table"><thead><tr><th>หมวด</th><th>ข้อเสนอ</th><th>ลำดับ</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = tbl.querySelector('tbody');
      list.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><select class="s-cat">${CATS.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('')}</select></td><td><input class="s-text" placeholder="เช่น ปรับชั้นวางให้อยู่ระดับเอว ลดการก้ม"></td><td><select class="s-prio">${PRIOS.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('')}</select></td><td><button class="r-del" type="button">✕</button></td>`;
        const c = tr.querySelector('.s-cat'); c.value = s.cat; c.onchange = () => s.cat = c.value;
        const t = tr.querySelector('.s-text'); t.value = s.text || ''; t.oninput = () => s.text = t.value;
        const p = tr.querySelector('.s-prio'); p.value = s.prio; p.onchange = () => s.prio = p.value;
        tr.querySelector('.r-del').onclick = () => { list.splice(list.indexOf(s), 1); suggest(); };
        tb.appendChild(tr);
      });
    }
    el.querySelector('.add').onclick = () => { list.push({ id: U().uid(), cat: 'method', text: '', prio: 'P1' }); suggest(); };
  }
  // ผูกกับ Time Study ด้วยรหัสสถานีจากรายการ (ไม่ต้องพิมพ์ชื่อให้ตรง)
  function stationPick(j) {
    const { esc } = U();
    const codes = [...new Set([...D().listStations().map(r => r.station), ...D().listStudies().map(s => s.station)].filter(Boolean))].sort();
    const cur = j.station || '';
    return `<label class="field"><span>สถานี (ผูกกับ Time Study)</span><select data-f="station"><option value="">— ไม่ผูก (ใช้ชื่องาน) —</option>${codes.map(c => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('')}${cur && !codes.includes(cur) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ''}</select></label>`;
  }
  function fld(label, key, val, ph, type) {
    const { esc } = U();
    return `<label class="field"><span>${esc(label)}</span><input data-f="${key}" ${type ? `type="${type}"` : ''} value="${esc(val)}" placeholder="${esc(ph || '')}"></label>`;
  }

  function phase(ph, title) {
    const { esc, TYPES, fmt } = U(); const list = editing[ph] || (editing[ph] = []);
    const t = U().totals(list);
    const sec = document.createElement('section'); sec.className = 'panel';
    sec.innerHTML = `<div class="panelhead"><h2>${esc(title)} <span>${list.length}</span></h2><div class="head-btns">
      ${ph === 'after' ? '<button class="copy ghost" type="button">คัดลอกจาก Before</button>' : ''}
      <button class="add ghost" type="button">＋ ขั้นตอน</button></div></div>
      <div class="tbl"></div>
      <div class="mini-metrics">${mini('CT', fmt(t.ct) + ' วิ')}${mini('VA', fmt(t.VA) + ' · ' + fmt(t.vaPct) + '%', '#15856b')}${mini('NNVA', fmt(t.NNVA), '#ad7206')}${mini('NVA', fmt(t.NVA), '#a64475')}</div>
      <div class="stack">${stack(t)}</div>`;
    if (ph === 'before' && editing.autoBefore) { const nt = document.createElement('p'); nt.className = 'hint'; nt.textContent = D().beforeOf(editing).frozen ? 'Before นี้เก็บไว้ตอนส่ง OIS — ไม่เปลี่ยนตามรอบ Time Study ใหม่' : 'Before นี้ใช้รอบที่ CT สูงสุดของ Time Study สถานีนี้ และอัปเดตเองเมื่อมีรอบใหม่ · ถ้าแก้ด้วยมือ ระบบจะหยุดเขียนทับ'; sec.appendChild(nt); }
    host.querySelector('#ph-' + ph).replaceChildren(sec);
    const tbl = sec.querySelector('.tbl');
    if (!list.length) tbl.innerHTML = `<div class="empty-row"><p>${ph === 'after' ? 'คัดลอกจาก Before แล้วแก้ หรือ ＋ ขั้นตอน' : 'กด ＋ ขั้นตอน เพื่อเพิ่มรายการ'}</p></div>`;
    else {
      tbl.innerHTML = `<table class="el-table"><thead><tr><th>#</th><th>ขั้นตอน</th><th>วินาที</th><th>ประเภท</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = tbl.querySelector('tbody'); list.forEach((e, i) => tb.appendChild(elRow(ph, list, e, i)));
    }
    sec.querySelector('.add').onclick = () => { if (ph === 'before') editing.autoBefore = false; list.push(blankEl()); phase(ph, title); report(); };
    const copy = sec.querySelector('.copy'); if (copy) copy.onclick = async () => { if (editing.after.length && !(await U().ask('แทนที่ After ทั้งหมดด้วยสำเนา Before?', [], { ok: 'แทนที่ After', cancel: 'ไม่แทนที่' }))) return; editing.after = editing.before.map(e => ({ ...e, id: U().uid() })); phase('after', title); report(); };
  }
  function mini(l, v, c) { return `<div><small>${U().esc(l)}</small><strong${c ? ` style="color:${c}"` : ''}>${v}</strong></div>`; }
  function stack(t) { if (!t.ct) return '<i style="flex:1;background:#e2e8f0"></i>'; return U().TYPES.map(ty => t[ty.k] ? `<i style="flex:${t[ty.k]};background:${ty.color}"></i>` : '').join(''); }
  function elRow(ph, list, e, i) {
    const { TYPES } = U();
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="idx">${i + 1}</td><td><input class="r-name" placeholder="ชื่อขั้นตอน"></td><td><input class="r-sec" type="number" min="0" step="0.1" inputmode="decimal"></td><td><select class="r-type">${TYPES.map(ty => `<option value="${ty.k}">${ty.k}</option>`).join('')}</select></td><td><button class="r-del" type="button">✕</button></td>`;
    const n = tr.querySelector('.r-name'); n.value = e.name || ''; n.oninput = () => e.name = n.value;
    const touch = () => { if (ph === 'before') editing.autoBefore = false; };
    n.addEventListener('input', touch);
    const s = tr.querySelector('.r-sec'); s.value = e.sec; s.oninput = () => { e.sec = s.value; touch(); report(); refreshPhaseMetrics(ph); };
    const ty = tr.querySelector('.r-type'); ty.value = e.type; ty.onchange = () => { e.type = ty.value; touch(); report(); refreshPhaseMetrics(ph); };
    tr.querySelector('.r-del').onclick = () => { touch(); const idx = list.indexOf(e); if (idx > -1) list.splice(idx, 1); phase(ph, ph === 'before' ? 'ก่อนปรับปรุง (Before)' : 'หลังปรับปรุง (After)'); report(); };
    return tr;
  }
  function refreshPhaseMetrics(ph) {
    const { fmt } = U(); const t = U().totals(editing[ph]); const sec = host.querySelector('#ph-' + ph);
    sec.querySelector('.mini-metrics').innerHTML = mini('CT', fmt(t.ct) + ' วิ') + mini('VA', fmt(t.VA) + ' · ' + fmt(t.vaPct) + '%', '#15856b') + mini('NNVA', fmt(t.NNVA), '#ad7206') + mini('NVA', fmt(t.NVA), '#a64475');
    sec.querySelector('.stack').innerHTML = stack(t);
  }

  function report() {
    const { esc, fmt } = U(); const j = editing;
    const b = U().totals(j.before), a = U().totals(j.after), has = a.count > 0;
    const saved = b.ct - a.ct, savedPct = b.ct ? (saved / b.ct) * 100 : 0, wasteCut = b.NVA - a.NVA;
    const el = host.querySelector('#an-report');
    el.innerHTML = `<div class="panelhead"><h2>รายงานสรุปอัตโนมัติ</h2></div>
      <div class="report-cards">
        ${rc('CT ก่อน', fmt(b.ct) + ' วิ')}
        ${rc('CT หลัง', has ? fmt(a.ct) + ' วิ' : '—')}
        ${rc('ลดเวลาได้', has ? fmt(saved) + ' วิ' : '—', saved > 0 ? '#15856b' : saved < 0 ? '#a64475' : '', has ? fmt(savedPct) + '%' : '')}
        ${rc('VA%', fmt(b.vaPct) + '%' + (has ? ' → ' + fmt(a.vaPct) + '%' : ''), '#15856b')}
        ${rc('NVA (สูญเปล่า) ก่อน → หลัง', has ? fmt(b.NVA) + ' → ' + fmt(a.NVA) + ' วิ' : '—', has ? (a.NVA < b.NVA ? '#15856b' : a.NVA > b.NVA ? '#c0392b' : '') : '')}
      </div>
      <div class="compare">${cmp('ก่อน', b, Math.max(b.ct, a.ct, 1))}${has ? cmp('หลัง', a, Math.max(b.ct, a.ct, 1)) : ''}</div>
      <div class="legend">${U().TYPES.map(t => `<span><i style="background:${t.color}"></i>${esc(t.label)}</span>`).join('')}</div>
      <p class="conclusion">${esc(conclusion(j, b, a, has, saved, savedPct, wasteCut))}</p>`;
  }
  function rc(l, v, c, sub) { return `<div><small>${U().esc(l)}</small><strong${c ? ` style="color:${c}"` : ''}>${v}</strong>${sub ? `<em>${U().esc(sub)}</em>` : ''}</div>`; }
  function cmp(label, t, scale) {
    const { fmt } = U();
    const segs = U().TYPES.map(ty => t[ty.k] ? `<i style="width:${(t[ty.k] / (t.ct || 1)) * 100}%;background:${ty.color}"></i>` : '').join('');
    return `<div class="cmp-row"><span class="cmp-label">${label}</span><div class="cmp-track"><div class="cmp-bar" style="width:${(t.ct / scale) * 100}%">${segs}</div></div><span class="cmp-val">${fmt(t.ct)} วิ</span></div>`;
  }
  function conclusion(j, b, a, has, saved, savedPct, wasteCut) {
    const { fmt } = U();
    if (!has) return 'บันทึกข้อมูล “หลังปรับปรุง” เพื่อให้ระบบสรุปผลเปรียบเทียบอัตโนมัติ';
    const tr = trainTotals(j.training); const p = [];
    p.push(`งาน “${j.name || 'ไม่ระบุ'}”${j.line ? ' (' + j.line + ')' : ''}: `);
    if (saved > 0) p.push(`ลดรอบเวลา ${fmt(saved)} วิ (${fmt(savedPct)}%) จาก ${fmt(b.ct)} เหลือ ${fmt(a.ct)} วิ`);
    else if (saved < 0) p.push(`รอบเวลาเพิ่มขึ้น ${fmt(-saved)} วิ ควรทบทวน`);
    else p.push('รอบเวลาคงเดิม');
    p.push(`. VA ${fmt(b.vaPct)}% → ${fmt(a.vaPct)}%`);
    if (wasteCut > 0) p.push(`, ลดความสูญเปล่า ${fmt(wasteCut)} วิ`);
    p.push('. ');
    p.push(tr.people ? `อบรมพนักงานตามวิธีใหม่รวม ${tr.people} คน ใน ${tr.months} เดือน` : 'ยังไม่มีบันทึกการอบรม');
    return p.join('');
  }

  // ---- training ----
  function trainTotals(training) { const m = new Set(); let people = 0; for (const r of training || []) { if (r.month) m.add(r.month); people += U().num(r.count); } return { people, months: m.size }; }
  function training() {
    const { esc } = U(); const list = editing.training || (editing.training = []);
    const el = host.querySelector('#an-train');
    el.innerHTML = `<div class="panelhead"><h2>อบรมพนักงาน (รายเดือน)</h2><button class="add ghost" type="button">＋ รอบอบรม</button></div>
      <div class="tbl"></div><div class="train-sum"></div>`;
    const tbl = el.querySelector('.tbl');
    if (!list.length) tbl.innerHTML = '<div class="empty-row"><p>กด ＋ รอบอบรม เพื่อบันทึกการเทรนแต่ละเดือน</p></div>';
    else {
      tbl.innerHTML = `<table class="el-table"><thead><tr><th>เดือน</th><th>จำนวนคน</th><th>ผู้สอน</th><th>หัวข้อ/หมายเหตุ</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = tbl.querySelector('tbody');
      list.slice().sort((x, y) => (y.month || '').localeCompare(x.month || '')).forEach(r => tb.appendChild(trainRow(list, r)));
      const t = trainTotals(list); el.querySelector('.train-sum').innerHTML = `รวมอบรม <strong>${t.people}</strong> คน · ${t.months} เดือน`;
    }
    el.querySelector('.add').onclick = () => { list.push({ id: U().uid(), month: thisMonth(), count: '', trainer: '', topic: '' }); training(); report(); };
  }
  function trainRow(list, r) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="t-month" type="month"></td><td><input class="t-count" type="number" min="0" step="1"></td><td><input class="t-trainer" placeholder="ผู้สอน"></td><td><input class="t-topic" placeholder="หัวข้อ/หมายเหตุ"></td><td><button class="r-del" type="button">✕</button></td>`;
    const m = tr.querySelector('.t-month'); m.value = r.month || ''; m.onchange = () => { r.month = m.value; training(); };
    const c = tr.querySelector('.t-count'); c.value = r.count; c.oninput = () => { r.count = c.value; const t = trainTotals(list); host.querySelector('#an-train .train-sum').innerHTML = `รวมอบรม <strong>${t.people}</strong> คน · ${t.months} เดือน`; report(); };
    const tn = tr.querySelector('.t-trainer'); tn.value = r.trainer || ''; tn.oninput = () => r.trainer = tn.value;
    const tp = tr.querySelector('.t-topic'); tp.value = r.topic || ''; tp.oninput = () => r.topic = tp.value;
    tr.querySelector('.r-del').onclick = () => { const i = list.indexOf(r); if (i > -1) list.splice(i, 1); training(); report(); };
    return tr;
  }

  // ---- print ----
  function printReport() {
    const { esc, fmt, num } = U(); const j = editing;
    const b = U().totals(j.before), a = U().totals(j.after), has = a.count > 0;
    const saved = b.ct - a.ct, savedPct = b.ct ? (saved / b.ct) * 100 : 0;
    const tr = trainTotals(j.training);
    const win = window.open('', '_blank'); if (!win) { U().toast('เบราว์เซอร์บล็อก popup'); return; }
    const row = (l, bb, aa) => `<tr><th>${l}</th><td>${bb}</td><td>${has ? aa : '—'}</td></tr>`;
    const elTbl = (list, cap) => !list.length ? '' : `<h3>${cap}</h3><table class="el"><thead><tr><th>#</th><th>ขั้นตอน</th><th>วิ</th><th>ประเภท</th></tr></thead><tbody>${list.map((e, i) => `<tr><td>${i + 1}</td><td>${U().ud(e.name)}</td><td style="text-align:right">${fmt(num(e.sec))}</td><td>${e.type}</td></tr>`).join('')}</tbody></table>`;
    win.document.write(`<!doctype html><meta charset="utf-8"><title>รายงานวิเคราะห์งาน · ${esc(j.name || '')}</title>
<style>body{font-family:system-ui,'Segoe UI',sans-serif;color:#17324b;padding:26px;max-width:900px;margin:auto}h1{border-bottom:3px solid #0879d5;padding-bottom:12px}h2{margin:24px 0 8px}table{border-collapse:collapse;width:100%;font-size:13px;margin:8px 0}th,td{border:1px solid #cbd7e2;padding:7px 9px;text-align:left}th{background:#eef5fb}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:14px;margin:14px 0}.concl{line-height:1.8;background:#f3f7fa;padding:12px;border-radius:8px}@media print{@page{size:A4;margin:14mm}}</style>
<body onload="print()"><h1>รายงานวิเคราะห์งาน (Before / After)</h1>
<div class="meta"><div><b>งาน:</b> ${U().ud(j.name || '—')}</div><div><b>สาย/สถานี:</b> ${esc(j.line || '—')}</div><div><b>ผู้ปฏิบัติงาน:</b> ${U().ud(j.operator || '—')}</div><div><b>ผู้วิเคราะห์:</b> ${esc(j.analyst || '—')}</div><div><b>วันที่:</b> ${esc(j.date || '—')}</div><div><b>ปัญหา:</b> ${U().ud(j.problem || '—')}</div></div>
<p><b>เป้าหมาย:</b> ${U().ud(j.target || '—')}</p>
<h2>สรุปเปรียบเทียบ</h2><table><thead><tr><th>รายการ</th><th>ก่อน</th><th>หลัง</th></tr></thead><tbody>
${row('รอบเวลา (วิ)', fmt(b.ct), fmt(a.ct))}${row('VA (วิ)', fmt(b.VA), fmt(a.VA))}${row('NNVA (วิ)', fmt(b.NNVA), fmt(a.NNVA))}${row('NVA (วิ)', fmt(b.NVA), fmt(a.NVA))}${row('VA %', fmt(b.vaPct), fmt(a.vaPct))}
</tbody></table><p><b>${has ? 'ลดรอบเวลา ' + fmt(saved) + ' วิ (' + fmt(savedPct) + '%)' : 'ยังไม่มีข้อมูลหลังปรับปรุง'}</b></p>
<h2>รายละเอียดขั้นตอน</h2>${elTbl(j.before, 'ก่อนปรับปรุง')}${elTbl(j.after, 'หลังปรับปรุง')}
<h2>สังเกตหน้างาน</h2>${!(j.observe || []).length ? '<p>—</p>' : `<table class="el"><thead><tr><th>หัวข้อ</th><th>สภาพปัจจุบัน</th><th>ผลต่อความง่าย</th></tr></thead><tbody>${j.observe.map(o => `<tr><td>${esc(o.item)}</td><td>${esc(o.now)}</td><td>${esc(o.effect)}</td></tr>`).join('')}</tbody></table>`}
<h2>เป้าหมายคะแนนความง่าย</h2>${!TDIMS.some(([k]) => j.targets && j.targets[k] && (j.targets[k].now || j.targets[k].goal)) ? '<p>—</p>' : `<table class="el"><thead><tr><th>มิติ</th><th>ปัจจุบัน</th><th>เป้าหมาย</th><th>มาตรการหลัก</th></tr></thead><tbody>${TDIMS.map(([k, l]) => { const r = (j.targets || {})[k] || {}; return `<tr><td>${l}</td><td>${esc(r.now || '—')}</td><td>${esc(r.goal || '—')}</td><td>${esc(r.act || '')}</td></tr>`; }).join('')}</tbody></table>`}
<h2>ข้อเสนอปรับปรุง (4M1E)</h2>${!(j.suggest || []).length ? '<p>—</p>' : `<table class="el"><thead><tr><th>หมวด</th><th>ข้อเสนอ</th><th>ลำดับ</th></tr></thead><tbody>${j.suggest.slice().sort((x, y) => (x.prio || '').localeCompare(y.prio || '')).map(s => `<tr><td>${esc(catLabel(s.cat))}</td><td>${esc(s.text)}</td><td>${esc(s.prio)}</td></tr>`).join('')}</tbody></table>`}
<h2>การอบรม (รายเดือน)</h2>${!(j.training || []).length ? '<p>—</p>' : `<table class="el"><thead><tr><th>เดือน</th><th>คน</th><th>ผู้สอน</th><th>หัวข้อ</th></tr></thead><tbody>${j.training.slice().sort((x, y) => (y.month || '').localeCompare(x.month || '')).map(r => `<tr><td>${esc(r.month)}</td><td style="text-align:right">${fmt(num(r.count))}</td><td>${esc(r.trainer)}</td><td>${esc(r.topic)}</td></tr>`).join('')}</tbody></table><p>รวม ${tr.people} คน · ${tr.months} เดือน</p>`}
<h2>สรุป</h2><p class="concl">${esc(conclusion(j, b, a, has, saved, savedPct, b.NVA - a.NVA))}</p>`);
    win.document.close();
  }

  function openJob(id) { const jb = D().listJobs().find(x => x.id === id); if (!jb) return; window.CPS.showTab('analysis'); editing = structuredClone(jb); render(document.getElementById('tab-analysis')); scrollTo(0, 0); }
  window.CPSAnalysis = { render, isDirty, leave, openJob };
})();
