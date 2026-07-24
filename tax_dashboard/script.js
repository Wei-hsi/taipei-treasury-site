/* ============================================================
 * 稅收儀表板 — 前端邏輯
 * 資料來源：臺北市資料大平臺 data.taipei（臺北市政府財政局）
 * 主資料「臺北市各項稅收快報」＋「地價稅／房屋稅開徵概況（按行政區）」。
 * ============================================================ */

const YI = 1e8, WAN = 1e4;
function moneyAuto(v) {
  const n = Number(v) || 0, a = Math.abs(n);
  if (a >= YI) return (n / YI).toFixed(a >= 10 * YI ? 0 : 1) + ' 億';
  if (a >= WAN) return Math.round(n / WAN).toLocaleString('en-US') + ' 萬';
  return Math.round(n).toLocaleString('en-US');
}
const comma = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
function pct(v, digits = 1) { const n = Number(v); return isFinite(n) ? n.toFixed(digits) + '%' : '—'; }
function delta(v, digits = 1) { const n = Number(v); return isFinite(n) ? (n > 0 ? '+' : '') + n.toFixed(digits) + '%' : '—'; }
function num(v) {
  if (v == null) return 0;
  const s = String(v).replace(/[, ]/g, '');
  if (s === '' || s === '-' || s === '--') return 0;
  const n = Number(s);
  return isFinite(n) ? n : 0;
}
function parseROC(ym) {
  const s = String(ym).trim();
  const roc = parseInt(s.slice(0, 3), 10);
  const month = parseInt(s.slice(3), 10);
  return { roc, month, label: `${roc}年${month}月` };
}

function theme() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  return {
    ink: dark ? '#e7edf4' : '#1a2430', sub: dark ? '#a9b6c4' : '#5a6877',
    muted: dark ? '#7d8a99' : '#8b97a6', grid: dark ? '#283543' : '#e8ebf0',
    surface: dark ? '#18222e' : '#ffffff',
    palette: [v('--c1'), v('--c2'), v('--c3'), v('--c4'), v('--c5'), v('--c6'), v('--c7'), v('--c8')],
    brand: v('--brand') || '#0B3D6B', gold: v('--gold') || '#C8A04B',
    pos: v('--pos') || '#1d9e75', neg: v('--neg') || '#c0433b',
  };
}
const charts = {};
function chart(id) {
  if (!charts[id]) charts[id] = echarts.init(document.getElementById(id), null, { renderer: 'svg' });
  return charts[id];
}
addEventListener('resize', () => Object.values(charts).forEach((c) => c.resize()));

const TOTAL = '稅捐收入';
const SKIP = new Set(['教育捐', '房屋稅附徵', '娛樂稅附徵', '特別及臨時稅課', '工程受益費', '田賦']);
const COLS = {
  ym: '資料年月', item: '項目別',
  budgetYear: '全年預算數（金額元）',
  monthActual: '本月實徵淨額（金額元）',
  cumActual: '累計實徵淨額（金額元）',
  cumPctBudget: '累計實徵淨額占全年預算（％）',
  lastYearMonth: '上年度同月實徵淨額（金額元）',
  cumYoY: '本年度累計實徵淨額與上年度同期累計實徵淨額比較增減（％）',
  monthYoY: '本年度本月實徵淨額與上年度同月實徵淨額比較增減（％）',
};

let periods, state = { tax: TOTAL };
let map, mapLayer;

function monthsOfYear(year) { return periods.filter((p) => String(p).startsWith(year)); }
function rowsAt(ym) { return KUAIBAO.filter((r) => r[COLS.ym] === ym); }
function row(ym, item) { return rowsAt(ym).find((r) => r[COLS.item] === item); }
function activeTaxes(year) {
  const months = monthsOfYear(year);
  const last = months[months.length - 1];
  return rowsAt(last)
    .filter((r) => r[COLS.item] !== TOTAL && !SKIP.has(r[COLS.item]) && num(r[COLS.cumActual]) > 0)
    .map((r) => r[COLS.item]);
}

function safe(fn, label) {
  try { fn(); } catch (e) { console.error(`[tax_dashboard] ${label} 失敗:`, e); }
}

