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
  const CODE_KEY = 'cps-ie-code-v1', NEED_KEY = 'cps-ie-needcode-v1'; // รหัสเข้าใช้งานของทีม / server ต้องการรหัสหรือไม่
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
  // ข้อมูลกลางของทีม (Apps Script ที่ผูกกับ Sheet "CPS IE Data") — ทุกคำขอต้องมีบัตรจาก CPS Digital Platform จึงเปิดเผย URL ได้
  const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbw4oG6L_q-uWJCj3WhNPpJr6LlC7stp8UGqFjizkM3Naq30hktQCosJg6_uFF8csvVD3A/exec';
  let sheetUrl = localStorage.getItem(URL_KEY) || DEFAULT_SHEET_URL;
  // ---- CPS SSO: บัตรแอปจาก sso-gate.js (เข้าผ่าน CPS Digital Platform) ใช้แทนรหัสทีม ----
  const PORTAL_URL = '/cps-portal/', SSO_RETRY = 'cps-ie-sso-retry';
  const ssoTok = () => (window.cpsAppToken ? window.cpsAppToken() : '');
  // server ไม่รับบัตร (หมดอายุ/ถูกถอนสิทธิ์): ขอบัตรใหม่หนึ่งครั้ง ถ้ายังไม่ได้ให้กลับไป Portal
  let ssoRefreshing = false;
  function ssoRefresh() {
    if (ssoRefreshing) return; ssoRefreshing = true;   // หลายคำขอถูกปฏิเสธพร้อมกัน: ทำครั้งเดียวต่อการโหลดหน้า
    let again = false; try { again = !!sessionStorage.getItem(SSO_RETRY); sessionStorage.setItem(SSO_RETRY, '1'); } catch (e) {}
    if (window.cpsGateReset) window.cpsGateReset();
    if (again) location.href = PORTAL_URL; else location.reload();
  }

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
  // Before ของงาน Kaizen = รอบที่ CT สูงสุดของ Time Study (ค่าเดียวกับ CT สถานีก่อนทำ Kaizen)
  // ยกเว้นผู้ใช้แก้ Before เอง (autoBefore === false) จึงใช้ค่าที่กรอก
  function maxRoundOf(k) { const rs = roundsOf(k); return rs.length ? rs.reduce((a, s) => (totals(s.elements).ct > totals(a.elements).ct ? s : a), rs[0]) : null; }
  function beforeOf(job) {
    const k = gkey(job);
    const sr = k ? listStations().find(r => gkey(r) === k && r.wf && r.wf.approval && r.wf.approval.submitted && r.wf.approval.before) : null;
    if (sr) { const b = sr.wf.approval.before; return { ct: b.ct, els: b.els || [], src: 'study', frozen: true }; }   // OIS ส่งแล้ว: ใช้ค่าตอนส่ง
    if (k && job.autoBefore !== false) { const mr = maxRoundOf(k); if (mr) return { ct: totals(mr.elements).ct, els: mr.elements || [], src: 'study', n: roundsOf(k).length }; }
    return { ct: totals(job.before || []).ct, els: job.before || [], src: 'manual' };
  }
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
    const mr = maxRoundOf(k);
    const before = ((mr && mr.elements) || agg.elements).map(e => ({ id: uid(), name: e.name, sec: e.sec, type: e.type, note: '' }));
    const job = listJobs().find(j => gkey(j) === k);
    if (!job) { upsert('jobs', { id: uid(), name: label, station: label, line: '', operator: agg.latest.operator || '', analyst: agg.latest.analyst || '', date: new Date().toISOString().slice(0, 10), problem: '', target: '', before, after: [], training: [], autoBefore: true }); out.job = 'created'; }
    else if (job.autoBefore) { job.before = before; upsert('jobs', job); out.job = 'updated'; }
    return out;
  }

  // ---------- ระบบแนะนำว่าสถานีควรปรับปรุงหรือไม่ ----------
  const RULES = { load: 90, ease: 3, nva: 15 };   // ภาระ ≥ 90% · คะแนนความง่าย ≤ 3 · NVA ≥ 15% ของรอบเวลา
  // CT ที่ใช้ของสถานี — แหล่งเดียวทั้งแอป: After ของงานวิเคราะห์ (ถ้ามี) > CT สูงสุดจาก Time Study > ค่าที่กรอกเอง
  function ctInfo(r) {
    const k = gkey(r);
    if (k) {
      const job = listJobs().find(j => gkey(j) === k && (j.after || []).length && (!r.team || !j.team || j.team === r.team));
      if (job) { const ct = totals(job.after).ct; if (ct) return { ct, src: 'after', before: beforeOf(job).ct }; }
      const agg = aggregate(roundsOf(k));
      if (agg && agg.ctMax) return { ct: agg.ctMax, src: 'study', n: agg.n };
    }
    return { ct: num(r.ct), src: 'manual' };
  }
  const ctOf = r => ctInfo(r).ct;
  function advise(r) {
    const agg = aggregate(roundsOf(r.station));
    const takt = num(r.jph) ? 3600 / num(r.jph) : 0; const load = takt ? (ctOf(r) / takt) * 100 : 0;
    const reasons = [];
    if (load > 100) reasons.push(`ภาระงาน ${fmt(load)}% เกิน TAKT`);
    else if (load >= RULES.load) reasons.push(`ภาระงาน ${fmt(load)}% ถึงเกณฑ์ ${RULES.load}%`);
    if (agg) {
      const mr = maxRoundOf(gkey(r)), base = mr ? mr.elements : agg.elements;   // รอบเดียวกับ Before
      const t = totals(base); const nvaPct = t.ct ? (t.NVA / t.ct) * 100 : 0;
      if (nvaPct >= RULES.nva) reasons.push(`NVA ${fmt(nvaPct)}% ของรอบเวลา (เกณฑ์ ${RULES.nva}%)`);
      let weak = 0; (base || []).forEach(e => ['t', 'u', 'v', 'w'].forEach(k => { const x = parseInt(e[k], 10); if (x >= 1 && x <= RULES.ease) weak++; }));
      if (weak) reasons.push(`คะแนนความง่าย ≤ ${RULES.ease} จำนวน ${weak} จุด`);
    }
    const status = (!agg && !ctOf(r)) ? 'nodata' : reasons.length ? 'improve' : 'ok';
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
  function setSync(s, msg) { syncState = s; const b = $('#sync-badge'); if (b) { b.dataset.state = s; b.title = msg || s; b.innerHTML = `<i aria-hidden="true">●</i> <span>${esc(shellPick('sync')[s] || s)}</span>`; } }
  async function sheetFetch(params, body) {
    if (!sheetUrl) throw new Error('ยังไม่ได้ตั้งค่า Google Sheet');
    if (accessCode) params = Object.assign({}, params, { key: accessCode });
    if (window.CPS_READY) await window.CPS_READY;      // รอ sso-gate.js ตรวจสิทธิ์เสร็จก่อน
    const st = ssoTok(); if (st) params = Object.assign({}, params, { sso: st });
    const url = sheetUrl + (sheetUrl.includes('?') ? '&' : '?') + new URLSearchParams(params).toString();
    const opt = body
      ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }
      : { method: 'GET' };
    const r = await fetch(url, opt);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text();
    let res; try { res = JSON.parse(txt); } catch { throw new Error('ตอบกลับไม่ใช่ JSON (ตรวจการ Deploy)'); }
    if (res && res.code === 'AI_FREE_OUT') aiOutAlert();
    if (res && res.code === 'AUTH' && res.sso) { ssoRefresh(); return res; }
    if (res && res.code === 'AUTH') { localStorage.setItem(NEED_KEY, '1'); showLogin('รหัสเข้าใช้งานไม่ถูกต้องหรือถูกเปลี่ยน — ใส่รหัสใหม่'); }
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
    if (locked) return;
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
  // ---- รหัสเข้าใช้งาน (เข้า/ออกระบบ) ----
  let accessCode = localStorage.getItem(CODE_KEY) || '';
  let locked = false;
  function startApp() {
    $('#btn-logout').hidden = !accessCode; $('#gate-logout').hidden = !accessCode;
    if (scope && (scope.workshop || scope.level === 'factory')) openApp(); else { openGate(); syncPull(true); }
  }
  function showLogin(msg) {
    locked = true;
    $('#app').hidden = true; $('#gate').hidden = true; $('#login').hidden = false;
    $('#login-msg').textContent = msg || '';
    setTimeout(() => $('#login-code').focus(), 50);
  }
  async function login() {
    const code = $('#login-code').value.trim(); if (!code) return;
    const old = accessCode; accessCode = code;
    $('#login-go').disabled = true; $('#login-msg').textContent = 'กำลังตรวจรหัส…';
    try {
      const r = await sheetFetch({ action: 'auth' });
      if (r && r.ok && r.valid) {
        localStorage.setItem(CODE_KEY, code); if (r.need) localStorage.setItem(NEED_KEY, '1');
        locked = false; $('#login').hidden = true; $('#login-code').value = ''; $('#login-msg').textContent = '';
        startApp();
      } else { accessCode = old; $('#login-msg').textContent = 'รหัสไม่ถูกต้อง'; }
    } catch (e) { accessCode = old; $('#login-msg').textContent = 'ตรวจรหัสไม่สำเร็จ (ตรวจอินเทอร์เน็ต): ' + e.message; }
    $('#login-go').disabled = false;
  }
  async function logout() {
    const q = Q(), n = Object.keys(q.up).length + Object.keys(q.del).length;
    const msg = 'ออกจากระบบ?\nข้อมูลที่เก็บไว้ในเครื่องนี้จะถูกล้าง (ข้อมูลกลางใน Sheet ยังอยู่ครบ)' + (n ? `\n\n⚠️ มี ${n} รายการที่ยังส่งขึ้น Sheet ไม่สำเร็จ จะหายไป` : '');
    if (!(await ask(msg, [], { ok: 'ออกจากระบบ', cancel: 'อยู่ต่อ' }))) return;
    [CODE_KEY, STORE_KEY, SCOPE_KEY, 'cps-ie-me'].forEach(k => localStorage.removeItem(k));
    location.reload();
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

  // ---------- labels for assistive tech ----------
  function autoLabel() {
    const named = el => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    document.querySelectorAll('main input:not([type=hidden]), main select, main textarea, dialog input, dialog select, dialog textarea').forEach(el => {
      if (named(el)) return;
      let name = el.getAttribute('placeholder') || el.getAttribute('title') || '';
      const td = el.closest('td'), table = el.closest('table');
      if (td && table) {
        const th = table.querySelectorAll('thead th, tr:first-child th')[td.cellIndex];
        const col = th ? th.textContent.trim() : '';
        const tr = td.parentElement, rowNo = tr.querySelector('.idx') ? tr.querySelector('.idx').textContent.trim() : (tr.rowIndex || '');
        name = [col || name, rowNo ? 'แถว ' + rowNo : ''].filter(Boolean).join(' · ');
      }
      if (!name) { const f = el.closest('.field, .dlg label, .panel'); const h = f && f.querySelector('span, h2, b'); name = h ? h.textContent.trim() : ''; }
      if (name) el.setAttribute('aria-label', name);
    });
    document.querySelectorAll('main button, dialog button').forEach(b => {
      if (b.getAttribute('aria-label')) return;
      const txt = b.textContent.trim();
      if (!/^(เปิด|ดู|ลบ|แก้ไข|✕|ดูกราฟ|เปิดงาน)$/.test(txt)) return;
      const row = b.closest('.recent-row, tr, .wf-flow, .sb-grouphead, .ts-group');
      const label = row && (row.querySelector('b, .sb-st, .tag') || {}).textContent;
      if (label) b.setAttribute('aria-label', (txt === '✕' ? 'ลบ' : txt) + ' ' + label.trim());
    });
  }
  // ---------- shell language: follows the Dashboard choice (ไทย / EN / 中文 / 中 / EN) ----------
  const SHELL = {
    th: { tabs: ['แดชบอร์ด', 'Time Study', 'สมดุลสถานี', 'วิเคราะห์งาน'], sw: 'เปลี่ยนพื้นที่', out: 'ออกจากระบบ', foot: 'ข้อมูลพื้นที่:', gate: 'เลือกระดับการใช้งาน แล้วเลือกพื้นที่',
      lv: { factory: 'ระบบโรงงาน', workshop: 'ระดับ Workshop', group: 'ระดับกลุ่ม', team: 'ระดับทีม' }, step1: 'ระดับการใช้งาน', step2: 'Workshop', step3: 'กลุ่ม (Group)', step4: 'ทีม (Team)', back: '← กลับ (ไม่เปลี่ยนพื้นที่)', choose: '— เลือก —', addNew: '➕ เพิ่มใหม่…', enter: 'เข้าใช้งาน →', view: 'ดูการวิเคราะห์ →',
      opts: { team: '🧑‍🔧 ระดับทีม — บันทึก/ทำงาน เห็นเฉพาะทีมตัวเอง', group: '👥 ระดับกลุ่ม — วิเคราะห์รวมทุกทีมในกลุ่ม', workshop: '🏢 ระดับ Workshop — วิเคราะห์รวมทั้ง Workshop', factory: '🏭 ระบบโรงงาน — วิเคราะห์รวมทุกพื้นที่' },
      sync: { ok: 'ซิงค์แล้ว', pending: 'กำลังซิงค์', error: 'ซิงค์ไม่สำเร็จ', off: 'เก็บในเครื่อง' } },
    en: { tabs: ['Dashboard', 'Time Study', 'Station balance', 'Kaizen analysis'], sw: 'Change area', out: 'Sign out', foot: 'Area:', gate: 'Choose your level, then your area',
      lv: { factory: 'Factory', workshop: 'Workshop level', group: 'Group level', team: 'Team level' }, step1: 'Access level', step2: 'Workshop', step3: 'Group', step4: 'Team', back: '← Back (keep this area)', choose: '— Choose —', addNew: '➕ Add new…', enter: 'Enter →', view: 'View analysis →',
      opts: { team: '🧑‍🔧 Team — record and work, own team only', group: '👥 Group — analyse all teams in the group', workshop: '🏢 Workshop — analyse the whole workshop', factory: '🏭 Factory — analyse every area' },
      sync: { ok: 'Synced', pending: 'Syncing', error: 'Sync failed', off: 'This device only' } },
    zh: { tabs: ['仪表板', '工时研究', '工位平衡', '改善分析'], sw: '切换区域', out: '退出', foot: '区域', gate: '选择使用级别，然后选择区域',
      lv: { factory: '工厂', workshop: '车间级', group: '组级', team: '班组级' }, step1: '使用级别', step2: '车间', step3: '组', step4: '班组', back: '← 返回（不切换区域）', choose: '— 请选择 —', addNew: '➕ 新增…', enter: '进入 →', view: '查看分析 →',
      opts: { team: '🧑‍🔧 班组 — 记录与作业，仅本班组', group: '👥 组 — 分析组内所有班组', workshop: '🏢 车间 — 分析整个车间', factory: '🏭 工厂 — 分析所有区域' },
      sync: { ok: '已同步', pending: '同步中', error: '同步失败', off: '仅本机' } },
  };
  function shellPick(k) {
    const I = window.CPSDashI18n; const L = I ? I.lang : 'th';
    const T = SHELL[L === 'zhen' ? 'zh' : L] || SHELL.th; return T[k];
  }
  function crumbText() {
    const parts = scope ? [scope.workshop, scope.group, scope.team].filter(Boolean).join(' / ') : '';
    return (shellPick('lv')[scope && scope.level] || shellPick('lv').team) + (parts ? ' · ' + parts : '');
  }
  function applyShell() {
    const I = window.CPSDashI18n; const L = I ? I.lang : 'th';
    const pick = k => L === 'zhen' ? (Array.isArray(SHELL.zh[k]) ? SHELL.zh[k].map((z, i) => z === SHELL.en[k][i] ? z : z + ' / ' + SHELL.en[k][i]) : SHELL.zh[k] + ' / ' + SHELL.en[k]) : (SHELL[L] || SHELL.th)[k];
    $$('#tabs button').forEach((b, i) => { b.textContent = pick('tabs')[i]; });
    if ($('#btn-switch')) $('#btn-switch').textContent = pick('sw');
    if ($('#btn-logout')) $('#btn-logout').textContent = pick('out');
    if ($('#foot-label')) $('#foot-label').textContent = pick('foot');
    if ($('#gate-sub')) $('#gate-sub').textContent = pick('gate');
    [['level', 'step1'], ['workshop', 'step2'], ['group', 'step3'], ['team', 'step4']].forEach(([k, v]) => { const h = $(`[data-step="${k}"] .step-head b`); if (h) h.textContent = shellPick(v); });
    if ($('#gate-cancel')) $('#gate-cancel').textContent = shellPick('back');
    $$('#sel-level option').forEach(o => { o.textContent = o.value ? shellPick('opts')[o.value] || o.textContent : shellPick('choose'); });
    if ($('#enter')) $('#enter').textContent = shellPick($('#sel-level') && $('#sel-level').value && $('#sel-level').value !== 'team' ? 'view' : 'enter');
    if (scope && $('#scope-crumb')) { $('#scope-crumb').textContent = crumbText(); $('#foot-scope').textContent = crumbText(); }
    setSync(syncState, $('#sync-badge') ? $('#sync-badge').title : '');
    document.documentElement.lang = L === 'zh' || L === 'zhen' ? 'zh-Hans' : L;
    if (window.CPSDom) window.CPSDom.apply();
  }
  // ข้อมูลที่ผู้ใช้พิมพ์: ไม่ถูกแปลตามภาษาหน้าจอ
  const ud = s => `<span translate="no">${esc(s)}</span>`;
  // วันที่แบบเดียวทั้งแอป: 24 พ.ย. 2569 (+ เวลา) · ตามภาษาที่เลือก
  function dateTxt(v, time) {
    if (v == null || v === '') return '';
    const d = typeof v === 'number' ? new Date(v) : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v);
    if (isNaN(d)) return String(v);
    const L = (window.CPSDashI18n && window.CPSDashI18n.lang) || 'th';
    return d.toLocaleString(L === 'en' ? 'en-GB' : L === 'th' ? 'th-TH' : 'zh-CN', Object.assign({ day: 'numeric', month: 'short', year: 'numeric' }, time ? { hour: '2-digit', minute: '2-digit' } : {})).replace('Sept', 'Sep');
  }
  // ลบแบบเลิกทำได้ 10 วินาที (แทนการถามยืนยัน)
  function removeUndo(kind, id, msg, after) {
    const rec = (store[kind] || []).find(x => x.id === id); if (!rec) return;
    const copy = JSON.parse(JSON.stringify(rec));
    remove(kind, id); if (after) after();
    const t = $('#toast'); if (!t) return;
    t.innerHTML = `<span>${esc(msg)}</span> <button type="button" class="toast-undo">เลิกทำ</button>`;
    t.classList.add('show', 'has-action'); clearTimeout(toastT);
    const hide = () => t.classList.remove('show', 'has-action');
    t.querySelector('.toast-undo').onclick = () => { hide(); store[kind].push(copy); persist(); upsert(kind, copy); if (after) after(); toast('กู้คืนแล้ว'); };
    toastT = setTimeout(hide, 10000);
  }
  // คู่มือย่อ (ปุ่ม ? บนแถบบน)
  function openHelp() {
    let d = $('#help-dlg');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'help-dlg'; d.className = 'help-dlg';
      d.innerHTML = `<div class="dlg"><div class="dlg-head"><h2>วิธีใช้ CPS IE Studio</h2><button type="button" class="ghost dlg-x" data-close aria-label="ปิด">✕</button></div>
        <ol class="help-steps"><li><b>Time Study</b> — เลือกวิดีโอ กด “มาร์คจุดเริ่ม” แล้วกด “ตัดจบขั้นตอน (Lap)” ทุกครั้งที่จบขั้นตอน เลือก VA / NNVA / NVA ให้ทุกแถว แล้วบันทึก</li>
        <li><b>สมดุลสถานี</b> — ดูภาระงานเทียบ TAKT ของทุกสถานี กด “→ ขั้นตอน” เพื่อทำ Workflow 6 ขั้นของสถานีนั้น</li>
        <li><b>วิเคราะห์งาน</b> — เทียบ Before / After เลือกสถานีให้ตรงกับ Time Study แล้วระบบจะดึงคะแนนมาให้</li>
        <li><b>แดชบอร์ด</b> — ดูแนวโน้ม CT, VA และ Line Balance Rate และดาวน์โหลดรายงาน PPT</li></ol>
        <p><b>คีย์ลัด</b> Space ตัดจบขั้นตอน · M มาร์คจุดเริ่ม · P เล่น/หยุด · Z ย้อน Lap · ← → ทีละ 0.1 วินาที · Ctrl+S บันทึก</p>
        <p><b>สูตร</b> Line Balance Rate = ΣCT ÷ (จำนวนสถานี × CT สูงสุด) × 100 · TAKT = 3600 ÷ JPH</p>
        <dl class="help-gloss"><dt>CT ที่ใช้</dt><dd>CT ของสถานีที่ทุกหน้าใช้: After ของงานวิเคราะห์ (ถ้ามี) → CT สูงสุดจาก Time Study → ค่าที่กรอกเอง</dd>
        <dt>VA / NNVA / NVA</dt><dd>เพิ่มคุณค่า / จำเป็นแต่ไม่เพิ่มคุณค่า / สูญเปล่า</dd>
        <dt>TAKT</dt><dd>เวลาที่ต้องผลิตได้ 1 คัน = 3600 ÷ JPH</dd>
        <dt>OIS</dt><dd>เอกสารมาตรฐานการทำงานของสถานี (ต้องอนุมัติครบ 5 ฝ่าย)</dd>
        <dt>4M1E</dt><dd>คน · เครื่อง · วัสดุ · วิธี · สภาพแวดล้อม</dd>
        <dt>การอนุมัติ OIS</dt><dd>ส่งแล้วอนุมัติตามลำดับ Flow 1 → 5 ด้วย PIN ของแต่ละฝ่าย · ฝ่ายที่กำลังพิจารณาส่งกลับแก้ไขได้ (ล้างการอนุมัติทั้งหมด) · ดูงานที่รอฝ่ายคุณได้ที่หน้าสมดุลสถานี</dd>
        <dt>Before</dt><dd>รอบที่ CT สูงสุดของ Time Study สถานีนั้น (ถ้าไม่ได้แก้เอง)</dd>
        <dt>คะแนนความง่าย</dt><dd>1 = ยากสุด, 5 = ง่ายสุด · ≤ 3 = จุดต้องปรับปรุง</dd></dl>
        <p><b>AI</b> ช่วยร่าง element และข้อเสนอให้ แล้วคนตรวจแก้ — ถ้าปุ่ม AI แจ้งว่ายังไม่พร้อม ให้ติดต่อผู้ดูแลระบบ</p>
        <div class="dlg-actions"><button type="button" class="primary" data-close>ปิด</button></div></div>`;
      document.body.appendChild(d);
      d.querySelectorAll('[data-close]').forEach(b => b.onclick = () => d.close());
    }
    d.showModal();
  }
  // ---------- toast ----------
  let toastT;
  function toast(m, ms) { const t = $('#toast'); if (!t) return; t.textContent = m; t.classList.remove('has-action'); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || Math.max(4000, 60 * String(m).length)); }
  // in-page input dialog (replaces prompt): fields = [{name,label,type?,options?}] -> Promise<object|null>
  function ask(title, fields, opt) {
    opt = opt || {};
    return new Promise(res => {
      const d = document.createElement('dialog');
      d.innerHTML = `<form method="dialog" class="dlg"><div class="dlg-head"><h2>${esc(title)}</h2></div>${fields.map(f => f.options
        ? `<label>${esc(f.label)}<select name="${f.name}">${f.options.map(o => `<option value="${esc(o.value)}"${f.value === o.value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`
        : `<label>${esc(f.label)}<input name="${f.name}" type="${f.type || 'text'}" autocomplete="off" value="${esc(f.value || '')}"></label>`).join('')}
        <div class="dlg-actions"><button value="cancel" class="ghost">${esc(opt.cancel || 'ยกเลิก')}</button><button value="ok" class="${opt.danger ? 'danger' : 'primary'}">${esc(opt.ok || 'ตกลง')}</button></div></form>`;
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
    sel.innerHTML = `<option value="">${esc(shellPick('choose'))}</option>` + opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('') + `<option value="${NEW}">${esc(shellPick('addNew'))}</option>`;
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
    $('#enter').textContent = shellPick(pick.level && pick.level !== 'team' ? 'view' : 'enter');
  }

  function openGate(prefill) {
    pick.level = prefill?.level || ''; pick.workshop = prefill?.workshop || ''; pick.group = prefill?.group || ''; pick.team = prefill?.team || '';
    $('#app').hidden = true; $('#gate').hidden = false;
    if ($('#gate-cancel')) $('#gate-cancel').hidden = !scope;
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
    const crumb = crumbText();
    $('#scope-crumb').textContent = crumb; $('#foot-scope').textContent = crumb;
    document.body.classList.toggle('readonly', !canEdit());
    setSync(sheetUrl ? 'ok' : 'off', sheetUrl ? 'เชื่อมข้อมูลกลางแล้ว' : 'ยังไม่เชื่อมข้อมูลกลาง — ขอลิงก์สำหรับทีมจากผู้ดูแลระบบ');
    showTab(currentTab);
    syncPull(true);
  }
  // leaving an unsaved time study asks first (the draft stays in this browser either way)
  const dirtyEditor = () => currentTab === 'timestudy' && window.CPSTimeStudy?.isDirty?.() ? ['CPSTimeStudy', 'Time Study', 'Time Study']
    : currentTab === 'analysis' && window.CPSAnalysis?.isDirty?.() ? ['CPSAnalysis', 'งานวิเคราะห์', 'วิเคราะห์งาน'] : null;
  function guardLeave(go) {
    const d = dirtyEditor();
    if (d) {
      ask(`ยังไม่ได้บันทึก ${d[1]} นี้ — ออกโดยไม่บันทึก? (ร่างยังเก็บไว้ในเครื่อง กู้คืนได้ที่หน้า ${d[2]})`, [], { ok: 'ออก (เก็บร่างไว้)', cancel: 'อยู่ต่อ' }).then(ok => { if (ok) { window[d[0]].leave(); go(); } });
      return;
    }
    go();
  }
  function showTab(tab) {
    if (tab !== currentTab && dirtyEditor()) return guardLeave(() => showTab(tab));
    if (tab !== currentTab) { scrollTo(0, 0); const tt = $('#toast'); if (tt && !tt.classList.contains('has-action')) tt.classList.remove('show'); }
    const prevTab = currentTab;
    currentTab = tab;
    const tbh = $('.topbar') ? $('.topbar').offsetHeight : 0; if (tbh) document.documentElement.style.setProperty('--topbar-h', tbh + 'px');
    $$('#tabs button').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    $$('.tab-page').forEach(p => p.hidden = p.id !== 'tab-' + tab);
    if (tab === 'stations' && prevTab !== 'stations') { window.CPSStations?.render($('#tab-stations')); return; }
    render();
  }
  function render() {
    if ($('#app').hidden) return;
    if (currentTab === 'dashboard') renderDashboard();
    else if (currentTab === 'timestudy') window.CPSTimeStudy?.render($('#tab-timestudy'));
    else if (currentTab === 'stations') { if (window.CPSWorkflow?.isOpen?.()) window.CPSWorkflow.refresh(); else window.CPSStations?.render($('#tab-stations')); }
    else if (currentTab === 'analysis') window.CPSAnalysis?.render($('#tab-analysis'));
  }

  function renderDashboard() {
    if (window.CPSDashboard) return window.CPSDashboard.render($('#tab-dashboard'), { lineBalance, lineBalanceTable, recent, levelLabel: LEVEL_LABEL[scope.level] });
    const studies = listStudies(), jobs = listJobs();
    const avgCt = studies.length ? studies.reduce((s, x) => s + num(x.ct), 0) / studies.length : 0;
    const trained = jobs.reduce((s, j) => s + (j.training || []).reduce((a, r) => a + num(r.count), 0), 0);
    const improved = jobs.filter(j => (j.after || []).length).length;
    const lb = lineBalance();
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
        ${lb.lines.length ? card('Line Balance Rate', fmt(lb.lbr) + '%', '', lb.lines.length + ' ไลน์ · ต่ำกว่า 70% ' + lb.low + ' ไลน์', lbrColor(lb.lbr)) : card('Line Balance Rate', '—', '', 'ยังไม่มีข้อมูลสถานี')}
      </div>
      ${lineBalanceTable(lb)}
      ${canEdit() ? `<div class="dash-links">
        <button class="bigbtn" data-go="timestudy"><b>⏱️ บันทึก Time Study</b><span>จับเวลา element จากวิดีโอ เก็บเฉพาะค่า</span></button>
        <button class="bigbtn" data-go="analysis"><b>🔧 วิเคราะห์งาน Before/After</b><span>เทียบก่อน/หลัง + อบรม + รายงานอัตโนมัติ</span></button>
      </div>` : ''}
      ${recent(studies, jobs)}`;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => showTab(b.dataset.go));
  }
  // สถานะของสถานีชุดเดียวทั้งแอป (ชิปในตาราง · การ์ดสรุป · แดชบอร์ด)
  function statusOf(r) {
    const w = r.wf || {}, ap = w.approval || {};
    const j = num(r.jph), load = j ? ctOf(r) / (3600 / j) * 100 : 0;
    if (w.improve === false) return load > 100 ? { key: 'decide', label: 'ต้องตัดสินใจ · ยังเกิน TAKT', alarm: true, load } : { key: 'closed', label: 'ปิด – ไม่ปรับปรุง', load };
    if (ap.submitted) { const n = Object.values(ap.flows || {}).filter(x => x && x.by).length; return n >= 5 ? { key: 'approved', label: 'อนุมัติครบ 5/5', load } : { key: 'pending', label: `รออนุมัติ ${n}/5`, load }; }
    if (w.improve === true) { const step = 4 + (w.lineBalance && w.lineBalance.saved ? 1 : 0) + (w.newOis && w.newOis.reviewed ? 1 : 0); return { key: 'progress', label: `กำลังทำ ขั้น ${step}/6`, load }; }
    const adv = advise(r);
    return adv.status === 'improve' ? { key: 'decide', label: 'ต้องตัดสินใจ', alarm: load > 100, reasons: adv.reasons, load } : adv.status === 'ok' ? { key: 'ok', label: 'ปกติ', load } : { key: 'nodata', label: 'รอข้อมูล', load };
  }
  // ---- Line Balance Rate: ไลน์ = ทีม + รุ่น/รุ่นย่อย · LBR = ΣCT ÷ (จำนวนสถานี × CT สูงสุด) × 100 ----
  const lbrColor = v => v >= 85 ? '#15856b' : v >= 70 ? '#9a5b00' : '#c0392b';
  function lineBalance() {
    const map = new Map();
    listStations().forEach(r => {
      const ct = ctOf(r); if (!ct) return;
      const k = [r.workshop, r.group, r.team, r.model || '-', r.submodel || '-'].join('§');
      if (!map.has(k)) map.set(k, { ws: r.workshop, group: r.group, team: r.team, model: r.model || '-', sub: r.submodel || '-', items: [], jph: [] });
      const g = map.get(k); g.items.push({ st: r.station, ct }); if (num(r.jph)) g.jph.push(num(r.jph));
    });
    let S = 0, D = 0;
    const lines = [...map.values()].map(g => {
      const n = g.items.length, sum = g.items.reduce((a, x) => a + x.ct, 0), max = Math.max(...g.items.map(x => x.ct));
      const neck = g.items.find(x => x.ct === max).st;
      const jph = g.jph.length ? g.jph.slice().sort((a, b) => g.jph.filter(x => x === b).length - g.jph.filter(x => x === a).length)[0] : 0;
      const tk = jph ? 3600 / jph : 0;
      S += sum; D += n * max;
      return { ...g, n, sum, max, neck, tk, lbr: sum / (n * max) * 100, eff: tk ? sum / (n * tk) * 100 : 0, over: tk ? g.items.filter(x => x.ct > tk).length : 0 };
    }).sort((a, b) => a.lbr - b.lbr);
    return { lines, lbr: D ? S / D * 100 : 0, low: lines.filter(l => l.lbr < 70).length };
  }
  function lineBalanceTable(lb) {
    if (!lb.lines.length) return '';
    const show = lb.lines.slice(0, 15);
    const area = l => [scope.level === 'team' ? '' : l.ws, scope.level === 'team' || scope.level === 'group' ? '' : l.group, scope.level === 'team' ? '' : l.team].filter(Boolean).join(' / ');
    return `<section class="panel"><div class="panelhead"><h2>Line Balance Rate รายไลน์</h2><small class="muted" title="ΣCT ÷ (จำนวนสถานี × CT สูงสุด) × 100">เรียงจากต่ำไปสูง · ${lb.lines.length} ไลน์</small></div>
      <div class="table-scroll"><table class="sb-table lbr-table"><thead><tr><th>ไลน์</th><th>รุ่น</th><th>สถานี</th><th>ΣCT</th><th>คอขวด</th><th>เกิน TAKT</th><th>เทียบ TAKT</th><th>Line Balance Rate</th></tr></thead><tbody>
      ${show.map(l => `<tr><td><b>${esc(area(l) || l.team || '—')}</b></td><td>${esc(l.model)} · ${esc(l.sub)}</td><td>${l.n}</td><td>${fmt(l.sum)} วิ</td>
        <td>${esc(l.neck)} <small class="muted">${fmt(l.max)} วิ</small></td><td>${l.over ? `<b style="color:#c0392b">${l.over}</b>` : '0'}</td><td>${l.tk ? fmt(l.eff) + '%' : '—'}</td>
        <td><div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(100, l.lbr)}%;background:${lbrColor(l.lbr)}"></i></div><span style="color:${lbrColor(l.lbr)}">${fmt(l.lbr)}%</span></div></td></tr>`).join('')}
      </tbody></table></div>${lb.lines.length > show.length ? `<p class="muted" style="padding:8px 16px">แสดง ${show.length} ไลน์ที่ต่ำสุด จาก ${lb.lines.length} ไลน์</p>` : ''}</section>`;
  }
  function card(label, val, unit, sub, color) {
    return `<div class="stat"><small>${esc(label)}</small><strong${color ? ` style="color:${color}"` : ''}>${val}<em>${unit ? ' ' + esc(unit) : ''}</em></strong>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
  }
  function recent(studies, jobs) {
    const rows = [...studies.slice(0, 5).map(s => ({ t: 'Time Study', n: s.name, d: s.date, ct: s.ct })),
    ...jobs.slice(0, 5).map(j => ({ t: 'วิเคราะห์งาน', n: j.name, d: j.date }))];
    if (!rows.length) return '<div class="blank">ยังไม่มีข้อมูลในพื้นที่นี้ เริ่มจากปุ่มด้านบน</div>';
    return `<section class="panel"><div class="panelhead"><h2>ล่าสุด</h2></div><div class="recent">${rows.map(r => `<div class="recent-row"><span class="tag">${esc(r.t)}</span><b>${ud(r.n || '—')}</b><small>${esc(dateTxt(r.d))}</small>${r.ct != null ? `<em>${fmt(r.ct)} วิ</em>` : ''}</div>`).join('')}</div></section>`;
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
    $$('#tabs button').forEach(b => b.onclick = () => { if (b.dataset.tab === currentTab && currentTab === 'stations' && window.CPSWorkflow?.isOpen?.()) { window.CPSStations.render($('#tab-stations')); return; } showTab(b.dataset.tab); });
    $('#btn-switch').onclick = () => guardLeave(() => openGate(scope));
    if ($('#gate-cancel')) $('#gate-cancel').onclick = () => openApp();
    if ($('#btn-help')) $('#btn-help').onclick = openHelp;
    // ภาษาทั้งแอป (แถบบน)
    const lg = $('#lang-global');
    if (lg && window.CPSDashI18n) {
      lg.innerHTML = window.CPSDashI18n.LANGS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
      lg.value = window.CPSDashI18n.lang;
      lg.onchange = () => { window.CPSDashI18n.set(lg.value); applyShell(); render(); };
    }
    // Ctrl+S / ⌘S บันทึกหน้าที่กำลังแก้
    addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || $('#app').hidden || document.querySelector('dialog[open]')) return;
      const b = $('#tab-' + currentTab + ' #ts-save') || $('#tab-' + currentTab + ' #an-save');
      if (b) { e.preventDefault(); b.click(); }
    });
    // ลูกศรซ้าย/ขวาสลับแท็บ (แบบ tablist มาตรฐาน)
    $('#tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const bs = $$('#tabs button'), i = bs.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); const nx = bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length]; nx.focus(); nx.click();
    });
    addEventListener('beforeunload', e => { if (window.CPSTimeStudy?.isDirty?.() || window.CPSAnalysis?.isDirty?.()) { e.preventDefault(); e.returnValue = ''; } });
    const tb = $('.topbar'), setTb = () => { if (tb && tb.offsetHeight) document.documentElement.style.setProperty('--topbar-h', tb.offsetHeight + 'px'); };
    setTb(); if (window.ResizeObserver && tb) new ResizeObserver(setTb).observe(tb);
    // every field gets a name screen readers can say; repeated row buttons say which row
    let lt; new MutationObserver(() => { clearTimeout(lt); lt = setTimeout(autoLabel, 120); }).observe(document.body, { childList: true, subtree: true });
    autoLabel(); applyShell();

    $('#login-form').onsubmit = e => { e.preventDefault(); login(); };
    $('#btn-logout').onclick = logout; $('#gate-logout').onclick = logout;

    // start
    takeSheetFromLink();
    if (!sheetUrl) $('#gate-msg').textContent = 'เครื่องนี้ยังไม่เชื่อมข้อมูลกลาง — ขอ “ลิงก์สำหรับทีม” จากผู้ดูแลระบบแล้วเปิดครั้งเดียว';
    if (sheetUrl && !accessCode && !window.CPS_READY && localStorage.getItem(NEED_KEY)) showLogin(); else startApp();
    startAutoSync();
    // ถาม server ว่าต้องใช้รหัสหรือไม่ / รหัสในเครื่องยังถูกอยู่ไหม
    if (sheetUrl) sheetFetch({ action: 'auth' }).then(r => {
      if (!r || !r.ok) return;
      if (r.sso) {                       // server ใช้การเข้าสู่ระบบของ CPS Digital Platform: ไม่มีรหัสทีม
        localStorage.removeItem(NEED_KEY);
        if (!r.valid) { ssoRefresh(); return; }
        try { sessionStorage.removeItem(SSO_RETRY); } catch (e) {}
        if (locked) { locked = false; $('#login').hidden = true; startApp(); }
        return;
      }
      if (r.need) localStorage.setItem(NEED_KEY, '1'); else localStorage.removeItem(NEED_KEY);
      if (r.need && !r.valid) showLogin(accessCode ? 'รหัสเข้าใช้งานถูกเปลี่ยน — ใส่รหัสใหม่' : '');
      else if (locked && !r.need) { locked = false; $('#login').hidden = true; startApp(); }
    }).catch(() => {});
  }

  // ---------- public API for modules ----------
  window.CPS = {
    boot,
    util: { $, $$, uid, esc, ud, num, round1, fmt, TYPES, totals, toast, ask, dateTxt },
    applyShell,
    data: {
      listStudies, listJobs, listStations, upsert, remove, removeUndo, canEdit, ctInfo, ctOf, statusOf, beforeOf,
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
