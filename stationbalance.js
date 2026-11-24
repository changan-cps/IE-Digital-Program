/* CPS IE Studio — สมดุลสถานี (Station Balance / Yamazumi)
   โครงสร้างตามภาพ: Group → Team → รุ่นย่อย → Station
   ต่อสถานี: JPH → TAKT=3600/JPH → CT สูงสุด → ภาระงาน%=CT/TAKT → OIS
   CT ดึงจาก Time Study ได้ · บันทึกได้เฉพาะระดับทีม
*/
(() => {
  const U = () => window.CPS.util;
  const D = () => window.CPS.data;
  let host = null;

  const takt = jph => { const j = U().num(jph); return j ? 3600 / j : 0; };
  const loadPct = r => { const t = takt(r.jph); return t ? (U().num(r.ct) / t) * 100 : 0; };
  const loadColor = p => p > 100 ? '#c0392b' : p >= 90 ? '#e08a00' : p >= 75 ? '#2e8b57' : '#15856b';

  function blank(prev) {
    return {
      id: U().uid(), model: prev?.model || 'B216', submodel: prev?.submodel || 'EV',
      station: '', jph: prev?.jph || 22, ct: '', ois: '', oisDesc: '', updatedAt: Date.now()
    };
  }

  function render(container) {
    host = container;
    const { esc, fmt, num } = U();
    const can = D().canEdit();
    const rows = D().listStations();
    const sc = D().scope;

    // group by model -> submodel
    const groups = {};
    for (const r of rows) {
      const key = (r.model || '-') + '§' + (r.submodel || '-');
      (groups[key] = groups[key] || []).push(r);
    }
    const allMax = rows.length ? Math.max(...rows.map(loadPct)) : 0;

    host.innerHTML = `
      <div class="page-head">
        <div><p class="eyebrow">STATION BALANCE</p><h1>สมดุลสถานี</h1>
          <p class="muted">${esc([sc.workshop, sc.group, sc.team].filter(Boolean).join(' · ') || U().esc('ทุกพื้นที่'))}</p></div>
        ${can ? '<button class="primary" id="sb-add">＋ เพิ่มสถานี</button>' : ''}
      </div>
      ${!can ? '<div class="ro-banner">👁️ โหมดวิเคราะห์ (อ่านอย่างเดียว) — รวมข้อมูลหลายทีม</div>' : ''}
      <div class="sb-summary">
        ${sumCard('จำนวน Station', rows.length, 'สถานี')}
        ${sumCard('ภาระสูงสุด', fmt(allMax) + '%', '', loadColor(allMax))}
        ${sumCard('เกิน TAKT (>100%)', rows.filter(r => loadPct(r) > 100).length, 'สถานี', '#c0392b')}
        ${sumCard('ระบบแนะนำปรับปรุง', rows.filter(r => D().advise(r).status === 'improve' && !(r.wf && (r.wf.improve === false || (r.wf.approval && r.wf.approval.submitted)))).length, 'สถานี', '#e08a00')}
      </div>
      ${!rows.length ? `<div class="blank">ยังไม่มีข้อมูลสถานี${can ? ' — กด “＋ เพิ่มสถานี”' : ''}</div>`
        : Object.keys(groups).sort().map(k => groupBlock(k, groups[k], can)).join('')}`;

    host.querySelectorAll('.wf-open').forEach(b => b.onclick = () => window.CPSWorkflow.open(b.dataset.wf, host, () => render(host)));
    host.querySelectorAll('.sb-chart').forEach(b => b.onclick = () => openCharts(b.dataset.st));
    host.querySelectorAll('.sb-line-swct').forEach(b => b.onclick = () => openLineSwct(b.dataset.key));
    if (can) {
      host.querySelector('#sb-add').onclick = () => {
        const last = rows[rows.length - 1];
        const rec = blank(last); rec.team = sc.team;
        D().upsert('stations', rec); render(host);
      };
      wireRows();
    }
  }

  function sumCard(label, val, unit, color) {
    return `<div class="stat"><small>${U().esc(label)}</small><strong${color ? ` style="color:${color}"` : ''}>${val}<em>${unit ? ' ' + U().esc(unit) : ''}</em></strong></div>`;
  }

  function groupBlock(key, list, can) {
    const { esc, fmt } = U();
    const [model, submodel] = key.split('§');
    const max = Math.max(...list.map(loadPct));
    const rowsHtml = list.map(r => stationRow(r, can)).join('');
    return `<section class="panel sb-group" data-key="${esc(key)}">
      <div class="sb-grouphead">
        <div><span class="sb-model">${esc(model)}</span> · รุ่นย่อย <b>${esc(submodel)}</b></div>
        <div class="sb-grouphead-r">${list.length} station · ภาระสูงสุด <b style="color:${loadColor(max)}">${fmt(max)}%</b>
          <button class="sb-line-swct" type="button" data-key="${esc(key)}">📊 SWCT ทั้งไลน์</button></div>
      </div>
      <div class="sb-yama">${yamazumi(list)}</div>
      <div class="table-scroll"><table class="sb-table">
        <thead><tr><th>STATION</th><th>TEAM</th><th>JPH</th><th>TAKT</th><th>CT สูงสุด</th><th>ภาระงาน</th><th>OIS</th><th>ระบบแนะนำ / ขั้นตอน</th>${can ? '<th></th>' : ''}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
    </section>`;
  }

  function stationRow(r, can) {
    const { esc, fmt, num } = U();
    const t = takt(r.jph), p = loadPct(r), col = loadColor(p);
    const bar = `<div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(p, 100)}%;background:${col}"></i>${p > 100 ? `<i class="over" style="width:${Math.min(p - 100, 40)}%"></i>` : ''}</div><span style="color:${col}">${fmt(p)}%</span></div>`;
    const adv = D().advise(r);
    const chip = adv.status === 'improve' ? `<span class="adv improve" title="${esc(adv.reasons.join(' · '))}">ควรปรับปรุง</span>` : adv.status === 'ok' ? '<span class="adv ok">ปกติ</span>' : '<span class="adv">รอข้อมูล</span>';
    const done = r.wf && r.wf.improve === false ? '<span class="adv">ปิดงานแล้ว</span>' : r.wf && r.wf.approval && r.wf.approval.submitted ? '<span class="adv ok">ส่งอนุมัติแล้ว</span>' : chip;
    const nR = D().group.roundsOf(r.station).length;
    const wfBtn = `<td class="sb-wf">${done}<button class="wf-open" data-wf="${esc(r.id)}">→ ขั้นตอน</button><button class="sb-chart" type="button" data-st="${esc(r.station)}"${nR ? '' : ' disabled title="ยังไม่มีรอบจับเวลาของสถานีนี้"'}>SWCT / สองมือ</button></td>`;
    if (!can) {
      return `<tr>
        <td class="sb-st">${esc(r.station)}</td><td>${esc(r.team)}</td><td>${esc(r.jph)}</td>
        <td>${fmt(t)} s</td><td><b>${fmt(num(r.ct))} s</b></td><td>${bar}</td>
        <td class="sb-ois"><b>${esc(r.ois)}</b><small>${esc(r.oisDesc)}</small></td>${wfBtn}</tr>`;
    }
    return `<tr data-id="${esc(r.id)}">
      <td><input class="f-station" value="${esc(r.station)}" placeholder="CA-01A"></td>
      <td><input class="f-team" value="${esc(r.team || '')}" placeholder="CA-A"></td>
      <td><input class="f-jph" type="number" min="1" step="1" value="${esc(r.jph)}"></td>
      <td class="sb-takt">${fmt(t)} s</td>
      <td><div class="sb-ct"><input class="f-ct" type="number" min="0" step="0.1" value="${esc(r.ct)}"><button class="f-pull" title="ดึง CT จาก Time Study" type="button">↧</button></div>${r.rounds ? `<small class="sb-rounds">สูงสุดจาก ${esc(r.rounds)} รอบ</small>` : ''}</td>
      <td class="sb-load">${bar}</td>
      <td class="sb-ois-edit"><input class="f-ois" value="${esc(r.ois)}" placeholder="OIS-..."><input class="f-oisdesc" value="${esc(r.oisDesc)}" placeholder="คำอธิบายงาน"></td>
      ${wfBtn}<td><button class="f-del r-del" type="button">✕</button></td></tr>`;
  }

  function wireRows() {
    host.querySelectorAll('tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      const rec = () => (window.CPS.data.listStations().find(x => x.id === id));
      const commit = (patch, rerender) => { const r = rec(); if (!r) return; Object.assign(r, patch); D().upsert('stations', r); if (rerender) render(host); };
      const bind = (sel, field, rerender) => { const inp = tr.querySelector(sel); if (inp) inp.oninput = () => commit({ [field]: inp.value }, rerender && docBlur(inp)); };
      // text fields: save on input, no rerender
      ['f-station:station', 'f-team:team', 'f-ois:ois', 'f-oisdesc:oisDesc'].forEach(s => { const [cls, f] = s.split(':'); bind('.' + cls, f, false); });
      // numeric fields change TAKT/load -> live update that row only
      const jph = tr.querySelector('.f-jph'), ct = tr.querySelector('.f-ct');
      const liveUpdate = () => {
        const r = rec(); if (!r) return;
        r.jph = jph.value; r.ct = ct.value; D().upsert('stations', r);
        const t = takt(r.jph), p = loadPct(r), col = loadColor(p);
        tr.querySelector('.sb-takt').textContent = U().fmt(t) + ' s';
        refreshYama(tr);
        tr.querySelector('.sb-load').innerHTML = `<div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(p, 100)}%;background:${col}"></i>${p > 100 ? `<i class="over" style="width:${Math.min(p - 100, 40)}%"></i>` : ''}</div><span style="color:${col}">${U().fmt(p)}%</span></div>`;
      };
      jph.oninput = liveUpdate; ct.oninput = liveUpdate;
      const pull = tr.querySelector('.f-pull'); if (pull) pull.onclick = () => pullCT(id, tr);
      const del = tr.querySelector('.f-del'); if (del) del.onclick = () => { if (confirm('ลบสถานีนี้?')) { D().remove('stations', id); render(host); } };
    });
  }
  function docBlur() { return false; }

  // ---- กราฟ Yamazumi (Line Balance) ต่อรุ่น: แท่งซ้อน VA/NNVA/NVA ต่อสถานี + เส้น TAKT ----
  // ใช้รอบที่ CT สูงสุดของสถานี (ตรงกับ CT สูงสุดในตาราง) · ถ้าไม่มีรอบ ใช้ CT ที่กรอกเป็นแท่งสีเทา
  function stackOf(r) {
    const { num } = U();
    const rounds = D().group.roundsOf(r.station);
    const top = rounds.reduce((a, x) => (!a || num(x.ct) >= num(a.ct) ? x : a), null);
    const ct = num(r.ct);
    if (top && num(top.ct) > 0) {
      const k = ct > 0 ? ct / num(top.ct) : 1; // ปรับสัดส่วนให้ยอดรวม = CT ในตาราง
      return { va: num(top.va) * k, nnva: num(top.nnva) * k, nva: num(top.nva) * k, other: 0, ct: ct || num(top.ct) };
    }
    return { va: 0, nnva: 0, nva: 0, other: ct, ct };
  }
  function yamazumi(list) {
    const { esc, fmt } = U();
    if (!list.length) return '';
    const data = list.map(r => ({ r, s: stackOf(r), t: takt(r.jph) }));
    const maxV = Math.max(5, ...data.map(d => Math.max(d.s.ct, d.t))) * 1.15;
    const bw = 44, gap = 26, left = 46, top = 22, ph = 200, bottom = 40;
    const W = Math.max(520, left + data.length * (bw + gap) + gap), H = top + ph + bottom;
    const Y = v => top + ph - (v / maxV) * ph;
    const step = maxV <= 60 ? 10 : maxV <= 150 ? 25 : maxV <= 400 ? 50 : 100;
    let g = '';
    for (let v = 0; v <= maxV; v += step) g += `<line x1="${left}" y1="${Y(v)}" x2="${W - 8}" y2="${Y(v)}" class="yz-g"/><text x="${left - 6}" y="${Y(v) + 4}" class="yz-ax">${v}</text>`;
    data.forEach((d, i) => {
      const x = left + gap + i * (bw + gap);
      let y = top + ph;
      [['va', '#15856b'], ['nnva', '#e0a21b'], ['nva', '#c0507f'], ['other', '#9aa8b6']].forEach(([k, c]) => {
        const v = d.s[k]; if (v <= 0) return; const h = (v / maxV) * ph; y -= h;
        g += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${c}"><title>${k.toUpperCase()} ${fmt(v)} วิ</title></rect>`;
      });
      const over = d.t && d.s.ct > d.t;
      g += `<text x="${x + bw / 2}" y="${Y(d.s.ct) - 5}" class="yz-v${over ? ' yz-over' : ''}">${fmt(d.s.ct)}</text>`;
      if (d.t) g += `<line x1="${x - gap / 2}" y1="${Y(d.t)}" x2="${x + bw + gap / 2}" y2="${Y(d.t)}" class="yz-takt"/>`;
      const nm = String(d.r.station || '—');
      g += `<text x="${x + bw / 2}" y="${top + ph + 16}" class="yz-st">${esc(nm.length > 9 ? nm.slice(0, 9) + '…' : nm)}</text>` +
        `<text x="${x + bw / 2}" y="${top + ph + 30}" class="yz-pct${over ? ' yz-over' : ''}">${d.t ? fmt(d.s.ct / d.t * 100) + '%' : ''}</text>`;
    });
    const t0 = data.find(d => d.t);
    const legend = `<div class="yz-legend"><span><i style="background:#15856b"></i>VA</span><span><i style="background:#e0a21b"></i>NNVA</span><span><i style="background:#c0507f"></i>NVA</span><span><i style="background:#9aa8b6"></i>ไม่มีรอบจับเวลา</span><span><i class="yz-tk"></i>TAKT${t0 ? ' ' + fmt(t0.t) + ' วิ' : ''}</span></div>`;
    return `<div class="yz-head"><b>กราฟ Yamazumi (Line Balance)</b>${legend}</div><div class="swct-scroll"><svg viewBox="0 0 ${W} ${H}" class="yz-svg" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><style>.yz-g{stroke:#e6edf3}.yz-ax{font:10px sans-serif;fill:#6b7f92;text-anchor:end}.yz-v{font:bold 11px sans-serif;fill:#17324b;text-anchor:middle}.yz-st{font:bold 11px sans-serif;fill:#17324b;text-anchor:middle}.yz-pct{font:10px sans-serif;fill:#4c6378;text-anchor:middle}.yz-over{fill:#c0392b}.yz-takt{stroke:#d62020;stroke-width:2.5}</style><line x1="${left}" y1="${top + ph}" x2="${W - 8}" y2="${top + ph}" stroke="#9fb1c0"/>${g}</svg></div>`;
  }
  function refreshYama(tr) {
    const sec = tr.closest('.sb-group'); if (!sec) return;
    const key = sec.dataset.key;
    const list = D().listStations().filter(r => ((r.model || '-') + '§' + (r.submodel || '-')) === key);
    sec.querySelector('.sb-yama').innerHTML = yamazumi(list);
  }

  // ---- ป๊อปอัป SWCT / แผนภูมิสองมือ ของสถานี (เลือกรอบได้ ค่าเริ่มต้น = รอบล่าสุด) ----
  function openCharts(code) {
    const { esc, fmt } = U(); const C = window.CPSTimeStudy && window.CPSTimeStudy.charts;
    const rounds = D().group.roundsOf(code); if (!rounds.length || !C) { U().toast('ยังไม่มีรอบจับเวลาของสถานีนี้'); return; }
    const st = D().listStations().find(r => r.station === code);
    const tk = st ? takt(st.jph) : 0;
    let dlg = document.getElementById('sb-chart-dlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'sb-chart-dlg'; dlg.className = 'sb-dlg'; document.body.appendChild(dlg); }
    const paint = id => {
      const s = rounds.find(x => x.id === id) || rounds[rounds.length - 1];
      const r = C.swct(s, U().num(s.takt) || tk);
      dlg.querySelector('#sbd-body').innerHTML =
        `<h3>ตารางงานมาตรฐาน (SWCT)</h3><p class="muted">C.T สูงสุด <b>${fmt(r.cycle)}</b> วิ · TAKT <b>${r.takt ? fmt(r.takt) : '—'}</b> วิ${r.takt && r.cycle > r.takt ? ` · <b style="color:#c0392b">เกิน TAKT ${fmt(r.cycle - r.takt)} วิ</b>` : ''}</p>` +
        `<div class="swct-scroll">${r.svg}</div>` +
        `<h3>แผนภูมิสองมือ (Two-Handed Process Chart)</h3><div class="swct-scroll">${C.hands(s)}</div><div class="th-sum">${C.handsSum(s)}</div>`;
    };
    dlg.innerHTML = `<div class="sbd-head"><b>${esc(code)}</b><label>รอบ <select id="sbd-round">${rounds.map((x, i) => `<option value="${esc(x.id)}">รอบ ${i + 1} · ${esc(x.date || '')} · ${esc(x.operator || '')} · CT ${fmt(x.ct)} วิ</option>`).join('')}</select></label><button type="button" class="ghost" id="sbd-close">ปิด ✕</button></div><div id="sbd-body"></div>`;
    const sel = dlg.querySelector('#sbd-round'); sel.value = rounds[rounds.length - 1].id;
    sel.onchange = () => paint(sel.value);
    dlg.querySelector('#sbd-close').onclick = () => dlg.close();
    paint(sel.value);
    dlg.showModal();
  }

  // ---- SWCT ทั้งไลน์: ทุกสถานีในกลุ่มรุ่นเดียวกัน วางต่อกันบนแกนเวลาเดียวกัน เทียบการทำงานช่วงเวลาเดียวกัน ----
  function openLineSwct(key) {
    const { esc, fmt, num } = U(); const C = window.CPSTimeStudy && window.CPSTimeStudy.charts;
    const list = D().listStations().filter(r => ((r.model || '-') + '§' + (r.submodel || '-')) === key);
    const [model, submodel] = key.split('§');
    const jphs = list.map(r => num(r.jph)).filter(Boolean);
    const mode = { pick: 'latest' };
    const jph = jphs.length ? jphs.sort((a, b) => jphs.filter(x => x === b).length - jphs.filter(x => x === a).length)[0] : 0;
    const tk = jph ? 3600 / jph : 0;
    let dlg = document.getElementById('sb-line-dlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'sb-line-dlg'; dlg.className = 'sb-dlg'; document.body.appendChild(dlg); }
    let last = null;
    const build = () => {
      const lanes = [], missing = [];
      list.forEach(r => {
        const rounds = D().group.roundsOf(r.station);
        if (!rounds.length) { missing.push(r.station); return; }
        const s = mode.pick === 'max' ? rounds.reduce((a, x) => (num(x.ct) > num(a.ct) ? x : a), rounds[0]) : rounds[rounds.length - 1];
        lanes.push({ station: r.station, elements: s.elements || [], round: rounds.indexOf(s) + 1, date: s.date || '' });
      });
      return { lanes, missing };
    };
    const paint = () => {
      const { lanes, missing } = build();
      const body = dlg.querySelector('#sbl-body');
      if (!lanes.length || !C) { body.innerHTML = '<p class="muted">ยังไม่มีรอบจับเวลาของสถานีในไลน์นี้</p>'; return; }
      const r = C.swctLine(lanes, tk); last = { r, lanes };
      const cts = r.groups.map(g => g.ct), over = tk ? r.groups.filter(g => g.ct > tk) : [];
      const slow = r.groups.reduce((a, g) => (g.ct > a.ct ? g : a), r.groups[0]);
      const fast = r.groups.reduce((a, g) => (g.ct < a.ct ? g : a), r.groups[0]);
      const avg = cts.reduce((a, b) => a + b, 0) / cts.length;
      body.innerHTML =
        `<div class="swct-sum"><span>สถานี <b>${lanes.length}</b></span><span>TAKT <b>${tk ? fmt(tk) : '—'}</b>${tk ? ' วิ' : ''}</span>` +
        `<span>C.T สูงสุด <b>${fmt(slow.ct)}</b> วิ (${esc(slow.label)})</span><span>ต่ำสุด <b>${fmt(fast.ct)}</b> วิ (${esc(fast.label)})</span>` +
        `<span>เฉลี่ย <b>${fmt(avg)}</b> วิ</span>${over.length ? `<span class="swct-over">เกิน TAKT ${over.length} สถานี: ${esc(over.map(g => g.label).join(', '))}</span>` : ''}` +
        `${tk ? `<span>Balance <b>${fmt(avg / slow.ct * 100)}%</b></span>` : ''}</div>` +
        (missing.length ? `<p class="muted">ยังไม่มีรอบจับเวลา: ${esc(missing.join(', '))}</p>` : '') +
        `<div class="swct-scroll">${r.svg}</div>`;
    };
    dlg.innerHTML = `<div class="sbd-head"><b>SWCT ทั้งไลน์ · ${esc(model)} / ${esc(submodel)}</b>
      <label>ใช้รอบ <select id="sbl-pick"><option value="latest">ล่าสุดของแต่ละสถานี</option><option value="max">ที่ C.T สูงสุด</option></select></label>
      <button type="button" id="sbl-print">พิมพ์</button><button type="button" id="sbd-close">ปิด</button></div><div id="sbl-body"></div>`;
    dlg.querySelector('#sbl-pick').onchange = e => { mode.pick = e.target.value; paint(); };
    dlg.querySelector('#sbd-close').onclick = () => dlg.close();
    dlg.querySelector('#sbl-print').onclick = () => {
      if (!last) return;
      const w = window.open('', '_blank'); if (!w) { U().toast('เบราว์เซอร์บล็อก popup'); return; }
      w.document.write(`<!doctype html><meta charset="utf-8"><title>SWCT ทั้งไลน์ · ${esc(model)} ${esc(submodel)}</title><style>body{font-family:system-ui,sans-serif;padding:14px;color:#17324b}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 8px;font-size:12px}svg{width:100%;height:auto}@page{size:A4 landscape;margin:8mm}</style>` +
        `<h1>ตารางงานมาตรฐาน (SWCT) ทั้งไลน์ · ${esc(model)} / ${esc(submodel)}</h1><p>TAKT ${tk ? fmt(tk) + ' วิ' : '—'} · ${last.lanes.map(l => esc(l.station) + ' รอบ ' + l.round + (l.date ? ' (' + esc(l.date) + ')' : '')).join(' · ')}</p>${last.r.svg}`);
      w.document.close(); setTimeout(() => w.print(), 300);
    };
    paint();
    dlg.showModal();
  }

  // ดึง CT สูงสุดจาก Time Study ที่ชื่อ/OIS ตรงกับสถานี
  async function pullCT(id, tr) {
    const r = window.CPS.data.listStations().find(x => x.id === id); if (!r) return;
    const studies = D().listStudies();
    const key = (r.ois || r.station || '').toLowerCase().trim();
    const G = D().group; const agg = G.aggregate(G.roundsOf(r.station));
    if (agg) { r.ct = agg.ctMax; r.rounds = agg.n; D().upsert('stations', r); render(host); U().toast(`ดึง CT สูงสุดจาก ${agg.n} รอบแล้ว`); return; }
    let match = studies.find(s => (s.name || '').toLowerCase().trim() === key || (s.name || '').toLowerCase().includes((r.station || '').toLowerCase()));
    if (!match && studies.length) {
      const a = await U().ask('ดึง CT จาก Time Study', [{ name: 'sid', label: 'เลือก Time Study', options: studies.map(s => ({ value: s.id, label: `${s.name || 'ไม่มีชื่อ'} (CT ${U().fmt(s.ct)} วิ)` })) }]);
      if (!a) return;
      match = studies.find(s => s.id === a.sid);
    }
    if (!match) { U().toast('ไม่พบ Time Study ที่ตรงกัน'); return; }
    r.ct = U().round1(U().num(match.ct)); D().upsert('stations', r); render(host);
    U().toast('ดึง CT จาก “' + (match.name || '') + '” แล้ว');
  }

  window.CPSStations = { render };
})();