function init() {
  if (!dataGuard({
    KUAIBAO: typeof KUAIBAO !== 'undefined' ? KUAIBAO : undefined,
    DISTRICTS: typeof DISTRICTS !== 'undefined' ? DISTRICTS : undefined,
    TAIPEI_GEOJSON: typeof TAIPEI_GEOJSON !== 'undefined' ? TAIPEI_GEOJSON : undefined,
  }, '稅收儀表板')) return;
  periods = [...new Set(KUAIBAO.map((r) => r[COLS.ym]))].sort((a, b) => a - b);
  state.year = String(parseROC(periods[periods.length - 1]).roc);
  safe(buildYearSelect, 'buildYearSelect');
  safe(buildTaxSelect, 'buildTaxSelect');
  safe(buildMapMetricSelect, 'buildMapMetricSelect');
  safe(renderAll, 'renderAll');
  safe(initMap, 'initMap');
}

function buildYearSelect() {
  const years = [...new Set(periods.map((p) => String(p).slice(0, 3)))].sort().reverse();
  const sel = document.getElementById('yearSel');
  sel.innerHTML = years.map((y) => `<option value="${y}">${y} 年度（民國）</option>`).join('');
  sel.value = state.year;
  sel.onchange = () => { state.year = sel.value; buildTaxSelect(); renderAll(); };
}
function buildTaxSelect() {
  const sel = document.getElementById('taxSel');
  const taxes = [TOTAL, ...activeTaxes(state.year)];
  if (!taxes.includes(state.tax)) state.tax = TOTAL;
  sel.innerHTML = taxes.map((t) => `<option value="${t}">${t === TOTAL ? '全部稅目（稅捐收入）' : t}</option>`).join('');
  sel.value = state.tax;
  sel.onchange = () => { state.tax = sel.value; renderTrend(); };
}
function buildMapMetricSelect() {
  const sel = document.getElementById('mapMetric');
  const metrics = [
    ['land_tax_yi', `地價稅查定稅額（億元）· ${DISTRICTS[0].land_year}年度`],
    ['house_value_yi', `房屋現值（億元）· ${DISTRICTS[0].house_year}年度`],
    ['land_house_count', '地價稅開徵戶數'],
    ['house_count', '房屋稅開徵戶數'],
  ];
  sel.innerHTML = metrics.map(([k, label]) => `<option value="${k}">${label}</option>`).join('');
  sel.onchange = () => renderMap();
}

function renderAll() {
  const months = monthsOfYear(state.year);
  const last = months[months.length - 1];
  const p = parseROC(last);
  document.getElementById('period').textContent =
    `資料期間 ${state.year}年1–${p.month}月 · 單位：新臺幣`;
  safe(() => renderKPIs(last), 'renderKPIs');
  safe(() => renderInsights(last), 'renderInsights');
  safe(() => renderDonut(last), 'renderDonut');
  safe(() => renderGauge(last), 'renderGauge');
  safe(renderTrend, 'renderTrend');
  safe(() => renderAchieve(last), 'renderAchieve');
  safe(() => renderTable(last), 'renderTable');
}

function renderKPIs(ym) {
  const t = row(ym, TOTAL);
  const taxes = activeTaxes(state.year).map((name) => ({ name, v: num(row(ym, name)[COLS.cumActual]) }));
  taxes.sort((a, b) => b.v - a.v);
  const top = taxes[0] || { name: '—', v: 0 };
  const cumTotal = num(t[COLS.cumActual]);

  const cards = [
    { label: `本月實徵淨額（${parseROC(ym).month}月）`, value: moneyAuto(num(t[COLS.monthActual])) + ' 元',
      d: num(t[COLS.monthYoY]), dlabel: '較上年同月' },
    { label: '本年累計實徵', value: moneyAuto(cumTotal) + ' 元',
      d: num(t[COLS.cumYoY]), dlabel: '較上年同期' },
    { label: '全年預算達成率', value: pct(num(t[COLS.cumPctBudget])),
      sub: `全年預算 ${moneyAuto(num(t[COLS.budgetYear]))} 元` },
    { label: '最大稅目', value: top.name, sub: `占 ${pct(cumTotal ? top.v / cumTotal * 100 : 0)} · ${moneyAuto(top.v)} 元` },
  ];
  document.getElementById('kpis').innerHTML = cards.map((c) => {
    let d = '';
    if (c.d != null && isFinite(c.d) && c.dlabel) {
      const cls = c.d > 0 ? 'up' : c.d < 0 ? 'down' : 'flat';
      const arrow = c.d > 0 ? '▲' : c.d < 0 ? '▼' : '–';
      d = `<div class="kpi__delta ${cls}">${arrow} ${c.dlabel} ${delta(c.d)}</div>`;
    } else if (c.sub) d = `<div class="kpi__sub">${c.sub}</div>`;
    return `<div class="kpi"><div class="kpi__label">${c.label}</div>
      <div class="kpi__value">${c.value}</div>${d}</div>`;
  }).join('');
}

