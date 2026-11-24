/* CPS IE Studio — Time Study
   นำวิดีโอเข้า (ในเครื่อง) → จับเวลาแยก element → บันทึกเฉพาะค่า (ไม่เก็บวิดีโอ)
   โหมดแมนนวลทำงานได้ทันที · ปุ่ม AI ไว้ต่อยอดวิเคราะห์อัตโนมัติ
*/
(() => {
  const U = () => window.CPS.util;
  const D = () => window.CPS.data;
  let editing = null;      // study object being edited
  let videoUrl = null;     // objectURL (not persisted)
  let videoFile = null;    // File object (not persisted) — used for local audio analysis
  let audioCache = null;   // { file, buffer }
  let soundEvents = [];    // [{start,end,db}] tool-sound bursts found locally
  let boundary = null;     // currentTime of the open element start
  let host = null;
  // unsaved work survives back, tab switch and reload: a draft per browser, restored from the list
  const DRAFT = 'cps-ie-ts-draft-v1';
  const snaps = new WeakMap();
  const scopeId = () => { const sc = D().scope || {}; return [sc.workshop, sc.group, sc.team].join('§'); };
  const isDirty = () => !!editing && snaps.has(editing) && snaps.get(editing) !== JSON.stringify(editing);
  function saveDraft() { if (!isDirty()) return; try { localStorage.setItem(DRAFT, JSON.stringify({ at: Date.now(), scope: scopeId(), s: editing })); } catch (e) {} }
  function readDraft() { try { const d = JSON.parse(localStorage.getItem(DRAFT)); return d && d.s && d.scope === scopeId() ? d : null; } catch (e) { return null; } }
  const dropDraft = () => { try { localStorage.removeItem(DRAFT); } catch (e) {} };
  function leave() { saveDraft(); cleanupVideo(); editing = null; laps = []; }

  // มิติคะแนนความง่ายในการทำงาน (1 = ยากสุด, 5 = ง่ายสุด) — เกณฑ์ตามตัวอย่างอ้างอิงเท่าที่ระบุไว้
  const DIMS = [
    { k: 't', label: 'หมุนตัว', r: { 3: '180–270°', 4: '90–180°' } },
    { k: 'u', label: 'ยกแขน', r: { 1: 'สูงกว่าศีรษะ', 2: 'ศอกสูงกว่าไหล่', 3: 'ศอกใกล้ไหล่', 4: 'ศอกต่ำกว่าไหล่', 5: 'ระหว่างไหล่–เอว' } },
    { k: 'v', label: 'ก้มหลัง', r: { 1: '90°', 2: '60–90°', 3: '45–60°', 4: '30–45°', 5: '0–30°' } },
    { k: 'w', label: 'ของหนัก', r: { 3: '3–5 กก.', 4: '2–3 กก.' } },
  ];
  const sc = v => { const n = parseInt(v, 10); return n >= 1 && n <= 5 ? n : 0; };
  function rowScore(e) { const a = DIMS.map(d => sc(e[d.k])).filter(Boolean); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  function easeSummary(list) {
    const out = { dims: {}, avg: 0, weak: [] };
    const all = [];
    for (const d of DIMS) { const a = (list || []).map(e => sc(e[d.k])).filter(Boolean); out.dims[d.k] = a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; all.push(...a); }
    out.avg = all.length ? all.reduce((x, y) => x + y, 0) / all.length : 0;
    (list || []).forEach((e, i) => DIMS.forEach(d => { const n = sc(e[d.k]); if (n && n <= 3) out.weak.push({ i: i + 1, name: e.name, dim: d.label, n }); }));
    return out;
  }
  const easeColor = n => n <= 3 ? '#c0392b' : n < 4 ? '#9a5b00' : '#15856b';

  function blank() {
    const { uid } = U();
    return { id: uid(), station: '', name: '', operator: '', analyst: '', date: new Date().toISOString().slice(0, 10), elements: [], ergo: { risk: '', notes: '', issues: [] } };
  }

  function render(container) {
    host = container;
    editing ? renderEditor() : renderList();
  }

  // ---------------- list ----------------
  function renderList() {
    const { esc, fmt } = U();
    const can = D().canEdit(); const G = D().group;
    const studies = D().listStudies();
    // จัดกลุ่มรอบจับเวลาตามสถานี (แยกตามพื้นที่ด้วย เผื่อดูรวมหลายทีม)
    const groups = new Map();
    for (const s of studies) { const k = [s.workshop, s.group, s.team, G.key(s)].join('§'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
    const blocks = [...groups.values()].map(list => {
      const rounds = list.slice().sort((x, y) => (x.updatedAt || 0) - (y.updatedAt || 0));
      const agg = G.aggregate(rounds); const head = rounds[rounds.length - 1];
      const label = (head.station || head.name || 'ไม่มีชื่อ');
      return `<section class="panel ts-group">
        <div class="sb-grouphead">
          <div><span class="sb-model">${esc(label)}</span> ${head.station && head.name && head.name !== head.station ? esc(head.name) : ''}${can ? '' : ' · ' + esc([head.workshop, head.group, head.team].filter(Boolean).join('/'))}</div>
          <div class="sb-grouphead-r"><b>${agg.n}</b> รอบ · CT เฉลี่ย <b>${fmt(agg.ctAvg)}</b> วิ · สูงสุด <b>${fmt(agg.ctMax)}</b> · ต่ำสุด <b>${fmt(agg.ctMin)}</b>${can ? ` <button class="mini dark" data-round="${head.id}">＋ จับรอบใหม่</button>` : ''}</div>
        </div>
        <div class="recent">${rounds.map((s, i) => { const t = U().totals(s.elements); return `<div class="recent-row ts-row">
            <span class="tag">รอบ ${i + 1}</span>
            <small>${esc(s.operator || '')} · ${esc(s.date || '')}</small>
            <em>${fmt(t.ct)} วิ · VA ${fmt(t.vaPct)}%</em>
            <span class="row-btns"><button data-edit="${s.id}">${can ? 'เปิด' : 'ดู'}</button>${can ? `<button class="del" data-del="${s.id}">ลบ</button>` : ''}</span>
          </div>`; }).join('')}</div>
      </section>`;
    });
    const dr = can ? readDraft() : null;
    host.innerHTML = `
      ${dr ? `<div class="ts-draft" role="status"><span>มีร่าง Time Study ที่ยังไม่ได้บันทึก · ${esc(dr.s.station || dr.s.name || 'ไม่มีชื่อ')} · ${(dr.s.elements || []).length} element · ${new Date(dr.at).toLocaleString('th-TH')}</span><button class="primary" id="ts-draft-go">กู้คืนร่าง</button><button id="ts-draft-drop">ทิ้งร่าง</button></div>` : ''}
      <div class="page-head">
        <div><h1>ศึกษางาน & จับเวลา</h1></div>
        ${can ? '<button class="primary" id="ts-new">＋ บันทึกใหม่</button>' : ''}
      </div>
      ${!can ? '<div class="ro-banner">👁️ โหมดวิเคราะห์ (อ่านอย่างเดียว) — รวมข้อมูลหลายทีม</div>' : ''}
      ${!studies.length ? '<div class="blank">ยังไม่มี Time Study ในพื้นที่นี้</div>' : '<p class="hint" style="margin:0 0 12px">รอบจับเวลาที่ใช้รหัสสถานีเดียวกันจะถูกรวมเป็นกลุ่มเดียว และคำนวณค่าเฉลี่ยให้อัตโนมัติ</p>' + blocks.join('')}`;
    const nb = host.querySelector('#ts-new'); if (nb) nb.onclick = () => { editing = blank(); renderEditor(); };
    const dg = host.querySelector('#ts-draft-go'); if (dg) dg.onclick = () => { const d = readDraft(); if (!d) return renderList(); editing = d.s; snaps.set(editing, ''); laps = []; renderEditor(); U().toast('กู้คืนร่างแล้ว — วิดีโอไม่ถูกเก็บในร่าง ถ้าจะจับเวลาต่อให้เลือกไฟล์วิดีโอเดิมอีกครั้ง', 7000); };
    const dd = host.querySelector('#ts-draft-drop'); if (dd) dd.onclick = async () => { if (await U().ask('ทิ้งร่าง Time Study นี้? ข้อมูลในร่างจะหายถาวร', [])) { dropDraft(); renderList(); } };
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editing = structuredClone(D().listStudies().find(s => s.id === b.dataset.edit)); renderEditor(); });
    host.querySelectorAll('[data-round]').forEach(b => b.onclick = () => { editing = newRound(D().listStudies().find(s => s.id === b.dataset.round)); renderEditor(); });
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!(await U().ask('ลบรอบจับเวลานี้? ลบแล้วกู้คืนไม่ได้', [], { ok: 'ลบรอบนี้', cancel: 'ไม่ลบ' }))) return;
      const s = D().listStudies().find(x => x.id === b.dataset.del); const k = s ? G.key(s) : '';
      D().remove('studies', b.dataset.del); if (k) G.flow(k); renderList();
    });
  }
  // รอบใหม่ของสถานีเดิม: คัดลอกชื่อขั้นตอน ประเภท และคะแนนมาให้ เหลือแค่จับเวลา
  function newRound(prev) {
    const n = blank();
    n.station = prev.station || prev.name || ''; n.name = prev.name || ''; n.operator = prev.operator || ''; n.analyst = prev.analyst || '';
    n.elements = (prev.elements || []).map(e => ({ id: U().uid(), name: e.name, sec: '', type: e.type, t: e.t || '', u: e.u || '', v: e.v || '', w: e.w || '', note: '' }));
    return n;
  }

  // ---------------- editor ----------------
  function renderEditor() {
    const { esc } = U();
    const s = editing;
    if (!s.ergo) s.ergo = { risk: '', notes: '', issues: [] };
    if (!snaps.has(s)) snaps.set(s, JSON.stringify(s));
    host.innerHTML = `
      <div class="page-head">
        <div><h1>บันทึก Time Study</h1></div>
        <div class="head-btns"><button id="ts-back" class="ghost">← กลับ</button><button id="ts-save" class="primary">บันทึกค่า</button></div>
      </div>
      <section class="panel"><div class="panelhead"><h2>ข้อมูลงาน</h2></div>
        <div class="field-grid">
          ${fld('รหัสสถานี (ใช้รวมรอบจับเวลา)', 'station', s.station || '', 'เช่น CA-05A')}
          ${fld('ชื่องาน / กระบวนการ', 'name', s.name, 'เช่น ประกอบฝาปั๊ม')}
          ${fld('ผู้ปฏิบัติงาน', 'operator', s.operator)}
          ${fld('ผู้วิเคราะห์', 'analyst', s.analyst)}
          ${fld('วันที่', 'date', s.date, '', 'date')}
        </div>
      </section>

      <section class="panel ts-videopanel">
        <div class="panelhead"><h2>วิดีโอ (ในเครื่อง — ไม่ถูกบันทึก)</h2>
          <label class="filebtn">เลือก/ถ่ายวิดีโอ<input id="ts-file" class="vh" type="file" accept="video/*" capture="environment"></label>
        </div>
        <div class="ts-screen"><video id="ts-video" playsinline></video><div id="ts-empty" class="ts-empty">เลือกวิดีโอเพื่อเริ่มจับเวลา</div></div>
        <div class="ts-transport">
          <button id="ts-back5" type="button">⏪ 5วิ</button>
          <button id="ts-stepb" type="button" aria-label="ย้อน 0.1 วินาที">◀ 0.1</button>
          <button id="ts-play" type="button">▶︎ เล่น</button>
          <button id="ts-stepf" type="button" aria-label="เดินหน้า 0.1 วินาที">0.1 ▶</button>
          <button id="ts-fwd5" type="button">5วิ ⏩</button>
          <label>ความเร็ว <select id="ts-rate"><option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></label>
          <span id="ts-time" class="ts-clock">0.0 / 0.0 วิ</span>
        </div>
        <div class="ts-framebar">
          <button id="ts-frames-btn" type="button">🎞 แตกเฟรมจากวิดีโอ</button>
          <label>ทุก <select id="ts-frames-int"><option value="0.5">0.5 วิ</option><option value="1" selected>1 วิ</option><option value="2">2 วิ</option></select></label>
          <small id="ts-frames-msg" class="muted"></small>
        </div>
        <div id="ts-frames" class="ts-frames"></div>
        <div class="ts-capture">
          <button id="ts-mark" class="primary" type="button" ${videoUrl ? '' : 'disabled'}>① มาร์คจุดเริ่ม element</button>
          <button id="ts-lap" class="dark" type="button" disabled>✂ ตัดจบขั้นตอน (Lap)</button>
          <button id="ts-undo" class="ghost" type="button" disabled>↶ ย้อน Lap</button>
          <span id="ts-open" class="muted" aria-live="polite"></span>
          <span class="ts-keys">คีย์ลัด: <kbd>Space</kbd> ตัดจบขั้นตอน (หรือมาร์คเริ่ม) · <kbd>M</kbd> มาร์คจุดเริ่ม · <kbd>P</kbd> เล่น/หยุด · <kbd>Z</kbd> ย้อน Lap · <kbd>←</kbd><kbd>→</kbd> ทีละ 0.1 วิ (<kbd>Shift</kbd> ทีละ 1 วิ)</span>
        </div>
        <p class="hint">วิธีใช้: เล่นวิดีโอ → กด “มาร์คจุดเริ่ม” ตรงจุดเริ่มงาน → พอจบขั้นตอนกด “ตัดจบขั้นตอน” ระบบจะสร้างแถว element พร้อมเวลาให้อัตโนมัติ แล้วเริ่มจับขั้นถัดไปต่อเนื่อง ตั้งชื่อและเลือกประเภทได้ภายหลัง</p>
        <div class="sound-strip"><button id="ts-sound" type="button" class="ghost">🔊 หาเสียงเครื่องมือ</button><button id="ts-sound-els" type="button" class="ghost" hidden>สร้าง element จากเสียง</button><label class="sound-opt"><input id="ts-speech" type="checkbox"> ใช้เสียงพูดบรรยายช่วย AI (ส่งเสียงให้ Gemini ถอดความ)</label><small id="ts-sound-msg" class="muted">เสียงเครื่องมือวิเคราะห์ในเครื่อง ไม่ส่งออก</small></div><div id="ts-sound-list" class="sound-list"></div>
        <div class="ai-strip"><button id="ts-ai" type="button" class="ghost">🤖 แยก element อัตโนมัติ (AI)</button><small>AI ร่าง element + เวลา + VA/NNVA/NVA + คะแนน + Ergonomic ให้ แล้วคนตรวจแก้ · ต้องตั้งค่า Gemini ตามคู่มือก่อน</small></div>
      </section>

      <section class="panel"><div class="panelhead"><h2>การยศาสตร์ (Ergonomic)</h2>
        <button id="ts-ergo-ai" type="button" class="ghost">🤖 ให้ AI ประเมิน</button></div>
        <div class="field-grid">
          <label class="field"><span>ระดับความเสี่ยงรวม</span>
            <select id="ergo-risk">
              <option value="">— ยังไม่ประเมิน —</option>
              <option value="low">ต่ำ</option><option value="medium">ปานกลาง</option><option value="high">สูง</option>
            </select></label>
          <label class="field wide"><span>ปัญหา/จุดเสี่ยงที่พบ (ท่าทาง เอื้อม แรง ความถี่ ฯลฯ)</span>
            <textarea id="ergo-notes" rows="3" placeholder="เช่น ก้มหลังหยิบของซ้ำ ๆ, เอื้อมไกลเกิน 40 ซม., ยกเกิน 5 กก."></textarea></label>
        </div>
        <p class="hint">AI จะช่วยระบุท่าทางเสี่ยง (แนว RULA/REBA) และจับคู่กับ element ที่เกี่ยวข้องให้อัตโนมัติเมื่อเปิดใช้โหมด AI</p>
      </section>

      <section class="panel"><div class="panelhead"><h2>Element <span id="ts-count">0</span></h2>
        <button id="ts-addrow" class="dark" type="button">＋ แถว</button></div>
        <div id="ts-table" class="tbl"></div>
        <div id="ts-metrics" class="mini-metrics"></div>
        <div id="ts-bar" class="stack"></div>
        <p class="hint">คะแนนความง่าย: 1 = ยากสุด, 5 = ง่ายสุด · คะแนน ≤ 3 ขึ้นสีแดง = จุดต้องปรับปรุง</p>
      </section>
      <section class="panel"><div class="panelhead"><h2>ตารางงานมาตรฐาน (SWCT)</h2>
        <div class="head-btns"><label class="swct-takt">TAKT <input id="swct-takt" type="number" min="0" step="0.1" inputmode="decimal"> วิ</label><button id="swct-print" type="button" class="ghost">พิมพ์ SWCT</button></div></div>
        <div id="ts-swct" class="swct-wrap"></div>
      </section>
      <section class="panel"><div class="panelhead"><h2>แผนภูมิสองมือ (Two-Handed Process Chart)</h2>
        <div class="head-btns"><label class="swct-takt">Proposed เทียบกับ <select id="th-cmp"></select></label><button id="th-print" type="button" class="ghost">พิมพ์</button></div></div>
        <div id="th-table" class="tbl"></div><div id="th-chart" class="swct-wrap"></div><div id="th-sum" class="th-sum"></div>
        <p class="hint">○ ทำงาน · ⇨ เคลื่อนย้าย · D รอ/มือว่าง · ▽ ถือค้าง · □ ตรวจสอบ · แถวละ 1 element · AI ร่างให้ แก้ได้ในตารางด้านบน · Proposed = เลือกรอบหลังปรับปรุงของสถานีเดียวกันมาเทียบ</p></section>
      <section class="panel"><div class="panelhead"><h2>สรุปคะแนนความง่ายในการทำงาน</h2></div><div id="ts-ease"></div></section>`;

    // field bindings
    host.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => { s[inp.dataset.f] = inp.value; if (inp.dataset.f === 'station') renderSwct(); saveDraft(); });
    host.querySelector('#ts-back').onclick = async () => {
      if (isDirty() && !(await U().ask('ยังไม่ได้บันทึก Time Study นี้ — ออกโดยไม่บันทึก? (ร่างยังเก็บไว้ในเครื่อง กู้คืนได้จากหน้ารายการ)', []))) return;
      leave(); renderList();
    };
    host.querySelector('#ts-save').onclick = saveStudy;
    host.querySelector('#ts-file').onchange = onFile;
    const v = host.querySelector('#ts-video');
    host.querySelector('#ts-play').onclick = () => { v.paused ? v.play() : v.pause(); };
    host.querySelector('#ts-back5').onclick = () => { v.currentTime = Math.max(0, v.currentTime - 5); };
    host.querySelector('#ts-fwd5').onclick = () => { v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); };
    host.querySelector('#ts-stepb').onclick = () => step(-0.1);
    host.querySelector('#ts-stepf').onclick = () => step(0.1);
    host.querySelector('#ts-rate').onchange = e => v.playbackRate = parseFloat(e.target.value);
    v.addEventListener('timeupdate', updateClock);
    v.addEventListener('loadedmetadata', updateClock);
    v.addEventListener('play', () => host.querySelector('#ts-play').textContent = '⏸ หยุด');
    v.addEventListener('pause', () => host.querySelector('#ts-play').textContent = '▶︎ เล่น');
    host.querySelector('#ts-frames-btn').onclick = extractFrames;
    const tk = host.querySelector('#swct-takt'); tk.value = editing.takt || ''; tk.placeholder = stationTakt() ? String(stationTakt()) : '';
    tk.oninput = () => { editing.takt = tk.value; renderSwct(); };
    host.querySelector('#swct-print').onclick = printSwct;
    host.querySelector('#th-print').onclick = printHands;
    host.querySelector('#th-cmp').onchange = e => { editing.thCmp = e.target.value; renderHandsChart(); };
    host.querySelector('#ts-sound').onclick = () => findSounds(true);
    host.querySelector('#ts-sound-els').onclick = elementsFromSound;
    if (soundEvents.length) paintSounds();
    host.querySelector('#ts-mark').onclick = markStart;
    host.querySelector('#ts-lap').onclick = lap;
    host.querySelector('#ts-undo').onclick = undoLap;
    host.querySelector('#ts-addrow').onclick = () => { s.elements.push({ id: U().uid(), name: '', sec: '', type: '', note: '' }); renderTable(); };
    host.querySelector('#ts-ai').onclick = aiAnalyze;
    const er = host.querySelector('#ergo-risk'); er.value = s.ergo.risk || ''; er.onchange = () => s.ergo.risk = er.value;
    const en = host.querySelector('#ergo-notes'); en.value = s.ergo.notes || ''; en.oninput = () => s.ergo.notes = en.value;
    host.querySelector('#ts-ergo-ai').onclick = aiAnalyze;
    if (videoUrl) { v.src = videoUrl; host.querySelector('#ts-empty').hidden = true; }
    renderTable();
  }

  function fld(label, key, val, ph, type) {
    const { esc } = U();
    return `<label class="field"><span>${esc(label)}</span><input data-f="${key}" ${type ? `type="${type}"` : ''} value="${esc(val)}" placeholder="${esc(ph || '')}"></label>`;
  }

  function onFile(e) {
    const f = e.target.files[0]; if (!f) return;
    cleanupVideo();
    videoUrl = URL.createObjectURL(f); videoFile = f; audioCache = null; soundEvents = [];
    const v = host.querySelector('#ts-video'); v.src = videoUrl;
    host.querySelector('#ts-empty').hidden = true;
    host.querySelector('#ts-mark').disabled = false;
  }
  function step(d) { const v = host && host.querySelector('#ts-video'); if (!v || !v.src) return; v.pause(); v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d)); }
  // keyboard: timing without reaching for the mouse
  document.addEventListener('keydown', e => {
    if (!editing || !host || !host.querySelector('#ts-video') || host.closest('[hidden]') || document.querySelector('dialog[open]')) return;
    const tg = e.target instanceof Element ? e.target : null;
    if ((tg && tg.closest('input, select, textarea, [contenteditable]')) || e.ctrlKey || e.metaKey || e.altKey) return;
    const v = host.querySelector('#ts-video'); if (!v.src) return;
    const k = e.code; // ปุ่มตามตำแหน่งบนคีย์บอร์ด ใช้ได้ทั้งแป้นไทยและอังกฤษ
    if (k === 'Space') { e.preventDefault(); boundary == null ? markStart() : lap(); }
    else if (k === 'KeyM') { e.preventDefault(); markStart(); }
    else if (k === 'KeyP') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
    else if (k === 'KeyZ' || k === 'Backspace') { e.preventDefault(); undoLap(); }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); step((k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1)); }
  });
  function cleanupVideo() { if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; } videoFile = null; audioCache = null; soundEvents = []; boundary = null; }

  // แตกเฟรมจากวิดีโอเป็นแถบภาพย่อ (อยู่ในหน้าจอเท่านั้น ไม่ถูกบันทึก) — กดภาพเพื่อข้ามไปเวลานั้น
  let extracting = false;
  async function extractFrames() {
    const v = host.querySelector('#ts-video'); const box = host.querySelector('#ts-frames'); const msg = host.querySelector('#ts-frames-msg');
    if (!v.src || !v.duration) { U().toast('เลือกวิดีโอก่อน'); return; }
    if (extracting) return; extracting = true;
    const step = parseFloat(host.querySelector('#ts-frames-int').value) || 1;
    const MAX = 150; let times = []; for (let t = 0; t < v.duration && times.length < MAX; t += step) times.push(t);
    v.pause(); const back = v.currentTime; box.innerHTML = '';
    const c = document.createElement('canvas'); c.width = 160; c.height = Math.round(160 * (v.videoHeight || 9) / (v.videoWidth || 16));
    const ctx = c.getContext('2d');
    const seek = t => new Promise(res => { const h = () => { v.removeEventListener('seeked', h); res(); }; v.addEventListener('seeked', h); v.currentTime = t; });
    try {
      for (let i = 0; i < times.length; i++) {
        if (!host.contains(box)) break;
        await seek(times[i]); ctx.drawImage(v, 0, 0, c.width, c.height);
        const f = document.createElement('button'); f.type = 'button'; f.className = 'ts-frame';
        f.innerHTML = `<img alt="" src="${c.toDataURL('image/jpeg', 0.6)}"><small>${times[i].toFixed(1)}s</small>`;
        const t = times[i]; f.onclick = () => { v.currentTime = t; box.querySelectorAll('.ts-frame').forEach(x => x.classList.toggle('on', x === f)); };
        box.appendChild(f); msg.textContent = `${i + 1}/${times.length} เฟรม`;
      }
      if (times.length >= MAX) msg.textContent += ` (จำกัด ${MAX} เฟรม — เพิ่มช่วงเวลาเพื่อครอบคลุมทั้งคลิป)`;
    } catch (e) { msg.textContent = 'แตกเฟรมไม่สำเร็จ: ' + e.message; }
    v.currentTime = back; extracting = false;
  }

  // ---- เสียง: ถอดรหัสเสียงจากไฟล์ในเครื่อง ----
  async function decodeAudio() {
    if (!videoFile) throw new Error('เลือกวิดีโอจากเครื่องก่อน');
    if (audioCache && audioCache.file === videoFile) return audioCache.buffer;
    const AC = window.AudioContext || window.webkitAudioContext; const ctx = new AC();
    try {
      const buf = await ctx.decodeAudioData(await videoFile.arrayBuffer());
      audioCache = { file: videoFile, buffer: buf }; return buf;
    } catch (e) { throw new Error('อ่านเสียงจากไฟล์นี้ไม่ได้ (ไฟล์อาจไม่มีเสียง)'); }
    finally { try { ctx.close(); } catch (e) {} }
  }
  // หาช่วงเสียงดังเด่นกว่าเสียงพื้นหลัง (เช่น บล็อกไฟฟ้า เสียงคลิก) — คำนวณในเครื่องทั้งหมด
  function detectBursts(buf) {
    const sr = buf.sampleRate, win = Math.max(1, Math.round(sr * 0.05)), n = Math.floor(buf.length / win);
    const chs = []; for (let c = 0; c < buf.numberOfChannels; c++) chs.push(buf.getChannelData(c));
    const db = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0; const o = i * win;
      for (let j = 0; j < win; j++) { let x = 0; for (const ch of chs) x += ch[o + j]; x /= chs.length; sum += x * x; }
      db[i] = 10 * Math.log10(sum / win + 1e-12);
    }
    const sorted = Array.from(db).sort((a, b) => a - b); const pct = q => sorted[Math.min(n - 1, Math.floor(q * n))];
    const floor = pct(0.2);
    // ปรับตามคลิป: เอาเฉพาะช่วงที่ดังติดอันดับ 7% แรก และดังกว่าเสียงพื้นหลังอย่างน้อย 6 dB (โรงงานเสียงดัง + ไมค์มือถือบีบเสียง)
    let thr = Math.max(floor + 6, pct(0.93)), ev = [];
    for (let pass = 0; pass < 6; pass++) {
      ev = []; let st = -1, gap = 0;
      for (let i = 0; i <= n; i++) {
        const loud = i < n && db[i] >= thr;
        if (loud) { if (st < 0) st = i; gap = 0; }
        else if (st >= 0) { gap++; if (gap > 6 || i === n) { const end = i - gap + 1; if ((end - st) * 0.05 >= 0.3) { let pk = -200; for (let k = st; k < end; k++) pk = Math.max(pk, db[k]); ev.push({ start: +(st * 0.05).toFixed(1), end: +(end * 0.05).toFixed(1), db: Math.round(pk - floor) }); } st = -1; gap = 0; } }
      }
      if (ev.length <= 60) break; thr += 3;
    }
    return ev;
  }
  async function findSounds(show) {
    const msg = host.querySelector('#ts-sound-msg');
    try {
      msg.textContent = 'กำลังวิเคราะห์เสียง…';
      const buf = await decodeAudio(); soundEvents = detectBursts(buf);
      msg.textContent = soundEvents.length ? `พบเสียงเครื่องมือ ${soundEvents.length} ช่วง (คำนวณในเครื่อง)` : 'ไม่พบช่วงเสียงดังเด่นชัด';
      if (show) paintSounds();
      return soundEvents;
    } catch (e) { msg.textContent = e.message; soundEvents = []; if (show) paintSounds(); return []; }
  }
  function paintSounds() {
    const box = host.querySelector('#ts-sound-list'); const v = host.querySelector('#ts-video');
    host.querySelector('#ts-sound-els').hidden = !soundEvents.length;
    box.innerHTML = soundEvents.map((e, i) => `<button type="button" class="sound-chip" data-i="${i}">🔊 ${e.start.toFixed(1)}–${e.end.toFixed(1)} วิ</button>`).join('');
    box.querySelectorAll('.sound-chip').forEach(b => b.onclick = () => { v.currentTime = soundEvents[+b.dataset.i].start; });
  }
  // แบ่งคลิปเป็นช่วง "มีเสียงเครื่องมือ" กับ "ช่วงระหว่างนั้น" เป็นร่าง element ให้คนตั้งชื่อต่อ
  async function elementsFromSound() {
    const v = host.querySelector('#ts-video'); if (!soundEvents.length) return;
    if (editing.elements.length && !(await U().ask('แทนที่ element ที่มีอยู่ด้วยช่วงที่แบ่งจากเสียง?', []))) return;
    const out = []; let t = 0, k = 0; const dur = v.duration || soundEvents[soundEvents.length - 1].end;
    const push = (a, b, name, type) => { const sec = Math.round((b - a) * 10) / 10; if (sec >= 0.3) out.push({ id: U().uid(), name, sec, type, note: `${a.toFixed(1)}–${b.toFixed(1)} วิ`, sound: true }); };
    for (const e of soundEvents) { push(t, e.start, '', 'NNVA'); push(e.start, e.end, `ใช้เครื่องมือ ${++k}`, 'VA'); t = e.end; }
    push(t, dur, '', 'NNVA');
    editing.elements = out; renderEditor();
    U().toast(`แบ่งได้ ${out.length} ช่วงจากเสียง — ตั้งชื่อขั้นตอนและตรวจประเภทต่อ`);
  }
  // แปลงเสียงเป็น WAV 8 kHz โมโน (สำหรับถอดเสียงพูดเท่านั้น)
  async function speechWav(buf, maxSec) {
    const sec = Math.min(buf.duration, maxSec), rate = 8000;
    const off = new OfflineAudioContext(1, Math.ceil(sec * rate), rate);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start(0, 0, sec);
    const pcm = (await off.startRendering()).getChannelData(0);
    const ab = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(ab);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const x = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    const bytes = new Uint8Array(ab); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // ---- AI วิเคราะห์อัตโนมัติ: ส่งเฟรมภาพไปให้ Gemini ผ่าน Apps Script แล้วเติม element/เวลา/ประเภท/คะแนน/Ergonomic ----
  let aiBusy = false;
  async function grabFrames(v, maxFrames, width) {
    const step = Math.max(1, v.duration / maxFrames); const times = [];
    for (let t = 0; t < v.duration && times.length < maxFrames; t += step) times.push(Math.round(t * 10) / 10);
    const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * (v.videoHeight || 9) / (v.videoWidth || 16));
    const ctx = c.getContext('2d');
    const seek = t => new Promise(res => { const h = () => { v.removeEventListener('seeked', h); res(); }; v.addEventListener('seeked', h); v.currentTime = t; });
    const out = [];
    for (const t of times) { await seek(t); ctx.drawImage(v, 0, 0, c.width, c.height); out.push({ t, data: c.toDataURL('image/jpeg', 0.6).split(',')[1] }); }
    return out;
  }
  async function aiAnalyze() {
    const v = host.querySelector('#ts-video');
    if (aiBusy) return;
    if (!v.src || !v.duration) { U().toast('เลือกวิดีโอก่อน'); return; }
    if (!window.CPS.sheet.configured()) { U().toast('เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — ขอลิงก์สำหรับทีมจากผู้ดูแลระบบ'); return; }
    const yes = async m => !!(await U().ask(m, []));
    const useSpeech = !!(host.querySelector('#ts-speech') || {}).checked;
    if (!await yes(useSpeech ? 'ส่งภาพนิ่งจากวิดีโอนี้ (สูงสุด 40 ภาพ) และเสียงพูดในคลิป ไปให้ Google Gemini วิเคราะห์ ผ่าน Apps Script ของคุณ?' : 'ส่งภาพนิ่งจากวิดีโอนี้ (สูงสุด 40 ภาพ) ไปให้ Google Gemini วิเคราะห์ ผ่าน Apps Script ของคุณ?')) return;
    if (editing.elements.length && !await yes('แทนที่ element ที่มีอยู่ด้วยผลจาก AI?')) return;
    aiBusy = true; const btn = host.querySelector('#ts-ai'); const label = btn.textContent; btn.disabled = true;
    try {
      // เริ่มถอดเสียงพูดทันที (ส่งให้ AI) ไปพร้อมกับตัดภาพและหาเสียงเครื่องมือในเครื่อง
      const dur = Math.round(v.duration * 10) / 10;
      const speechJob = (useSpeech && videoFile) ? (async () => {
        try {
          const audio = await speechWav(await decodeAudio(), 600);
          const tr = await window.CPS.sheet.call({ action: 'transcribe' }, { audio, mime: 'audio/wav', duration: dur });
          if (tr.ok) return (tr.speech || []).filter(x => x && x.text);
          U().toast('ถอดเสียงพูดไม่สำเร็จ ใช้ภาพและเสียงเครื่องมืออย่างเดียว: ' + (tr.error || ''));
        } catch (e) { U().toast('ถอดเสียงพูดไม่สำเร็จ ใช้ภาพและเสียงเครื่องมืออย่างเดียว: ' + e.message); }
        return [];
      })() : Promise.resolve([]);
      btn.textContent = useSpeech ? 'กำลังเตรียมภาพ + ถอดเสียงพูด…' : 'กำลังเตรียมภาพ…'; v.pause(); const back = v.currentTime;
      const frames = await grabFrames(v, 40, 384); v.currentTime = back;
      btn.textContent = 'กำลังวิเคราะห์เสียง…';
      const sound = videoFile ? (soundEvents.length ? soundEvents : await findSounds(true)) : [];
      if (useSpeech) btn.textContent = 'AI กำลังถอดเสียงพูด…';
      const speech = await speechJob;
      btn.textContent = 'AI กำลังวิเคราะห์ภาพ…';
      const res = await window.CPS.sheet.call({ action: 'ai' }, { frames, duration: dur, name: editing.name || '', sound: sound.map(e => [e.start, e.end]), speech: speech.map(x => ({ start: +x.start || 0, end: +x.end || 0, text: String(x.text).slice(0, 200) })) });
      if (!res.ok) throw new Error(res.error || 'AI ตอบกลับผิดปกติ');
      const ok = ['VA', 'NNVA', 'NVA']; const s15 = n => { n = parseInt(n, 10); return n >= 1 && n <= 5 ? String(n) : ''; };
      const els = (res.elements || []).map(e => ({
        id: U().uid(), name: String(e.name || ''), sec: Math.max(0, Math.round((U().num(e.end) - U().num(e.start)) * 10) / 10),
        type: ok.includes(e.type) ? e.type : 'NNVA', t: s15(e.t), u: s15(e.u), v: s15(e.v), w: s15(e.w), steps: Math.max(0, Math.round(U().num(e.steps))), note: '', ai: true, _span: [U().num(e.start), U().num(e.end)]
      })).filter(e => e.sec > 0);
      const spans = els.map(e => { const sp = e._span; delete e._span; return sp; });
      if (!els.length) throw new Error('AI ไม่พบ element');
      editing.elements = els; editing.aiDraft = true;
      if (res.ergo) { editing.ergo.risk = ['low', 'medium', 'high'].includes(res.ergo.risk) ? res.ergo.risk : editing.ergo.risk; if (res.ergo.notes) editing.ergo.notes = String(res.ergo.notes); }
      renderEditor();
      U().toast('AI ร่างให้ ' + els.length + ' element' + (sound.length ? ` (ใช้เสียงเครื่องมือ ${sound.length} ช่วง` + (speech.length ? ` + คำพูด ${speech.length} ช่วง)` : ')') : '') + ' — กรุณาตรวจและแก้ก่อนบันทึก');
      // คำขอที่ 2: ร่างแบบงาน เวลาเครื่อง และมือซ้าย/ขวา (แยกเพื่อไม่ให้เกินเวลา 6 นาทีของ Apps Script)
      const b2 = host.querySelector('#ts-ai'); if (b2) { b2.disabled = true; b2.textContent = 'AI กำลังร่างแบบงาน / มือซ้าย-ขวา…'; }
      try {
        const det = await window.CPS.sheet.call({ action: 'aidetail' }, { frames, elements: els.map((e, i) => ({ i, name: e.name, start: spans[i][0], end: spans[i][1] })) });
        if (!det.ok) throw new Error(det.error || 'AI ตอบกลับผิดปกติ');
        let n = 0;
        if (editing.elements === els) (det.items || []).forEach(it => {
          const e = els[parseInt(it && it.i, 10)]; if (!e) return;
          if (KINDS.some(k => k[0] === it.kind)) e.kind = it.kind;
          e.mach = it.kind === 'auto' && U().num(it.mach) > 0 ? Math.round(U().num(it.mach) * 10) / 10 : '';
          const l = handOf(it.lh), r = handOf(it.rh); if (l) e.lh = l; if (r) e.rh = r; n++;
        });
        if (editing.elements === els) { renderTable(); U().toast('AI ร่างแบบงาน / มือซ้าย-ขวา ให้ ' + n + ' element — กรุณาตรวจก่อนบันทึก'); }
      } catch (e) { U().toast('ร่างแบบงาน / มือซ้าย-ขวา ไม่สำเร็จ (element ที่แบ่งไว้ยังอยู่): ' + e.message); }
      const b3 = host.querySelector('#ts-ai'); if (b3) { b3.disabled = false; b3.textContent = label; }
    } catch (e) { U().toast('AI วิเคราะห์ไม่สำเร็จ: ' + e.message); btn.textContent = label; btn.disabled = false; }
    aiBusy = false;
  }

  function updateClock() {
    const v = host.querySelector('#ts-video'); if (!v) return;
    host.querySelector('#ts-time').textContent = `${v.currentTime.toFixed(1)} / ${(v.duration || 0).toFixed(1)} วิ`;
    if (boundary != null) host.querySelector('#ts-open').textContent = 'กำลังจับ: ' + Math.max(0, v.currentTime - boundary).toFixed(1) + ' วิ';
  }
  // ย้อน Lap ล่าสุด (กดตัดผิดจังหวะ): คืนแถวและจุดเริ่มเดิม
  let laps = [];
  function undoLap() {
    const l = laps.pop(); if (!l || !editing) { U().toast('ไม่มี Lap ให้ย้อน'); return; }
    const i = editing.elements.findIndex(e => e.id === l.id);
    if (i >= 0) { if (l.filled) editing.elements[i].sec = ''; else editing.elements.splice(i, 1); }
    boundary = l.from;
    const v = host.querySelector('#ts-video'); if (v && v.src) { v.pause(); v.currentTime = l.from; }
    const ub = host.querySelector('#ts-undo'); if (ub) ub.disabled = !laps.length;
    renderTable(); updateClock(); U().toast('ย้อน Lap ล่าสุดแล้ว — วิดีโอกลับไปที่จุดเริ่มของขั้นตอนนั้น');
  }
  function markStart() {
    const v = host.querySelector('#ts-video'); if (!v.src) { U().toast('เลือกวิดีโอก่อน'); return; }
    boundary = v.currentTime;
    host.querySelector('#ts-lap').disabled = false;
    host.querySelector('#ts-mark').textContent = '↻ รีเซ็ตจุดเริ่ม';
    updateClock();
  }
  function lap() {
    const v = host.querySelector('#ts-video');
    if (boundary == null) return;
    const dur = Math.max(0, v.currentTime - boundary);
    if (dur < 0.05) { U().toast('ช่วงเวลาสั้นเกินไป'); return; }
    const sec = Math.round(dur * 10) / 10;
    const empty = editing.elements.find(e => e.sec === '' || e.sec == null);
    const from = boundary;
    if (empty) { empty.sec = sec; laps.push({ id: empty.id, filled: true, from }); }
    else { const id = U().uid(); editing.elements.push({ id, name: '', sec, type: '', note: '' }); laps.push({ id, filled: false, from }); }
    boundary = v.currentTime; // chain next element
    const ub = host.querySelector('#ts-undo'); if (ub) ub.disabled = false;
    renderTable();
    updateClock();
  }

  // ---------- element table (shared look) ----------
  function renderTable() {
    const { esc, TYPES, fmt, num } = U();
    const list = editing.elements;
    const wrap = host.querySelector('#ts-table');
    host.querySelector('#ts-count').textContent = list.length;
    if (!list.length) { wrap.innerHTML = '<div class="empty-row"><p>ยังไม่มี element — ใช้ปุ่มจับเวลา หรือ “＋ แถว”</p></div>'; }
    else {
      wrap.innerHTML = `<table class="el-table ease-table"><thead><tr><th>#</th><th>คนที่</th><th>ขั้นตอน</th><th>วินาที</th><th>ก้าว</th><th>ประเภท</th><th>แบบงาน</th><th>เครื่อง (วิ)</th>${DIMS.map(d => `<th>${d.label}</th>`).join('')}<th>รวม</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = wrap.querySelector('tbody');
      list.forEach((e, i) => tb.appendChild(row(list, e, i)));
    }
    const t = U().totals(list);
    host.querySelector('#ts-metrics').innerHTML =
      mini('รอบเวลา (CT)', fmt(t.ct) + ' วิ') + mini('VA', fmt(t.VA) + ' วิ · ' + fmt(t.vaPct) + '%', '#15856b') +
      mini('NNVA', fmt(t.NNVA) + ' วิ', '#ad7206') + mini('NVA', fmt(t.NVA) + ' วิ', '#a64475') + mini('ก้าวเดิน', totalSteps(editing.elements) + ' ก้าว');
    host.querySelector('#ts-bar').innerHTML = stack(t);
    renderEase(); renderSwct(); renderHands();
  }
  // ---- ตารางงานมาตรฐาน (Standardized Work Combination Table) ----
  const KINDS = [['manual', 'งานมือ'], ['walk', 'เดิน'], ['wait', 'รอ'], ['auto', 'เครื่องจักร']];
  function kindOf(e) {
    if (e.kind && KINDS.some(k => k[0] === e.kind)) return e.kind;
    const n = String(e.name || '');
    if (/รอ/.test(n)) return 'wait';
    if (/เดิน/.test(n) || (U().num(e.steps) > 0 && e.type !== 'VA')) return 'walk';
    return 'manual';
  }
  function stationTakt() {
    const k = String(editing.station || editing.name || '').trim().toLowerCase(); if (!k) return 0;
    const st = D().listStations().find(r => String(r.station || '').trim().toLowerCase() === k);
    return st && U().num(st.jph) ? Math.round(3600 / U().num(st.jph) * 10) / 10 : 0;
  }
  const OP_COLORS = ['#f9c9d6', '#fbe9a6', '#c9ecc9', '#d9c7f0', '#c7e3f6', '#f6d5b5', '#e0e0e0', '#c8efe6', '#f2c7c7'];
  // lanes (optional): [{ station, elements }] — SWCT of a whole line, every station on the same time axis
  // opt (ไม่บังคับ): { lab: ป้ายหัวตาราง (ภาษาอื่น / สองบรรทัดด้วย \n), span: บังคับช่วงแกนเวลา (ให้หลายหน้าใช้สเกลเดียวกัน) }
  const SW_LAB = { station: 'Station', no: 'ลำดับที่', name: 'ชื่องานที่ทำ', time: 'เวลา', hand: 'มือ', send: 'ส่ง', walk: 'เดิน', total: 'รวม', person: 'คนที่' };
  function swctSvg(list, takt, station, lanes, opt) {
    const { esc, num, fmt } = U();
    const LB = Object.assign({}, SW_LAB, (opt && opt.lab) || {});
    const ht = (x, y, s, cls) => { const p = String(s).split('\n'); return p.length < 2 ? `<text x="${x}" y="${y}" class="${cls}">${esc(s)}</text>`
      : `<text x="${x}" y="${y - 6}" class="${cls} sw-2l">${esc(p[0])}</text><text x="${x}" y="${y + 5}" class="${cls} sw-2l">${esc(p[1])}</text>`; };
    // แยกตามผู้ปฏิบัติงาน (คนที่) — แต่ละคนเริ่มเวลา 0
    function opGroups(els, label, laneIdx) {
      const ops = new Map();
      (els || []).forEach((e, i) => { const o = Math.max(1, parseInt(e.op, 10) || 1); if (!ops.has(o)) ops.set(o, []); ops.get(o).push({ e, idx: i }); });
      const out = [...ops.entries()].sort((x, y) => x[0] - y[0]).map(([o, arr]) => {
        let t = 0; const rows = arr.map(({ e }, k) => { const sec = num(e.sec), kd = kindOf(e), mach = kd === 'auto' ? num(e.mach) : 0; const r = { no: k + 1, name: e.name || '', kd, start: t, sec, mach }; t += sec; return r; });
        return { op: o, label, color: laneIdx == null ? (o - 1) : laneIdx, rows, ct: t, machEnd: Math.max(0, ...rows.map(r => r.kd === 'auto' ? r.start + r.sec + r.mach : 0)) };
      });
      out.forEach(g => { g.multi = out.length > 1; });
      return out;
    }
    const single = String((station !== undefined ? station : editing && editing.station) || '—');
    const groups = lanes ? lanes.flatMap((ln, li) => opGroups(ln.elements, String(ln.station || '—'), li + ((opt && opt.laneOffset) || 0))) : opGroups(list, single, null);
    const cycle = Math.max(0, ...groups.map(g => g.ct)), machEnd = Math.max(0, ...groups.map(g => g.machEnd));
    const span = (opt && opt.span) || Math.ceil(Math.max(cycle, takt || 0, machEnd, 5) * 1.08 / 5) * 5;
    const cOp = 70, cNo = 40, cName = 210, cNum = 36, L = cOp + cNo + cName + cNum * 3, W = 1100, RH = 24, top = 44;
    const nRows = groups.reduce((a, g) => a + g.rows.length, 0);
    const H = top + nRows * RH + RH + 6, X = v => L + 6 + (v / span) * (W - L - 16);
    let g = '';
    const gs = span <= 120 ? 5 : span <= 300 ? 10 : 30;
    for (let v = 0; v <= span; v += gs) { const major = v % (gs * 2) === 0; g += `<line x1="${X(v)}" y1="${top}" x2="${X(v)}" y2="${H - RH}" class="${major ? 'sw-g2' : 'sw-g1'}"/>${v ? `<text x="${X(v)}" y="${top - 6}" class="sw-ax">${v}"</text>` : ''}`; }
    const hx = [cOp / 2, cOp + cNo / 2, cOp + cNo + cName / 2, cOp + cNo + cName + cNum / 2, cOp + cNo + cName + cNum * 1.5, cOp + cNo + cName + cNum * 2.5];
    let head = `<rect x="0" y="0" width="${W}" height="${top}" class="sw-headbg"/>` +
      ht(hx[0], top - 14, LB.station, 'sw-h') + ht(hx[1], top - 14, LB.no, 'sw-h') + ht(hx[2], top - 14, LB.name, 'sw-h sw-big') +
      `<text x="${hx[4]}" y="${top - 30}" class="sw-h">${esc(LB.time)}</text>` + ht(hx[3], top - 10, LB.hand, 'sw-h') + ht(hx[4], top - 10, LB.send, 'sw-h') + ht(hx[5], top - 10, LB.walk, 'sw-h');
    let body = '', y0 = top, tot = { man: 0, auto: 0, walk: 0, wait: 0 };
    groups.forEach((gr, gi) => {
      const hgt = gr.rows.length * RH, stTxt = gr.label.length > 10 ? gr.label.slice(0, 10) + '…' : gr.label;
      const over = takt && gr.ct > takt;
      body += `<rect x="0" y="${y0}" width="${cOp}" height="${hgt}" fill="${OP_COLORS[gr.color % OP_COLORS.length]}"/><text x="${cOp / 2}" y="${y0 + hgt / 2 + 4}" class="sw-op">${esc(stTxt)}</text>${gr.multi ? `<text x="${cOp / 2}" y="${y0 + hgt / 2 + 18}" class="sw-op">${esc(LB.person)} ${gr.op}</text>` : ''}`;
      gr.rows.forEach((r, i) => {
        const y = y0 + i * RH + RH / 2, x1 = X(r.start), x2 = X(r.start + r.sec);
        const lbl = r.name.length > 26 ? r.name.slice(0, 26) + '…' : r.name;
        const man = r.kd === 'manual' || r.kd === 'auto' ? r.sec : 0, walk = r.kd === 'walk' ? r.sec : 0;
        tot.man += man; tot.walk += walk; tot.auto += r.mach; if (r.kd === 'wait') tot.wait += r.sec;
        body += `<line x1="${cOp}" y1="${y + RH / 2}" x2="${W}" y2="${y + RH / 2}" class="sw-row"/>` +
          `<text x="${hx[1]}" y="${y + 4}" class="sw-c">${r.no}</text><text x="${cOp + cNo + 6}" y="${y + 4}" class="sw-name">${esc(lbl)}</text>` +
          `<text x="${hx[3]}" y="${y + 4}" class="sw-c">${man ? fmt(man) : ''}</text><text x="${hx[4]}" y="${y + 4}" class="sw-c">${r.mach ? fmt(r.mach) : ''}</text><text x="${hx[5]}" y="${y + 4}" class="sw-c">${walk ? fmt(walk) : ''}</text>`;
        if (r.sec > 0) {
          if (r.kd === 'walk') { let d = `M${x1},${y}`; const n = Math.max(2, Math.round((x2 - x1) / 6)); for (let k = 1; k <= n; k++) { const xa = x1 + (x2 - x1) * (k - 0.5) / n, xb = x1 + (x2 - x1) * k / n; d += ` Q${xa},${y + (k % 2 ? -5 : 5)} ${xb},${y}`; } body += `<path d="${d}" class="sw-walk"/>`; }
          else if (r.kd === 'wait') body += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="sw-wait"/>`;
          else body += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" class="sw-man"/>`;
        }
        if (r.mach > 0) body += `<line x1="${x2}" y1="${y}" x2="${X(r.start + r.sec + r.mach)}" y2="${y}" class="sw-auto"/>`;
        if (i < gr.rows.length - 1 && r.sec > 0) body += `<line x1="${x2}" y1="${y}" x2="${x2}" y2="${y + RH}" class="sw-link"/>`;
      });
      // C.T ของผู้ปฏิบัติงานคนนี้
      body += `<line x1="${X(gr.ct)}" y1="${y0 + 2}" x2="${X(gr.ct)}" y2="${y0 + hgt - 2}" class="sw-ct"/><text x="${X(gr.ct) + 4}" y="${y0 + 12}" class="sw-ct-t${over ? ' sw-ct-over' : ''}">C.T = ${fmt(gr.ct)}"</text>`;
      body += `<line x1="0" y1="${y0 + hgt}" x2="${W}" y2="${y0 + hgt}" class="sw-sep"/>`;
      y0 += hgt;
    });
    const yT = y0 + RH / 2 + 5;
    body += `<rect x="0" y="${y0}" width="${L}" height="${RH}" class="sw-headbg"/><text x="${cOp + cNo + cName / 2}" y="${yT}" class="sw-h sw-big">${esc(LB.total)}</text><text x="${hx[3]}" y="${yT}" class="sw-c sw-b">${fmt(tot.man)}</text><text x="${hx[4]}" y="${yT}" class="sw-c sw-b">${tot.auto ? fmt(tot.auto) : ''}</text><text x="${hx[5]}" y="${yT}" class="sw-c sw-b">${tot.walk ? fmt(tot.walk) : ''}</text>`;
    const tk = takt ? `<line x1="${X(takt)}" y1="${top - 2}" x2="${X(takt)}" y2="${y0}" class="sw-takt"/><text x="${X(takt)}" y="${top - 30}" class="sw-takt-t">T.T = ${fmt(takt)}"</text>` : '';
    const cols = [cOp, cOp + cNo, cOp + cNo + cName, cOp + cNo + cName + cNum, cOp + cNo + cName + cNum * 2, L].map(x => `<line x1="${x}" y1="0" x2="${x}" y2="${H - 6}" class="sw-col"/>`).join('');
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="swct-svg" xmlns="http://www.w3.org/2000/svg"><style>
      .sw-headbg{fill:#f1f5f9}.sw-g1{stroke:#eef2f6}.sw-g2{stroke:#d9e1e8}.sw-row{stroke:#edf1f4}.sw-sep{stroke:#9fb1c0}.sw-col{stroke:#c9d4de}
      .sw-ax{font:10px sans-serif;fill:#52708a;text-anchor:middle}.sw-h{font:bold 11px sans-serif;fill:#17324b;text-anchor:middle}.sw-big{font-size:13px}.sw-2l{font-size:10px}
      .sw-c{font:11px sans-serif;fill:#17324b;text-anchor:middle}.sw-b{font-weight:bold}.sw-name{font:11px sans-serif;fill:#17324b}.sw-op{font:bold 11px sans-serif;fill:#17324b;text-anchor:middle}
      .sw-man{stroke:#111;stroke-width:3}.sw-walk{stroke:#111;stroke-width:1.6;fill:none}.sw-auto{stroke:#111;stroke-width:2;stroke-dasharray:2 3}
      .sw-wait{stroke:#d6338a;stroke-width:3;stroke-dasharray:1 5;stroke-linecap:round}.sw-link{stroke:#555;stroke-width:1}
      .sw-ct{stroke:#1f4fd6;stroke-width:2.5}.sw-ct-t{font:bold 11px sans-serif;fill:#111}.sw-ct-over{fill:#d62020}.sw-takt{stroke:#d62020;stroke-width:3}.sw-takt-t{font:bold 12px sans-serif;fill:#d62020;text-anchor:middle}
    </style>${head}${g}${cols}${body}${tk}</svg>`;
    return { svg, cycle, takt, machEnd, ops: groups.length, man: tot.man, walk: tot.walk, wait: tot.wait, auto: tot.auto, groups, W, H };
  }
  function swctTakt() { return U().num(editing.takt) || stationTakt(); }
  function renderSwct() {
    const box = host && host.querySelector('#ts-swct'); if (!box) return;
    const list = editing.elements || [];
    if (!list.length) { box.innerHTML = '<div class="empty-row"><p>เพิ่ม element ก่อน แผนภูมิจะสร้างให้อัตโนมัติ</p></div>'; return; }
    const { fmt } = U(); const r = swctSvg(list, swctTakt());
    const over = r.takt && r.cycle > r.takt;
    box.innerHTML = `<div class="swct-sum"><span>ผู้ปฏิบัติงาน <b>${r.ops}</b> คน</span><span>งานมือ <b>${fmt(r.man)}</b> วิ</span><span>เดิน <b>${fmt(r.walk)}</b> วิ</span><span>รอ <b>${fmt(r.wait)}</b> วิ</span><span>C.T สูงสุด <b>${fmt(r.cycle)}</b> วิ</span><span>TAKT <b>${r.takt ? fmt(r.takt) : '—'}</b>${r.takt ? ' วิ' : ''}</span>${over ? `<span class="swct-over">เกิน TAKT ${fmt(r.cycle - r.takt)} วิ</span>` : ''}${r.machEnd > r.cycle ? `<span class="swct-over">เครื่องจักรทำงานเลยรอบ ${fmt(r.machEnd - r.cycle)} วิ</span>` : ''}</div><div class="swct-scroll">${r.svg}</div>`;
  }
  function printSwct() {
    const { esc } = U(); const r = swctSvg(editing.elements || [], swctTakt());
    const w = window.open('', '_blank'); if (!w) { U().toast('เบราว์เซอร์บล็อก popup'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>SWCT · ${esc(editing.station || editing.name || '')}</title><style>body{font-family:system-ui,sans-serif;padding:14px;color:#17324b}.hd{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px}.hd td{border:1px solid #9fb1c0;padding:4px 8px;vertical-align:top}.hd .tt{text-align:center;font-size:20px;font-weight:bold;width:34%}.hd .tt small{font-size:11px;font-weight:normal}.lg{font-size:12px;margin:4px 0 6px;text-align:right}svg{width:100%;height:auto}@media print{@page{size:A4 landscape;margin:10mm}}</style><body onload="print()"><table class="hd"><tr><td><b>สถานี / ชิ้นงาน</b><br>${esc(editing.station || '—')}</td><td><b>ชื่องาน</b><br>${esc(editing.name || '—')}</td><td class="tt" rowspan="2">ตารางงานมาตรฐานผสม<br><small>Standardized Work Combination Table</small></td><td><b>วันที่</b><br>${esc(editing.date || '')}</td><td><b>Cycle Time</b><br>${U().fmt(r.cycle)} วิ</td></tr><tr><td><b>ผู้วิเคราะห์</b><br>${esc(editing.analyst || '—')}</td><td><b>ผู้ปฏิบัติงาน</b><br>${esc(editing.operator || '—')} (${r.ops} คน)</td><td><b>พื้นที่</b><br>${esc([D().scope.workshop, D().scope.group, D().scope.team].filter(Boolean).join(' / '))}</td><td><b>Takt Time</b><br>${r.takt ? U().fmt(r.takt) + ' วิ' : '—'}</td></tr></table><div class="lg">━ ทำงาน &nbsp; ┅ ส่ง (เครื่องจักร) &nbsp; ∿ เดิน &nbsp; <span style="color:#d6338a">•••</span> รอ &nbsp; <span style="color:#1f4fd6">┃</span> C.T &nbsp; <span style="color:#d62020">┃</span> T.T</div>${r.svg}</body>`);
    w.document.close();
  }

  // ---- แผนภูมิสองมือ (Two-Handed Process Chart) ----
  const SYMS = [['O', '○', 'ทำงาน', 'Operations'], ['T', '⇨', 'เคลื่อนย้าย', 'Transports'], ['D', 'D', 'รอ', 'Delays'], ['H', '▽', 'ถือค้าง', 'Holds'], ['I', '□', 'ตรวจสอบ', 'Inspections']];
  const SYMK = SYMS.map(x => x[0]);
  function handOf(h) { if (!h || typeof h !== 'object') return undefined; const sy = String(h.s || '').toUpperCase(); return { d: String(h.d || ''), s: SYMK.includes(sy) ? sy : '' }; }
  function handCounts(list) {
    const c = { L: {}, R: {} }; SYMK.forEach(k => { c.L[k] = 0; c.R[k] = 0; });
    (list || []).forEach(e => { const l = e.lh && e.lh.s, r = e.rh && e.rh.s; if (SYMK.includes(l)) c.L[l]++; if (SYMK.includes(r)) c.R[r]++; });
    return c;
  }
  function renderHands() {
    const box = host && host.querySelector('#th-table'); if (!box) return;
    const { esc } = U(); const list = editing.elements || [];
    // ตัวเลือก Proposed = รอบอื่นของสถานีเดียวกัน
    const sel = host.querySelector('#th-cmp'); const G = D().group;
    const others = G.roundsOf(G.key(editing)).filter(x => x.id !== editing.id);
    sel.innerHTML = '<option value="">— ไม่เทียบ —</option>' + others.map((x, i) => `<option value="${esc(x.id)}">${esc(x.date || '')} · ${esc(x.operator || 'รอบ ' + (i + 1))}</option>`).join('');
    sel.value = others.some(x => x.id === editing.thCmp) ? editing.thCmp : '';
    if (!list.length) { box.innerHTML = '<div class="empty-row"><p>เพิ่ม element ก่อน</p></div>'; renderHandsChart(); return; }
    const opt = v => '<option value="">–</option>' + SYMS.map(x => `<option value="${x[0]}"${v === x[0] ? ' selected' : ''}>${x[1]} ${x[2]}</option>`).join('');
    box.innerHTML = `<table class="el-table th-table"><thead><tr><th>#</th><th>มือซ้ายทำอะไร</th><th>ซ้าย</th><th>ขวา</th><th>มือขวาทำอะไร</th></tr></thead><tbody>${list.map((e, i) => {
      const l = e.lh || {}, r = e.rh || {};
      return `<tr data-i="${i}"><td class="idx">${i + 1}</td><td><input class="th-ld" value="${esc(l.d || '')}" placeholder="${esc(e.name || '')}"></td><td><select class="th-ls">${opt(l.s)}</select></td><td><select class="th-rs">${opt(r.s)}</select></td><td><input class="th-rd" value="${esc(r.d || '')}"></td></tr>`;
    }).join('')}</tbody></table>`;
    box.querySelectorAll('tr[data-i]').forEach(tr => {
      const e = list[+tr.dataset.i];
      const hl = () => (e.lh = e.lh || { d: '', s: '' }), hr = () => (e.rh = e.rh || { d: '', s: '' });
      tr.querySelector('.th-ld').oninput = ev => { hl().d = ev.target.value; renderHandsChart(); };
      tr.querySelector('.th-rd').oninput = ev => { hr().d = ev.target.value; renderHandsChart(); };
      tr.querySelector('.th-ls').onchange = ev => { hl().s = ev.target.value; renderHandsChart(); };
      tr.querySelector('.th-rs').onchange = ev => { hr().s = ev.target.value; renderHandsChart(); };
    });
    renderHandsChart();
  }
  function handsSvg(list) {
    const { esc } = U();
    const cD = 300, cS = 26, W = cD * 2 + cS * 10, RH = 22, top = 30, H = top + list.length * RH + 6;
    const xL = k => cD + cS * SYMK.indexOf(k) + cS / 2, xR = k => cD + cS * 5 + cS * SYMK.indexOf(k) + cS / 2;
    let g = `<rect x="0" y="0" width="${W}" height="${top}" class="th-hb"/><text x="${cD / 2}" y="${top - 10}" class="th-h">LEFT-HAND (มือซ้าย)</text><text x="${cD + cS * 10 + cD / 2}" y="${top - 10}" class="th-h">RIGHT-HAND (มือขวา)</text>`;
    const icon = (k, cx, cy) => k === 'O' ? `<circle cx="${cx}" cy="${cy}" r="6" class="th-ic"/>` : k === 'T' ? `<path d="M${cx - 7},${cy - 3} h7 v-4 l7,7 l-7,7 v-4 h-7 z" class="th-ic"/>` : k === 'D' ? `<text x="${cx}" y="${cy + 5}" class="th-sy">D</text>` : k === 'H' ? `<path d="M${cx - 7},${cy - 5} h14 l-7,12 z" class="th-ic"/>` : `<rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" class="th-ic"/>`;
    SYMS.forEach((x, k) => { g += icon(x[0], cD + cS * k + cS / 2, top - 14) + icon(x[0], cD + cS * 5 + cS * k + cS / 2, top - 14); });
    for (let k = 0; k <= 10; k++) g += `<line x1="${cD + cS * k}" y1="0" x2="${cD + cS * k}" y2="${H - 6}" class="${k === 5 ? 'th-mid' : 'th-col'}"/>`;
    const pl = [], pr = [];
    list.forEach((e, i) => {
      const y = top + i * RH + RH / 2, l = e.lh || {}, r = e.rh || {};
      const ld = (l.d || e.name || ''), rd = (r.d || '');
      g += `<line x1="0" y1="${y + RH / 2}" x2="${W}" y2="${y + RH / 2}" class="th-row"/><text x="6" y="${y + 4}" class="th-t">${esc(ld.length > 34 ? ld.slice(0, 34) + '…' : ld)}</text><text x="${cD + cS * 10 + 6}" y="${y + 4}" class="th-t">${esc(rd.length > 34 ? rd.slice(0, 34) + '…' : rd)}</text>`;
      if (SYMK.includes(l.s)) pl.push([xL(l.s), y]);
      if (SYMK.includes(r.s)) pr.push([xR(r.s), y]);
    });
    const poly = pts => pts.length > 1 ? `<polyline points="${pts.map(p => p.join(',')).join(' ')}" class="th-line"/>` : '';
    const dots = pts => pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" class="th-dot"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="swct-svg" xmlns="http://www.w3.org/2000/svg"><style>.th-hb{fill:#f1f5f9}.th-h{font:bold 12px sans-serif;fill:#17324b;text-anchor:middle}.th-sy{font:bold 14px sans-serif;fill:#17324b;text-anchor:middle}.th-ic{fill:none;stroke:#17324b;stroke-width:1.6}.th-col{stroke:#d5dde5}.th-mid{stroke:#17324b;stroke-width:1.5}.th-row{stroke:#eef2f6}.th-t{font:11px sans-serif;fill:#17324b}.th-line{fill:none;stroke:#111;stroke-width:1.4}.th-dot{fill:#111}</style>${g}${poly(pl)}${poly(pr)}${dots(pl)}${dots(pr)}</svg>`;
  }
  function handsSummary(list, cmpId = editing && editing.thCmp) {
    const cmp = cmpId ? D().listStudies().find(x => x.id === cmpId) : null;
    const a = handCounts(list), b = cmp ? handCounts(cmp.elements) : null;
    const tot = c => SYMK.reduce((s, k) => s + c[k], 0);
    const cell = v => `<td>${v == null ? '–' : v}</td>`;
    return `<table class="el-table th-summary"><thead><tr><th rowspan="2">สรุป (Method)</th><th colspan="2">Present (รอบนี้)</th><th colspan="2">Proposed${cmp ? ' (' + U().esc(cmp.date || '') + ')' : ''}</th></tr><tr><th>L.H</th><th>R.H</th><th>L.H</th><th>R.H</th></tr></thead><tbody>${SYMS.map(x => `<tr><td>${x[1]} ${x[3]} (${x[2]})</td>${cell(a.L[x[0]])}${cell(a.R[x[0]])}${cell(b ? b.L[x[0]] : null)}${cell(b ? b.R[x[0]] : null)}</tr>`).join('')}<tr class="th-total"><td>Total</td>${cell(tot(a.L))}${cell(tot(a.R))}${cell(b ? tot(b.L) : null)}${cell(b ? tot(b.R) : null)}</tr></tbody></table>`;
  }
  function renderHandsChart() {
    const c = host && host.querySelector('#th-chart'); if (!c) return;
    const list = editing.elements || [];
    c.innerHTML = list.length ? `<div class="swct-scroll">${handsSvg(list)}</div>` : '';
    host.querySelector('#th-sum').innerHTML = list.length ? handsSummary(list) : '';
  }
  function printHands() {
    const { esc } = U(); const list = editing.elements || [];
    const w = window.open('', '_blank'); if (!w) { U().toast('เบราว์เซอร์บล็อก popup'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Two-Handed Process Chart · ${esc(editing.station || editing.name || '')}</title><style>body{font-family:system-ui,sans-serif;padding:14px;color:#17324b}h1{font-size:18px;margin:0 0 6px}.hd{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}.hd td{border:1px solid #9fb1c0;padding:4px 8px}svg{width:100%;height:auto}table.s{border-collapse:collapse;font-size:12px;margin-top:10px}table.s th,table.s td{border:1px solid #9fb1c0;padding:3px 10px;text-align:center}table.s td:first-child{text-align:left}@media print{@page{size:A4 portrait;margin:10mm}}</style><body onload="print()"><h1>TWO-HANDED PROCESS CHART · แผนภูมิกระบวนการสองมือ</h1><table class="hd"><tr><td><b>สถานี</b> ${esc(editing.station || '—')}</td><td><b>งาน</b> ${esc(editing.name || '—')}</td><td><b>ผู้ปฏิบัติงาน</b> ${esc(editing.operator || '—')}</td><td><b>ผู้วิเคราะห์</b> ${esc(editing.analyst || '—')}</td><td><b>วันที่</b> ${esc(editing.date || '')}</td></tr></table>${handsSvg(list)}${handsSummary(list).replace('class="el-table th-summary"', 'class="s"')}</body>`);
    w.document.close();
  }

  function renderEase() {
    const { esc } = U(); const box = host.querySelector('#ts-ease'); if (!box) return;
    const s = easeSummary(editing.elements);
    if (!s.avg) { box.innerHTML = '<div class="empty-row"><p>ยังไม่ได้ให้คะแนน — เลือกคะแนน 1–5 ในตาราง Element</p></div>'; return; }
    box.innerHTML = `<div class="ease-wrap">
      <div class="ease-total"><small>คะแนนเฉลี่ยรวม</small><strong style="color:${easeColor(s.avg)}">${s.avg.toFixed(2)}</strong><span>/ 5</span></div>
      <div class="ease-dims">${DIMS.map(d => { const v = s.dims[d.k]; return `<div class="ease-dim"><span>${d.label}</span><div class="cmp-track"><div class="cmp-bar" style="width:${v / 5 * 100}%;background:${v ? easeColor(v) : 'transparent'}"></div></div><b>${v ? v.toFixed(2) : '–'}</b></div>`; }).join('')}</div>
    </div>
    ${s.weak.length ? `<div class="ease-weak"><b>จุดต้องปรับปรุง (คะแนน ≤ 3)</b><ul>${s.weak.map(w => `<li>ขั้น ${w.i} ${esc(w.name || '')} — ${w.dim} = ${w.n}</li>`).join('')}</ul></div>` : '<p class="hint">ไม่มีขั้นตอนที่คะแนน ≤ 3</p>'}`;
  }
  function mini(l, v, c) { return `<div><small>${U().esc(l)}</small><strong${c ? ` style="color:${c}"` : ''}>${v}</strong></div>`; }
  function stack(t) {
    if (!t.ct) return '<i style="flex:1;background:#e2e8f0"></i>';
    return U().TYPES.map(ty => t[ty.k] ? `<i title="${ty.k}" style="flex:${t[ty.k]};background:${ty.color}"></i>` : '').join('');
  }
  function row(list, e, i) {
    const { TYPES, uid } = U();
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="idx">${i + 1}</td>
      <td><input class="r-op" type="number" min="1" max="9" step="1" inputmode="numeric" title="ผู้ปฏิบัติงานคนที่ (สำหรับ SWCT หลายคน)"></td>
      <td><input class="r-name" placeholder="ชื่อขั้นตอน"></td>
      <td><input class="r-sec" type="number" min="0" step="0.1" inputmode="decimal"></td>
      <td><input class="r-steps" type="number" min="0" step="1" inputmode="numeric" title="จำนวนก้าวเดิน (AI ประมาณให้ แก้ได้)"></td>
      <td><select class="r-type"><option value="">— ประเภท —</option>${TYPES.map(ty => `<option value="${ty.k}">${ty.k}</option>`).join('')}</select></td>
      <td><select class="r-kind">${KINDS.map(k => `<option value="${k[0]}">${k[1]}</option>`).join('')}</select></td>
      <td><input class="r-mach" type="number" min="0" step="0.1" inputmode="decimal" title="เวลาที่เครื่องจักร/หุ่นยนต์ทำงานเองต่อจากขั้นนี้"></td>
      ${DIMS.map(d => `<td><select class="r-dim" data-k="${d.k}"><option value="">–</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${n}${d.r[n] ? ' · ' + d.r[n] : ''}</option>`).join('')}</select></td>`).join('')}
      <td class="r-sum"></td>
      <td><button class="r-del" title="ลบ" type="button">✕</button></td>`;
    const paintRow = () => {
      tr.querySelectorAll('.r-dim').forEach(s => { const n = sc(s.value); s.classList.toggle('low', n > 0 && n <= 3); });
      const v = rowScore(e); const cell = tr.querySelector('.r-sum'); cell.textContent = v ? v.toFixed(1) : ''; cell.style.color = v ? easeColor(v) : '';
    };
    tr.querySelectorAll('.r-dim').forEach(s => { s.value = e[s.dataset.k] || ''; s.onchange = () => { e[s.dataset.k] = s.value; paintRow(); renderEase(); }; });
    paintRow();
    const name = tr.querySelector('.r-name'); name.value = e.name || ''; name.oninput = () => { e.name = name.value; renderSwct(); renderHands(); };
    const sec = tr.querySelector('.r-sec'); sec.value = e.sec;
    const checkSec = () => { const bad = sec.validity.badInput || (sec.value !== '' && !(parseFloat(sec.value) >= 0)); sec.classList.toggle('bad', bad); sec.setAttribute('aria-invalid', bad); return !bad; };
    sec.oninput = () => { e.sec = checkSec() ? sec.value : ''; refreshMetrics(); };
    const type = tr.querySelector('.r-type'); type.value = e.type || ''; type.classList.toggle('need', !type.value);
    type.onchange = () => { e.type = type.value; type.classList.toggle('need', !type.value); refreshMetrics(); };
    const stp = tr.querySelector('.r-steps'); stp.value = e.steps ?? ''; stp.oninput = () => { e.steps = stp.value; refreshMetrics(); };
    const op = tr.querySelector('.r-op'); op.value = e.op || 1; op.oninput = () => { e.op = Math.max(1, Math.min(9, parseInt(op.value, 10) || 1)); renderSwct(); };
    const kd = tr.querySelector('.r-kind'), mc = tr.querySelector('.r-mach');
    kd.value = kindOf(e); mc.value = e.mach ?? ''; mc.disabled = kd.value !== 'auto';
    kd.onchange = () => { e.kind = kd.value; mc.disabled = kd.value !== 'auto'; renderSwct(); };
    mc.oninput = () => { e.mach = mc.value; renderSwct(); };
    tr.querySelector('.r-del').onclick = () => { const idx = list.indexOf(e); if (idx > -1) list.splice(idx, 1); renderTable(); };
    return tr;
  }
  const totalSteps = list => (list || []).reduce((a, e) => a + Math.max(0, Math.round(U().num(e.steps))), 0);
  function refreshMetrics() {
    const { fmt } = U(); const t = U().totals(editing.elements);
    host.querySelector('#ts-metrics').innerHTML =
      mini('รอบเวลา (CT)', fmt(t.ct) + ' วิ') + mini('VA', fmt(t.VA) + ' วิ · ' + fmt(t.vaPct) + '%', '#15856b') +
      mini('NNVA', fmt(t.NNVA) + ' วิ', '#ad7206') + mini('NVA', fmt(t.NVA) + ' วิ', '#a64475') + mini('ก้าวเดิน', totalSteps(editing.elements) + ' ก้าว') +
      (untyped() ? mini('ยังไม่ระบุประเภท', untyped() + ' แถว', '#c0392b') : '');
    host.querySelector('#ts-bar').innerHTML = stack(t);
    renderSwct();
    saveDraft();
  }

  const untyped = () => (editing ? editing.elements : []).filter(e => U().num(e.sec) > 0 && !e.type && /^\s*\d+(\.\d+)?\s*$/.test(String(e.sec))).length;
  async function saveStudy() {
    const badSec = host.querySelector('.r-sec.bad');
    if (badSec) { badSec.focus(); U().toast('เวลาบางแถวไม่ถูกต้อง (ต้องเป็นตัวเลข 0 ขึ้นไป) — แก้ช่องที่ขึ้นสีแดงก่อนบันทึก', 6000); return; }
    const st = host.querySelector('[data-f="station"]');
    if (!String(editing.station || editing.name || '').trim()) { st.classList.add('bad'); st.setAttribute('aria-invalid', 'true'); st.focus(); U().toast('กรอกรหัสสถานีหรือชื่องานก่อนบันทึก', 6000); return; }
    if (untyped() && !(await U().ask(`มี ${untyped()} แถวที่ยังไม่ระบุประเภท (VA/NNVA/NVA) — แถวเหล่านี้จะนับใน CT แต่ไม่นับใน VA% · บันทึกต่อ?`, []))) { host.querySelector('.r-type.need')?.focus(); return; }
    const t = U().totals(editing.elements);
    editing.ct = U().round1(t.ct); editing.va = U().round1(t.VA); editing.nnva = U().round1(t.NNVA); editing.nva = U().round1(t.NVA); editing.vaPct = U().round1(t.vaPct); editing.steps = totalSteps(editing.elements);
    const es = easeSummary(editing.elements);
    editing.ease = { avg: U().round1(es.avg * 10) / 10, t: es.dims.t, u: es.dims.u, v: es.dims.v, w: es.dims.w };
    editing.station = String(editing.station || editing.name || '').trim();
    if (!editing.station) { U().toast('กรอกรหัสสถานีหรือชื่องานก่อนบันทึก'); return; }
    if (!editing.name) editing.name = editing.station;
    const G = D().group; const prev = D().listStudies().find(x => x.id === editing.id); const oldKey = prev ? G.key(prev) : '';
    // store ONLY values (strip any transient fields); video never stored
    D().upsert('studies', editing);
    const key = G.key(editing);
    if (oldKey && oldKey !== key) G.flow(oldKey);
    const f = G.flow(key); const n = G.roundsOf(key).length;
    U().toast(f ? `บันทึกแล้ว · ${editing.station} รวม ${n} รอบ → อัปเดตสมดุลสถานี${f.job === 'created' ? ' และสร้างงานวิเคราะห์' : f.job === 'updated' ? ' และ Before ของงานวิเคราะห์' : ''}ให้แล้ว` : 'บันทึกค่า Time Study แล้ว (ไม่เก็บวิดีโอ)');
    dropDraft(); cleanupVideo(); editing = null; renderList();
  }

  // ให้หน้าอื่น (สมดุลสถานี) เรียกวาด SWCT / แผนภูมิสองมือ ของรอบที่บันทึกแล้วได้
  const charts = {
    swct: (study, takt) => swctSvg((study && study.elements) || [], takt, (study && study.station) || ''),
    swctLine: (lanes, takt, opt) => swctSvg([], takt, '', lanes, opt),
    hands: study => handsSvg((study && study.elements) || []),
    handsSum: study => handsSummary((study && study.elements) || [], '')
  };
  window.CPSTimeStudy = { render, charts, isDirty, leave };
})();
