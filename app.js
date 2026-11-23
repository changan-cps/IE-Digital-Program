/* CPS IE Studio — core
   - ไม่มี login: เข้าใช้งานด้วยการเลือกพื้นที่ Workshop/Group/Team
   - เก็บข้อมูลใน localStorage (ออฟไลน์) + ซิงค์ Google Sheet (ออนไลน์)
   - แยกข้อมูลตามพื้นที่: แสดงเฉพาะ records ที่ workshop/group/team ตรงกัน
*/
(() => {
  const DEFAULT_WORKSHOPS = ['GA', 'BS', 'PS', 'PT'];
  // พื้นที่ตั้งต้น Workshop → Group → Team (ตามตารางของโรงงาน)
  const PRESET_AREAS = {
    GA: { CA: ['CA-A', 'CA-B'], TA1: ['TA1-A', 'TA1-B'], TA2: ['TA2-A', 'TA2-B'], PCA: ['PCA-PBS', 'DA'], FA: ['FA-A', 'FA-B'], FI: ['FI'], Other: [] },
    BS: { BS: ['BS', 'EH/RH', 'UB', 'FA1', 'FA2', 'GA'] },
    PS: { Group1: ['ED Sanding', 'Sealer', 'UBS/UBC', 'BIW'], Group2: ['Primer Coat', 'Primer Sanding', 'Top Coat'], Group3: ['B216', 'Wax', 'Inspection', 'Repair'] },
    PT: { Battery: ['Module', 'Pack1', 'Pack2', 'Pack3'], Subline: ['IP', 'RS', 'FS'] }
  };
  const STORE_KEY = 'cps-ie-store-v1';
  const SCOPE_KEY = 'cps-ie-scope-v1';
  const URL_KEY = 'cps-ie-sheeturl-v1';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- numeric / analysis helpers (shared by modules) ----------
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const round1 = n => Math.round(n * 10) / 10;
  const fmt = n => round1(n).toLocaleString('th-TH');
  const TYPES = [
    { k: 'VA', label: 'VA · เพิ่มคุณค่า', color: '#15856b' },
    { k: 'NNVA', label: 'NNVA · จำเป็น แต่ไม่เพิ่มคุณค่า', color: '#ad7206' },
    { k: 'NVA', label: 'NVA · สูญเปล่า', color: '#a64475' },
  ];
  function totals(list) {
    const t = { VA: 0, NNVA: 0, NVA: 0, ct: 0, count: (list || []).length };
    for (const e of list || []) { const s = num(e.sec); t[e.type] = (t[e.type] || 0) + s; t.ct += s; }
    t.waste = t.NNVA + t.NVA; t.vaPct = t.ct ? (t.VA / t.ct) * 100 : 0;
    return t;
  }

  // ---------- data store ----------
  let store = load();
  let scope = loadScope();   // {workshop, group, team}
  let sheetUrl = localStorage.getItem(URL_KEY) || '';

  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s && s.studies) { s.stations = s.stations || []; s.approval = s.approval || {}; return s; } } catch {}
    return { areas: [], studies: [], jobs: [], stations: [], approval: {} };
  }
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { toast('บันทึกในเครื่องไม่สำเร็จ: ' + e.message); } }
  function loadScope() { try { return JSON.parse(localStorage.getItem(SCOPE_KEY)) || null; } catch { return null; } }
  function saveScope(s) { scope = s; localStorage.setItem(SCOPE_KEY, JSON.stringify(s)); }

  function sameScope(r) {
    if (!scope) return false;
    const L = scope.level || 'team';
    if (L === 'factory') return true;
    if (r.workshop !== scope.workshop) return false;
    if (L === 'workshop') return true;
    if (r.group !== scope.group) return false;
    if (L === 'group') return true;
    return r.team === scope.team;
  }
  const canEdit = () => (scope && scope.level || 'team') === 'team';
  const inScope = arr => (arr || []).filter(sameScope);
  const tagScope = r => ({ ...r, workshop: scope.workshop, group: scope.group, team: scope.team });
  const LEVEL_LABEL = { factory: 'ระบบโรงงาน', workshop: 'ระดับ Workshop', group: 'ระดับกลุ่ม', team: 'ระดับทีม' };
  const LEVEL_DEPTH = { factory: 0, workshop: 1, group: 2, team: 3 };

  // areas registry (for the cascading picker) — union of saved + from records
  function areaList() {
    const set = new Set(store.areas.map(a => JSON.stringify([a.workshop, a.group, a.team])));
    for (const r of [...store.studies, ...store.jobs]) if (r.workshop) set.add(JSON.stringify([r.workshop, r.group, r.team]));
    return [...set].map(j => { const [workshop, group, team] = JSON.parse(j); return { workshop, group, team }; });
  }
  function registerArea(a) {
    if (!store.areas.some(x => x.workshop === a.workshop && x.group === a.group && x.team === a.team)) { store.areas.push(a); persist(); syncPush('areas', a); }
  }

  // ---------- CRUD used by modules ----------
  function upsert(kind, rec) {
    if (!canEdit()) { toast('โหมดวิเคราะห์ (อ่านอย่างเดียว) — บันทึกได้เฉพาะระดับทีม'); return rec; }
    const col = store[kind];
    rec = tagScope(rec); rec.updatedAt = Date.now();
    const i = col.findIndex(x => x.id === rec.id);
    if (i > -1) col[i] = rec; else col.push(rec);
    persist(); syncPush(kind, rec);
    return rec;
  }
  function remove(kind, id) {
    if (!canEdit()) { toast('โหมดวิเคราะห์ (อ่านอย่างเดียว)'); return; }
    store[kind] = store[kind].filter(x => x.id !== id);
    persist(); syncDelete(kind, id);
  }
  const listStudies = () => inScope(store.studies).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const listJobs = () => inScope(store.jobs).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const listStations = () => inScope(store.stations || []);

  // ---------- รวมรอบจับเวลาเป็นกลุ่มตามสถานี ----------
  // กุญแจกลุ่ม = รหัสสถานี (ถ้าไม่ได้กรอกใช้ชื่องาน) ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่าง
  const gkey = r => String((r && (r.station || r.name)) || '').trim().toLowerCase();
  const roundsOf = code => { const k = String(code || '').trim().toLowerCase(); return k ? inScope(store.studies).filter(s => gkey(s) === k).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0)) : []; };
  function aggregate(rounds) {
    const n = rounds.length; if (!n) return null;
    const cts = rounds.map(s => totals(s.elements).ct);
    const latest = rounds[n - 1];
    const maxLen = Math.max(...rounds.map(s => (s.elements || []).length));
    const elements = [];
    for (let i = 0; i < maxLen; i++) {
      const tpl = (latest.elements || [])[i] || rounds.map(s => (s.elements || [])[i]).filter(Boolean).pop();
      const secs = rounds.map(s => (s.elements || [])[i]).filter(e => e && num(e.sec) > 0).map(e => num(e.sec));
      elements.push({ name: tpl.name || '', type: tpl.type || 'VA', sec: secs.length ? round1(secs.reduce((a, b) => a + b, 0) / secs.length) : 0, n: secs.length, note: '' });
    }
    const dims = {}; const all = [];
    for (const k of ['t', 'u', 'v', 'w']) { const a = []; rounds.forEach(s => (s.elements || []).forEach(e => { const x = parseInt(e[k], 10); if (x >= 1 && x <= 5) a.push(x); })); dims[k] = a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; all.push(...a); }
    const t = totals(elements);
    return {
      n, ctAvg: round1(cts.reduce((a, b) => a + b, 0) / n), ctMax: round1(Math.max(...cts)), ctMin: round1(Math.min(...cts)),
      elements, vaPct: round1(t.vaPct), ease: { ...dims, avg: all.length ? all.reduce((x, y) => x + y, 0) / all.length : 0 }, latest
    };
  }
  // ส่งค่าของกลุ่มไปยังสมดุลสถานี (CT สูงสุด) และวิเคราะห์งาน (Before = เวลาเฉลี่ย) โดยอัตโนมัติ
  function flowFromStation(code) {
    const k = String(code || '').trim().toLowerCase(); if (!k || !canEdit()) return null;
    const rounds = roundsOf(k); const agg = aggregate(rounds); if (!agg) return null;
    const label = (agg.latest.station || agg.latest.name || '').trim();
    const out = { stationRows: 0, stationCreated: false, job: 'kept' };
    const rows = listStations().filter(r => String(r.station || '').trim().toLowerCase() === k);
    if (rows.length) rows.forEach(r => { r.ct = agg.ctMax; r.rounds = agg.n; upsert('stations', r); out.stationRows++; });
    else {
      const last = listStations().slice(-1)[0];
      upsert('stations', { id: uid(), model: last ? last.model : 'B216', submodel: last ? last.submodel : 'EV', station: label, jph: last ? last.jph : 22, ct: agg.ctMax, rounds: agg.n, ois: '', oisDesc: agg.latest.name && agg.latest.name !== label ? agg.latest.name : '' });
      out.stationCreated = true; out.stationRows = 1;
    }
    const before = agg.elements.map(e => ({ id: uid(), name: e.name, sec: e.sec, type: e.type, note: '' }));
    const job = listJobs().find(j => gkey(j) === k);
    if (!job) { upsert('jobs', { id: uid(), name: label, station: label, line: '', operator: agg.latest.operator || '', analyst: agg.latest.analyst || '', date: new Date().toISOString().slice(0, 10), problem: '', target: '', before, after: [], training: [], autoBefore: true }); out.job = 'created'; }
    else if (job.autoBefore) { job.before = before; upsert('jobs', job); out.job = 'updated'; }
    return out;
  }

  // ---------- ระบบแนะนำว่าสถานีควรปรับปรุงหรือไม่ ----------
  const RULES = { load: 90, ease: 3, nva: 15 };   // ภาระ ≥ 90% · คะแนนความง่าย ≤ 3 · NVA ≥ 15% ของรอบเวลา
  function advise(r) {
    const agg = aggregate(roundsOf(r.station));
    const takt = num(r.jph) ? 3600 / num(r.jph) : 0; const load = takt ? (num(r.ct) / takt) * 100 : 0;
    const reasons = [];
    if (load > 100) reasons.push(`ภาระงาน ${fmt(load)}% เกิน TAKT`);
    else if (load >= RULES.load) reasons.push(`ภาระงาน ${fmt(load)}% ถึงเกณฑ์ ${RULES.load}%`);
    if (agg) {
      const t = totals(agg.elements); const nvaPct = t.ct ? (t.NVA / t.ct) * 100 : 0;
      if (nvaPct >= RULES.nva) reasons.push(`NVA ${fmt(nvaPct)}% ของรอบเวลา (เกณฑ์ ${RULES.nva}%)`);
      let weak = 0; (agg.latest.elements || []).forEach(e => ['t', 'u', 'v', 'w'].forEach(k => { const x = parseInt(e[k], 10); if (x >= 1 && x <= RULES.ease) weak++; }));
      if (weak) reasons.push(`คะแนนความง่าย ≤ ${RULES.ease} จำนวน ${weak} จุด`);
    }
    const status = (!agg && !num(r.ct)) ? 'nodata' : reasons.length ? 'improve' : 'ok';
    return { status, reasons, load, hasStudy: !!agg };
  }

  // ---------- เสนอ Line Balance: เกลี่ยงานระหว่างสถานีที่อยู่ติดกันให้ไม่เกินเพดานภาระ ----------
  // items: [{ id, station, ct, els:[{name,sec}] }] เรียงตามลำดับสายการผลิต
  function balance(items, takt, limitPct) {
    const n = items.length; const limit = takt * (num(limitPct) || 90) / 100;
    const ct = items.map(x => num(x.ct)); const total = ct.reduce((a, b) => a + b, 0);
    const flow = new Array(Math.max(n - 1, 0)).fill(0);            // flow[i] > 0 = ย้ายจากสถานี i ไป i+1
    const TOL = 1;   // ไม่เสนอย้ายงานที่เกินเพดานไม่ถึง 1 วินาที
    if (limit > 0) {
      for (let i = 0; i < n - 1; i++) if (ct[i] > limit + TOL) { const m = ct[i] - limit; ct[i] -= m; ct[i + 1] += m; flow[i] += m; }
      for (let i = n - 1; i > 0; i--) if (ct[i] > limit + TOL) { const m = ct[i] - limit; ct[i] -= m; ct[i - 1] += m; flow[i - 1] -= m; }
    }
    const pickEls = (els, sec, fromEnd) => {
      const list = (els || []).filter(e => num(e.sec) > 0); const order = fromEnd ? list.slice().reverse() : list.slice();
      const got = []; let acc = 0;
      for (const e of order) { if (acc >= sec * 0.95) break; if (acc + num(e.sec) > sec * 1.25) { if (!got.length) return { split: e.name, splitSec: num(e.sec) }; break; } got.push(e); acc += num(e.sec); }
      return { names: (fromEnd ? got.reverse() : got).map(e => `${e.name} (${fmt(num(e.sec))} วิ)`), acc: round1(acc) };
    };
    const moves = [];
    flow.forEach((f, i) => {
      if (Math.abs(f) < 0.05) return;
      const from = f > 0 ? i : i + 1, to = f > 0 ? i + 1 : i; const sec = round1(Math.abs(f));
      moves.push({ from: items[from].station, to: items[to].station, sec, pick: pickEls(items[from].els, sec, f > 0) });
    });
    const cap = limit * n;
    return {
      limit: round1(limit), total: round1(total), proposed: ct.map(round1), moves,
      feasible: limit > 0 && total <= cap + TOL * n, shortage: round1(Math.max(0, total - cap)),
      minStations: limit > 0 ? Math.ceil(total / limit - 1e-9) : 0
    };
  }

  // ---------- Google Sheet sync (best-effort, offline-first) ----------
  let syncState = 'off'; // off | ok | pending | error
  function setSync(s, msg) { syncState = s; const b = $('#sync-badge'); if (b) { b.dataset.state = s; b.title = msg || s; } }
  async function sheetFetch(params, body) {
    if (!sheetUrl) throw new Error('ยังไม่ได้ตั้งค่า Google Sheet');
    const url = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + new URLSearchParams(params).toString();
    const opt = body
      ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }
      : { method: 'GET' };
    const r = await fetch(url, opt);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    let res; try { res = JSON.parse(txt); } catch { throw new Error('ตอบกลับไม่ใช่ JSON (ตรวจการ Deploy)'); }
    if (res && res.code === 'AI_FREE_OUT') aiOutAlert();
    return res;
  }
  // แจ้งเตือนเด่น ๆ เมื่อโควตาฟรีของ AI หมด (หลังบ้านตอบ code AI_FREE_OUT)
  function aiOutAlert() {
    let b = $('#ai-out');
    if (!b) {
      b = document.createElement('div'); b.id = 'ai-out'; b.setAttribute('role', 'alert');
      b.innerHTML = '<b>⚠️ AI Free out of Credit</b><span>โควตาฟรีของ AI หมดแล้ว — ใช้ AI ได้อีกครั้งเมื่อโควตารีเซ็ต (วันถัดไป) หรือให้ผู้ดูแลระบบเปิด Billing ใน Google AI Studio · บันทึก/แก้ข้อมูลเองยังใช้ได้ตามปกติ</span><button type="button" aria-label="ปิด">✕</button>';
      b.querySelector('button').onclick = () => b.remove();
      document.body.appendChild(b);
    }
  }
  // ---- ข้อมูลกลาง: ทุกเครื่องเห็นเหมือนกัน (Sheet เป็นตัวจริง) ----
  // up = แก้ในเครื่องแล้วแต่ยังส่งขึ้น Sheet ไม่สำเร็จ · del = ลบในเครื่องแล้วยังส่งไม่สำเร็จ · seen = เคยเห็นใน Sheet (ถ้าหายไปแปลว่าเครื่องอื่นลบ)
  function Q() { const q = store.sync = store.sync || {}; q.up = q.up || {}; q.del = q.del || {}; q.seen = q.seen || {}; return q; }
  const areaId = a => JSON.stringify([a.workshop || '', a.group || '', a.team || '']);
  const qk = (kind, rec) => kind + '|' + (kind === 'areas' ? areaId(rec) : rec.id);
  function syncPush(kind, rec) {
    const k = qk(kind, rec); Q().up[k] = 1; persist();
    if (!sheetUrl) return;
    const ts = rec.updatedAt; setSync('pending');
    sheetFetch({ action: 'upsert', sheet: kind }, rec).then(() => {
      if (rec.updatedAt === ts) delete Q().up[k];
      Q().seen[k] = 1; persist(); setSync('ok', 'ซิงค์แล้ว');
    }).catch(e => setSync('error', e.message));
  }
  function syncDelete(kind, id) {
    const k = kind + '|' + id; delete Q().up[k]; Q().del[k] = 1; persist();
    if (!sheetUrl) return;
    setSync('pending');
    sheetFetch({ action: 'delete', sheet: kind }, { id }).then(() => { delete Q().del[k]; delete Q().seen[k]; persist(); setSync('ok'); })
      .catch(e => setSync('error', e.message));
  }
  async function flushQueue() {
    const q = Q();
    for (const k of Object.keys(q.del)) {
      const kind = k.slice(0, k.indexOf('|')), id = k.slice(k.indexOf('|') + 1);
      await sheetFetch({ action: 'delete', sheet: kind }, { id }); delete q.del[k]; delete q.seen[k];
    }
    for (const k of Object.keys(q.up)) {
      const kind = k.slice(0, k.indexOf('|')), id = k.slice(k.indexOf('|') + 1);
      const rec = kind === 'areas' ? store.areas.find(a => areaId(a) === id) : (store[kind] || []).find(x => x.id === id);
      if (!rec) { delete q.up[k]; continue; }
      const ts = rec.updatedAt;
      await sheetFetch({ action: 'upsert', sheet: kind }, rec);
      if (rec.updatedAt === ts) delete q.up[k];
      q.seen[k] = 1;
    }
    persist();
  }
  function applyRemote(kind, rows) {
    const q = Q(); let changed = false;
    if (kind === 'areas') {
      rows.forEach(row => { if (row && row.workshop && !store.areas.some(a => areaId(a) === areaId(row))) { store.areas.push({ workshop: row.workshop, group: row.group || '', team: row.team || '' }); changed = true; } q.seen['areas|' + areaId(row || {})] = 1; });
      const have = new Set(rows.map(r => areaId(r || {})));
      store.areas.forEach(a => { const k = 'areas|' + areaId(a); if (!have.has(areaId(a)) && !q.seen[k]) q.up[k] = 1; }); // พื้นที่ที่เพิ่มในเครื่องนี้ก่อนเชื่อม Sheet → ส่งขึ้น
      return changed;
    }
    const remote = new Map(rows.filter(r => r && r.id).map(r => [r.id, r]));
    const out = [];
    for (const loc of store[kind]) {
      const k = kind + '|' + loc.id, r = remote.get(loc.id);
      if (r) {
        remote.delete(loc.id); q.seen[k] = 1;
        if (!q.up[k] && (r.updatedAt || 0) >= (loc.updatedAt || 0) && JSON.stringify(r) !== JSON.stringify(loc)) { out.push(r); changed = true; }
        else out.push(loc);
      } else if (q.up[k]) out.push(loc);                       // ยังส่งไม่สำเร็จ เก็บไว้ส่งรอบหน้า
      else if (q.seen[k]) { delete q.seen[k]; changed = true; } // เครื่องอื่นลบไปแล้ว
      else { out.push(loc); q.up[k] = 1; }                      // ข้อมูลเดิมในเครื่องที่ยังไม่เคยขึ้น Sheet → ส่งขึ้น
    }
    for (const [id, r] of remote) { const k = kind + '|' + id; if (q.del[k]) continue; out.push(r); q.seen[k] = 1; changed = true; }
    store[kind] = out;
    return changed;
  }
  let pulling = false;
  async function syncPull(silent) {
    if (!sheetUrl) { if (!silent) toast('เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — ขอลิงก์สำหรับทีมจากผู้ดูแลระบบ'); return; }
    if (pulling) return; pulling = true;
    setSync('pending'); if (!silent) sheetStatus('กำลังซิงค์กับ Sheet…');
    try {
      // เปลี่ยน Sheet (URL ใหม่) → ล้างประวัติ "เคยเห็น" เพื่อไม่ให้ตีความว่าข้อมูลถูกลบ แล้วส่งข้อมูลในเครื่องขึ้น Sheet ใหม่
      if (Q().url !== sheetUrl) { Q().seen = {}; Q().url = sheetUrl; persist(); }
      await flushQueue();
      const kinds = ['studies', 'jobs', 'stations', 'areas'];
      const res = await Promise.all(kinds.map(k => sheetFetch({ action: 'list', sheet: k })));
      let changed = false;
      kinds.forEach((k, i) => { if (res[i] && Array.isArray(res[i].rows)) changed = applyRemote(k, res[i].rows) || changed; });
      persist();
      setSync('ok', 'ซิงค์แล้ว ' + new Date().toLocaleTimeString());
      if (!silent) sheetStatus('ซิงค์สำเร็จ — ข้อมูลตรงกับ Sheet แล้ว');
      if (Object.keys(Q().up).length) flushQueue().catch(() => {});
      if (changed || pendingRender) safeRender();
    } catch (e) { setSync('error', e.message); if (!silent) sheetStatus('ซิงค์ไม่สำเร็จ: ' + e.message); }
    finally { pulling = false; }
  }
  // วาดหน้าใหม่เมื่อมีข้อมูลจากเครื่องอื่น — แต่ไม่รบกวนตอนกำลังพิมพ์/แก้ไขอยู่ (ไว้วาดรอบถัดไป)
  let pendingRender = false;
  function isBusy() {
    const a = document.activeElement;
    if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return true;
    if ([...document.querySelectorAll('dialog')].some(x => x.open)) return true;
    if (!$('#app').hidden && document.querySelector('.tab-page:not([hidden]) #ts-table, .tab-page:not([hidden]) #an-back, .tab-page:not([hidden]) .wf-steps')) return true;
    return false;
  }
  function safeRender() {
    if (isBusy()) { pendingRender = true; return; }
    pendingRender = false;
    if (!$('#gate').hidden) { ['workshop', 'group', 'team'].forEach(st => { fillSelect(st); if (pick[st]) $('#sel-' + st).value = pick[st]; }); return; }
    render();
  }
  function startAutoSync() {
    setInterval(() => { if (!document.hidden) syncPull(true); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncPull(true); });
  }
  // ลิงก์สำหรับทีม: #sheet=<Web App URL> → ตั้งค่าเครื่องนี้ให้อัตโนมัติ (ส่วนหลัง # ไม่ถูกส่งไปที่ GitHub)
  function takeSheetFromLink() {
    const m = location.hash.match(/[#&]sheet=([^&]+)/); if (!m) return;
    const u = decodeURIComponent(m[1]);
    if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) { sheetUrl = u; localStorage.setItem(URL_KEY, u); toast('เชื่อมข้อมูลกลางของทีมแล้ว'); }
    history.replaceState(null, '', location.pathname + location.search);
  }
  function teamLink() { return location.origin + location.pathname + '#sheet=' + encodeURIComponent(sheetUrl); }
  async function fullPush() {
    if (!sheetUrl) { toast('เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — ขอลิงก์สำหรับทีมจากผู้ดูแลระบบ'); return; }
    setSync('pending'); sheetStatus('กำลังอัปโหลดข้อมูลทั้งหมด…');
    try {
      await sheetFetch({ action: 'bulk' }, { areas: store.areas, studies: store.studies, jobs: store.jobs, stations: store.stations || [] });
      setSync('ok'); sheetStatus('อัปโหลดสำเร็จ');
    } catch (e) { setSync('error', e.message); sheetStatus('อัปโหลดไม่สำเร็จ: ' + e.message); }
  }

  // ---------- toast ----------
  let toastT;
  function toast(m) { const t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  // in-page input dialog (replaces prompt): fields = [{name,label,type?,options?}] -> Promise<object|null>
  function ask(title, fields) {
    return new Promise(res => {
      const d = document.createElement('dialog');
      d.innerHTML = `<form method="dialog" class="dlg"><div class="dlg-head"><h2>${esc(title)}</h2></div>${fields.map(f => f.options
        ? `<label>${esc(f.label)}<select name="${f.name}">${f.options.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></label>`
        : `<label>${esc(f.label)}<input name="${f.name}" type="${f.type || 'text'}" autocomplete="off"></label>`).join('')}
        <div class="dlg-actions"><button value="cancel" class="ghost">ยกเลิก</button><button value="ok" class="primary">ตกลง</button></div></form>`;
      document.body.appendChild(d);
      // ปิดและคืนค่าทันทีจากปุ่ม ไม่รอ event 'close' (บางเบราว์เซอร์/แท็บที่ซ่อนอยู่ยิง event นี้ช้า)
      let done = false;
      const finish = ok => {
        if (done) return; done = true;
        let out = null;
        if (ok) { out = {}; d.querySelectorAll('[name]').forEach(i => out[i.name] = i.value); }
        try { d.close(); } catch (e) {}
        d.remove(); res(out);
      };
      d.querySelector('form').addEventListener('submit', e => { e.preventDefault(); finish((e.submitter && e.submitter.value) === 'ok'); });
      d.addEventListener('cancel', e => { e.preventDefault(); finish(false); });
      d.showModal();
    });
  }
  function sheetStatus(m) { const p = $('#sheet-status'); if (p) p.textContent = m || ''; }

  // ================= GATE (area picker) =================
  const pick = { level: '', workshop: '', group: '', team: '' };
  const NEW = '__new__';

  function setLevel(level) {
    pick.level = level;
    $('#sel-level').value = level;
    showSteps();
    updateEnter();
  }
  function showSteps() {
    const d = LEVEL_DEPTH[pick.level] ?? -1;
    $('[data-step=workshop]').hidden = d < 1;
    $('[data-step=group]').hidden = d < 2;
    $('[data-step=team]').hidden = d < 3;
  }

  function fillSelect(step) {
    const sel = $('#sel-' + step);
    let opts;
    const areas = areaList();
    if (step === 'workshop') opts = [...new Set([...DEFAULT_WORKSHOPS, ...areas.map(a => a.workshop)])];
    else if (step === 'group') opts = [...new Set(areas.filter(a => a.workshop === pick.workshop).map(a => a.group))];
    else opts = [...new Set(areas.filter(a => a.workshop === pick.workshop && a.group === pick.group).map(a => a.team))];
    opts = opts.filter(Boolean);
    // รายการตั้งต้นขึ้นก่อนตามลำดับในตาราง ส่วนที่เพิ่มเองต่อท้าย
    const base = step === 'workshop' ? DEFAULT_WORKSHOPS : step === 'group' ? Object.keys(PRESET_AREAS[pick.workshop] || {}) : ((PRESET_AREAS[pick.workshop] || {})[pick.group] || []);
    opts = [...base, ...opts.filter(o => !base.includes(o)).sort()];
    sel.innerHTML = '<option value="">— เลือก —</option>' + opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('') + `<option value="${NEW}">➕ เพิ่มใหม่…</option>`;
    sel.value = pick[step] && opts.includes(pick[step]) ? pick[step] : '';
  }

  function onPick(step, val) {
    const addBox = $('#sel-' + step).closest('.step-body').querySelector('.step-add');
    if (val === NEW) { addBox.hidden = false; addBox.querySelector('input').focus(); return; }
    addBox.hidden = true;
    pick[step] = val;
    if (step === 'workshop') { pick.group = ''; pick.team = ''; $('#sel-group').disabled = !val; $('#sel-team').disabled = true; fillSelect('group'); fillSelect('team'); }
    if (step === 'group') { pick.team = ''; $('#sel-team').disabled = !val; fillSelect('team'); }
    updateEnter();
  }
  function addNew(step) {
    const input = $('#new-' + step); const v = input.value.trim(); if (!v) return;
    pick[step] = v; input.value = '';
    if (step === 'workshop') { pick.group = ''; pick.team = ''; }
    if (step === 'group') pick.team = '';
    // จำพื้นที่ที่เพิ่มใหม่ทันที (ครั้งหน้าขึ้นในดรอปดาวน์เลย แม้ยังไม่ได้กดเข้าใช้งาน)
    registerArea({ workshop: pick.workshop, group: step === 'workshop' ? '' : pick.group, team: step === 'team' ? v : '' });
    // ensure dependent enabled
    if (step === 'workshop') { $('#sel-group').disabled = false; }
    if (step === 'group') { $('#sel-team').disabled = false; }
    fillSelect(step);
    $('#sel-' + step).value = v;
    $('#sel-' + step).closest('.step-body').querySelector('.step-add').hidden = true;
    if (step !== 'team') { fillSelect(step === 'workshop' ? 'group' : 'team'); }
    updateEnter();
  }
  function updateEnter() {
    const d = LEVEL_DEPTH[pick.level] ?? -1;
    let ok = pick.level !== '';
    if (d >= 1 && !pick.workshop) ok = false;
    if (d >= 2 && !pick.group) ok = false;
    if (d >= 3 && !pick.team) ok = false;
    $('#enter').disabled = !ok;
    $('#enter').textContent = pick.level === 'team' ? 'เข้าใช้งาน →' : 'ดูการวิเคราะห์ →';
  }

  function openGate(prefill) {
    pick.level = prefill?.level || ''; pick.workshop = prefill?.workshop || ''; pick.group = prefill?.group || ''; pick.team = prefill?.team || '';
    $('#app').hidden = true; $('#gate').hidden = false;
    $('#sel-level').value = pick.level;
    showSteps();
    $('#sel-group').disabled = !pick.workshop; $('#sel-team').disabled = !pick.group;
    fillSelect('workshop'); fillSelect('group'); fillSelect('team');
    if (pick.workshop) $('#sel-workshop').value = pick.workshop;
    if (pick.group) $('#sel-group').value = pick.group;
    if (pick.team) $('#sel-team').value = pick.team;
    updateEnter();
  }

  function enter() {
    const d = LEVEL_DEPTH[pick.level] ?? -1;
    if (d === -1) return;
    const s = { level: pick.level, workshop: d >= 1 ? pick.workshop : '', group: d >= 2 ? pick.group : '', team: d >= 3 ? pick.team : '' };
    saveScope(s);
    if (pick.level === 'team') registerArea({ workshop: s.workshop, group: s.group, team: s.team });
    openApp();
  }

  // ================= APP shell =================
  let currentTab = 'dashboard';
  function openApp() {
    $('#gate').hidden = true; $('#app').hidden = false;
    const parts = [scope.workshop, scope.group, scope.team].filter(Boolean).join(' / ');
    const crumb = (LEVEL_LABEL[scope.level] || 'ระดับทีม') + (parts ? ' · ' + parts : '');
    $('#scope-crumb').textContent = crumb; $('#foot-scope').textContent = crumb;
    document.body.classList.toggle('readonly', !canEdit());
    setSync(sheetUrl ? 'ok' : 'off', sheetUrl ? 'เชื่อมข้อมูลกลางแล้ว' : 'ยังไม่เชื่อมข้อมูลกลาง — ขอลิงก์สำหรับทีมจากผู้ดูแลระบบ');
    showTab(currentTab);
    syncPull(true);
  }
  function showTab(tab) {
    currentTab = tab;
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-page').forEach(p => p.hidden = p.id !== 'tab-' + tab);
    render();
  }
  function render() {
    if ($('#app').hidden) return;
    if (currentTab === 'dashboard') renderDashboard();
    else if (currentTab === 'timestudy') window.CPSTimeStudy?.render($('#tab-timestudy'));
    else if (currentTab === 'stations') window.CPSStations?.render($('#tab-stations'));
    else if (currentTab === 'analysis') window.CPSAnalysis?.render($('#tab-analysis'));
  }

  function renderDashboard() {
    const studies = listStudies(), jobs = listJobs();
    const avgCt = studies.length ? studies.reduce((s, x) => s + num(x.ct), 0) / studies.length : 0;
    const trained = jobs.reduce((s, j) => s + (j.training || []).reduce((a, r) => a + num(r.count), 0), 0);
    const improved = jobs.filter(j => (j.after || []).length).length;
    const title = scope.team || scope.group || scope.workshop || 'ทุกพื้นที่';
    const sub = [scope.workshop, scope.group].filter(Boolean).join(' / ') || LEVEL_LABEL[scope.level];
    const el = $('#tab-dashboard');
    el.innerHTML = `
      <div class="page-head"><div><p class="eyebrow">${esc(LEVEL_LABEL[scope.level] || 'พื้นที่')}</p><h1>${esc(title)}</h1><p class="muted">${esc(sub)}</p></div></div>
      ${!canEdit() ? '<div class="ro-banner">👁️ โหมดวิเคราะห์ — แสดงข้อมูลรวมของพื้นที่นี้ (อ่านอย่างเดียว บันทึกได้เฉพาะระดับทีม)</div>' : ''}
      <div class="cards">
        ${card('Time Study', studies.length, 'รายการ')}
        ${card('รอบเวลาเฉลี่ย', fmt(avgCt), 'วินาที')}
        ${card('งานวิเคราะห์', jobs.length, 'งาน', improved + ' ปรับปรุงแล้ว')}
        ${card('อบรมสะสม', trained, 'คน')}
      </div>
      ${canEdit() ? `<div class="dash-links">
        <button class="bigbtn" data-go="timestudy"><b>⏱️ บันทึก Time Study</b><span>จับเวลา element จากวิดีโอ เก็บเฉพาะค่า</span></button>
        <button class="bigbtn" data-go="analysis"><b>🔧 วิเคราะห์งาน Before/After</b><span>เทียบก่อน/หลัง + อบรม + รายงานอัตโนมัติ</span></button>
      </div>` : ''}
      ${recent(studies, jobs)}`;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => showTab(b.dataset.go));
  }
  function card(label, val, unit, sub) {
    return `<div class="stat"><small>${esc(label)}</small><strong>${val}<em>${unit ? ' ' + esc(unit) : ''}</em></strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  }
  function recent(studies, jobs) {
    const rows = [...studies.slice(0, 5).map(s => ({ t: 'Time Study', n: s.name, d: s.date, ct: s.ct })),
    ...jobs.slice(0, 5).map(j => ({ t: 'วิเคราะห์งาน', n: j.name, d: j.date }))];
    if (!rows.length) return '<div class="blank">ยังไม่มีข้อมูลในพื้นที่นี้ เริ่มจากปุ่มด้านบน</div>';
    return `<section class="panel"><div class="panelhead"><h2>ล่าสุด</h2></div><div class="recent">${rows.map(r => `<div class="recent-row"><span class="tag">${esc(r.t)}</span><b>${esc(r.n || '—')}</b><small>${esc(r.d || '')}</small>${r.ct != null ? `<em>${fmt(r.ct)} วิ</em>` : ''}</div>`).join('')}</div></section>`;
  }

  // ================= wire up =================
  function boot() {
    // gate events
    ['workshop', 'group', 'team'].forEach(step => {
      $('#sel-' + step).addEventListener('change', e => onPick(step, e.target.value));
    });
    $('#sel-level').addEventListener('change', e => setLevel(e.target.value));
    $$('[data-addconfirm]').forEach(b => b.onclick = () => addNew(b.dataset.addconfirm));
    $$('[data-addcancel]').forEach(b => b.onclick = () => { b.closest('.step-add').hidden = true; $('#sel-' + b.dataset.addcancel).value = pick[b.dataset.addcancel] || ''; });
    $$('.step-add input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const step = inp.id.replace('new-', ''); addNew(step); } }));
    $('#enter').onclick = enter;

    // app events
    $$('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
    $('#btn-switch').onclick = () => openGate(scope);

    // start
    takeSheetFromLink();
    if (!sheetUrl) $('#gate-msg').textContent = 'เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — ขอ “ลิงก์สำหรับทีม” จากผู้ดูแลระบบแล้วเปิดครั้งเดียว';
    if (scope && scope.workshop) openApp(); else { openGate(); syncPull(true); }
    startAutoSync();
  }

  // ---------- public API for modules ----------
  window.CPS = {
    boot,
    util: { $, $$, uid, esc, num, round1, fmt, TYPES, totals, toast, ask },
    data: {
      listStudies, listJobs, listStations, upsert, remove, canEdit,
      group: { key: gkey, roundsOf, aggregate, flow: flowFromStation },
      advise, balance, RULES,
      approval: { get: () => (store.approval = store.approval || {}), save: () => persist() },
      get scope() { return scope; }
    },
    showTab,
    sheet: { configured: () => !!sheetUrl, call: sheetFetch },
    render,
  };
})();
