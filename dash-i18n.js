// CPS IE Studio — ภาษา Dashboard และ PPT Report (ไทย / English / 中文)
// ใช้ค่าเดียวกับ CPS Digital Platform ('cpsPortal.lang' บนโดเมนเดียวกัน) เลือกภาษาที่ Portal แล้ว Dashboard ตามด้วย
(function (root) {
  const KEY = 'cpsPortal.lang';
  const LANGS = [['th', 'ไทย'], ['en', 'EN'], ['zh', '中文']];
  const W = { th: { week: 'สัปดาห์', month: 'เดือน' }, en: { week: 'week', month: 'month' }, zh: { week: '周', month: '月' } };
  const D = {
    th: {
      weekly: 'รายสัปดาห์', monthly: 'รายเดือน', weekOf: r => 'สัปดาห์ ' + r,
      level_factory: 'ระดับโรงงาน', level_workshop: 'ระดับ Workshop', level_group: 'ระดับกลุ่ม', level_team: 'ระดับทีม', allAreas: 'ทุกพื้นที่',
      roBanner: '👁️ โหมดวิเคราะห์ — แสดงข้อมูลรวมของพื้นที่นี้ (อ่านอย่างเดียว บันทึกได้เฉพาะระดับทีม)',
      range: (n, m, r) => `ช่วงข้อมูล ${n} ${W.th[m]}: ${r}`, periods: (n, m) => `${n} ${W.th[m]}`,
      items: 'รายการ', latestCount: (m, n) => `${W.th[m]}ล่าสุด ${n} รายการ`,
      avgCt: 'CT เฉลี่ย', sec: 'วินาที', s: 'วิ', vsPrev: m => 'เทียบ' + W.th[m] + 'ก่อน', same: 'เท่าเดิม', noStudy: 'ยังไม่มี Time Study',
      ctReduced: 'CT ที่ลดได้ (สะสม)', jobsAvg: (n, p) => `${n} งาน · ลดเฉลี่ย ${p}%`, noJobs: 'ยังไม่มีงานปรับปรุง',
      linesLow: (n, l) => `${n} ไลน์ · ต่ำกว่า 70% ${l} ไลน์`, noStation: 'ยังไม่มีข้อมูลสถานี', trained: 'อบรมสะสม', people: 'คน',
      redTitle: m => 'การลด CT ราย' + W.th[m], redNote: m => `แท่ง = CT ที่ลดได้ใน${W.th[m]}นั้น · เส้น = ลดสะสม (หน่วยวินาทีเดียวกัน)`,
      redSeries: m => `CT ที่ลดได้ใน${W.th[m]}นั้น (วินาที)`, cumSeries: 'ลดสะสม (วินาที)', cumLabel: v => `สะสม −${v} วิ`,
      reduced: 'ลดได้', cumulative: 'ลดสะสม', jobsN: n => `${n} งาน`, reducePct: p => ` · ลด ${p}%`,
      noJobsPeriod: 'ยังไม่มีงานวิเคราะห์ Before/After ในช่วงนี้',
      ctTitle: 'CT เฉลี่ย & VA / NNVA / NVA', ctTitleBy: m => 'CT เฉลี่ย & VA/NNVA/NVA ราย' + W.th[m], ctNote: 'เฉลี่ยต่อ Time Study · เส้นประ = TAKT เฉลี่ย',
      taktAvg: 'TAKT เฉลี่ย', noStudyPeriod: 'ยังไม่มี Time Study ในช่วงนี้',
      lbrTitle: m => 'Line Balance Rate ราย' + W.th[m], lbrNote: m => `ณ สิ้น${W.th[m]} · เป้า ≥ 85%`,
      lbrHelp: m => `ΣCT ÷ (จำนวนสถานี × CT สูงสุด) × 100 จาก Time Study ล่าสุดของแต่ละสถานี ณ สิ้น${W.th[m]}`,
      target85: 'เป้า 85%', linesN: n => `${n} ไลน์`, noData: 'ยังไม่มีข้อมูล', noLineStudy: 'ยังไม่มี Time Study ที่ผูกกับสถานีในไลน์',
      handsTitle: 'Two-Hand Operation ภาพรวม', handsNote: (n, m) => `สัดส่วนจำนวน element ของมือซ้าย/ขวา · ${n} ${W.th[m]}`,
      both: 'สองมือทำงานพร้อมกัน (○ + ○)', hold: 'มือถือค้าง ▽', wait: 'มือรอ D', left: 'มือซ้าย (L.H)', right: 'มือขวา (R.H)', symbol: 'สัญลักษณ์',
      sym: { O: 'ทำงาน', T: 'เคลื่อนย้าย', D: 'รอ', H: 'ถือค้าง', I: 'ตรวจสอบ' },
      elsNote: n => `${n} element จาก Time Study ในช่วงนี้`, noHands: 'ยังไม่มีข้อมูล Two-Handed ในช่วงนี้',
      topTitle: 'งานที่ลด CT ได้มากที่สุด', topNote: n => `${n} งานในช่วงนี้`,
      lbrTable: 'Line Balance Rate รายไลน์', sortedLow: n => `เรียงจากต่ำไปสูง · ${n} ไลน์`, lbrFormula: 'ΣCT ÷ (จำนวนสถานี × CT สูงสุด) × 100',
      cols: { line: 'ไลน์', model: 'รุ่น', st: 'สถานี', sum: 'ΣCT', neck: 'คอขวด', over: 'เกิน TAKT', eff: 'เทียบ TAKT', lbr: 'Line Balance Rate' },
      showLowest: (s, n) => `แสดง ${s} ไลน์ที่ต่ำสุด จาก ${n} ไลน์`,
      recent: 'ล่าสุด', tagJob: 'วิเคราะห์งาน', noArea: 'ยังไม่มีข้อมูลในพื้นที่นี้ เริ่มจากปุ่มด้านบน',
      goTs: '⏱️ บันทึก Time Study', goTsSub: 'จับเวลา element จากวิดีโอ เก็บเฉพาะค่า', goAn: '🔧 วิเคราะห์งาน Before/After', goAnSub: 'เทียบก่อน/หลัง + อบรม + รายงานอัตโนมัติ',
      ppt: '⬇ PPT Report', pptTip: 'ดาวน์โหลดรายงาน PowerPoint ตามแม่แบบ CHANGAN', building: 'กำลังสร้าง…', pptDone: 'ดาวน์โหลด PPT Report แล้ว',
      pptFail: e => 'สร้าง PPT ไม่สำเร็จ: ' + e, loadFail: 'โหลดตัวสร้าง PowerPoint ไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ต',
      // PPT
      r_generated: d => 'ออกรายงาน ' + d, r_summary: m => 'สรุปภาพรวม' + (m === 'week' ? 'รายสัปดาห์' : 'รายเดือน'), r_key: 'ประเด็นสำคัญ',
      r_totRed: 'ลด CT สะสม', r_avgJob: 'ลดเฉลี่ยต่องาน', r_vsBefore: 'เทียบ CT ก่อนปรับปรุง', r_best: m => W.th[m] + 'ที่ลดได้มากที่สุด',
      r_ctLatest: m => 'CT เฉลี่ย' + W.th[m] + 'ล่าสุด', r_vaAvg: 'VA เฉลี่ยทั้งช่วง', r_vaSub: 'สัดส่วนเวลาที่เพิ่มคุณค่า', r_inPeriod: 'รายการในช่วงนี้',
      r_overall: (v, n) => `ภาพรวม ${v}% · ${n} ไลน์ · เรียงจากต่ำไปสูง`, r_holdSub: 'ควรใช้ Jig / ที่จับแทนมือ', r_waitSub: 'จังหวะที่มือว่างไม่ได้ทำงาน',
      r_topCols: ['#', 'งาน', 'ทีม · สถานี', 'วันที่', 'ก่อน (วิ)', 'หลัง (วิ)', 'ลดได้'], r_lbrCols: ['ไลน์', 'สถานี', 'คอขวด', 'LBR'],
      ins_red: (t, n, p) => `ลด CT ได้รวม ${t} วินาที จาก ${n} งาน (ลดเฉลี่ย ${p}%)`, ins_best: (x, r, p) => `ลดได้มากที่สุด: ${x} −${r} วินาที (−${p}%)`,
      ins_ct: (m, c, d, down) => `CT เฉลี่ย${W.th[m]}ล่าสุด ${c} วินาที` + (d != null ? ` (${down ? 'ลดลง' : 'เพิ่มขึ้น'} ${d} วินาทีจาก${W.th[m]}ก่อน)` : ''),
      ins_va: p => `VA เฉลี่ย ${p}% ของเวลาทำงาน`, ins_lbr: (v, ok, g, ln, lv) => `Line Balance Rate ${v}% ` + (ok ? 'ผ่านเป้า 85%' : `ต่ำกว่าเป้า 85% อยู่ ${g} จุด`) + ` · ไลน์ที่ต้องปรับก่อน: ${ln} (${lv}%)`,
      ins_hold: p => `มือถือค้าง ▽ ${p}% ของ element — โอกาสใช้ Jig ช่วยจับ`, ins_none: 'ยังไม่มีข้อมูลในช่วงนี้',
    },
    en: {
      weekly: 'Weekly', monthly: 'Monthly', weekOf: r => 'Week of ' + r,
      level_factory: 'Factory level', level_workshop: 'Workshop level', level_group: 'Group level', level_team: 'Team level', allAreas: 'All areas',
      roBanner: '👁️ Analysis mode — combined data for this area (read-only; editing is at team level)',
      range: (n, m, r) => `Data range: ${n} ${W.en[m]}s · ${r}`, periods: (n, m) => `${n} ${W.en[m]}${n === 1 ? '' : 's'}`,
      items: 'records', latestCount: (m, n) => `Latest ${W.en[m]}: ${n}`,
      avgCt: 'Average CT', sec: 's', s: 's', vsPrev: m => 'vs last ' + W.en[m], same: 'No change', noStudy: 'No Time Study yet',
      ctReduced: 'CT reduced (cumulative)', jobsAvg: (n, p) => `${n} jobs · avg −${p}%`, noJobs: 'No improvements yet',
      linesLow: (n, l) => `${n} lines · ${l} below 70%`, noStation: 'No station data yet', trained: 'Trained (cumulative)', people: 'people',
      redTitle: m => 'CT reduction by ' + W.en[m], redNote: m => `Bars = CT reduced in the ${W.en[m]} · Line = cumulative (same seconds axis)`,
      redSeries: m => `CT reduced in the ${W.en[m]} (s)`, cumSeries: 'Cumulative reduction (s)', cumLabel: v => `Cumulative −${v} s`,
      reduced: 'Reduced', cumulative: 'Cumulative', jobsN: n => `${n} jobs`, reducePct: p => ` · −${p}%`,
      noJobsPeriod: 'No Before/After analyses in this period',
      ctTitle: 'Average CT & VA / NNVA / NVA', ctTitleBy: m => 'Average CT & VA/NNVA/NVA by ' + W.en[m], ctNote: 'Average per Time Study · dashed = average TAKT',
      taktAvg: 'Average TAKT', noStudyPeriod: 'No Time Study in this period',
      lbrTitle: m => 'Line Balance Rate by ' + W.en[m], lbrNote: m => `At end of each ${W.en[m]} · target ≥ 85%`,
      lbrHelp: m => `ΣCT ÷ (stations × max CT) × 100, using each station's latest Time Study at the end of the ${W.en[m]}`,
      target85: 'Target 85%', linesN: n => `${n} lines`, noData: 'No data', noLineStudy: 'No Time Study linked to line stations yet',
      handsTitle: 'Two-Hand Operation overview', handsNote: (n, m) => `Share of left/right-hand elements · ${n} ${W.en[m]}s`,
      both: 'Both hands working (○ + ○)', hold: 'Hand holding ▽', wait: 'Hand waiting D', left: 'Left hand (L.H)', right: 'Right hand (R.H)', symbol: 'Symbol',
      sym: { O: 'Operation', T: 'Transport', D: 'Delay', H: 'Hold', I: 'Inspection' },
      elsNote: n => `${n} elements from Time Studies in this period`, noHands: 'No two-handed data in this period',
      topTitle: 'Top CT reductions', topNote: n => `${n} jobs in this period`,
      lbrTable: 'Line Balance Rate by line', sortedLow: n => `Lowest first · ${n} lines`, lbrFormula: 'ΣCT ÷ (stations × max CT) × 100',
      cols: { line: 'Line', model: 'Model', st: 'Stations', sum: 'ΣCT', neck: 'Bottleneck', over: 'Over TAKT', eff: 'vs TAKT', lbr: 'Line Balance Rate' },
      showLowest: (s, n) => `Showing the ${s} lowest of ${n} lines`,
      recent: 'Recent', tagJob: 'Job analysis', noArea: 'No data in this area yet — start with the buttons above',
      goTs: '⏱️ Record Time Study', goTsSub: 'Time elements from video, values only', goAn: '🔧 Before/After job analysis', goAnSub: 'Compare before/after + training + auto report',
      ppt: '⬇ PPT Report', pptTip: 'Download a PowerPoint report in the CHANGAN template', building: 'Building…', pptDone: 'PPT Report downloaded',
      pptFail: e => 'Could not build PPT: ' + e, loadFail: 'Could not load the PowerPoint builder — check the internet connection',
      r_generated: d => 'Generated ' + d, r_summary: m => (m === 'week' ? 'Weekly' : 'Monthly') + ' summary', r_key: 'Key points',
      r_totRed: 'Cumulative CT reduction', r_avgJob: 'Average reduction per job', r_vsBefore: 'vs CT before improvement', r_best: m => 'Best ' + W.en[m],
      r_ctLatest: m => 'Average CT, latest ' + W.en[m], r_vaAvg: 'Average VA (period)', r_vaSub: 'Share of value-added time', r_inPeriod: 'records in this period',
      r_overall: (v, n) => `Overall ${v}% · ${n} lines · lowest first`, r_holdSub: 'Use jigs / fixtures instead of hands', r_waitSub: 'Idle hand time',
      r_topCols: ['#', 'Job', 'Team · Station', 'Date', 'Before (s)', 'After (s)', 'Reduced'], r_lbrCols: ['Line', 'Stations', 'Bottleneck', 'LBR'],
      ins_red: (t, n, p) => `CT reduced by ${t} s in total across ${n} jobs (avg −${p}%)`, ins_best: (x, r, p) => `Biggest reduction: ${x} −${r} s (−${p}%)`,
      ins_ct: (m, c, d, down) => `Average CT in the latest ${W.en[m]}: ${c} s` + (d != null ? ` (${down ? 'down' : 'up'} ${d} s from the previous ${W.en[m]})` : ''),
      ins_va: p => `VA averages ${p}% of working time`, ins_lbr: (v, ok, g, ln, lv) => `Line Balance Rate ${v}% — ` + (ok ? 'meets the 85% target' : `${g} points below the 85% target`) + ` · fix first: ${ln} (${lv}%)`,
      ins_hold: p => `Hand holding ▽ is ${p}% of elements — room for jigs`, ins_none: 'No data in this period yet',
    },
    zh: {
      weekly: '按周', monthly: '按月', weekOf: r => r + ' 当周',
      level_factory: '工厂级', level_workshop: '车间级', level_group: '工段级', level_team: '班组级', allAreas: '全部区域',
      roBanner: '👁️ 分析模式 — 显示本区域汇总数据（只读，仅班组级可编辑）',
      range: (n, m, r) => `数据范围：${n} ${m === 'week' ? '周' : '个月'} · ${r}`, periods: (n, m) => `${n} ${m === 'week' ? '周' : '个月'}`,
      items: '条', latestCount: (m, n) => `最近一${m === 'week' ? '周' : '个月'}：${n} 条`,
      avgCt: '平均 CT', sec: '秒', s: '秒', vsPrev: m => '较上' + W.zh[m], same: '持平', noStudy: '暂无 Time Study',
      ctReduced: 'CT 累计降低', jobsAvg: (n, p) => `${n} 项 · 平均降低 ${p}%`, noJobs: '暂无改善项目',
      linesLow: (n, l) => `${n} 条线 · ${l} 条低于 70%`, noStation: '暂无工位数据', trained: '累计培训', people: '人',
      redTitle: m => (m === 'week' ? '每周' : '每月') + ' CT 降低', redNote: m => `柱 = 当${W.zh[m]}降低的 CT · 线 = 累计降低（同一秒轴）`,
      redSeries: m => `当${W.zh[m]}降低 CT（秒）`, cumSeries: '累计降低（秒）', cumLabel: v => `累计 −${v} 秒`,
      reduced: '降低', cumulative: '累计降低', jobsN: n => `${n} 项`, reducePct: p => ` · 降低 ${p}%`,
      noJobsPeriod: '本期暂无改善前后（Before/After）分析',
      ctTitle: '平均 CT 与 VA / NNVA / NVA', ctTitleBy: m => (m === 'week' ? '每周' : '每月') + '平均 CT 与 VA/NNVA/NVA', ctNote: '每个 Time Study 的平均值 · 虚线 = 平均 TAKT',
      taktAvg: '平均 TAKT', noStudyPeriod: '本期暂无 Time Study',
      lbrTitle: m => (m === 'week' ? '每周' : '每月') + ' Line Balance Rate', lbrNote: m => `每${W.zh[m]}末 · 目标 ≥ 85%`,
      lbrHelp: m => `ΣCT ÷ (工位数 × 最大 CT) × 100，取每${W.zh[m]}末各工位最新的 Time Study`,
      target85: '目标 85%', linesN: n => `${n} 条线`, noData: '暂无数据', noLineStudy: '暂无与产线工位关联的 Time Study',
      handsTitle: '双手作业（Two-Hand Operation）概览', handsNote: (n, m) => `左右手要素数量占比 · ${n} ${m === 'week' ? '周' : '个月'}`,
      both: '双手同时作业 (○ + ○)', hold: '手持握 ▽', wait: '手等待 D', left: '左手 (L.H)', right: '右手 (R.H)', symbol: '符号',
      sym: { O: '操作', T: '移动', D: '等待', H: '持握', I: '检查' },
      elsNote: n => `本期 Time Study 共 ${n} 个要素`, noHands: '本期暂无双手作业数据',
      topTitle: 'CT 降低最多的项目', topNote: n => `本期 ${n} 项`,
      lbrTable: '各产线 Line Balance Rate', sortedLow: n => `由低到高 · ${n} 条线`, lbrFormula: 'ΣCT ÷ (工位数 × 最大 CT) × 100',
      cols: { line: '产线', model: '车型', st: '工位数', sum: 'ΣCT', neck: '瓶颈', over: '超 TAKT', eff: '对比 TAKT', lbr: 'Line Balance Rate' },
      showLowest: (s, n) => `显示 ${n} 条线中最低的 ${s} 条`,
      recent: '最近', tagJob: '作业分析', noArea: '本区域暂无数据，请从上方按钮开始',
      goTs: '⏱️ 记录 Time Study', goTsSub: '从视频测量要素时间，只保存数值', goAn: '🔧 改善前后作业分析', goAnSub: '前后对比 + 培训 + 自动报告',
      ppt: '⬇ PPT 报告', pptTip: '按 CHANGAN 模板下载 PowerPoint 报告', building: '生成中…', pptDone: '已下载 PPT 报告',
      pptFail: e => 'PPT 生成失败：' + e, loadFail: 'PowerPoint 生成组件加载失败 — 请检查网络',
      r_generated: d => '生成时间 ' + d, r_summary: m => (m === 'week' ? '周' : '月') + '度总览', r_key: '要点',
      r_totRed: 'CT 累计降低', r_avgJob: '每项平均降低', r_vsBefore: '相对改善前 CT', r_best: m => '降低最多的' + W.zh[m],
      r_ctLatest: m => '最近一' + (m === 'week' ? '周' : '个月') + '平均 CT', r_vaAvg: '本期平均 VA', r_vaSub: '增值时间占比', r_inPeriod: '本期记录',
      r_overall: (v, n) => `整体 ${v}% · ${n} 条线 · 由低到高`, r_holdSub: '建议用夹具代替手持', r_waitSub: '手空闲未作业的时间',
      r_topCols: ['#', '项目', '班组 · 工位', '日期', '改善前 (秒)', '改善后 (秒)', '降低'], r_lbrCols: ['产线', '工位数', '瓶颈', 'LBR'],
      ins_red: (t, n, p) => `${n} 项改善累计降低 CT ${t} 秒（平均降低 ${p}%）`, ins_best: (x, r, p) => `降低最多：${x} −${r} 秒（−${p}%）`,
      ins_ct: (m, c, d, down) => `最近一${m === 'week' ? '周' : '个月'}平均 CT ${c} 秒` + (d != null ? `（较上${W.zh[m]}${down ? '降低' : '增加'} ${d} 秒）` : ''),
      ins_va: p => `VA 平均占作业时间 ${p}%`, ins_lbr: (v, ok, g, ln, lv) => `Line Balance Rate ${v}%，` + (ok ? '达到 85% 目标' : `低于 85% 目标 ${g} 个百分点`) + `；优先改善：${ln}（${lv}%）`,
      ins_hold: p => `手持握 ▽ 占要素 ${p}% — 可考虑使用夹具`, ins_none: '本期暂无数据',
    },
  };
  // ---- SWCT ทั้งไลน์ ----
  Object.assign(D.th, {
    swctTitle: 'SWCT ทั้งไลน์', swctNote: 'ทุกสถานีในไลน์บนแกนเวลาเดียวกัน · เส้นแดง = TAKT', swctLine: 'ไลน์', swctRound: 'ใช้รอบ',
    pickLatest: 'ล่าสุดของแต่ละสถานี', pickMax: 'ที่ C.T สูงสุด', swctNoRounds: 'ยังไม่มีรอบจับเวลาของสถานีในไลน์นี้', swctMissing: l => 'ยังไม่มีรอบจับเวลา: ' + l,
    sw_st: 'สถานี', sw_ctMax: 'C.T สูงสุด', sw_ctMin: 'ต่ำสุด', sw_avg: 'เฉลี่ย', sw_over: (n, l) => `เกิน TAKT ${n} สถานี: ${l}`,
    sw_loss: 'Balance Loss', sw_neck: 'คอขวด', sw_eff: 'ประสิทธิภาพเทียบ TAKT', sw_min: (m, n, mu) => `${mu ? 'คน' : 'สถานี'}ขั้นต่ำตาม TAKT ${m} (ใช้อยู่ ${n})`,
    swct: { station: 'Station', no: 'ลำดับที่', name: 'ชื่องานที่ทำ', time: 'เวลา', hand: 'มือ', send: 'ส่ง', walk: 'เดิน', total: 'รวม', person: 'คนที่' },
    r_swctHead: 'SWCT ทั้งไลน์',
  });
  Object.assign(D.en, {
    swctTitle: 'Line SWCT', swctNote: 'All stations of the line on one time axis · red line = TAKT', swctLine: 'Line', swctRound: 'Round',
    pickLatest: 'Latest per station', pickMax: 'Highest C.T', swctNoRounds: 'No timed rounds for this line yet', swctMissing: l => 'No timed rounds: ' + l,
    sw_st: 'Stations', sw_ctMax: 'Max C.T', sw_ctMin: 'Min', sw_avg: 'Average', sw_over: (n, l) => `${n} over TAKT: ${l}`,
    sw_loss: 'Balance Loss', sw_neck: 'Bottleneck', sw_eff: 'Efficiency vs TAKT', sw_min: (m, n, mu) => `Min ${mu ? 'operators' : 'stations'} by TAKT ${m} (using ${n})`,
    swct: { station: 'Station', no: 'No.', name: 'Work element', time: 'Time', hand: 'Man', send: 'Auto', walk: 'Walk', total: 'Total', person: 'Op' },
    r_swctHead: 'Line SWCT',
  });
  Object.assign(D.zh, {
    swctTitle: '整线标准作业组合票 (SWCT)', swctNote: '全线工位同一时间轴 · 红线 = TAKT', swctLine: '产线', swctRound: '轮次',
    pickLatest: '各工位最新一轮', pickMax: 'C.T 最高的一轮', swctNoRounds: '本产线工位暂无测时记录', swctMissing: l => '暂无测时：' + l,
    sw_st: '工位', sw_ctMax: '最大 C.T', sw_ctMin: '最小', sw_avg: '平均', sw_over: (n, l) => `${n} 个工位超 TAKT：${l}`,
    sw_loss: 'Balance Loss', sw_neck: '瓶颈', sw_eff: '对比 TAKT 效率', sw_min: (m, n, mu) => `按 TAKT 最少${mu ? '人数' : '工位'} ${m}（现用 ${n}）`,
    swct: { station: '工位', no: '序号', name: '作业内容', time: '时间', hand: '手工', send: '自动', walk: '步行', total: '合计', person: '作业员' },
    r_swctHead: '整线 SWCT',
  });

  // 'zhen' = 中文 + English ในหน้าเดียว (สองภาษาคู่กัน) — เก็บแยกใน 'cps-ie-lang' เพราะ Portal มีแค่ zh / en / th
  const BI = 'zhen', OWN = 'cps-ie-lang';
  const EN_ONLY = ['s', 'sec', 'items', 'people', 'weekOf', 'periods', 'ppt', 'cumLabel'];   // หน่วย/วันที่ใช้ภาษาอังกฤษอย่างเดียวให้สั้น
  const LOCALE = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN', zhen: 'en-GB' };
  let lang = 'th';
  try { const v = localStorage.getItem(KEY); if (D[v]) lang = v; if (localStorage.getItem(OWN) === BI) lang = BI; } catch (e) {}
  const raw = (L, k, a) => { const v = D[L][k] !== undefined ? D[L][k] : D.en[k]; return typeof v === 'function' ? v(...a) : v; };
  function pair(z, e, sep) {
    if (Array.isArray(z)) return z.map((x, i) => pair(x, e[i], sep));
    if (z && typeof z === 'object') { const o = {}; Object.keys(z).forEach(k => o[k] = pair(z[k], e[k], sep)); return o; }
    return z === e ? z : z + sep + e;
  }
  const get = (k, a, sep) => lang !== BI ? raw(lang, k, a) : EN_ONLY.includes(k) ? raw('en', k, a) : pair(raw('zh', k, a), raw('en', k, a), sep);
  const api = {
    LANGS: [...LANGS, [BI, '中 / EN']],
    get lang() { return lang; },
    get bilingual() { return lang === BI; },
    set(v) {
      if (v !== BI && !D[v]) return; lang = v;
      try { if (v === BI) localStorage.setItem(OWN, BI); else { localStorage.removeItem(OWN); localStorage.setItem(KEY, v); } } catch (e) {}
    },
    locale: () => LOCALE[lang],
    t: (k, ...a) => get(k, a, ' / '),      // บนหน้าเว็บ: 中文 / English
    tn: (k, ...a) => get(k, a, '\n'),      // ในสไลด์: 中文 บรรทัดบน · English บรรทัดล่าง
  };
  Object.assign(D.th, { lbrOp: 'LBR ต่อคน (นับคนละช่อง)', lbrBoth: 'Line Balance Rate = ΣCT ÷ (จำนวนสถานี × CT สูงสุด) · LBR ต่อคน นับผู้ปฏิบัติงานแต่ละคนเป็น 1 ช่อง', noAreaRo: 'ยังไม่มีข้อมูลในพื้นที่นี้',
    pptStep1: 'กำลังโหลดเครื่องมือ…', pptStep2: 'กำลังสร้างสไลด์…', pptStep3: 'กำลังบันทึกไฟล์…' });
  Object.assign(D.en, { lbrOp: 'LBR per operator', lbrBoth: 'Line Balance Rate = ΣCT ÷ (stations × max CT) · LBR per operator counts each operator as one slot', noAreaRo: 'No data in this area yet',
    pptStep1: 'Loading tools…', pptStep2: 'Building slides…', pptStep3: 'Saving file…' });
  Object.assign(D.zh, { lbrOp: '按人计 LBR', lbrBoth: 'Line Balance Rate = ΣCT ÷ (工位数 × 最大 CT) · 按人计 LBR 每位作业员算一个位置', noAreaRo: '本区域暂无数据',
    pptStep1: '正在加载工具…', pptStep2: '正在生成幻灯片…', pptStep3: '正在保存文件…' });
  root.CPSDashI18n = api;
})(window);