function renderInsights(ym) {
  const t = row(ym, TOTAL);
  const cumYoY = num(t[COLS.cumYoY]);
  const achieve = num(t[COLS.cumPctBudget]);
  const taxes = activeTaxes(state.year).map((name) => ({ name, v: num(row(ym, name)[COLS.cumPctBudget]) }));
  const sortedByAchieve = taxes.slice().sort((a, b) => b.v - a.v);
  const best = sortedByAchieve[0], worst = sortedByAchieve[sortedByAchieve.length - 1];
  const distByTax = DISTRICTS.slice().sort((a, b) => b.land_tax_yi - a.land_tax_yi);
  const topDist = distByTax[0], bottomDist = distByTax[distByTax.length - 1];

  const items = [
    { tone: cumYoY >= 0 ? 'pos' : 'neg',
      title: `本年稅收較去年${cumYoY >= 0 ? '成長' : '衰退'} ${Math.abs(cumYoY).toFixed(1)}%`,
      detail: `${state.year}年度累計實徵淨額較上年同期${cumYoY >= 0 ? '增加' : '減少'} ${Math.abs(cumYoY).toFixed(1)}%，全年預算達成率為 ${achieve.toFixed(1)}%。` },
    { tone: 'info', title: `「${best?.name || '—'}」達成率最高`,
      detail: `達成率最高的稅目是「${best?.name}」（${best?.v.toFixed(1)}%），最低的是「${worst?.name}」（${worst?.v.toFixed(1)}%）。達成率不是越高越好，也要看整體景氣與課稅基礎變化。` },
    { tone: 'watch', title: `地價稅負擔：${topDist.name}最高、${bottomDist.name}最低`,
      detail: `${topDist.land_year}年度地價稅查定稅額，「${topDist.name}」約 ${topDist.land_tax_yi} 億元最高；「${bottomDist.name}」約 ${bottomDist.land_tax_yi} 億元最低，兩者相差約 ${(topDist.land_tax_yi - bottomDist.land_tax_yi).toFixed(1)} 億元。` },
  ];
  const TONE = { pos: 'var(--pos)', neg: 'var(--neg)', watch: 'var(--warn)', info: 'var(--brand-600)' };
  document.getElementById('insights').innerHTML = `<div class="card">
    <div class="block-head"><h2 class="card__title">重點觀察</h2>
      <span class="tag tag--ai">依目前資料整理</span></div>
    <div class="insight-grid">${items.map((i) => `<div class="insight" style="--tone:${TONE[i.tone]}">
      <div class="insight__head"><span class="insight__title">${i.title}</span></div>
      <div class="insight__detail">${i.detail}</div></div>`).join('')}</div>
  </div>`;
}

