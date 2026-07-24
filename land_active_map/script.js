/* ============================================================
 * 市有土地活化地圖 — 前端邏輯
 * 資料來源：臺北市資料大平臺 data.taipei（臺北市政府資料大平臺）
 * ============================================================ */

const YI = 1e8;
const comma = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
function moneyAuto(v) {
  const n = Number(v) || 0, a = Math.abs(n);
  if (a >= YI) return (n / YI).toFixed(a >= 10 * YI ? 0 : 1) + ' 億';
  if (a >= 1e4) return Math.round(n / 1e4).toLocaleString('en-US') + ' 萬';
  return Math.round(n).toLocaleString('en-US');
}
function num(v) {
  if (v == null) return 0;
  const s = String(v).replace(/[, ]/g, '');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function theme() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  return {
    ink: dark ? '#e7edf4' : '#1a2430', sub: dark ? '#a9b6c4' : '#5a6877',
    grid: dark ? '#283543' : '#e8ebf0', surface: dark ? '#18222e' : '#ffffff',
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

const DIST_LIST = ['中正區','大同區','中山區','松山區','大安區','萬華區','信義區','士林區','北投區','內湖區','南港區','文山區'];
function norm(d) { if (!d) return null; return d.endsWith('區') ? d : d + '區'; }

let map, mapLayer;
let latestYear;

function safe(fn, label) {
  try { fn(); } catch (e) { console.error(`[land_active_map] ${label} 失敗:`, e); }
}

function init() {
  if (!dataGuard({
    PROPERTY: typeof PROPERTY !== 'undefined' ? PROPERTY : undefined,
    IDLE_LAND: typeof IDLE_LAND !== 'undefined' ? IDLE_LAND : undefined,
    UNUSED_LAND: typeof UNUSED_LAND !== 'undefined' ? UNUSED_LAND : undefined,
    UNUSED_BLDG: typeof UNUSED_BLDG !== 'undefined' ? UNUSED_BLDG : undefined,
    LEASE: typeof LEASE !== 'undefined' ? LEASE : undefined,
    SALE: typeof SALE !== 'undefined' ? SALE : undefined,
    URBAN: typeof URBAN !== 'undefined' ? URBAN : undefined,
    ADOPT: typeof ADOPT !== 'undefined' ? ADOPT : undefined,
    TAIPEI_GEOJSON: typeof TAIPEI_GEOJSON !== 'undefined' ? TAIPEI_GEOJSON : undefined,
  }, '市有土地活化地圖')) return;
  latestYear = Math.max(...PROPERTY.map((r) => r['年度']));
  document.getElementById('period').textContent =
    `市有財產資料至 ${latestYear}年12月 · 閒置／尚未利用房地清冊 · 金額單位：新臺幣`;
  safe(renderKPIs, 'renderKPIs');
  safe(renderInsights, 'renderInsights');
  safe(renderDonut, 'renderDonut');
  safe(renderTrend, 'renderTrend');
  safe(renderUrbanChart, 'renderUrbanChart');
  safe(buildMapMetricSelect, 'buildMapMetricSelect');
  safe(initMap, 'initMap');
  safe(renderIdleTable, 'renderIdleTable');
  safe(renderUnusedLand, 'renderUnusedLand');
  safe(renderUnusedBldg, 'renderUnusedBldg');
  safe(buildSaleFilter, 'buildSaleFilter');
  safe(renderSaleTable, 'renderSaleTable');
  safe(renderLeaseTable, 'renderLeaseTable');
  safe(renderAdoptTable, 'renderAdoptTable');
  document.getElementById('idleSearch').oninput = renderIdleTable;
  document.getElementById('saleSearch').oninput = renderSaleTable;
  document.getElementById('leaseSearch').oninput = renderLeaseTable;
}

function renderKPIs() {
  const totalAssetYuan = PROPERTY.filter((r) => r['年度'] === latestYear).reduce((s, r) => s + num(r['金額（元）']), 0);
  const idleCount = IDLE_LAND.length;
  const idleArea = IDLE_LAND.reduce((s, r) => s + num(r['列管面積_㎡']), 0);
  const unusedCount = UNUSED_LAND.length + UNUSED_BLDG.length;
  const soldYuan = SALE.filter((r) => r['後續處理'] === '已標脫').reduce((s, r) => s + num(r['得標價']), 0);
  const soldCount = SALE.filter((r) => r['後續處理'] === '已標脫').length;
  const leaseYuan = LEASE.reduce((s, r) => s + num(r['得標價_元']), 0);
  const urbanApproved = URBAN.filter((r) => String(r['最新辦理情形']).includes('核定')).length;

  const cards = [
    { label: `市有財產總額（${latestYear}年）`, value: moneyAuto(totalAssetYuan) + ' 元', sub: '土地、房屋、設備等 6 大類加總' },
    /{  label: `市有財產總額（${latestYear}年）`,  value: Number(totalAssetYuan).toLocaleString('zh-TW') + ' 元',  sub: '土地、房屋、設備等 6 大類加總'}/
    { label: '閒置土地', value: comma(idleCount) + ' <small>筆</small>', sub: `列管面積合計約 ${comma(idleArea)} ㎡` },
    { label: '尚未利用土地／建物', value: comma(unusedCount) + ' <small>筆</small>', sub: `土地 ${UNUSED_LAND.length} 筆・建物 ${UNUSED_BLDG.length} 筆` },
    { label: '標售已標脫金額', value: moneyAuto(soldYuan) + ' 元', sub: `累計 ${comma(soldCount)} 件已標脫` },
    { label: '標租累計得標金額', value: moneyAuto(leaseYuan) + ' 元', sub: `累計 ${comma(LEASE.length)} 件` },
    { label: '都市更新已核定案件', value: comma(urbanApproved), sub: `全部 ${comma(URBAN.length)} 案參與都更` },
  ];
  document.getElementById('kpis').innerHTML = cards.map((c) => `<div class="kpi">
    <div class="kpi__label">${c.label}</div>
    <div class="kpi__value">${c.value}</div>
    <div class="kpi__sub">${c.sub}</div></div>`).join('');
}

function renderInsights() {
  const byNature = {};
  PROPERTY.filter((r) => r['年度'] === latestYear).forEach((r) => {
    byNature[r['財產性質別']] = (byNature[r['財產性質別']] || 0) + num(r['金額（元）']);
  });
  const natureSorted = Object.entries(byNature).sort((a, b) => b[1] - a[1]);
  const total114 = natureSorted.reduce((s, [, v]) => s + v, 0);
  const first = PROPERTY.filter((r) => r['年度'] === Math.min(...PROPERTY.map(x => x['年度']))).reduce((s, r) => s + num(r['金額（元）']), 0);
  const growthPct = ((total114 - first) / first * 100).toFixed(1);

  const distCount = {};
  [...IDLE_LAND].forEach((r) => { const d = r['行政區']; distCount[d] = (distCount[d] || 0) + 1; });
  [...UNUSED_LAND].forEach((r) => { const d = norm(r['行政區']); distCount[d] = (distCount[d] || 0) + 1; });
  const distSorted = Object.entries(distCount).sort((a, b) => b[1] - a[1]);

  const reSaleCount = SALE.filter((r) => r['後續處理'] === '再標售').length;
  const reSaleRate = (reSaleCount / SALE.length * 100).toFixed(0);

  const items = [
    { tone: 'info', title: `市有財產 ${latestYear - Math.min(...PROPERTY.map(x=>x['年度']))} 年來成長 ${growthPct}%`,
      detail: `${latestYear}年市有財產總額約 ${moneyAuto(total114)} 元，其中「${natureSorted[0][0]}」占比最高，約 ${(natureSorted[0][1]/total114*100).toFixed(0)}%。` },
    { tone: 'watch', title: `「${distSorted[0][0]}」閒置／尚未利用房地最多`,
      detail: `「${distSorted[0][0]}」共有 ${distSorted[0][1]} 筆閒置或尚未利用土地，是全市最多的行政區，其餘案件分布在其他 11 個行政區。` },
    { tone: 'neg', title: `標售案約 ${reSaleRate}% 需要「再標售」`,
      detail: `263 件標售紀錄中，有 ${reSaleCount} 件因流標等原因列為「再標售」，只有 ${SALE.filter(r=>r['後續處理']==='已標脫').length} 件已成功標脫，顯示市有不動產標售並非每次都能順利成交。` },
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

function renderDonut() {
  const th = theme();
  document.getElementById('donutHint').textContent = `${latestYear}年12月`;
  const byNature = {};
  PROPERTY.filter((r) => r['年度'] === latestYear).forEach((r) => {
    byNature[r['財產性質別']] = (byNature[r['財產性質別']] || 0) + num(r['金額（元）']);
  });
  const data = Object.entries(byNature).map(([name, v]) => ({ name, value: +(v / YI).toFixed(1) })).sort((a, b) => b.value - a.value);
  chart('donut').setOption({
    color: th.palette,
    tooltip: { trigger: 'item', formatter: (p) => `${p.name}<br/>${comma(p.value)} 億元 (${p.percent}%)` },
    legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { color: th.sub, fontSize: 12 } },
    series: [{ type: 'pie', radius: ['46%', '72%'], center: ['34%', '50%'],
      itemStyle: { borderColor: th.surface, borderWidth: 2 }, label: { show: false }, data }],
  }, true);
}

function renderTrend() {
  const th = theme();
  const years = [...new Set(PROPERTY.map((r) => r['年度']))].sort();
  const totals = years.map((y) => +(PROPERTY.filter((r) => r['年度'] === y).reduce((s, r) => s + num(r['金額（元）']), 0) / YI).toFixed(0));
  chart('trend').setOption({
    grid: { left: 60, right: 20, top: 16, bottom: 28 },
    tooltip: { trigger: 'axis', valueFormatter: (v) => comma(v) + ' 億' },
    xAxis: { type: 'category', data: years.map((y) => y + '年'), axisTick: { show: false },
      axisLine: { lineStyle: { color: th.grid } }, axisLabel: { color: th.sub, fontSize: 11 } },
    yAxis: { type: 'value', name: '億元', nameTextStyle: { color: th.sub, fontSize: 11 },
      splitLine: { lineStyle: { color: th.grid } }, axisLabel: { color: th.sub, fontSize: 11 } },
    series: [{ type: 'line', smooth: true, symbolSize: 7, areaStyle: { color: th.brand, opacity: 0.08 },
      lineStyle: { color: th.brand, width: 2.5 }, itemStyle: { color: th.brand }, data: totals }],
  }, true);
}

function renderUrbanChart() {
  const th = theme();
  const counts = {};
  URBAN.forEach((r) => { counts[r['最新辦理情形']] = (counts[r['最新辦理情形']] || 0) + 1; });
  const data = Object.entries(counts).sort((a, b) => a[1] - b[1]);
  chart('urbanChart').setOption({
    grid: { left: 170, right: 40, top: 10, bottom: 24 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', axisLabel: { color: th.sub, fontSize: 11 }, splitLine: { lineStyle: { color: th.grid } } },
    yAxis: { type: 'category', data: data.map((d) => d[0]),
      axisLine: { lineStyle: { color: th.grid } }, axisTick: { show: false }, axisLabel: { color: th.ink, fontSize: 11.5 } },
    series: [{
      type: 'bar', barWidth: 15, data: data.map((d) => d[1]),
      itemStyle: { color: (p) => p.dataIndex === data.length - 1 ? th.pos : th.brand, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: th.sub, fontSize: 11 },
    }],
  }, true);
}

function buildMapMetricSelect() {
  const sel = document.getElementById('mapMetric');
  sel.innerHTML = `<option value="count">閒置＋尚未利用 筆數</option>
    <option value="area">閒置土地列管面積（㎡）</option>`;
  sel.onchange = renderMap;
}

function districtAgg() {
  const agg = {};
  DIST_LIST.forEach((d) => { agg[d] = { count: 0, area: 0 }; });
  IDLE_LAND.forEach((r) => { const d = r['行政區']; if (agg[d]) { agg[d].count++; agg[d].area += num(r['列管面積_㎡']); } });
  UNUSED_LAND.forEach((r) => { const d = norm(r['行政區']); if (agg[d]) agg[d].count++; });
  UNUSED_BLDG.forEach((r) => { const d = r['行政區']; if (agg[d]) agg[d].count++; });
  return agg;
}

function initMap() {
  map = L.map('landMap', { scrollWheelZoom: false }).setView([25.06, 121.55], 11.4);
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
  const metric = document.getElementById('mapMetric').value;
  const agg = districtAgg();
  const vals = DIST_LIST.map((d) => metric === 'count' ? agg[d].count : agg[d].area);
  const min = Math.min(...vals), max = Math.max(...vals);

  mapLayer.eachLayer((layer) => {
    const name = layer.feature.properties.name;
    const v = agg[name] ? (metric === 'count' ? agg[name].count : agg[name].area) : 0;
    layer.setStyle({ fillColor: colorScale(v, min, max), fillOpacity: 0.85, color: th.surface, weight: 1.5 });
    layer.unbindTooltip();
    const label = metric === 'count' ? `${comma(v)} 筆` : `${comma(v)} ㎡`;
    layer.bindTooltip(`<b>${name}</b><br>${label}`, { sticky: true });
    layer.off('mouseover mouseout');
    layer.on('mouseover', () => layer.setStyle({ weight: 3, color: th.gold }));
    layer.on('mouseout', () => layer.setStyle({ weight: 1.5, color: th.surface }));
  });

  const sorted = DIST_LIST.map((d) => ({ name: d, v: metric === 'count' ? agg[d].count : agg[d].area })).sort((a, b) => b.v - a.v);
  const unit = metric === 'count' ? ' 筆' : ' ㎡';
  document.getElementById('mapLegend').innerHTML = `
    <span>${comma(min)}${unit}</span>
    <span style="display:inline-block;width:120px;height:10px;border-radius:5px;
      background:linear-gradient(90deg, rgb(222,232,244), rgb(11,61,107))"></span>
    <span>${comma(max)}${unit}</span>
    <span style="margin-left:10px">顏色越深＝數量越多</span>`;
  document.getElementById('mapNote').textContent =
    `最多：${sorted[0].name}（${comma(sorted[0].v)}${unit}）。座標為行政區概略位置，非精確地址。`;
}

function renderIdleTable() {
  const q = (document.getElementById('idleSearch').value || '').trim();
  let rows = IDLE_LAND.slice().sort((a, b) => num(b['公告現值_金額_元']) - num(a['公告現值_金額_元']));
  if (q) rows = rows.filter((r) => (r['土地標示'] + r['都市計畫使用分區']).includes(q));
  const head = `<thead><tr><th>土地標示</th><th>行政區</th><th>面積(㎡)</th><th>使用分區</th><th>公告現值</th></tr></thead>`;
  const body = rows.map((r) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:220px">${r['土地標示']}</td>
    <td>${r['行政區'] || '—'}</td>
    <td class="num">${comma(r['列管面積_㎡'])}</td>
    <td>${r['都市計畫使用分區']}</td>
    <td class="num">${moneyAuto(num(r['公告現值_金額_元']))}</td>
  </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">沒有符合條件的資料</td></tr>`;
  document.getElementById('idleTableWrap').innerHTML =
    `<div class="card__hint" style="margin-bottom:8px">共 ${rows.length} 筆（全部 ${IDLE_LAND.length} 筆）</div>
     <table class="data">${head}<tbody>${body}</tbody></table>`;
}

function renderUnusedLand() {
  const rows = UNUSED_LAND.slice().sort((a, b) => num(b['面積_m2']) - num(a['面積_m2']));
  const head = `<thead><tr><th>地號</th><th>行政區</th><th>面積(㎡)</th><th>管理機關</th></tr></thead>`;
  const body = rows.map((r) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:180px">${r['段代碼_段小段_地號']}</td>
    <td>${r['行政區']}</td>
    <td class="num">${comma(r['面積_m2'])}</td>
    <td>${r['管理機關']}</td>
  </tr>`).join('');
  document.getElementById('unusedLandWrap').innerHTML =
    `<div class="card__hint" style="margin-bottom:8px">共 ${UNUSED_LAND.length} 筆</div><table class="data">${head}<tbody>${body}</tbody></table>`;
}

function renderUnusedBldg() {
  const rows = UNUSED_BLDG.slice().sort((a, b) => num(b['AREA_平方公尺']) - num(a['AREA_平方公尺']));
  const head = `<thead><tr><th>門牌</th><th>行政區</th><th>面積(㎡)</th><th>原用途</th><th>預定處理方式</th></tr></thead>`;
  const body = rows.map((r) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:160px">${r['門牌']}</td>
    <td>${r['行政區']}</td>
    <td class="num">${comma(r['AREA_平方公尺'])}</td>
    <td>${r['原使用用途']}</td>
    <td style="text-align:left;white-space:normal;min-width:220px">${r['預定處理方式'] || '—'}</td>
  </tr>`).join('');
  document.getElementById('unusedBldgWrap').innerHTML =
    `<div class="card__hint" style="margin-bottom:8px">共 ${UNUSED_BLDG.length} 筆</div><table class="data">${head}<tbody>${body}</tbody></table>`;
}

function buildSaleFilter() {
  const statuses = ['全部狀態', ...new Set(SALE.map((r) => r['後續處理']).filter(Boolean))];
  const sel = document.getElementById('saleFilter');
  sel.innerHTML = statuses.map((s) => `<option value="${s}">${s}</option>`).join('');
  sel.onchange = renderSaleTable;
}

function renderSaleTable() {
  const q = (document.getElementById('saleSearch').value || '').trim();
  const statusFilter = document.getElementById('saleFilter').value;
  let rows = SALE.slice();
  if (statusFilter && statusFilter !== '全部狀態') rows = rows.filter((r) => r['後續處理'] === statusFilter);
  if (q) rows = rows.filter((r) => (r['標案名稱'] + r['土地標示']).includes(q));
  rows = rows.slice(0, 150);
  const head = `<thead><tr><th>標案名稱</th><th>土地標示</th><th>標售底標</th><th>得標價</th><th>後續處理</th></tr></thead>`;
  const STATUS_TAG = { '已標脫': 'tag--pos', '再標售': 'tag--neg', '招標中': 'tag--ai' };
  const body = rows.map((r) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:260px">${r['標案名稱']}</td>
    <td style="text-align:left;white-space:normal;min-width:200px">${r['土地標示']}</td>
    <td class="num">${moneyAuto(num(r['標售底標金額']))}</td>
    <td class="num">${num(r['得標價']) ? moneyAuto(num(r['得標價'])) : '—'}</td>
    <td><span class="tag ${STATUS_TAG[r['後續處理']] || ''}">${r['後續處理'] || '—'}</span></td>
  </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">沒有符合條件的資料</td></tr>`;
  document.getElementById('saleTableWrap').innerHTML =
    `<div class="card__hint" style="margin-bottom:8px">顯示前 ${rows.length} 筆（符合條件全部 ${SALE.filter(r => (!statusFilter || statusFilter === '全部狀態' || r['後續處理'] === statusFilter) && (!q || (r['標案名稱']+r['土地標示']).includes(q))).length} 筆，全部資料 ${SALE.length} 筆）</div>
     <table class="data">${head}<tbody>${body}</tbody></table>`;
}

function renderLeaseTable() {
  const q = (document.getElementById('leaseSearch').value || '').trim();
  let rows = LEASE.slice().sort((a, b) => b['年度'] - a['年度']);
  if (q) rows = rows.filter((r) => String(r['建物門牌/地號']).includes(q));
  const head = `<thead><tr><th>建物門牌／地號</th><th>年度</th><th>出租面積(㎡)</th><th>標租底價</th><th>得標價</th></tr></thead>`;
  const body = rows.map((r) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:220px">${r['建物門牌/地號']}</td>
    <td>${r['年度']}</td>
    <td class="num">${r['出租面積_㎡']}</td>
    <td class="num">${moneyAuto(num(r['標租底價_元']))}</td>
    <td class="num">${num(r['得標價_元']) ? moneyAuto(num(r['得標價_元'])) : '—'}</td>
  </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">沒有符合條件的資料</td></tr>`;
  document.getElementById('leaseTableWrap').innerHTML =
    `<div class="card__hint" style="margin-bottom:8px">共 ${rows.length} 筆（全部 ${LEASE.length} 筆）</div>
     <table class="data">${head}<tbody>${body}</tbody></table>`;
}

function renderAdoptTable() {
  const head = `<thead><tr><th>土地標示</th><th>行政區</th><th>可提供使用面積(㎡)</th><th>公告地價(元/㎡)</th><th>使用分區</th></tr></thead>`;
  const body = ADOPT.map((r) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:220px">${r['土地標示']}</td>
    <td>${r['行政區'] || '—'}</td>
    <td class="num">${comma(r['可提供使用面積_㎡'])}</td>
    <td class="num">${comma(r['土地公告地價金額_元/㎡'])}</td>
    <td>${r['都市計畫使用分區']}</td>
  </tr>`).join('');
  document.getElementById('adoptTableWrap').innerHTML =
    `<div class="card__hint" style="margin-bottom:8px">共 ${ADOPT.length} 筆</div><table class="data">${head}<tbody>${body}</tbody></table>`;
}

init();
