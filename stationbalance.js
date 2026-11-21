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
    return `<section class="panel sb-group">
      <div class="sb-grouphead">
        <div><span class="sb-model">${esc(model)}</span> · รุ่นย่อย <b>${esc(submodel)}</b></div>
        <div class="sb-grouphead-r">${list.length} station · ภาระสูงสุด <b style="color:${loadColor(max)}">${fmt(max)}%</b></div>
      </div>
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
    const wfBtn = `<td class="sb-wf">${done}<button class="wf-open" data-wf="${esc(r.id)}">→ ขั้นตอน</button></td>`;
    if (!can) {
      return `<tr>
        <td class="sb-st">${esc(r.station)}</td><td>${esc(r.team)}</td><td>${esc(r.jph)}</td>
        <td>${fmt(t)} s</td><td><b>${fmt(num(r.ct))} s</b></td><td>${bar}</td>
        <td class="sb-ois"><b>${esc(r.ois)}</b><small>${esc(r.oisDesc)}</small></td>${wfBtn}</tr>`;
    }
    return `<tr data-id="${esc(r.id)}">
      <td><input class="f-station" value="${esc(r.station)}" placeholder="CA-01A"></td>
      <td><input class="f-team" value="${esc(r.team || '')}" placeholder="CA-A"></td>
      <td><input class="f-jph" type="number" min="1" step="1" value="${esc(r.jph)}" style="max-width:68px"></td>
      <td class="sb-takt">${fmt(t)} s</td>
      <td><div class="sb-ct"><input class="f-ct" type="number" min="0" step="0.1" value="${esc(r.ct)}" style="max-width:80px"><button class="f-pull" title="ดึง CT จาก Time Study" type="button">↧</button></div>${r.rounds ? `<small class="sb-rounds">สูงสุดจาก ${esc(r.rounds)} รอบ</small>` : ''}</td>
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
        tr.querySelector('.sb-load').innerHTML = `<div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(p, 100)}%;background:${col}"></i>${p > 100 ? `<i class="over" style="width:${Math.min(p - 100, 40)}%"></i>` : ''}</div><span style="color:${col}">${U().fmt(p)}%</span></div>`;
      };
      jph.oninput = liveUpdate; ct.oninput = liveUpdate;
      const pull = tr.querySelector('.f-pull'); if (pull) pull.onclick = () => pullCT(id, tr);
      const del = tr.querySelector('.f-del'); if (del) del.onclick = () => { if (confirm('ลบสถานีนี้?')) { D().remove('stations', id); render(host); } };
    });
  }
  function docBlur() { return false; }

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
