/**
 * CPS IE Studio — Google Apps Script backend (Google Sheet เป็นฐานข้อมูล)
 * ----------------------------------------------------------------------
 * วิธีใช้ (ย่อ — ดูละเอียดใน README.md):
 *   1) เปิด Google Sheet ใหม่ → เมนู Extensions → Apps Script
 *   2) ลบโค้ดเดิม แล้ววางไฟล์นี้ทั้งหมด → Save
 *   3) Deploy → New deployment → เลือก "Web app"
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   4) คัดลอก URL ที่ลงท้าย /exec ไปวางในแอป (ปุ่มตั้งค่า Google Sheet)
 *
 * รองรับ: ping, list, upsert, delete, bulk  (sheet = studies | jobs | areas)
 * เก็บข้อมูลเป็น JSON ต่อแถว + คอลัมน์อ่านง่าย (name/date/scope) ไว้ดูใน Sheet
 */

var SHEETS = {
  studies: ['id', 'workshop', 'group', 'team', 'name', 'operator', 'date', 'ct', 'vaPct', 'updatedAt', 'json'],
  jobs:    ['id', 'workshop', 'group', 'team', 'name', 'line', 'date', 'updatedAt', 'json'],
  stations:['id', 'workshop', 'group', 'team', 'model', 'submodel', 'station', 'jph', 'ct', 'ois', 'oisDesc', 'updatedAt', 'json'],
  areas:   ['workshop', 'group', 'team']
};

function doGet(e)  { return handle(e, e.parameter, null); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {}
  return handle(e, e.parameter, body);
}

function handle(e, p, body) {
  try {
    var action = (p && p.action) || 'ping';
    if (action === 'ping') return json({ ok: true, app: 'CPS IE Studio' });
    if (action === 'auth') return json(authInfo_(p));
    var deny = auth_(p, action); if (deny) return json(deny);
    if (action === 'adminauth') return json(adminInfo_());
    if (action === 'setteamcode') return json(setTeamCode_(body));

    if (action === 'list')   return json({ ok: true, rows: listRows(p.sheet) });
    if (action === 'upsert') return json({ ok: true, row: upsertRow(p.sheet, body) });
    if (action === 'delete') return json({ ok: true, deleted: deleteRow(p.sheet, body.id) });
    if (action === 'bulk')   return json({ ok: true, bulk: bulkWrite(body) });
    if (action === 'ai')     return json(analyzeFrames(body));
    if (action === 'models') return json(modelsInfo());
    if (action === 'aisuggest') return json(suggestDraft(body));
    if (action === 'transcribe') return json(transcribeAudio(body));
    if (action === 'aidetail') return json(detailDraft(body));
    if (action === 'setpins') return json(setPins(body));
    if (action === 'pinstatus') return json(pinStatus());
    if (action === 'approve') return json(checkPin(body));

    return json({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheetFor(name) {
  if (!SHEETS[name]) throw new Error('bad sheet: ' + name);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(SHEETS[name]); }
  if (sh.getLastRow() === 0) sh.appendRow(SHEETS[name]);
  return sh;
}

function listRows(name) {
  var sh = sheetFor(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var jsonCol = header.indexOf('json');
  var out = [];
  for (var i = 1; i < values.length; i++) {
    if (jsonCol > -1 && values[i][jsonCol]) {
      try { out.push(JSON.parse(values[i][jsonCol])); continue; } catch (e) {}
    }
    var obj = {};
    for (var c = 0; c < header.length; c++) obj[header[c]] = values[i][c];
    out.push(obj);
  }
  return out;
}

function upsertRow(name, rec) {
  var sh = sheetFor(name);
  var header = SHEETS[name];
  var row = header.map(function (col) {
    if (col === 'json') return JSON.stringify(rec);
    return rec[col] != null ? rec[col] : '';
  });
  if (name === 'areas') {
    // de-dup by workshop/group/team
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++)
      if (vals[i][0] === rec.workshop && vals[i][1] === rec.group && vals[i][2] === rec.team) return rec;
    sh.appendRow(row);
    return rec;
  }
  var idCol = header.indexOf('id');
  var data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][idCol] === rec.id) { sh.getRange(r + 1, 1, 1, row.length).setValues([row]); return rec; }
  }
  sh.appendRow(row);
  return rec;
}

