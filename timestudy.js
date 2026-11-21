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
  const easeColor = n => n <= 3 ? '#c0392b' : n < 4 ? '#e08a00' : '#15856b';

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
    host.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">TIME STUDY</p><h1>ศึกษางาน & จับเวลา</h1></div>
        ${can ? '<button class="primary" id="ts-new">＋ บันทึกใหม่</button>' : ''}
      </div>
      ${!can ? '<div class="ro-banner">👁️ โหมดวิเคราะห์ (อ่านอย่างเดียว) — รวมข้อมูลหลายทีม</div>' : ''}
      ${!studies.length ? '<div class="blank">ยังไม่มี Time Study ในพื้นที่นี้</div>' : '<p class="hint" style="margin:0 0 12px">รอบจับเวลาที่ใช้รหัสสถานีเดียวกันจะถูกรวมเป็นกลุ่มเดียว และคำนวณค่าเฉลี่ยให้อัตโนมัติ</p>' + blocks.join('')}`;
    const nb = host.querySelector('#ts-new'); if (nb) nb.onclick = () => { editing = blank(); renderEditor(); };
    host.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { editing = structuredClone(D().listStudies().find(s => s.id === b.dataset.edit)); renderEditor(); });
    host.querySelectorAll('[data-round]').forEach(b => b.onclick = () => { editing = newRound(D().listStudies().find(s => s.id === b.dataset.round)); renderEditor(); });
    host.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (!confirm('ลบรอบจับเวลานี้?')) return;
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
    host.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">TIME STUDY</p><h1>บันทึก Time Study</h1></div>
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

      <section class="panel">
        <div class="panelhead"><h2>วิดีโอ (ในเครื่อง — ไม่ถูกบันทึก)</h2>
          <label class="filebtn">เลือก/ถ่ายวิดีโอ<input id="ts-file" type="file" accept="video/*" capture="environment" hidden></label>
        </div>
        <div class="ts-screen"><video id="ts-video" playsinline></video><div id="ts-empty" class="ts-empty">เลือกวิดีโอเพื่อเริ่มจับเวลา</div></div>
        <div class="ts-transport">
          <button id="ts-back5" type="button">⏪ 5วิ</button>
          <button id="ts-play" type="button">▶︎ เล่น</button>
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
          <button id="ts-mark" class="primary" type="button">① มาร์คจุดเริ่ม element</button>
          <button id="ts-lap" class="dark" type="button" disabled>✂ ตัดจบขั้นตอน (Lap)</button>
          <span id="ts-open" class="muted"></span>
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
      <section class="panel"><div class="panelhead"><h2>สรุปคะแนนความง่ายในการทำงาน</h2></div><div id="ts-ease"></div></section>`;

    // field bindings
    host.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => { s[inp.dataset.f] = inp.value; });
    host.querySelector('#ts-back').onclick = () => { cleanupVideo(); editing = null; renderList(); };
    host.querySelector('#ts-save').onclick = saveStudy;
    host.querySelector('#ts-file').onchange = onFile;
    const v = host.querySelector('#ts-video');
    host.querySelector('#ts-play').onclick = () => { v.paused ? v.play() : v.pause(); };
    host.querySelector('#ts-back5').onclick = () => { v.currentTime = Math.max(0, v.currentTime - 5); };
    host.querySelector('#ts-fwd5').onclick = () => { v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); };
    host.querySelector('#ts-rate').onchange = e => v.playbackRate = parseFloat(e.target.value);
    v.addEventListener('timeupdate', updateClock);
    v.addEventListener('loadedmetadata', updateClock);
    v.addEventListener('play', () => host.querySelector('#ts-play').textContent = '⏸ หยุด');
    v.addEventListener('pause', () => host.querySelector('#ts-play').textContent = '▶︎ เล่น');
    host.querySelector('#ts-frames-btn').onclick = extractFrames;
    host.querySelector('#ts-sound').onclick = () => findSounds(true);
    host.querySelector('#ts-sound-els').onclick = elementsFromSound;
    if (soundEvents.length) paintSounds();
    host.querySelector('#ts-mark').onclick = markStart;
    host.querySelector('#ts-lap').onclick = lap;
    host.querySelector('#ts-addrow').onclick = () => { s.elements.push({ id: U().uid(), name: '', sec: '', type: 'VA', note: '' }); renderTable(); };
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
  }
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
    if (!window.CPS.sheet.configured()) { U().toast('ยังไม่ได้ตั้งค่า Google Sheet/AI — ดูคู่มือ (README) ส่วนที่ 3'); return; }
    const yes = async m => !!(await U().ask(m, []));
    const useSpeech = !!(host.querySelector('#ts-speech') || {}).checked;
    if (!await yes(useSpeech ? 'ส่งภาพนิ่งจากวิดีโอนี้ (สูงสุด 40 ภาพ) และเสียงพูดในคลิป ไปให้ Google Gemini วิเคราะห์ ผ่าน Apps Script ของคุณ?' : 'ส่งภาพนิ่งจากวิดีโอนี้ (สูงสุด 40 ภาพ) ไปให้ Google Gemini วิเคราะห์ ผ่าน Apps Script ของคุณ?')) return;
    if (editing.elements.length && !await yes('แทนที่ element ที่มีอยู่ด้วยผลจาก AI?')) return;
    aiBusy = true; const btn = host.querySelector('#ts-ai'); const label = btn.textContent; btn.disabled = true;
    try {
      btn.textContent = 'กำลังเตรียมภาพ…'; v.pause(); const back = v.currentTime;
      const frames = await grabFrames(v, 40, 384); v.currentTime = back;
      btn.textContent = 'กำลังวิเคราะห์เสียง…';
      const sound = videoFile ? (soundEvents.length ? soundEvents : await findSounds(true)) : [];
      let speech = [];
      if (useSpeech && videoFile) {
        try {
          btn.textContent = 'AI กำลังถอดเสียงพูด…';
          const audio = await speechWav(await decodeAudio(), 600);
          const tr = await window.CPS.sheet.call({ action: 'transcribe' }, { audio, mime: 'audio/wav', duration: Math.round(v.duration * 10) / 10 });
          if (tr.ok) speech = (tr.speech || []).filter(x => x && x.text); else U().toast('ถอดเสียงพูดไม่สำเร็จ ใช้ภาพและเสียงเครื่องมืออย่างเดียว: ' + (tr.error || ''));
        } catch (e) { U().toast('ถอดเสียงพูดไม่สำเร็จ ใช้ภาพและเสียงเครื่องมืออย่างเดียว: ' + e.message); }
      }
      btn.textContent = 'AI กำลังวิเคราะห์ภาพ…';
      const res = await window.CPS.sheet.call({ action: 'ai' }, { frames, duration: Math.round(v.duration * 10) / 10, name: editing.name || '', sound: sound.map(e => [e.start, e.end]), speech: speech.map(x => ({ start: +x.start || 0, end: +x.end || 0, text: String(x.text).slice(0, 200) })) });
      if (!res.ok) throw new Error(res.error || 'AI ตอบกลับผิดปกติ');
      const ok = ['VA', 'NNVA', 'NVA']; const s15 = n => { n = parseInt(n, 10); return n >= 1 && n <= 5 ? String(n) : ''; };
      const els = (res.elements || []).map(e => ({
        id: U().uid(), name: String(e.name || ''), sec: Math.max(0, Math.round((U().num(e.end) - U().num(e.start)) * 10) / 10),
        type: ok.includes(e.type) ? e.type : 'NNVA', t: s15(e.t), u: s15(e.u), v: s15(e.v), w: s15(e.w), steps: Math.max(0, Math.round(U().num(e.steps))), note: '', ai: true
      })).filter(e => e.sec > 0);
      if (!els.length) throw new Error('AI ไม่พบ element');
      editing.elements = els; editing.aiDraft = true;
      if (res.ergo) { editing.ergo.risk = ['low', 'medium', 'high'].includes(res.ergo.risk) ? res.ergo.risk : editing.ergo.risk; if (res.ergo.notes) editing.ergo.notes = String(res.ergo.notes); }
      renderEditor();
      U().toast('AI ร่างให้ ' + els.length + ' element' + (sound.length ? ` (ใช้เสียงเครื่องมือ ${sound.length} ช่วง` + (speech.length ? ` + คำพูด ${speech.length} ช่วง)` : ')') : '') + ' — กรุณาตรวจและแก้ก่อนบันทึก');
    } catch (e) { U().toast('AI วิเคราะห์ไม่สำเร็จ: ' + e.message); btn.textContent = label; btn.disabled = false; }
    aiBusy = false;
  }

  function updateClock() {
    const v = host.querySelector('#ts-video'); if (!v) return;
    host.querySelector('#ts-time').textContent = `${v.currentTime.toFixed(1)} / ${(v.duration || 0).toFixed(1)} วิ`;
    if (boundary != null) host.querySelector('#ts-open').textContent = 'กำลังจับ: ' + Math.max(0, v.currentTime - boundary).toFixed(1) + ' วิ';
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
    if (empty) empty.sec = sec; else editing.elements.push({ id: U().uid(), name: '', sec, type: 'VA', note: '' });
    boundary = v.currentTime; // chain next element
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
      wrap.innerHTML = `<table class="el-table ease-table"><thead><tr><th>#</th><th>ขั้นตอน</th><th>วินาที</th><th>ก้าว</th><th>ประเภท</th>${DIMS.map(d => `<th>${d.label}</th>`).join('')}<th>รวม</th><th></th></tr></thead><tbody></tbody></table>`;
      const tb = wrap.querySelector('tbody');
      list.forEach((e, i) => tb.appendChild(row(list, e, i)));
    }
    const t = U().totals(list);
    host.querySelector('#ts-metrics').innerHTML =
      mini('รอบเวลา (CT)', fmt(t.ct) + ' วิ') + mini('VA', fmt(t.VA) + ' วิ · ' + fmt(t.vaPct) + '%', '#15856b') +
      mini('NNVA', fmt(t.NNVA) + ' วิ', '#ad7206') + mini('NVA', fmt(t.NVA) + ' วิ', '#a64475') + mini('ก้าวเดิน', totalSteps(editing.elements) + ' ก้าว');
    host.querySelector('#ts-bar').innerHTML = stack(t);
    renderEase();
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
      <td><input class="r-name" placeholder="ชื่อขั้นตอน"></td>
      <td><input class="r-sec" type="number" min="0" step="0.1" inputmode="decimal"></td>
      <td><input class="r-steps" type="number" min="0" step="1" inputmode="numeric" title="จำนวนก้าวเดิน (AI ประมาณให้ แก้ได้)"></td>
      <td><select class="r-type">${TYPES.map(ty => `<option value="${ty.k}">${ty.k}</option>`).join('')}</select></td>
      ${DIMS.map(d => `<td><select class="r-dim" data-k="${d.k}"><option value="">–</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${n}${d.r[n] ? ' · ' + d.r[n] : ''}</option>`).join('')}</select></td>`).join('')}
      <td class="r-sum"></td>
      <td><button class="r-del" title="ลบ" type="button">✕</button></td>`;
    const paintRow = () => {
      tr.querySelectorAll('.r-dim').forEach(s => { const n = sc(s.value); s.classList.toggle('low', n > 0 && n <= 3); });
      const v = rowScore(e); const cell = tr.querySelector('.r-sum'); cell.textContent = v ? v.toFixed(1) : ''; cell.style.color = v ? easeColor(v) : '';
    };
    tr.querySelectorAll('.r-dim').forEach(s => { s.value = e[s.dataset.k] || ''; s.onchange = () => { e[s.dataset.k] = s.value; paintRow(); renderEase(); }; });
    paintRow();
    const name = tr.querySelector('.r-name'); name.value = e.name || ''; name.oninput = () => e.name = name.value;
    const sec = tr.querySelector('.r-sec'); sec.value = e.sec; sec.oninput = () => { e.sec = sec.value; refreshMetrics(); };
    const type = tr.querySelector('.r-type'); type.value = e.type; type.onchange = () => { e.type = type.value; refreshMetrics(); };
    const stp = tr.querySelector('.r-steps'); stp.value = e.steps ?? ''; stp.oninput = () => { e.steps = stp.value; refreshMetrics(); };
    tr.querySelector('.r-del').onclick = () => { const idx = list.indexOf(e); if (idx > -1) list.splice(idx, 1); renderTable(); };
    return tr;
  }
  const totalSteps = list => (list || []).reduce((a, e) => a + Math.max(0, Math.round(U().num(e.steps))), 0);
  function refreshMetrics() {
    const { fmt } = U(); const t = U().totals(editing.elements);
    host.querySelector('#ts-metrics').innerHTML =
      mini('รอบเวลา (CT)', fmt(t.ct) + ' วิ') + mini('VA', fmt(t.VA) + ' วิ · ' + fmt(t.vaPct) + '%', '#15856b') +
      mini('NNVA', fmt(t.NNVA) + ' วิ', '#ad7206') + mini('NVA', fmt(t.NVA) + ' วิ', '#a64475') + mini('ก้าวเดิน', totalSteps(editing.elements) + ' ก้าว');
    host.querySelector('#ts-bar').innerHTML = stack(t);
  }

  function saveStudy() {
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
    cleanupVideo(); editing = null; renderList();
  }

  window.CPSTimeStudy = { render };
})();
