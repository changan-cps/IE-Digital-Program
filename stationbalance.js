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
  const loadPct = r => { const t = takt(r.jph); return t ? (D().ctOf(r) / t) * 100 : 0; };
  // ไลน์ = ทีม + รุ่น/รุ่นย่อย (คีย์เดียวกับแดชบอร์ด) — คนละทีมที่ใช้รุ่นเดียวกันไม่ถูกรวมเป็นไลน์เดียว

  // ป้ายของหน้าสรุป (ส่วนที่ผู้จัดการเปิดดู) ตามภาษาที่เลือกบนแดชบอร์ด · โหมดแก้ไขตารางยังเป็นภาษาไทย
  const SBT = {
    th: { title: 'สมดุลสถานี', all: 'ทุกพื้นที่', n: 'จำนวนสถานี', unit: 'สถานี', max: 'ภาระสูงสุด', over: 'เกิน TAKT (>100%)', adv: 'ต้องตัดสินใจ / ยังเกิน TAKT', sub: 'รุ่นย่อย',
      yz: 'กราฟ Yamazumi (Line Balance)', noRound: 'ไม่มีรอบจับเวลา', swct: '📊 SWCT ทั้งไลน์', edit: '✎ แก้ไขตาราง', done: '✓ เสร็จสิ้นการแก้ไข', cancel: 'ยกเลิกการแก้ไข', add: '＋ เพิ่มสถานี',
      ro: '👁️ โหมดวิเคราะห์ (อ่านอย่างเดียว) — รวมข้อมูลหลายทีม', th: ['สถานี', 'ทีม', 'JPH', 'TAKT', 'CT ที่ใช้', 'ภาระงาน', 'OIS', 'ระบบแนะนำ / ขั้นตอน'],
      improve: 'ควรปรับปรุง', ok: 'ปกติ', wait: 'รอข้อมูล', step: '→ ขั้นตอน', twoHand: 'SWCT / สองมือ' },
    en: { title: 'Station balance', all: 'All areas', n: 'Stations', unit: 'stations', max: 'Highest load', over: 'Over TAKT (>100%)', adv: 'Needs decision / still over TAKT', sub: 'sub-model',
      yz: 'Yamazumi chart (line balance)', noRound: 'no timing round', swct: '📊 Line SWCT', edit: '✎ Edit table', done: '✓ Done editing', cancel: 'Discard changes', add: '＋ Add station',
      ro: '👁️ Analysis mode (read only) — several teams combined', th: ['Station', 'Team', 'JPH', 'TAKT', 'CT in use', 'Load', 'OIS', 'Advice / steps'],
      improve: 'Needs improvement', ok: 'OK', wait: 'No data', step: '→ Steps', twoHand: 'SWCT / two-hand' },
    zh: { title: '工位平衡', all: '所有区域', n: '工位数', unit: '个工位', max: '最高负荷', over: '超出 TAKT (>100%)', adv: '待决定 / 仍超出 TAKT', sub: '子车型',
      yz: '山积图 (Yamazumi)', noRound: '无计时轮次', swct: '📊 整线 SWCT', edit: '✎ 编辑表格', done: '✓ 完成编辑', cancel: '放弃修改', add: '＋ 添加工位',
      ro: '👁️ 分析模式（只读）— 多个班组汇总', th: ['工位', '班组', 'JPH', 'TAKT', '使用的 CT', '负荷', 'OIS', '建议 / 步骤'],
      improve: '需改善', ok: '正常', wait: '无数据', step: '→ 步骤', twoHand: 'SWCT / 双手' },
  };
  const L = k => {
    const l = window.CPSDashI18n ? window.CPSDashI18n.lang : 'th';
    if (l !== 'zhen') return (SBT[l] || SBT.th)[k];
    const z = SBT.zh[k], e = SBT.en[k], two = (x, y) => x === y ? x : x + (/ \/ /.test(x + y) ? ' · ' : ' / ') + y;   // แบบเดียวกับตัวแปลหน้าจอ   // 中 / EN แบบเดียวกับแดชบอร์ด
    return Array.isArray(z) ? z.map((x, i) => two(x, e[i])) : two(z, e);
  };
  const unitN = n => n === 1 && L('unit') === 'stations' ? 'station' : L('unit');
  let editMode = false, editSnap = null;   // ตารางสถานีอ่านอย่างเดียวจนกว่าจะกด "แก้ไขตาราง" (กันพิมพ์โดนช่องโดยไม่ตั้งใจ)
  const lineKey = r => [r.workshop || '', r.group || '', r.team || '', r.model || '-', r.submodel || '-'].join('§');
  const loadColor = p => p > 100 ? '#c0392b' : p >= 90 ? '#9a5b00' : p >= 75 ? '#1e7a46' : '#15856b';

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
      const key = lineKey(r);
      (groups[key] = groups[key] || []).push(r);
    }
    const allMax = rows.length ? Math.max(...rows.map(loadPct)) : 0;

    host.innerHTML = `
      <div class="page-head">
        <div><h1>${esc(L('title'))}</h1>
          <p class="muted">${esc([sc.workshop, sc.group, sc.team].filter(Boolean).join(' · ') || L('all'))}</p></div>
        ${can ? `<div class="head-btns">${editMode ? `<button class="ghost" id="sb-cancel">${esc(L('cancel'))}</button>` : ''}${rows.length ? `<button class="ghost" id="sb-edit" aria-pressed="${editMode}">${esc(L(editMode ? 'done' : 'edit'))}</button>` : ''}<button class="primary" id="sb-add">${esc(L('add'))}</button></div>` : ''}
      </div>
      ${!can ? `<div class="ro-banner">${esc(L('ro'))}</div>` : ''}
      <div class="sb-summary">
        ${sumCard(L('n'), rows.length, unitN(rows.length))}
        ${sumCard(L('max'), (allMax > 100 ? '▲ ' : '') + fmt(allMax) + '%', '', loadColor(allMax))}
        ${(() => { const nO = rows.filter(r => loadPct(r) > 100).length; return sumCard(L('over'), nO, unitN(nO), nO ? '#c0392b' : ''); })()}
        ${(() => { const adv = rows.filter(r => ['decide', 'closedOver'].includes(D().statusOf(r).key)); return sumCard(L('adv'), adv.length, unitN(adv.length) + (adv.length ? ' · ' + adv.slice(0, 3).map(r => r.station).join(', ') : ''), adv.length ? '#9a5b00' : ''); })()}
      </div>
      ${!rows.length ? `<div class="blank">ยังไม่มีข้อมูลสถานี${can ? ' — กด “＋ เพิ่มสถานี”' : ''}</div>`
        : Object.keys(groups).sort().map(k => groupBlock(k, groups[k], can && editMode)).join('')}`;

    host.querySelectorAll('.wf-open').forEach(b => b.onclick = () => window.CPSWorkflow.open(b.dataset.wf, host, () => render(host)));
    host.querySelectorAll('.sb-chart').forEach(b => b.onclick = () => openCharts(b.dataset.st));
    host.querySelectorAll('.sb-line-swct').forEach(b => b.onclick = () => openLineSwct(b.dataset.key));
    if (can) {
      const eb = host.querySelector('#sb-edit'); if (eb) eb.onclick = () => { editMode = !editMode; editSnap = editMode ? JSON.stringify(D().listStations()) : null; render(host); };
      const cb = host.querySelector('#sb-cancel'); if (cb) cb.onclick = () => {
        if (editSnap) { const old = JSON.parse(editSnap), ids = new Set(old.map(r => r.id)); D().listStations().filter(r => !ids.has(r.id)).forEach(r => D().remove('stations', r.id)); old.forEach(r => { const cur = D().listStations().find(x => x.id === r.id); if (!cur || JSON.stringify(cur) !== JSON.stringify(r)) D().upsert('stations', r); }); }
        editMode = false; editSnap = null; render(host); U().toast('ยกเลิกการแก้ไขแล้ว');
      };
      host.querySelector('#sb-add').onclick = () => {
        const last = rows[rows.length - 1];
        const rec = blank(last); rec.team = sc.team;
        if (!editMode) editSnap = JSON.stringify(D().listStations());
        D().upsert('stations', rec); editMode = true; render(host);
      };
      wireRows();
    }
  }

  // Line Balance Rate (LBR) = ΣCT / (จำนวนสถานี × CT สูงสุด) × 100 · Balance loss = 100 − LBR
  // ประสิทธิภาพเทียบ TAKT = ΣCT / (จำนวนสถานี × TAKT) × 100 · สถานีขั้นต่ำ = ⌈ΣCT / TAKT⌉
  function lineStats(items, tk) {
    const cts = items.map(x => x.ct).filter(v => v > 0);
    if (!cts.length) return null;
    const n = cts.length, sum = cts.reduce((a, b) => a + b, 0), max = Math.max(...cts);
    const neck = items.find(x => x.ct === max);
    return { n, sum, max, avg: sum / n, neck: neck ? neck.label : '', lbr: sum / (n * max) * 100,
      eff: tk ? sum / (n * tk) * 100 : 0, minSt: tk ? Math.ceil(sum / tk - 1e-9) : 0, tk };
  }
  const lbrColor = v => v >= 85 ? '#15856b' : v >= 70 ? '#9a5b00' : '#c0392b';
  // ตัวเลขสมดุลไลน์ชุดเดียวทั้งแอป (แดชบอร์ด · หน้าสมดุลสถานี · PPT)
  // ค่าหลักนับตามสถานี (CT ในตารางสถานี) · ถ้าสถานีมีผู้ปฏิบัติงานหลายคน แสดงค่าต่อคนเป็นบรรทัดรอง
  const LI = () => window.CPSDashI18n;
  function lineFacts(st, op) {
    const f = U().fmt, t = (k, ...a) => LI().t(k, ...a), s = ' ' + t('s');
    const main = [['Line Balance Rate', f(st.lbr) + '%'], [t('sw_loss'), f(100 - st.lbr) + '%'], ['ΣCT', f(st.sum) + s], [t('sw_neck'), st.neck + ' ' + f(st.max) + s]];
    if (st.tk) main.push([t('sw_eff'), f(st.eff) + '%'], [t('sw_min', st.minSt, st.n, false), '']);
    const sub = op ? [[t('lbrOp'), f(op.lbr) + '%'], [t('sw_loss'), f(100 - op.lbr) + '%']].concat(op.tk ? [[t('sw_eff'), f(op.eff) + '%'], [t('sw_min', op.minSt, op.n, true), '']] : []) : null;
    return { main, sub };
  }
  function lineStrip(st, op) {
    if (!st) return '';
    const { esc } = U(); const F = lineFacts(st, op);
    const sp = ([k, v], i, color) => `<span>${esc(k)}${v ? ` <b${color && i === 0 ? ` style="color:${color}"` : ''}>${esc(v)}</b>` : ''}</span>`;
    return `<div class="sb-lbr">${F.main.map((p, i) => sp(p, i, lbrColor(st.lbr))).join('')}` +
      (F.sub ? `<div class="lbr-op"><small>${esc(LI().t('perOp'))}</small>${F.sub.map((p, i) => sp(p, i)).join('')}</div>` : '') +
      `<span class="lbr-f">${esc(LI().t('lbrBoth'))}</span></div>`;
  }
  function groupTakt(list) {
    const jphs = list.map(r => U().num(r.jph)).filter(Boolean);
    if (!jphs.length) return 0;
    const jph = jphs.slice().sort((a, b) => jphs.filter(x => x === b).length - jphs.filter(x => x === a).length)[0];
    return 3600 / jph;
  }

  function sumCard(label, val, unit, color) {
    return `<div class="stat"><small>${U().esc(label)}</small><strong${color ? ` style="color:${color}"` : ''}>${val}<em>${unit ? ' ' + U().esc(unit) : ''}</em></strong></div>`;
  }

  function groupBlock(key, list, can) {
    const { esc, fmt } = U();
    const [, , team, model, submodel] = key.split('§');
    const max = Math.max(...list.map(loadPct));
    const rowsHtml = list.map(r => stationRow(r, can)).join('');
    return `<section class="panel sb-group" data-key="${esc(key)}">
      <div class="sb-grouphead">
        <div>${team ? `<span class="muted">${esc(team)} · </span>` : ''}<span class="sb-model">${esc(model)}</span> · ${esc(L('sub'))} <b>${esc(submodel)}</b></div>
        <div class="sb-grouphead-r">${list.length} ${esc(unitN(list.length))} · ${esc(L('max'))} <b style="color:${loadColor(max)}">${max > 100 ? '▲ ' : ''}${fmt(max)}%</b>
          <button class="sb-line-swct" type="button" data-key="${esc(key)}">${esc(L('swct'))}</button></div>
      </div>
      ${lineStrip(lineStats(list.map(r => ({ label: r.station, ct: D().ctOf(r) })), groupTakt(list)), null)}
      <div class="sb-yama">${yamazumi(list)}</div>
      <div class="table-scroll"><table class="sb-table${can ? '' : ' ro'}">
        <thead><tr>${L('th').map(h => `<th>${esc(h)}</th>`).join('')}${can ? '<th></th>' : ''}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>
    </section>`;
  }

  // ที่มาของ CT ที่ใช้ (After ของงานวิเคราะห์ / Time Study / กรอกเอง)
  function srcNote(ci) {
    const { fmt } = U();
    return ci.src === 'after' ? `<small class="sb-rounds">หลังปรับ (After) · ก่อน (เฉลี่ย) ${fmt(ci.before)} วิ</small>` : ci.src === 'study' ? `<small class="sb-rounds">สูงสุดจาก ${ci.n} รอบ</small>` : '';
  }
  function stationRow(r, can) {
    const { esc, fmt, num } = U();
    const ci = D().ctInfo(r);
    const t = takt(r.jph), p = loadPct(r), col = loadColor(p);
    const bar = `<div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(p, 100)}%;background:${col}"></i>${p > 100 ? `<i class="over" style="width:${Math.min(p - 100, 40)}%"></i>` : ''}</div><span style="color:${col}">${fmt(p)}%</span></div>`;
    const adv = D().advise(r);
    const stt = D().statusOf(r);
    const cls = { ok: 'adv ok', approved: 'adv ok', pending: 'adv ok', progress: 'adv prog', decide: 'adv improve', closedOver: 'adv alarm', closed: 'adv', nodata: 'adv' }[stt.key];
    const done = `<span class="${cls}"${stt.reasons ? ` title="${esc(stt.reasons.join(' · '))}"` : ''}>${stt.alarm ? '▲ ' : ''}${esc(stt.label)}</span>`;
    const nR = D().group.roundsOf(r.station).length;
    const wfBtn = `<td class="sb-wf">${done}<button class="wf-open" data-wf="${esc(r.id)}">${esc(L('step'))}</button><button class="sb-chart" type="button" data-st="${esc(r.station)}"${nR ? '' : ' disabled title="ยังไม่มีรอบจับเวลาของสถานีนี้"'}>SWCT / สองมือ</button></td>`;
    if (!can) {
      return `<tr>
        <td class="sb-st">${esc(r.station)}</td><td class="sb-team">${esc(r.team)}</td><td class="sb-jph">${esc(r.jph)}</td>
        <td class="sb-takt">${fmt(t)} วิ</td><td class="sb-ctv"><b>${fmt(ci.ct)} วิ</b>${srcNote(ci)}</td><td class="sb-load">${bar}</td>
        <td class="sb-ois"><b>${esc(r.ois)}</b><small>${U().ud(r.oisDesc)}</small></td>${wfBtn}</tr>`;
    }
    return `<tr data-id="${esc(r.id)}">
      <td><input class="f-station" aria-label="รหัสสถานี" value="${esc(r.station)}" placeholder="CA-01A"></td>
      <td><input class="f-team" aria-label="ทีม" value="${esc(r.team || '')}" placeholder="CA-A"></td>
      <td><input class="f-jph" aria-label="JPH" type="number" min="1" step="1" value="${esc(r.jph)}"></td>
      <td class="sb-takt">${fmt(t)} วิ</td>
      <td>${ci.src === 'manual' ? `<div class="sb-ct"><input class="f-ct" aria-label="CT (วินาที)" type="number" min="0" step="0.1" value="${esc(r.ct)}"><button class="f-pull" title="ดึง CT จาก Time Study" aria-label="ดึง CT จาก Time Study" type="button">↧ ดึง CT</button></div>` : `<b>${fmt(ci.ct)} วิ</b>`}${srcNote(ci)}</td>
      <td class="sb-load">${bar}</td>
      <td class="sb-ois-edit"><input class="f-ois" aria-label="รหัส OIS" value="${esc(r.ois)}" placeholder="OIS-..."><input class="f-oisdesc" aria-label="คำอธิบายงาน OIS" value="${esc(r.oisDesc)}" placeholder="คำอธิบายงาน"></td>
      ${wfBtn}<td><button class="f-del r-del" type="button" title="ลบสถานี" aria-label="ลบสถานี ${esc(r.station)}">✕</button></td></tr>`;
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
      const jph = tr.querySelector('.f-jph'), ct = tr.querySelector('.f-ct') || { value: '' };
      const liveUpdate = () => {
        const r = rec(); if (!r) return;
        r.jph = jph.value; if (tr.querySelector('.f-ct')) r.ct = ct.value; D().upsert('stations', r);
        const t = takt(r.jph), p = loadPct(r), col = loadColor(p);
        tr.querySelector('.sb-takt').textContent = U().fmt(t) + ' s';
        refreshYama(tr);
        tr.querySelector('.sb-load').innerHTML = `<div class="sb-bar"><div class="sb-bar-track"><i style="width:${Math.min(p, 100)}%;background:${col}"></i>${p > 100 ? `<i class="over" style="width:${Math.min(p - 100, 40)}%"></i>` : ''}</div><span style="color:${col}">${U().fmt(p)}%</span></div>`;
      };
      jph.oninput = liveUpdate; if (tr.querySelector('.f-ct')) ct.oninput = liveUpdate;
      const pull = tr.querySelector('.f-pull'); if (pull) pull.onclick = () => pullCT(id, tr);
      const del = tr.querySelector('.f-del'); if (del) del.onclick = () => D().removeUndo('stations', id, 'ลบสถานีแล้ว', () => render(host));
    });
  }
  function docBlur() { return false; }

  // ---- กราฟ Yamazumi (Line Balance) ต่อรุ่น: แท่งซ้อน VA/NNVA/NVA ต่อสถานี + เส้น TAKT ----
  // ใช้รอบที่ CT สูงสุดของสถานี (ตรงกับ CT สูงสุดในตาราง) · ถ้าไม่มีรอบ ใช้ CT ที่กรอกเป็นแท่งสีเทา
  function stackOf(r) {
    const { num } = U();
    const rounds = D().group.roundsOf(r.station);
    const top = rounds.reduce((a, x) => (!a || num(x.ct) >= num(a.ct) ? x : a), null);
    const ct = D().ctOf(r);
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
      g += `<text x="${x + bw / 2}" y="${Y(d.s.ct) - 5}" class="yz-v${over ? ' yz-over' : ''}">${over ? '▲ ' : ''}${fmt(d.s.ct)}</text>`;
      if (d.t) g += `<line x1="${x - gap / 2}" y1="${Y(d.t)}" x2="${x + bw + gap / 2}" y2="${Y(d.t)}" class="yz-takt"/>`;
      const nm = String(d.r.station || '—');
      g += `<text x="${x + bw / 2}" y="${top + ph + 16}" class="yz-st">${esc(nm.length > 9 ? '…' + nm.slice(-8) : nm)}</text>` +
        `<text x="${x + bw / 2}" y="${top + ph + 30}" class="yz-pct${over ? ' yz-over' : ''}">${d.t ? fmt(d.s.ct / d.t * 100) + '%' : ''}</text>`;
    });
    const t0 = data.find(d => d.t);
    const legend = `<div class="yz-legend"><span><i style="background:#15856b"></i>VA</span><span><i style="background:#e0a21b"></i>NNVA</span><span><i style="background:#c0507f"></i>NVA</span><span><i style="background:#9aa8b6"></i>${esc(L('noRound'))}</span><span><i class="yz-tk"></i>TAKT${t0 ? ' ' + fmt(t0.t) + ' วิ' : ''}</span></div>`;
    return `<div class="yz-head"><b>${esc(L('yz'))}</b>${legend}</div><div class="swct-scroll"><svg viewBox="0 0 ${W} ${H}" class="yz-svg" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><style>.yz-g{stroke:#e6edf3}.yz-ax{font:10px sans-serif;fill:#6b7f92;text-anchor:end}.yz-v{font:bold 11px sans-serif;fill:#17324b;text-anchor:middle}.yz-st{font:bold 11px sans-serif;fill:#17324b;text-anchor:middle}.yz-pct{font:10px sans-serif;fill:#4c6378;text-anchor:middle}.yz-over{fill:#c0392b}.yz-takt{stroke:#d62020;stroke-width:2.5}</style><line x1="${left}" y1="${top + ph}" x2="${W - 8}" y2="${top + ph}" stroke="#9fb1c0"/>${g}</svg></div>`;
  }
  function refreshYama(tr) {
    const sec = tr.closest('.sb-group'); if (!sec) return;
    const key = sec.dataset.key;
    const list = D().listStations().filter(r => lineKey(r) === key);
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
    const list = D().listStations().filter(r => lineKey(r) === key);
    const [, , , model, submodel] = key.split('§');
    const jphs = list.map(r => num(r.jph)).filter(Boolean);
    const mode = { pick: 'official' };
    const tk = groupTakt(list);
    let dlg = document.getElementById('sb-line-dlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'sb-line-dlg'; dlg.className = 'sb-dlg'; document.body.appendChild(dlg); }
    let last = null;
    const build = () => {
      const lanes = [], missing = [];
      list.forEach(r => {
        if (mode.pick === 'official' && D().ctInfo(r).src === 'after') { const jb = D().listJobs().find(j => D().group.key(j) === D().group.key(r) && (j.after || []).length); if (jb) { lanes.push({ station: r.station, elements: jb.after, round: 'After', date: '' }); return; } }
        const rounds = D().group.roundsOf(r.station);
        if (!rounds.length) { missing.push(r.station); return; }
        const s = mode.pick === 'latest' ? rounds[rounds.length - 1] : rounds.reduce((a, x) => (num(x.ct) > num(a.ct) ? x : a), rounds[0]);
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
      const ls = lineStats(r.groups.map(g => ({ label: g.label + (g.multi ? ' คนที่ ' + g.op : ''), ct: g.ct })), tk);
      body.innerHTML =
        `<div class="swct-sum"><span>สถานี <b>${lanes.length}</b></span><span>TAKT <b>${tk ? fmt(tk) : '—'}</b>${tk ? ' วิ' : ''}</span>` +
        `<span>C.T สูงสุด <b>${fmt(slow.ct)}</b> วิ (${esc(slow.label)})</span><span>ต่ำสุด <b>${fmt(fast.ct)}</b> วิ (${esc(fast.label)})</span>` +
        `<span>เฉลี่ย <b>${fmt(avg)}</b> วิ</span>${over.length ? `<span class="swct-over">เกิน TAKT ${over.length} สถานี: ${esc(over.map(g => g.label).join(', '))}</span>` : ''}` +
        `</div>` + lineStrip(lineStats(list.map(x => ({ label: x.station, ct: D().ctOf(x) })), tk), r.groups.some(g => g.multi) ? ls : null) +
        (missing.length ? `<p class="muted">ยังไม่มีรอบจับเวลา: ${esc(missing.join(', '))}</p>` : '') +
        `<div class="swct-scroll">${r.svg}</div>`;
    };
    dlg.innerHTML = `<div class="sbd-head"><b>SWCT ทั้งไลน์ · ${esc(model)} / ${esc(submodel)}</b>
      <label>ใช้รอบ <select id="sbl-pick"><option value="official">ตาม CT ที่ใช้ (After / รอบสูงสุด)</option><option value="latest">รอบล่าสุดของแต่ละสถานี (ดูเทียบ)</option><option value="max">รอบที่ C.T สูงสุด (ดูเทียบ)</option></select></label>
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
  window.CPSLine = { stats: lineStats, facts: lineFacts, strip: lineStrip };
})();