function deleteRow(name, id) {
  var sh = sheetFor(name);
  var header = SHEETS[name];
  var idCol = header.indexOf('id');
  if (idCol < 0) return false;
  var data = sh.getDataRange().getValues();
  for (var r = data.length - 1; r >= 1; r--) {
    if (data[r][idCol] === id) { sh.deleteRow(r + 1); return true; }
  }
  return false;
}

function bulkWrite(body) {
  var n = 0;
  ['areas', 'studies', 'jobs', 'stations'].forEach(function (k) {
    (body[k] || []).forEach(function (rec) { upsertRow(k, rec); n++; });
  });
  return n;
}

/* ----------------------------------------------------------------------
 * AI: วิเคราะห์เฟรมภาพจากวิดีโอด้วย Google Gemini (action=ai)
 * ตั้งค่าที่ ⚙ Project Settings → Script properties
 *   GEMINI_KEY   = API key จาก https://aistudio.google.com/app/apikey   (จำเป็น)
 *   GEMINI_MODEL = ชื่อโมเดล (ไม่ใส่จะใช้ค่าเริ่มต้นด้านล่าง — ตรวจชื่อรุ่นปัจจุบันใน AI Studio)
 * หลังแก้โค้ดต้อง Deploy → Manage deployments → Edit → Version: New version
 * ---------------------------------------------------------------------- */
var DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

