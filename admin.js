/* CPS IE Studio — หน้าหลังบ้าน (ผู้ดูแลระบบ): เชื่อม Sheet, ลิงก์สำหรับทีม, PIN, ข้อมูลสำรอง */
(() => {
  const URL_KEY = 'cps-ie-sheeturl-v1', STORE_KEY = 'cps-ie-store-v1';
  const KINDS = ['areas', 'studies', 'jobs', 'stations'];
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  const say = (id, m) => { $(id).textContent = m || ''; };

  const getUrl = () => localStorage.getItem(URL_KEY) || '';
  const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } };
  const teamLink = u => location.origin + location.pathname.replace(/admin\.html$/, '') + '#sheet=' + encodeURIComponent(u);

  async function call(params, body) {
    const u = getUrl(); if (!u) throw new Error('ยังไม่ได้บันทึก Web App URL');
    const r = await fetch(u + '?' + new URLSearchParams(params), body
      ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) } : {});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    try { return JSON.parse(await r.text()); } catch { throw new Error('ตอบกลับไม่ใช่ JSON (ตรวจการ Deploy)'); }
  }
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
  if (getUrl()) loadPinStatus();

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