function renderDonut(ym) {
  const th = theme();
  const data = activeTaxes(state.year)
    .map((name) => ({ name, value: +(num(row(ym, name)[COLS.cumActual]) / YI).toFixed(1) }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  chart('donut').setOption({
    color: th.palette,
    tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/>${comma(p.value)} 億元 (${p.percent}%)` },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle', itemWidth: 10, itemHeight: 10, textStyle: { color: th.sub, fontSize: 12 } },
    series: [{ type: 'pie', radius: ['46%', '72%'], center: ['34%', '50%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: th.surface, borderWidth: 2 }, label: { show: false }, labelLine: { show: false }, data }],
  }, true);
}

function renderGauge(ym) {
  const th = theme();
  const v = +num(row(ym, TOTAL)[COLS.cumPctBudget]).toFixed(1);
  document.getElementById('gaugeHint').textContent = '本年累計 / 全年預算';
  chart('gauge').setOption({
    series: [{
      type: 'gauge', startAngle: 210, endAngle: -30, min: 0, max: 100, radius: '94%', center: ['50%', '56%'],
      progress: { show: true, width: 16, itemStyle: { color: th.gold } },
      axisLine: { lineStyle: { width: 16, color: [[1, th.grid]] } },
      pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { distance: -4, color: th.muted, fontSize: 11 },
      title: { offsetCenter: [0, '26%'], color: th.sub, fontSize: 13 },
      detail: { offsetCenter: [0, '-4%'], formatter: '{value}%', color: th.ink, fontSize: 32, fontWeight: 500 },
      data: [{ value: v, name: `截至 ${parseROC(ym).month} 月` }],
    }],
  }, true);
}

function renderTrend() {
  const th = theme();
  const months = monthsOfYear(state.year);
  const labels = months.map((m) => parseROC(m).month + '月');
  const cur = months.map((m) => +(num(row(m, state.tax)[COLS.monthActual]) / YI).toFixed(2));
  const prev = months.map((m) => +(num(row(m, state.tax)[COLS.lastYearMonth]) / YI).toFixed(2));
  chart('trend').setOption({
    grid: { left: 46, right: 16, top: 16, bottom: 28 },
    tooltip: { trigger: 'axis', valueFormatter: (v) => comma(v) + ' 億' },
    xAxis: { type: 'category', data: labels, axisTick: { show: false },
      axisLine: { lineStyle: { color: th.grid } }, axisLabel: { color: th.sub, fontSize: 11 } },
    yAxis: { type: 'value', name: '億元', nameTextStyle: { color: th.sub, fontSize: 11 },
      splitLine: { lineStyle: { color: th.grid } }, axisLabel: { color: th.sub, fontSize: 11 } },
    series: [
      { name: '本年', type: 'bar', barWidth: '52%', itemStyle: { color: th.brand, borderRadius: [4, 4, 0, 0] }, data: cur },
      { name: '去年同月', type: 'line', smooth: true, symbol: 'circle', symbolSize: 6,
        lineStyle: { color: th.gold, width: 2 }, itemStyle: { color: th.gold }, data: prev },
    ],
  }, true);
}

function renderAchieve(ym) {
  const th = theme();
  const data = activeTaxes(state.year)
    .map((name) => ({ name, v: +num(row(ym, name)[COLS.cumPctBudget]).toFixed(1) }))
    .filter((d) => isFinite(d.v) && d.v > 0).sort((a, b) => a.v - b.v);
  chart('achieve').setOption({
    grid: { left: 90, right: 48, top: 10, bottom: 24 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => v + '%' },
    xAxis: { type: 'value', axisLabel: { color: th.sub, fontSize: 11, formatter: '{value}%' }, splitLine: { lineStyle: { color: th.grid } } },
    yAxis: { type: 'category', data: data.map((d) => d.name),
      axisLine: { lineStyle: { color: th.grid } }, axisTick: { show: false }, axisLabel: { color: th.ink, fontSize: 12 } },
    series: [{
      type: 'bar', barWidth: 14, data: data.map((d) => d.v),
      itemStyle: { color: (p) => p.value >= 100 ? th.pos : th.brand, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', formatter: '{c}%', color: th.sub, fontSize: 11 },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: th.gold, type: 'dashed' },
        data: [{ xAxis: 100 }], label: { formatter: '預算 100%', color: th.gold, fontSize: 11 } },
    }],
  }, true);
}

function renderTable(ym) {
  document.getElementById('tableHint').textContent = `${parseROC(ym).label}累計`;
  const total = row(ym, TOTAL);
  const rows = [total, ...activeTaxes(state.year).map((n) => row(ym, n))];
  const head = `<thead><tr><th>項目別</th><th>本月實徵</th><th>本年累計</th>
    <th>全年預算</th><th>達成率</th><th>較上年同期</th></tr></thead>`;
  const body = rows.map((r) => {
    const isTotal = r[COLS.item] === TOTAL;
    const yoy = num(r[COLS.cumYoY]);
    const yoyCls = yoy > 0 ? 'tag--pos' : yoy < 0 ? 'tag--neg' : '';
    return `<tr style="${isTotal ? 'font-weight:500;background:var(--surface-2)' : ''}">
      <td class="cat">${r[COLS.item]}</td>
      <td class="num">${moneyAuto(num(r[COLS.monthActual]))}</td>
      <td class="num">${moneyAuto(num(r[COLS.cumActual]))}</td>
      <td class="num">${moneyAuto(num(r[COLS.budgetYear]))}</td>
      <td class="num">${pct(num(r[COLS.cumPctBudget]))}</td>
      <td class="num"><span class="tag ${yoyCls}">${delta(yoy)}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('detailTable').innerHTML = head + '<tbody>' + body + '</tbody>';
}

/* ── 各行政區稅負地圖（真實地價稅／房屋稅資料，行政區色階地圖）───────── */
function initMap() {
  map = L.map('taxmap', { scrollWheelZoom: false }).setView([25.06, 121.55], 11.4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 17,
  }).addTo(map);
  mapLayer = L.geoJSON(TAIPEI_GEOJSON, { style: () => ({}) }).addTo(map);
  renderMap();
}

function colorScale(v, min, max) {
  const t = max > min ? (v - min) / (max - min) : 0.5;
  const stops = [[222, 232, 244], [175, 200, 226], [120, 160, 202], [70, 118, 172], [11, 61, 107]];
  const idx = t * (stops.length - 1);
  const i0 = Math.floor(idx), i1 = Math.min(i0 + 1, stops.length - 1), f = idx - i0;
  const c = stops[i0].map((v0, k) => Math.round(v0 + (stops[i1][k] - v0) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function renderMap() {
  const th = theme();
  const metric = document.getElementById('mapMetric').value || 'land_tax_yi';
  const byName = Object.fromEntries(DISTRICTS.map((d) => [d.name, d]));
  const vals = DISTRICTS.map((d) => d[metric]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const isCount = metric.includes('count');

  mapLayer.eachLayer((layer) => {
    const name = layer.feature.properties.name;
    const d = byName[name];
    const v = d ? d[metric] : null;
    layer.setStyle({ fillColor: v == null ? '#ccc' : colorScale(v, min, max), fillOpacity: 0.85, color: th.surface, weight: 1.5 });
    layer.unbindTooltip();
    const label = isCount ? comma(v) + ' 戶' : comma(v) + ' 億元';
    layer.bindTooltip(`<b>${name}</b><br>${label}`, { sticky: true });
    layer.off('mouseover mouseout');
    layer.on('mouseover', () => layer.setStyle({ weight: 3, color: th.gold }));
    layer.on('mouseout', () => layer.setStyle({ weight: 1.5, color: th.surface }));
  });

  const metricLabel = document.getElementById('mapMetric').selectedOptions[0].textContent;
  const sorted = DISTRICTS.slice().sort((a, b) => b[metric] - a[metric]);
  const top = sorted[0], bottom = sorted[sorted.length - 1];
  const unit = isCount ? ' 戶' : ' 億';

  document.getElementById('mapLegend').innerHTML = `
    <span>${comma(min)}${unit}</span>
    <span style="display:inline-block;width:120px;height:10px;border-radius:5px;
      background:linear-gradient(90deg, rgb(222,232,244), rgb(11,61,107))"></span>
    <span>${comma(max)}${unit}</span>
    <span style="margin-left:10px">顏色越深＝${metricLabel.split('·')[0].trim()}越高</span>`;
  document.getElementById('mapNote').textContent =
    `最高 ${top.name} ${comma(top[metric])}${unit}、最低 ${bottom.name} ${comma(bottom[metric])}${unit}。資料：${metricLabel}。`;
}

init();