function analyzeFrames(body) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_KEY');
  if (!key) return { ok: false, error: 'ยังไม่ได้ตั้ง GEMINI_KEY ใน Script properties' };
  var model = props.getProperty('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  var frames = (body && body.frames) || [];
  if (!frames.length) return { ok: false, error: 'ไม่มีเฟรมภาพ' };

  var prompt =
    'คุณเป็นวิศวกรอุตสาหการ (IE) วิเคราะห์ Time Study จากภาพนิ่งที่ตัดจากวิดีโอการทำงาน 1 คลิป\n' +
    'ความยาวคลิป ' + body.duration + ' วินาที' + (body.name ? ' ชื่องาน: ' + body.name : '') + '\n' +
    'แต่ละภาพมีป้ายเวลา (วินาที) นำหน้า เรียงตามลำดับเวลา\n\n' +
    hints_(body) +
    'งานของคุณ:\n' +
    '1) แบ่งงานเป็น element ต่อเนื่องกันตามลำดับเวลา ให้ start/end เป็นวินาที ครอบคลุมทั้งคลิป ไม่ซ้อนกัน\n' +
    '2) ตั้งชื่อ element เป็นภาษาไทย สั้น กระชับ บอกการกระทำและชิ้นงาน\n' +
    '3) จำแนก type: VA = เปลี่ยนรูป/ประกอบชิ้นงานโดยตรง, NNVA = จำเป็นแต่ไม่เพิ่มคุณค่า (หยิบ วาง ตรวจ เดินที่เลี่ยงไม่ได้), NVA = สูญเปล่า (รอ ค้นหา เดินเกินจำเป็น ทำซ้ำ)\n' +
    '4) ให้คะแนนความง่าย 1-5 (1 ยากสุด 5 ง่ายสุด) เฉพาะมิติที่เกิดขึ้นใน element นั้น ไม่เกิดให้ใส่ 0:\n' +
    '   t หมุนตัว: 180-270 องศา=3, 90-180 องศา=4\n' +
    '   u ยกแขน: สูงกว่าศีรษะ=1, ศอกสูงกว่าไหล่=2, ศอกใกล้ไหล่=3, ศอกต่ำกว่าไหล่=4, ระหว่างไหล่-เอว=5\n' +
    '   v ก้มหลัง: 90 องศา=1, 60-90=2, 45-60=3, 30-45=4, 0-30=5\n' +
    '   w ของหนัก: 3-5 กก.=3, 2-3 กก.=4\n' +
    '5) สรุป ergo: risk เป็น low/medium/high และ notes เป็นภาษาไทย ระบุท่าทางเสี่ยงที่เห็นพร้อม element ที่เกี่ยวข้อง\n\n' +
    'ถ้ามองไม่ชัดให้ประมาณอย่างระมัดระวัง ห้ามแต่งรายละเอียดที่ไม่เห็นในภาพ\n' +
    'ตั้งชื่อ element ตามการกระทำที่เห็นในภาพหรือได้ยินในคำบรรยายเท่านั้น ห้ามเดาเหตุผลหรือสิ่งที่รอ\n' +
    'ช่วงที่ผู้ปฏิบัติงานยืนรอ ให้ตั้งชื่อว่า "ยืนรอ step ถัดไป" เว้นแต่ภาพหรือคำบรรยายบอกชัดว่ารออะไร (ห้ามสรุปเองว่ารอรถคันถัดไป)\n' +
    'steps: จำนวนก้าวเดินใน element นั้น นับเฉพาะการเดินเปลี่ยนตำแหน่ง (ยืนหมุนตัวไม่นับ) ไม่ได้เดินใส่ 0 · ถ้าไม่เห็นเท้า ให้ดูการเดินจากลำตัวที่เคลื่อนที่ ฉากหลังที่เลื่อน หรือมุมกล้องที่เปลี่ยน แล้วประมาณจากเวลาที่เดินจริง × 1.8 ก้าวต่อวินาที\n' +
    'ตอบเป็น JSON เท่านั้น รูปแบบ: {"elements":[{"name":"","start":0,"end":0,"type":"VA","t":0,"u":0,"v":0,"w":0,"steps":0}],"ergo":{"risk":"low","notes":""}}';

  var parts = [{ text: prompt }];
  frames.forEach(function (f) {
    parts.push({ text: 't=' + f.t + 's' });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: f.data } });
  });

  var lvl = thinkingLevel_(body);
  var payloadPlain = JSON.stringify({ contents: [{ parts: parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
  var payload = lvl ? JSON.stringify({ contents: [{ parts: parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2, thinkingConfig: { thinkingLevel: lvl } } }) : payloadPlain;
  // เรียกโมเดลหนึ่งตัว พร้อมลองซ้ำอัตโนมัติเมื่อไม่ว่างชั่วคราว (429/500/503)
  function callModel(m, waits) {
    var code = 0, text = '', pl = payload;
    for (var i = 0; i <= waits.length; i++) {
      var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-goog-api-key': key },
        payload: pl,
        muteHttpExceptions: true
      });
      code = res.getResponseCode();
      text = res.getContentText();
      // โมเดลบางรุ่นไม่รับระดับการคิดที่ตั้งไว้ → ส่งใหม่แบบไม่ตั้งค่า
      if (code === 400 && pl !== payloadPlain && /thinking/i.test(text)) { pl = payloadPlain; i--; continue; }
      if (code !== 429 && code !== 500 && code !== 503) break;
      if (i < waits.length) Utilities.sleep(waits[i]);
    }
    return { code: code, text: text };
  }
  var tried = [];
  var r = callModel(model, [4000]); tried.push(model + '=' + r.code);
  // ถ้าโมเดลหลักไม่ว่างหรือเลิกใช้ ให้ลองโมเดล flash ตัวอื่นที่บัญชีนี้ใช้ได้
  if (r.code === 429 || r.code === 500 || r.code === 503 || r.code === 404) {
    var alts = listFlashModels(key, model);
    for (var a = 0; a < alts.length && a < 3 && r.code !== 200; a++) { model = alts[a]; r = callModel(model, []); tried.push(model + '=' + r.code); }
  }
  var code = r.code, text = r.text;
  if (code !== 200) return geminiFail_(code, text, tried);
  try {
    var data = JSON.parse(text);
    var out = data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
    var parsed = JSON.parse(out);
    return { ok: true, model: model, thinking: lvl || 'DEFAULT', elements: parsed.elements || [], ergo: parsed.ergo || null };
  } catch (err) {
    return { ok: false, error: 'อ่านผล AI ไม่ได้: ' + String(err && err.message || err) };
  }
}

// รายชื่อโมเดลตระกูล flash ที่ key นี้เรียก generateContent ได้ (ไม่รวมโมเดลภาพ/เสียง/embedding)
function listFlashModels(key, exclude) {
  try {
    var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return [];
    var list = (JSON.parse(res.getContentText()).models || []).filter(function (m) {
      var n = String(m.name || '').replace('models/', '');
      return (m.supportedGenerationMethods || []).indexOf('generateContent') > -1 && /flash/i.test(n) && !/(image|tts|audio|live|embed|robotic|computer)/i.test(n) && n !== exclude;
    }).map(function (m) { return String(m.name).replace('models/', ''); });
    // รุ่นใหม่ก่อน ข้ามรุ่น preview/lite และรุ่นเก่ากว่า 3
    var ver = function (n) { var m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
    list = list.filter(function (n) { return !/(preview|lite|omni|latest)/i.test(n) && ver(n) >= 3; }).sort(function (a, b) { return ver(b) - ver(a); });
    return list;
  } catch (err) { return []; }
}
function modelsInfo() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_KEY');
  if (!key) return { ok: false, error: 'ยังไม่ได้ตั้ง GEMINI_KEY ใน Script properties' };
  return { ok: true, current: props.getProperty('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL, flash: listFlashModels(key, '') };
}

/* ----------------------------------------------------------------------
 * AI: ร่างข้อสังเกตหน้างาน ข้อเสนอ 4M1E และเป้าหมายคะแนน จากข้อมูลที่บันทึกแล้ว (action=aisuggest)
 * ส่งเฉพาะตัวเลขและข้อความ ไม่ส่งภาพ
 * ---------------------------------------------------------------------- */
function geminiText_(prompt, extraParts) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_KEY');
  if (!key) return { ok: false, error: 'ยังไม่ได้ตั้ง GEMINI_KEY ใน Script properties' };
  var model = props.getProperty('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  var lvl = thinkingLevel_(null);
  var payloadPlain = JSON.stringify({ contents: [{ parts: [{ text: prompt }].concat(extraParts || []) }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3 } });
  var payload = lvl ? JSON.stringify({ contents: [{ parts: [{ text: prompt }].concat(extraParts || []) }], generationConfig: { responseMimeType: 'application/json', temperature: 0.3, thinkingConfig: { thinkingLevel: lvl } } }) : payloadPlain;
  var call = function (m, waits) {
    var code = 0, text = '', pl = payload;
    for (var i = 0; i <= waits.length; i++) {
      var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent', {
        method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: pl, muteHttpExceptions: true
      });
      code = res.getResponseCode(); text = res.getContentText();
      if (code === 400 && pl !== payloadPlain && /thinking/i.test(text)) { pl = payloadPlain; i--; continue; }
      if (code !== 429 && code !== 500 && code !== 503) break;
      if (i < waits.length) Utilities.sleep(waits[i]);
    }
    return { code: code, text: text };
  };
  var tried = [];
  var r = call(model, [4000]); tried.push(model + '=' + r.code);
  if (r.code === 429 || r.code === 500 || r.code === 503 || r.code === 404) {
    var alts = listFlashModels(key, model);
    for (var a = 0; a < alts.length && a < 3 && r.code !== 200; a++) { model = alts[a]; r = call(model, []); tried.push(model + '=' + r.code); }
  }
  if (r.code !== 200) return geminiFail_(r.code, r.text, tried);
  try {
    var data = JSON.parse(r.text);
    var out = data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
    return { ok: true, model: model, data: JSON.parse(out) };
  } catch (err) {
    return { ok: false, error: 'อ่านผล AI ไม่ได้: ' + String(err && err.message || err) };
  }
}

function suggestDraft(body) {
  var prompt =
    'คุณเป็นวิศวกรอุตสาหการ (IE) ที่ทำงานปรับปรุงสถานีงานในสายประกอบรถยนต์\n' +
    'ด้านล่างคือข้อมูลจริงที่บันทึกจาก Time Study และการวิเคราะห์ของสถานีหนึ่ง (JSON)\n' +
    'คะแนนความง่าย 1-5: 1 = ยากสุด 5 = ง่ายสุด มิติ t หมุนตัว, u ยกแขน, v ก้มหลัง, w ของหนัก, avg รวม · คะแนน ≤3 คือจุดต้องปรับปรุง\n' +
    'ประเภทขั้นตอน: VA เพิ่มคุณค่า, NNVA จำเป็นแต่ไม่เพิ่มคุณค่า, NVA สูญเปล่า\n\n' +
    JSON.stringify(body) + '\n\n' +
    'ให้ร่างเป็นภาษาไทย กระชับ ใช้ได้จริงหน้างาน:\n' +
    '1) observe: ข้อสังเกตหน้างาน 2-5 ข้อ แต่ละข้อมี item (หัวข้อ), now (สภาพปัจจุบันที่เห็นจากข้อมูล), effect (ผลต่อความง่ายหรือรอบเวลา) โดยอ้างชื่อขั้นตอนและตัวเลขจากข้อมูล\n' +
    '2) suggest: ข้อเสนอปรับปรุง 3-6 ข้อ แต่ละข้อมี cat (man|machine|material|method|env), text (สิ่งที่ต้องทำ), prio (P1 ทำได้เร็ว ต้นทุนต่ำ | P2 ระยะกลาง | P3 ระยะยาว ลงทุนสูง)\n' +
    '3) targets: เป้าหมายคะแนนรายมิติ t,u,v,w,avg แต่ละตัวมี goal (ตัวเลข ไม่ต่ำกว่าคะแนนปัจจุบัน ไม่เกิน 5) และ act (มาตรการหลัก) · ข้ามมิติที่ไม่มีคะแนนปัจจุบัน\n\n' +
    'ห้ามแต่งข้อมูลที่ไม่มีในข้อมูลที่ให้ เช่น ชื่อเครื่องมือ ระยะทาง น้ำหนัก ถ้าไม่ระบุไว้ ให้เขียนเป็นแนวทางทั่วไปแทน\n' +
    'ตอบเป็น JSON เท่านั้น รูปแบบ: {"observe":[{"item":"","now":"","effect":""}],"suggest":[{"cat":"method","text":"","prio":"P1"}],"targets":{"t":{"goal":4,"act":""}}}';
  var r = geminiText_(prompt);
  if (!r.ok) return r;
  var d = r.data || {};
  return { ok: true, model: r.model, observe: d.observe || [], suggest: d.suggest || [], targets: d.targets || {} };
}

/* ----------------------------------------------------------------------
 * เสียง: ข้อมูลเสริมช่วยแยก element (เสียงเครื่องมือจากแอป + คำพูดบรรยายที่ถอดแล้ว)
 * ---------------------------------------------------------------------- */
function hints_(body) {
  var out = '';
  var snd = (body && body.sound) || [];
  if (snd.length) out += 'ข้อมูลเสริมจากเสียง: ช่วงที่มีเสียงเครื่องมือดังเด่น (วินาที เริ่ม-จบ) ' + JSON.stringify(snd) + '\n' +
    'ช่วงเสียงเครื่องมือมักเป็นจังหวะใช้เครื่องมือจริง (เช่น ขันน็อต) ให้ใช้ขอบช่วงเสียงช่วยกำหนดเวลาเริ่ม/จบ element ให้แม่นขึ้น แต่ต้องสอดคล้องกับภาพด้วย\n';
  var sp = (body && body.speech) || [];
  if (sp.length) out += 'คำพูดบรรยายในคลิปพร้อมเวลา: ' + JSON.stringify(sp) + '\n' +
    'ถ้าผู้พูดบอกชื่อขั้นตอน ให้ใช้ชื่อและจังหวะเวลานั้นเป็นหลักในการตั้งชื่อและแบ่ง element\n';
  return out ? out + '\n' : '';
}

function transcribeAudio(body) {
  if (!body || !body.audio) return { ok: false, error: 'ไม่มีข้อมูลเสียง' };
  var prompt =
    'ถอดเสียงพูดจากคลิปบันทึกการทำงานในโรงงาน (ภาษาไทย อาจมีจีนหรืออังกฤษปน) ความยาวประมาณ ' + body.duration + ' วินาที\n' +
    'ให้เฉพาะคำพูดของคน ข้ามเสียงเครื่องจักรและเสียงรบกวน แบ่งเป็นช่วงสั้น ๆ พร้อมเวลาเริ่ม/จบเป็นวินาทีจากต้นคลิป\n' +
    'ถ้าไม่มีเสียงพูดเลยให้คืนรายการว่าง ห้ามแต่งคำพูดที่ไม่ได้ยิน\n' +
    'ตอบเป็น JSON เท่านั้น รูปแบบ: {"speech":[{"start":0,"end":0,"text":""}]}';
  var r = geminiText_(prompt, [{ inline_data: { mime_type: body.mime || 'audio/wav', data: body.audio } }]);
  if (!r.ok) return r;
  return { ok: true, model: r.model, speech: (r.data && r.data.speech) || [] };
}

// ระดับการคิดของโมเดล Gemini 3 (ยิ่งต่ำยิ่งตอบเร็ว) ตั้งที่ Script property GEMINI_THINKING = MINIMAL | LOW | MEDIUM | HIGH | DEFAULT (ไม่ตั้ง = DEFAULT ใช้ค่าตั้งต้นของโมเดล แม่นที่สุด)
function thinkingLevel_(body) {
  var v = String((body && body.thinking) || PropertiesService.getScriptProperties().getProperty('GEMINI_THINKING') || 'DEFAULT').toUpperCase();
  if (v === 'DEFAULT') return '';
  return ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH'].indexOf(v) > -1 ? v : '';
}

/* ----------------------------------------------------------------------
 * AI คำขอที่ 2 (action=aidetail): ร่างแบบงาน เวลาเครื่อง และมือซ้าย/ขวา ของ element ที่แบ่งไว้แล้ว
 * แยกจากคำขอแรกเพื่อไม่ให้แต่ละคำขอเกินเวลา 6 นาทีของ Apps Script
 * ---------------------------------------------------------------------- */
function detailDraft(body) {
  var frames = (body && body.frames) || [];
  var els = (body && body.elements) || [];
  if (!frames.length || !els.length) return { ok: false, error: 'ไม่มีภาพหรือรายการ element' };
  var prompt =
    'คุณเป็นวิศวกรอุตสาหการ (IE) ด้านล่างคือรายการ element ที่แบ่งไว้แล้วจากคลิปการทำงาน (i = ลำดับ, เวลาเป็นวินาที) และภาพนิ่งจากคลิปพร้อมป้ายเวลา\n' +
    JSON.stringify(els) + '\n\n' +
    'สำหรับทุก element ให้ระบุ (ดูจากภาพในช่วงเวลาของ element นั้น):\n' +
    'kind: manual = คนทำด้วยมือ/เครื่องมือมือถือ, walk = เดินเปลี่ยนตำแหน่ง, wait = ยืนรอ, auto = คนสั่งงานแล้วเครื่องจักร/หุ่นยนต์ทำต่อเอง\n' +
    'mach: เวลาที่เครื่องจักรทำงานเองหลังจบ element นั้น (วินาที) ใส่เฉพาะ kind=auto นอกนั้น 0\n' +
    'lh / rh: สิ่งที่มือซ้าย / มือขวาทำ (d = คำอธิบายสั้น ๆ ภาษาไทย, s = O ทำงาน | T เคลื่อนย้ายมือหรือถือของเคลื่อนที่ | D มือว่าง/รอ | H ถือค้างไว้เฉย ๆ | I ตรวจสอบ) ถ้ามองไม่เห็นมือข้างใดชัด ให้เดาอย่างระมัดระวังจากท่าทางลำตัว\n' +
    'ห้ามแต่งรายละเอียดที่ไม่เห็นในภาพ ต้องตอบครบทุก i\n' +
    'ตอบเป็น JSON เท่านั้น รูปแบบ: {"items":[{"i":0,"kind":"manual","mach":0,"lh":{"d":"","s":"O"},"rh":{"d":"","s":"O"}}]}';
  var parts = [];
  frames.forEach(function (f) { parts.push({ text: 't=' + f.t + 's' }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: f.data } }); });
  var r = geminiText_(prompt, parts);
  if (!r.ok) return r;
  return { ok: true, model: r.model, items: (r.data && r.data.items) || [] };
}

