// CPS IE Studio — PPT report ตามแม่แบบ CHANGAN "Confidential 16:9"
// (หน้าปก · หน้าเนื้อหาแบบ "仅标题" · ปกหลัง) กราฟเป็นกราฟ PowerPoint จริง แก้ไขต่อได้
// ใช้ได้ทั้งในเบราว์เซอร์ (window.CPSPptReport) และ Node (module.exports) สำหรับทดสอบ
(function (root) {
  const W = 12.567, H = 7.069;                     // ขนาดสไลด์เดียวกับแม่แบบ (11491595 × 6464300 EMU)
  const NAVY = '1F497D', BRAND = '00467F', INK = '17324B', MUTED = '5F7891', GRID = 'E6EDF3', CARD = 'F3F6FA';
  const FONT_EN = 'Noto Sans';
  const COL = { s1: '2A78D6', s2: 'EB6834', s3: '1BAF7A', s4: 'EDA100', s5: 'E87BA4', VA: '15856B', NNVA: 'AD7206', NVA: 'A64475', good: '15856B', warn: 'E08A00', bad: 'C0392B' };
  const lbrCol = v => v >= 85 ? COL.good : v >= 70 ? COL.warn : COL.bad;
  const f1 = n => (Math.round(n * 10) / 10).toLocaleString('en-US');

  function build(PptxGenJS, R, base) {
    const img = n => base + n, X = R.tx;
    // ไทย/English: Leelawadee UI (มีใน Windows ทุกเครื่อง) · 中文: Microsoft YaHei เหมือนแม่แบบ
    const FONT = R.lang === 'zh' ? 'Microsoft YaHei' : 'Leelawadee UI', LANG = R.lang === 'zh' ? 'zh-CN' : R.lang === 'en' ? 'en-US' : 'th-TH';
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'CHANGAN_16x9', width: W, height: H });
    pptx.layout = 'CHANGAN_16x9';
    pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
    pptx.title = 'CPS IE Studio Report — ' + R.area;
    pptx.author = 'CPS IE Studio'; pptx.company = 'Changan';

    pptx.defineSlideMaster({ title: 'COVER', background: { color: 'FFFFFF' }, objects: [
      { image: { x: 10.4, y: 0, w: 2.16, h: 0.78, path: img('cover-confidential.png') } },
      { image: { x: 2.8, y: 1.15, w: 6.97, h: 0.63, path: img('cover-tagline.png') } },
      { image: { x: 9.53, y: 6.14, w: 2.7, h: 0.71, path: img('cover-logo.png') } },
    ] });
    pptx.defineSlideMaster({ title: 'TITLE_ONLY', background: { color: 'FFFFFF' }, margin: [0.5, 0.5, 0.6, 0.5], objects: [
      { image: { x: 0.23, y: 0.06, w: 1.75, h: 0.46, path: img('page-logo.png') } },
      { image: { x: 2.93, y: 0.18, w: 6.71, h: 0.18, path: img('tagline-strip.png') } },
      { image: { x: 11.15, y: 0, w: 1.42, h: 0.4, path: img('page-confidential.png') } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.62, w: 11.57, h: 0.62, fontSize: 24, bold: true, color: BRAND, fontFace: FONT, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
      { text: { text: 'CPS IE Studio · ' + R.area + ' · ' + R.rangeText, options: { x: 0.5, y: 6.62, w: 9, h: 0.3, fontSize: 10, color: MUTED, fontFace: FONT, margin: 0 } } },
    ], slideNumber: { x: 11.4, y: 6.62, w: 0.67, h: 0.3, fontSize: 10, color: MUTED, fontFace: FONT, align: 'right' } });
    pptx.defineSlideMaster({ title: 'BACK', background: { color: 'FFFFFF' }, objects: [
      { image: { x: 4.36, y: 2.73, w: 3.78, h: 0.99, path: img('back-logo.png') } },
      { image: { x: 1.61, y: 6.2, w: 9.29, h: 0.25, path: img('tagline-strip.png') } },
    ] });

    const T = (s, text, o) => s.addText(text, Object.assign({ isTextBox: true, fontFace: FONT, color: INK, margin: 0, lang: LANG }, o));
    const page = (title, section) => { const s = pptx.addSlide({ masterName: 'TITLE_ONLY', sectionTitle: section }); s.addText(title, { placeholder: 'title' }); return s; };
    const axis = () => ({
      catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
      valGridLine: { color: GRID, size: 0.75 }, catGridLine: { style: 'none' }, catAxisLineShow: true, valAxisLineShow: false,
      showLegend: true, legendPos: 't', legendFontFace: FONT, legendFontSize: 11, legendColor: INK,
    });
    const callout = (s, x, y, w, label, value, sub, color) => {
      s.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 1.25, fill: { color: CARD }, line: { color: CARD }, rectRadius: 0.08, objectName: 'card ' + label });
      T(s, label, { x: x + 0.22, y: y + 0.14, w: w - 0.44, h: 0.3, fontSize: 12, color: MUTED });
      T(s, value, { x: x + 0.22, y: y + 0.42, w: w - 0.44, h: 0.5, fontSize: 26, bold: true, color: color || INK });
      if (sub) T(s, sub, { x: x + 0.22, y: y + 0.9, w: w - 0.44, h: 0.26, fontSize: 10, color: MUTED });
    };
    const empty = (s, msg) => T(s, msg, { x: 0.5, y: 3, w: 11.57, h: 0.6, fontSize: 16, color: MUTED, align: 'center' });

    // 1) ปก
    pptx.addSection({ title: 'Cover' });
    const c = pptx.addSlide({ masterName: 'COVER', sectionTitle: 'Cover' });
    T(c, [{ text: 'CPS IE Studio Report', options: { fontFace: FONT_EN, breakLine: true } }, { text: R.area + ' · ' + R.modeTitle }],
      { x: 0, y: 1.96, w: W, h: 1.45, fontSize: 36, color: NAVY, align: 'center', valign: 'middle' });
    T(c, 'SOUTHEAST ASIA BUSINESS UNIT | ' + R.levelLabel + ' | ' + R.rangeText, { x: 0, y: 3.59, w: W, h: 0.4, fontSize: 14, color: NAVY, align: 'center' });
    T(c, X.generated + R.generated, { x: 0, y: 4.1, w: W, h: 0.3, fontSize: 11, color: MUTED, align: 'center' });

    // 2) สรุป
    pptx.addSection({ title: 'Summary' });
    let s = page(X.summary, 'Summary');
    R.kpis.forEach((k, i) => callout(s, 0.5 + (i % 2) * 3.45, 1.5 + Math.floor(i / 2) * 1.5, 3.25, k.label, k.value, k.sub, k.color));
    s.addShape(pptx.ShapeType.roundRect, { x: 7.55, y: 1.5, w: 4.52, h: 4.25, fill: { color: 'FFFFFF' }, line: { color: 'D8E2EC', width: 1 }, rectRadius: 0.08, objectName: 'key points' });
    T(s, X.key, { x: 7.8, y: 1.68, w: 4.0, h: 0.4, fontSize: 16, bold: true, color: BRAND });
    T(s, R.insights.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < R.insights.length - 1 } })),
      { x: 7.8, y: 2.15, w: 4.05, h: 3.45, fontSize: 13, valign: 'top', paraSpaceAfter: 8 });

    // 3) การลด CT (combination: แท่ง + เส้น แกนเดียว หน่วยวินาที)
    pptx.addSection({ title: 'CT' });
    s = page(X.redTitle, 'CT');
    if (R.red.some(v => v > 0)) {
      s.addChart([
        { type: pptx.ChartType.bar, data: [{ name: X.redSeries, labels: R.labels, values: R.red.map(v => +v.toFixed(1)) }], options: { chartColors: [COL.s1], barGapWidthPct: 80, showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 9, dataLabelColor: INK, dataLabelFormatCode: '0.0;;;' } },
        { type: pptx.ChartType.line, data: [{ name: X.cumSeries, labels: R.labels, values: R.cum.map(v => +v.toFixed(1)) }], options: { chartColors: [COL.s2], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 7 } },
      ], Object.assign(axis(), { x: 0.5, y: 1.45, w: 8.4, h: 4.95, valAxisTitle: X.sec, showValAxisTitle: true, valAxisTitleFontSize: 10, valAxisTitleColor: MUTED, objectName: 'CT reduction chart' }));
      callout(s, 9.15, 1.5, 2.92, X.totRed, '−' + f1(R.totRed) + ' ' + X.s, X.jobsN, COL.good);
      callout(s, 9.15, 2.95, 2.92, X.avgJob, f1(R.avgPct) + '%', X.vsBefore);
      callout(s, 9.15, 4.4, 2.92, X.best, R.bestLabel || '—', R.bestRed ? '−' + f1(R.bestRed) + ' ' + X.s : '');
    } else empty(s, X.noJobs);

    // 4) CT เฉลี่ย VA/NNVA/NVA + TAKT
    s = page(X.ctTitle, 'CT');
    if (R.va.some(v => v > 0)) {
      const parts = [
        { type: pptx.ChartType.bar, data: [['VA', R.va], ['NNVA', R.nnva], ['NVA', R.nva]].map(([n, v]) => ({ name: n, labels: R.labels, values: v.map(x => +x.toFixed(1)) })),
          options: { barGrouping: 'stacked', chartColors: [COL.VA, COL.NNVA, COL.NVA], barGapWidthPct: 70 } },
      ];
      if (R.takt.some(v => v)) parts.push({ type: pptx.ChartType.line, data: [{ name: X.takt, labels: R.labels, values: R.takt.map(v => v ? +v.toFixed(1) : null) }], options: { chartColors: [INK], lineSize: 2, lineDash: 'dash', lineDataSymbol: 'none' } });
      s.addChart(parts, Object.assign(axis(), { x: 0.5, y: 1.45, w: 8.4, h: 4.95, valAxisTitle: X.sec, showValAxisTitle: true, valAxisTitleFontSize: 10, valAxisTitleColor: MUTED, objectName: 'CT by type chart' }));
      callout(s, 9.15, 1.5, 2.92, X.ctLatest, R.ctLast != null ? f1(R.ctLast) + ' ' + X.s : '—', R.ctDelta || '');
      callout(s, 9.15, 2.95, 2.92, X.vaAvg, f1(R.vaPct) + '%', X.vaSub);
      callout(s, 9.15, 4.4, 2.92, 'Time Study', String(R.nStudy), X.inPeriod);
    } else empty(s, X.noStudy);

    // 5) Line Balance Rate
    pptx.addSection({ title: 'Line Balance' });
    s = page('Line Balance Rate', 'Line Balance');
    const lv = R.lbr.map(v => v == null ? null : +v.toFixed(1));
    if (lv.some(v => v != null)) {
      const mn = Math.min(...lv.filter(v => v != null));
      s.addChart([
        { type: pptx.ChartType.line, data: [{ name: 'Line Balance Rate (%)', labels: R.labels, values: lv }], options: { chartColors: [COL.s1], lineSize: 2, lineDataSymbol: 'circle', lineDataSymbolSize: 7 } },
        { type: pptx.ChartType.line, data: [{ name: X.target, labels: R.labels, values: R.labels.map(() => 85) }], options: { chartColors: [COL.good], lineSize: 1.5, lineDash: 'dash', lineDataSymbol: 'none' } },
      ], Object.assign(axis(), { x: 0.5, y: 1.45, w: 5.9, h: 4.95,
        valAxisMinVal: Math.min(60, Math.floor((mn - 5) / 10) * 10), valAxisMaxVal: 100, valAxisLabelFormatCode: '0"%"', objectName: 'LBR trend chart' }));
    }
    if (R.lines.length) {
      const hd = X.lbrCols.map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: BRAND } } }));
      const rows = R.lines.slice(0, 9).map(l => [l.area + '\n' + l.model, String(l.n), l.neck + ' · ' + f1(l.max) + ' ' + X.s, { text: f1(l.lbr) + '%', options: { bold: true, color: lbrCol(l.lbr) } }]);
      s.addTable([hd, ...rows], { x: 6.65, y: 1.5, w: 5.42, colW: [2.2, 0.7, 1.67, 0.85], fontFace: FONT, fontSize: 10, color: INK, border: { type: 'solid', pt: 0.5, color: 'D8E2EC' }, valign: 'middle', margin: 0.05, objectName: 'LBR by line' });
      T(s, X.overall, { x: 6.65, y: 6.18, w: 5.42, h: 0.28, fontSize: 10, color: MUTED });
    }
    if (!lv.some(v => v != null) && !R.lines.length) empty(s, X.noStation);

    // 6) Two-Hand Operation
    pptx.addSection({ title: 'Two-Hand' });
    s = page(X.handsTitle, 'Two-Hand');
    if (R.hands.els) {
      const SY = [['O', X.sym.O, COL.s1], ['T', X.sym.T, COL.s2], ['D', X.sym.D, COL.s3], ['H', X.sym.H, COL.s4], ['I', X.sym.I, COL.s5]];
      const pct = (o, k) => { const t = SY.reduce((a, [x]) => a + (o[x] || 0), 0) || 1; return +((o[k] || 0) / t * 100).toFixed(1); };
      s.addChart(pptx.ChartType.bar, SY.map(([k, n]) => ({ name: n, labels: [X.left, X.right], values: [pct(R.hands.L, k), pct(R.hands.R, k)] })),
        Object.assign(axis(), { x: 0.5, y: 1.45, w: 7.4, h: 3.1, barDir: 'bar', barGrouping: 'percentStacked', chartColors: SY.map(x => x[2]), barGapWidthPct: 45,
          showValue: true, dataLabelPosition: 'ctr', dataLabelFontSize: 10, dataLabelColor: 'FFFFFF', dataLabelFormatCode: '0"%";;;', valAxisLabelFormatCode: '0%', catAxisOrientation: 'maxMin', objectName: 'two-hand chart' }));
      const hd = [X.symbol, 'L.H', 'R.H'].map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: BRAND } } }));
      s.addTable([hd, ...SY.map(([k, n]) => [n, f1(pct(R.hands.L, k)) + '%  (' + (R.hands.L[k] || 0) + ')', f1(pct(R.hands.R, k)) + '%  (' + (R.hands.R[k] || 0) + ')'])],
        { x: 0.5, y: 4.7, w: 7.4, colW: [2.8, 2.3, 2.3], fontFace: FONT, fontSize: 11, color: INK, border: { type: 'solid', pt: 0.5, color: 'D8E2EC' }, margin: 0.05, objectName: 'two-hand table' });
      callout(s, 8.25, 1.5, 3.82, X.both, f1(R.hands.bothPct) + '%', X.elements);
      callout(s, 8.25, 2.95, 3.82, X.hold, f1(R.hands.holdPct) + '%', X.holdSub);
      callout(s, 8.25, 4.4, 3.82, X.wait, f1(R.hands.waitPct) + '%', X.waitSub);
    } else empty(s, X.noHands);

    // 7) งานที่ลด CT ได้มากที่สุด
    pptx.addSection({ title: 'Kaizen' });
    s = page(X.topTitle, 'Kaizen');
    if (R.top.length) {
      const hd = X.topCols.map(t => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: BRAND } } }));
      const rows = R.top.slice(0, 10).map((k, i) => [String(i + 1), k.name, k.where, k.date, f1(k.bf), f1(k.af), { text: '−' + f1(k.red) + ' ' + X.s + ' (−' + f1(k.pct) + '%)', options: { bold: true, color: COL.good } }]);
      s.addTable([hd, ...rows], { x: 0.5, y: 1.5, w: 11.57, colW: [0.45, 3.4, 2.5, 1.35, 1.1, 1.1, 1.67], fontFace: FONT, fontSize: 11, color: INK, border: { type: 'solid', pt: 0.5, color: 'D8E2EC' }, margin: 0.06, valign: 'middle', objectName: 'top kaizen' });
    } else empty(s, X.noJobs);

    // 8) ปกหลัง
    pptx.addSection({ title: 'End' });
    pptx.addSlide({ masterName: 'BACK', sectionTitle: 'End' });
    return pptx;
  }

  // ไฟล์จาก pptxgenjs มีรายการโฟลเดอร์ใน zip ซึ่ง OneDrive/Teams เปิดร่วมกันไม่ได้ — แพ็กใหม่เฉพาะไฟล์
  async function toBlob(pptx, JSZip) {
    const src = await JSZip.loadAsync(await pptx.write({ outputType: 'arraybuffer' })), out = new JSZip();
    for (const [name, f] of Object.entries(src.files)) if (!f.dir) out.file(name, await f.async('uint8array'), { createFolders: false });
    return out.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
  async function toBuffer(pptx, JSZip) {
    const src = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer' })), out = new JSZip();
    for (const [name, f] of Object.entries(src.files)) if (!f.dir) out.file(name, await f.async('uint8array'), { createFolders: false });
    return out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
  const api = { build, toBlob, toBuffer, fileName: R => ('CPS-IE-Report_' + R.area + '_' + R.modeTitle + '_' + R.stamp).replace(/[\\/:*?"<>|\s]+/g, '_') + '.pptx' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CPSPptReport = api;
})(typeof window !== 'undefined' ? window : this);
