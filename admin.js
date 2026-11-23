/* CPS IE Studio — หน้าหลังบ้าน (ผู้ดูแลระบบ): เชื่อม Sheet, ลิงก์สำหรับทีม, PIN, ข้อมูลสำรอง */
(() => {
  const URL_KEY = 'cps-ie-sheeturl-v1', STORE_KEY = 'cps-ie-store-v1';
  const KINDS = ['areas', 'studies', 'jobs', 'stations'];
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  const say = (id, m) => { $(id).textContent = m || ''; };

  const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbw4oG6L_q-uWJCj3WhNPpJr6LlC7stp8UGqFjizkM3Naq30hktQCosJg6_uFF8csvVD3A/exec';
  const getUrl = () => localStorage.getItem(URL_KEY) || DEFAULT_SHEET_URL;
  const ssoTok = () => (window.cpsAppToken ? window.cpsAppToken() : '');
  const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } };
  const teamLink = u => location.origin + location.pathname.replace(/admin\.html$/, '') + '#sheet=' + encodeURIComponent(u);

  async function call(params, body) {
    const u = getUrl(); if (!u) throw new Error('ยังไม่ได้บันทึก Web App URL');
    const a = adminCode(); if (a) params = Object.assign({}, params, { admin: a });
    if (window.CPS_READY) await window.CPS_READY;
    const st = ssoTok(); if (st) params = Object.assign({}, params, { sso: st });
    const r = await fetch(u + '?' + new URLSearchParams(params), body
      ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) } : {});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let res; try { res = JSON.parse(await r.text()); } catch { throw new Error('ตอบกลับไม่ใช่ JSON (ตรวจการ Deploy)'); }
    if (res && res.code === 'AUTH_ADMIN' && adminCode()) { admLogout(); say('#st-adm', 'รหัสผู้ดูแลไม่ถูกต้องหรือถูกเปลี่ยน — เข้าสู่ระบบใหม่'); }
    return res;
  }

  // ---- เข้า/ออกระบบผู้ดูแล (เก็บรหัสไว้เฉพาะแท็บนี้ ปิดแท็บ = ออกจากระบบ) ----
  const ADM_KEY = 'cps-ie-admin';
  function adminCode() { try { return sessionStorage.getItem(ADM_KEY) || ''; } catch { return ''; } }
  function showTeamState(set) { $('#team-state').textContent = set ? 'สถานะ: ตั้งรหัสทีมแล้ว ✓ (ผู้ใช้ต้องใส่รหัสก่อนใช้งาน)' : 'สถานะ: ยังไม่ตั้งรหัสทีม — ใครมีลิงก์ก็ใช้งานได้'; }
  function admLogout() {
    try { sessionStorage.removeItem(ADM_KEY); } catch {}
    $('#priv').hidden = true; $('#adm-out').hidden = true; $('#adm-go').hidden = false; $('#adm-code').hidden = false;
  }
  async function admLogin(code) {
    if (!getUrl()) { say('#st-adm', 'บันทึก Web App URL ในข้อ 1 ก่อน'); return; }
    try { sessionStorage.setItem(ADM_KEY, code); } catch {}
    say('#st-adm', 'กำลังตรวจรหัส…');
    try {
      const r = await call({ action: 'adminauth' });
      if (!r.ok) { try { sessionStorage.removeItem(ADM_KEY); } catch {} say('#st-adm', r.error || 'เข้าสู่ระบบไม่สำเร็จ'); return; }
      $('#priv').hidden = false; $('#adm-out').hidden = false; $('#adm-go').hidden = true; $('#adm-code').hidden = true; $('#adm-code').value = '';
      say('#st-adm', 'เข้าสู่ระบบผู้ดูแลแล้ว'); showTeamState(r.teamSet); loadPinStatus();
    } catch (e) { try { sessionStorage.removeItem(ADM_KEY); } catch {} say('#st-adm', 'เข้าสู่ระบบไม่สำเร็จ: ' + e.message); }
  }
  $('#adm-form').onsubmit = e => { e.preventDefault(); const c = $('#adm-code').value.trim(); if (c) admLogin(c); };
  $('#adm-out').onclick = () => { admLogout(); say('#st-adm', 'ออกจากระบบแล้ว'); };
  async function setTeam(code) {
    say('#st-team', 'กำลังบันทึก…');
    try {
      const r = await call({ action: 'setteamcode' }, { code });
      if (!r.ok) throw new Error(r.error || 'ตอบกลับผิดปกติ');
      $('#team-code').value = ''; showTeamState(r.teamSet);
      say('#st-team', r.teamSet ? 'บันทึกรหัสทีมแล้ว — ผู้ใช้ทุกเครื่องต้องใส่รหัสนี้' : 'ยกเลิกรหัสทีมแล้ว — เปิดให้ทุกคนที่มีลิงก์');
    } catch (e) { say('#st-team', 'บันทึกไม่สำเร็จ: ' + e.message); }
  }
  $('#team-form').onsubmit = e => {
    e.preventDefault(); const c = $('#team-code').value.trim();
    if (c.length < 6) { say('#st-team', 'รหัสทีมต้องยาวอย่างน้อย 6 ตัว'); return; }
    if (confirm('ตั้ง/เปลี่ยนรหัสทีม? ผู้ใช้ทุกเครื่องจะต้องใส่รหัสใหม่')) setTeam(c);
  };
  $('#team-clear').onclick = () => { if (confirm('ยกเลิกรหัสทีม? ใครที่มีลิงก์สำหรับทีมจะเข้าใช้งานได้โดยไม่ต้องใส่รหัส')) setTeam(''); };
  function download(obj, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const today = () => new Date().toISOString().slice(0, 10);

  // 1) เชื่อมต่อ
  $('#url').value = getUrl();
  $('#save').onclick = () => {
    const u = $('#url').value.trim();
    if (u && !URL_RE.test(u)) { say('#st-url', 'URL ไม่ถูกต้อง ต้องเป็น https://script.google.com/macros/s/…/exec'); return; }
    localStorage.setItem(URL_KEY, u); say('#st-url', u ? 'บันทึกแล้ว' : 'ล้าง URL แล้ว'); $('#link').hidden = true;
  };
  $('#test').onclick = async () => {
    $('#save').click(); if (!getUrl()) return;
    say('#st-url', 'กำลังทดสอบ…');
    try { const r = await call({ action: 'ping' }); say('#st-url', r.ok ? 'เชื่อมต่อสำเร็จ ✓' : 'ตอบกลับผิดปกติ: ' + (r.error || '')); }
    catch (e) { say('#st-url', 'เชื่อมต่อไม่สำเร็จ: ' + e.message); }
  };
  $('#copy').onclick = async () => {
    $('#save').click(); const u = getUrl(); if (!u) return;
    const link = teamLink(u); $('#link').textContent = link; $('#link').hidden = false;
    try { await navigator.clipboard.writeText(link); say('#st-url', 'คัดลอกลิงก์สำหรับทีมแล้ว'); }
    catch { say('#st-url', 'คัดลอกอัตโนมัติไม่ได้ — คัดลอกจากกล่องด้านบนเอง'); }
  };

  // 2) นับข้อมูล
  const LABEL = { areas: 'พื้นที่', studies: 'รอบจับเวลา (Time Study)', jobs: 'งานวิเคราะห์', stations: 'สถานี' };
  async function fetchAll() {
    const res = await Promise.all(KINDS.map(k => call({ action: 'list', sheet: k })));
    const out = {}; KINDS.forEach((k, i) => { if (!res[i].ok) throw new Error(res[i].error || k); out[k] = res[i].rows || []; });
    return out;
  }
  $('#count').onclick = async () => {
    $('#counts').innerHTML = '<p class="muted">กำลังนับ…</p>';
    try { const d = await fetchAll(); $('#counts').innerHTML = KINDS.map(k => `<div class="stat"><small>${LABEL[k]}</small><strong>${d[k].length}</strong></div>`).join(''); }
    catch (e) { $('#counts').innerHTML = `<p class="muted">นับไม่สำเร็จ: ${e.message}</p>`; }
  };

  // 3) PIN กลาง (เก็บที่ server) — แสดงแค่ว่าฝ่ายไหนตั้งแล้ว ไม่ดึงค่า PIN กลับมา
  function showPinStatus(st) {
    $$('[data-pin]').forEach(i => { i.placeholder = st && st[i.dataset.pin] ? 'ตั้งแล้ว ✓ (เว้นว่าง = ไม่เปลี่ยน)' : 'ยังไม่ได้ตั้ง'; });
  }
  async function loadPinStatus() {
    if (!getUrl()) { say('#st-pin', 'บันทึก Web App URL ก่อน'); return; }
    try { const r = await call({ action: 'pinstatus' }); if (!r.ok) throw new Error(r.error || 'ตอบกลับผิดปกติ'); showPinStatus(r.status); say('#st-pin', ''); }
    catch (e) { say('#st-pin', 'ดูสถานะ PIN ไม่สำเร็จ: ' + e.message); }
  }
  $('#pin-check').onclick = loadPinStatus;
  $('#pin-save').onclick = async () => {
    const pins = {}; $$('[data-pin]').forEach(i => { const v = i.value.trim(); if (v) pins[i.dataset.pin] = v; });
    if (!Object.keys(pins).length) { say('#st-pin', 'ยังไม่ได้กรอก PIN ช่องไหน'); return; }
    say('#st-pin', 'กำลังบันทึก…');
    try {
      const r = await call({ action: 'setpins' }, { pins }); if (!r.ok) throw new Error(r.error || 'ตอบกลับผิดปกติ');
      $$('[data-pin]').forEach(i => i.value = ''); showPinStatus(r.status); say('#st-pin', `บันทึกแล้ว ${r.saved} ฝ่าย — ใช้ได้ทุกเครื่องทันที`);
    } catch (e) { say('#st-pin', 'บันทึกไม่สำเร็จ: ' + e.message); }
  };
  // CPS SSO: ผู้ที่มีสิทธิ์ IE Digital Program (Admin) ใน CPS Digital Platform เข้าหลังบ้านได้เลย ไม่ต้องใส่รหัสผู้ดูแล
  async function ssoAdmin() {
    try {
      if (window.CPS_READY) await window.CPS_READY;
      if (!ssoTok()) return;
      const r = await call({ action: 'adminauth' });
      if (!r.ok || !r.sso) return;
      $('#priv').hidden = false; $('#adm-go').hidden = true; $('#adm-code').hidden = true;
      say('#st-adm', 'เข้าสู่ระบบผ่าน CPS Digital Platform แล้ว'); loadPinStatus();
      $('#team-state').textContent = 'สถานะ: ใช้การเข้าสู่ระบบของ CPS Digital Platform — ไม่ใช้รหัสทีม';
    } catch (e) { /* ใช้ฟอร์มรหัสผู้ดูแลตามเดิม */ }
  }
  if (adminCode()) admLogin(adminCode()); else ssoAdmin();

  // 4) ข้อมูลสำรอง
  $('#exp-sheet').onclick = async () => {
    say('#st-bak', 'กำลังดึงจาก Sheet…');
    try { const d = await fetchAll(); download(d, 'cps-ie-sheet-backup-' + today() + '.json'); say('#st-bak', 'ส่งออกแล้ว'); }
    catch (e) { say('#st-bak', 'ส่งออกไม่สำเร็จ: ' + e.message); }
  };
  $('#exp-local').onclick = () => {
    const s = readStore(); const out = {}; KINDS.forEach(k => out[k] = s[k] || []);
    download(out, 'cps-ie-device-backup-' + today() + '.json'); say('#st-bak', 'ส่งออกแล้ว (ไม่รวม PIN)');
  };
  $('#imp').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const d = JSON.parse(rd.result); if (!d || !Array.isArray(d.studies)) throw new Error('ไฟล์ไม่ถูกต้อง');
        const body = {}; let n = 0; KINDS.forEach(k => { body[k] = Array.isArray(d[k]) ? d[k] : []; n += body[k].length; });
        if (!confirm(`นำเข้า ${n} รายการขึ้น Sheet? (เพิ่ม/อัปเดตตาม id ไม่ลบของเดิม)`)) return;
        say('#st-bak', 'กำลังนำเข้า…');
        const r = await call({ action: 'bulk' }, body);
        say('#st-bak', r.ok ? `นำเข้าแล้ว ${r.bulk} รายการ` : 'นำเข้าไม่สำเร็จ: ' + (r.error || ''));
      } catch (err) { say('#st-bak', 'นำเข้าไม่สำเร็จ: ' + err.message); }
      e.target.value = '';
    };
    rd.readAsText(f);
  };
})();