/* ----------------------------------------------------------------------
 * PIN ผู้อนุมัติ (กลาง): เก็บใน Script Properties (PIN_<flow>) ไม่อยู่ใน Sheet
 * setpins = ผู้ดูแลตั้ง/เปลี่ยน PIN · pinstatus = ฝ่ายไหนตั้งแล้ว (ไม่ส่งค่า PIN ออก)
 * approve = ตรวจ PIN ที่ server · ผิด 5 ครั้งล็อก 10 นาที
 * ---------------------------------------------------------------------- */
var PIN_FLOWS = ['reviewer', 'safety', 'quality', 'process', 'manager'];
function setPins(body) {
  var pins = (body && body.pins) || {}, props = PropertiesService.getScriptProperties(), n = 0;
  PIN_FLOWS.forEach(function (f) {
    var v = pins[f]; if (v == null) return; v = String(v).trim(); if (!v) return;
    props.setProperty('PIN_' + f, v); n++;
  });
  return { ok: true, saved: n, status: pinStatus().status };
}
function pinStatus() {
  var props = PropertiesService.getScriptProperties(), st = {};
  PIN_FLOWS.forEach(function (f) { st[f] = !!props.getProperty('PIN_' + f); });
  return { ok: true, status: st };
}
function checkPin(body) {
  var f = body && body.flow;
  if (PIN_FLOWS.indexOf(f) < 0) return { ok: false, error: 'bad flow' };
  var pin = PropertiesService.getScriptProperties().getProperty('PIN_' + f);
  if (!pin) return { ok: true, set: false, valid: false };
  var cache = CacheService.getScriptCache(), k = 'pinfail_' + f, n = +(cache.get(k) || 0);
  if (n >= 5) return { ok: true, set: true, valid: false, locked: true };
  var valid = String((body && body.pin) || '').trim() === pin;
  if (valid) cache.remove(k); else cache.put(k, String(n + 1), 600);
  return { ok: true, set: true, valid: valid };
}

/* ----------------------------------------------------------------------
 * แยกสาเหตุที่ Gemini ไม่ตอบ: โควตาฟรีรายวันหมด / เครดิตหมด → code AI_FREE_OUT (แอปแจ้งเตือน "AI Free out of Credit")
 * 429 แบบรายนาที = ไม่ว่างชั่วคราว → code AI_BUSY
 * ---------------------------------------------------------------------- */
function geminiFail_(code, text, tried) {
  text = String(text || '');
  var detail = 'Gemini HTTP ' + code + ' (ลองแล้ว: ' + (tried || []).join(', ') + '): ' + text.slice(0, 300);
  if (code === 429) {
    var perDay = /PerDay/i.test(text), perMin = /PerMinute/i.test(text);
    var billing = /billing|credit|check your plan|prepay/i.test(text);
    if (perDay || (billing && !perMin)) return { ok: false, code: 'AI_FREE_OUT', error: 'AI Free out of Credit — โควตาฟรีของ AI หมดแล้ว (รีเซ็ตวันถัดไป หรือเปิด Billing ใน Google AI Studio) · ' + detail };
    return { ok: false, code: 'AI_BUSY', error: 'AI ไม่ว่างชั่วคราว (เกินจำนวนครั้งต่อนาที) ลองใหม่ในอีก 1–2 นาที · ' + detail };
  }
  return { ok: false, error: detail };
}

/* ----------------------------------------------------------------------
 * รหัสเข้าใช้งาน (ตรวจที่ server ทุกคำขอ)
 *   TEAM_CODE  = รหัสของทีม (ผู้ดูแลตั้ง/เปลี่ยนจากหน้าหลังบ้าน) ถ้ายังไม่ตั้ง = เปิดให้ใช้ได้
 *   ADMIN_CODE = รหัสผู้ดูแล (เจ้าของตั้งเองใน Project Settings → Script properties)
 *   ส่งมากับ URL: key=<รหัสทีม> หรือ admin=<รหัสผู้ดูแล>
 * ---------------------------------------------------------------------- */
var ADMIN_ACTIONS = ['adminauth', 'setteamcode', 'setpins', 'bulk'];

/* CPS SSO — sign-in from the CPS Digital Platform portal (https://changan-cps.github.io/cps-portal/)
 *   Script property SSO_SECRET = the secret printed by showSecret() in the CPS SSO script.
 *   While it is set, the TEAM CODE IS NOT USED: every request must carry sso=<app token>, issued by the portal's
 *   SSO service to people allowed to use IE Digital Program:
 *     base64url(JSON {t:'a', u, n, app, role, exp}) + "." + base64url(HMAC-SHA256(part1, SSO_SECRET))
 *   A token for app "ie-digital-program-admin" also opens the admin actions (ADMIN_CODE keeps working as a fallback).
 *   Delete SSO_SECRET to go back to the team code. */
var SSO_APP = 'ie-digital-program', SSO_ADMIN_APP = 'ie-digital-program-admin';
function ssoSecret_() { return String(PropertiesService.getScriptProperties().getProperty('SSO_SECRET') || '').trim(); }
function ssoUser_(p) {
  var secret = ssoSecret_(); if (!secret) return null;
  var m = /^([\w-]+)\.([\w-]+)$/.exec(String((p && p.sso) || '')); if (!m) return null;
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(m[1], secret)).replace(/=+$/, '');
  if (sig !== m[2]) return null;
  var t;
  try { t = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(m[1] + '==='.slice((m[1].length + 3) % 4))).getDataAsString()); } catch (e) { return null; }
  return t && t.t === 'a' && t.exp > Date.now() && (t.app === SSO_APP || t.app === SSO_ADMIN_APP) ? t : null;
}
function codes_() {
  var props = PropertiesService.getScriptProperties();
  return { team: props.getProperty('TEAM_CODE') || '', admin: props.getProperty('ADMIN_CODE') || '' };
}
function auth_(p, action) {
  var c = codes_(), key = String((p && p.key) || ''), akey = String((p && p.admin) || '');
  var sso = !!ssoSecret_(), u = sso ? ssoUser_(p) : null;
  if (ADMIN_ACTIONS.indexOf(action) > -1) {
    if (u && u.app === SSO_ADMIN_APP) return null;
    if (sso && !akey) return { ok: false, code: 'AUTH_ADMIN', sso: true, error: 'ต้องมีสิทธิ์ IE Digital Program (Admin) ใน CPS Digital Platform' };
    if (!c.admin) return { ok: false, code: 'NO_ADMIN', error: 'ยังไม่ได้ตั้ง ADMIN_CODE ใน Script properties ของ Apps Script' };
    if (akey !== c.admin) return { ok: false, code: 'AUTH_ADMIN', error: 'รหัสผู้ดูแลไม่ถูกต้อง' };
    return null;
  }
  if (sso) return (u || (c.admin && akey === c.admin)) ? null : { ok: false, code: 'AUTH', sso: true, error: 'กรุณาเข้าใช้งานผ่าน CPS Digital Platform' };
  if (!c.team) return null;
  if (key === c.team || (c.admin && akey === c.admin)) return null;
  return { ok: false, code: 'AUTH', error: 'ต้องใส่รหัสเข้าใช้งาน' };
}
function authInfo_(p) {
  var c = codes_(), key = String((p && p.key) || '');
  if (ssoSecret_()) return { ok: true, need: true, sso: true, valid: !!ssoUser_(p) };
  return { ok: true, need: !!c.team, valid: !c.team || key === c.team };
}
function adminInfo_() {
  return { ok: true, teamSet: !!codes_().team, sso: !!ssoSecret_() };
}
function setTeamCode_(body) {
  var v = String((body && body.code) || '').trim(), props = PropertiesService.getScriptProperties();
  if (!v) { props.deleteProperty('TEAM_CODE'); return { ok: true, teamSet: false }; }
  if (v.length < 6) return { ok: false, error: 'รหัสทีมต้องยาวอย่างน้อย 6 ตัว' };
  props.setProperty('TEAM_CODE', v);
  return { ok: true, teamSet: true };
}
