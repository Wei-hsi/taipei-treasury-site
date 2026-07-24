/* ============================================================
 * 促參／BOT 透明資料庫 — 前端邏輯
 * 資料來源：臺北市資料大平臺 data.taipei（臺北市政府財政局）
 * ============================================================ */

const comma = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');
const YI = 1e8;
function moneyAuto(v) {
  const n = Number(v) || 0, a = Math.abs(n);
  if (a >= YI) return (n / YI).toFixed(a >= 10 * YI ? 0 : 1) + ' 億';
  if (a >= 1e4) return Math.round(n / 1e4).toLocaleString('en-US') + ' 萬';
  return Math.round(n).toLocaleString('en-US');
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
    pos: v('--pos') || '#1d9e75', neg: v('--neg') || '#c0433b', warn: v('--warn') || '#b9821a',
  };
}
const charts = {};
function chart(id) {
  if (!charts[id]) charts[id] = echarts.init(document.getElementById(id), null, { renderer: 'svg' });
  return charts[id];
}
addEventListener('resize', () => Object.values(charts).forEach((c) => c.resize()));

const state = { type: '全部類型', agency: '全部機關', q: '' };
let map, mapLayer;

function safe(fn, label) {
  try { fn(); } catch (e) { console.error(`[bot_cases] ${label} 失敗:`, e); }
}

function init() {
  const totalSigned = TYPE_SUMMARY.reduce((s, t) => s + t['已結案'] + t['履約中'], 0);
  document.getElementById('period').textContent =
    `已簽約案件 ${comma(totalSigned)} 件 · 地上權 ${comma(TYPE_SUMMARY.find(t=>t.type==='設定地上權').count)} 案 · `
    + `委託經營 ${comma(TYPE_SUMMARY.find(t=>t.type==='委託經營').count)} 案 · 金額單位：新臺幣`;
  safe(renderKPIs, 'renderKPIs');
  safe(renderInsights, 'renderInsights');
  safe(renderTypeChart, 'renderTypeChart');
  safe(renderStageChart, 'renderStageChart');
  safe(renderRoyaltyChart, 'renderRoyaltyChart');
  safe(buildFilters, 'buildFilters');
  safe(renderContractsTable, 'renderContractsTable');
  safe(renderSupTable, 'renderSupTable');
  safe(renderEntrustedTable, 'renderEntrustedTable');
  safe(initMap, 'initMap');
  document.getElementById('entrustedSearch').oninput = renderEntrustedTable;
}

function renderKPIs() {
  const totalSigned = TYPE_SUMMARY.reduce((s, t) => s + t['已結案'] + t['履約中'], 0);
  const totalInvestYi = TYPE_SUMMARY.reduce((s, t) => s + t.invest_yi, 0);
  const totalRoyaltyYi = TYPE_SUMMARY.reduce((s, t) => s + t.royalty_yi, 0);
  const totalRentYi = TYPE_SUMMARY.reduce((s, t) => s + t.rent_yi, 0);
  const ongoing = TYPE_SUMMARY.reduce((s, t) => s + t['履約中'], 0);

  const cards = [
    { label: '已簽約案件總數', value: comma(totalSigned), sub: '含 BOT/BOO/ROT/OT、地上權、委託經營' },
    { label: '民間投資總額', value: comma(totalInvestYi) + ' <small>億元</small>', sub: `約 ${comma(totalInvestYi)} 億元` },
    { label: '權利金累計', value: comma(totalRoyaltyYi) + ' <small>億元</small>', sub: '回饋市庫之權利金' },
    { label: '年土地租金', value: totalRentYi.toFixed(1) + ' <small>億元/年</small>', sub: '當年度土地租金合計' },
    { label: '履約中案件', value: comma(ongoing), sub: '已簽約且仍在履約中' },
  ];
  document.getElementById('kpis').innerHTML = cards.map((c) => `<div class="kpi">
    <div class="kpi__label">${c.label}</div>
    <div class="kpi__value">${c.value}</div>
    <div class="kpi__sub">${c.sub}</div></div>`).join('');
}

function renderInsights() {
  const byRoyaltyShare = TYPE_SUMMARY.slice().sort((a, b) => b.royalty_yi - a.royalty_yi);
  const top = byRoyaltyShare[0];
  const totalInvest = TYPE_SUMMARY.reduce((s, t) => s + t.invest_yi, 0);
  const totalRoyalty = TYPE_SUMMARY.reduce((s, t) => s + t.royalty_yi, 0);
  const supSorted = SUPERFICIES.slice().sort((a, b) => b['當年度租金_億'] - a['當年度租金_億']);
  const topSup = supSorted.slice(0, 3).map((s) => `${s['現況']} ${s['決標權利金_億'].toFixed(1)}億`).join('、');
  const rateByType = TYPE_SUMMARY.map((t) => ({ type: t.type, rate: t.invest_yi ? t.royalty_yi / t.invest_yi * 100 : 0 }))
    .sort((a, b) => b.rate - a.rate);

  const items = [
    { tone: 'pos', title: '地上權是市庫金雞母',
      detail: `設定地上權 ${TYPE_SUMMARY.find(t=>t.type==='設定地上權').count} 案累計決標權利金約 ${comma(top.royalty_yi)} 億、占全部促參權利金逾 ${(top.royalty_yi/totalRoyalty*100).toFixed(0)}%，年土地租金 ${TYPE_SUMMARY.find(t=>t.type==='設定地上權').rent_yi.toFixed(1)} 億。` },
    { tone: 'info', title: '地上權回饋率遠高於 BOT',
      detail: `地上權權利金約為民間投資的 ${rateByType.find(r=>r.type==='設定地上權').rate.toFixed(0)}%，BOT 僅約 ${rateByType.find(r=>r.type==='BOT').rate.toFixed(0)}%，兩種模式回饋市庫結構差異明顯。` },
    { tone: 'pos', title: '信義計畫區地標撐起權利金',
      detail: `權利金前段班為 ${topSup}（決標權利金，單位億元）。` },
    { tone: 'watch', title: '仍有案件在規劃辦理中',
      detail: `全市促參案件中，還有 ${TYPE_SUMMARY.reduce((s,t)=>s+t['規劃辦理中'],0)} 件處於規劃／招商辦理階段，尚未正式簽約。` },
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

function renderTypeChart() {
  const th = theme();
  const cats = TYPE_SUMMARY.map((t) => t.type);
  chart('typeChart').setOption({
    grid: { left: 56, right: 50, top: 30, bottom: 28 },
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: th.sub, fontSize: 11.5 } },
    xAxis: { type: 'category', data: cats, axisTick: { show: false },
      axisLine: { lineStyle: { color: th.grid } }, axisLabel: { color: th.sub, fontSize: 11 } },
    yAxis: [
      { type: 'value', name: '民間投資（億元）', nameTextStyle: { color: th.sub, fontSize: 10.5 },
        splitLine: { lineStyle: { color: th.grid } }, axisLabel: { color: th.sub, fontSize: 11 } },
      { type: 'value', name: '件數', position: 'right', splitLine: { show: false },
        nameTextStyle: { color: th.sub, fontSize: 10.5 }, axisLabel: { color: th.sub, fontSize: 11 } },
    ],
    series: [
      { name: '民間投資（億元）', type: 'bar', itemStyle: { color: th.brand, borderRadius: [4, 4, 0, 0] },
        data: TYPE_SUMMARY.map((t) => +t.invest_yi.toFixed(1)) },
      { name: '件數', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 7,
        lineStyle: { color: th.gold, width: 2.5 }, itemStyle: { color: th.gold },
        data: TYPE_SUMMARY.map((t) => t.count) },
    ],
  }, true);
}

function renderStageChart() {
  const th = theme();
  const rows = TYPE_SUMMARY.slice().sort((a, b) => (b['已結案'] + b['履約中'] + b['規劃辦理中']) - (a['已結案'] + a['履約中'] + a['規劃辦理中']));
  chart('stageChart').setOption({
    grid: { left: 90, right: 30, top: 30, bottom: 24 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: th.sub, fontSize: 11.5 } },
    xAxis: { type: 'value', axisLabel: { color: th.sub, fontSize: 11 }, splitLine: { lineStyle: { color: th.grid } } },
    yAxis: { type: 'category', data: rows.map((r) => r.type),
      axisLine: { lineStyle: { color: th.grid } }, axisTick: { show: false }, axisLabel: { color: th.ink, fontSize: 12 } },
    series: [
      { name: '已結案', type: 'bar', stack: 's', itemStyle: { color: th.brand }, data: rows.map((r) => r['已結案']) },
      { name: '履約中', type: 'bar', stack: 's', itemStyle: { color: th.palette[2] }, data: rows.map((r) => r['履約中']) },
      { name: '規劃辦理中', type: 'bar', stack: 's', itemStyle: { color: th.gold }, data: rows.map((r) => r['規劃辦理中']) },
    ],
  }, true);
}

function renderRoyaltyChart() {
  const th = theme();
  const data = CONTRACTS
    .filter((c) => c['民間投資_元'] >= 1e8)
    .map((c) => ({ name: c['計畫名稱'], rate: c['民間投資_元'] ? c['權利金累計_元'] / c['民間投資_元'] * 100 : 0 }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 15)
    .reverse();
  chart('royaltyChart').setOption({
    grid: { left: 280, right: 60, top: 10, bottom: 24 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => v.toFixed(1) + '%' },
    xAxis: { type: 'value', axisLabel: { color: th.sub, fontSize: 11, formatter: '{value}%' }, splitLine: { lineStyle: { color: th.grid } } },
    yAxis: { type: 'category', data: data.map((d) => d.name),
      axisLine: { lineStyle: { color: th.grid } }, axisTick: { show: false },
      axisLabel: { color: th.ink, fontSize: 11, width: 260, overflow: 'truncate' } },
    series: [{
      type: 'bar', barWidth: 13, data: data.map((d) => +d.rate.toFixed(1)),
      itemStyle: { color: th.brand, borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', formatter: '{c}%', color: th.sub, fontSize: 11 },
    }],
  }, true);
}

function buildFilters() {
  const types = ['全部類型', ...new Set(CONTRACTS.map((c) => c['類型']))];
  const agencies = ['全部機關', ...new Set(CONTRACTS.map((c) => c['辦理機關']))];
  document.getElementById('filterType').innerHTML = types.map((t) => `<option value="${t}">${t}</option>`).join('');
  document.getElementById('filterAgency').innerHTML = agencies.map((a) => `<option value="${a}">${a}</option>`).join('');
  document.getElementById('filterType').onchange = (e) => { state.type = e.target.value; renderContractsTable(); };
  document.getElementById('filterAgency').onchange = (e) => { state.agency = e.target.value; renderContractsTable(); };
  document.getElementById('filterSearch').oninput = (e) => { state.q = e.target.value.trim(); renderContractsTable(); };
}

function renderContractsTable() {
  let rows = CONTRACTS.slice().sort((a, b) => b['民間投資_元'] - a['民間投資_元']);
  if (state.type !== '全部類型') rows = rows.filter((r) => r['類型'] === state.type);
  if (state.agency !== '全部機關') rows = rows.filter((r) => r['辦理機關'] === state.agency);
  if (state.q) rows = rows.filter((r) => (r['計畫名稱'] + r['受託廠商']).includes(state.q));

  const head = `<thead><tr><th>計畫名稱</th><th>類型</th><th>民間投資</th><th>權利金累計</th>
    <th>辦理機關</th><th>契約期間</th><th>簽約日</th><th>受託廠商</th></tr></thead>`;
  const body = rows.map((r) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:240px">${r['計畫名稱']}</td>
    <td><span class="tag tag--ai">${r['類型']}</span></td>
    <td class="num">${moneyAuto(r['民間投資_元'])}</td>
    <td class="num">${r['權利金累計_元'] ? moneyAuto(r['權利金累計_元']) : '—'}</td>
    <td>${r['辦理機關']}</td>
    <td>${r['契約期間']}</td>
    <td>${r['簽約日']}</td>
    <td>${r['受託廠商']}</td>
  </tr>`).join('') || `<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">沒有符合條件的案件</td></tr>`;
  document.getElementById('contractsTableWrap').innerHTML =
    `<div class="card__hint" style="margin-bottom:8px">共 ${rows.length} 筆（全部 ${CONTRACTS.length} 筆）</div>
     <table class="data">${head}<tbody>${body}</tbody></table>`;
}

function renderSupTable() {
  const rows = SUPERFICIES.slice().sort((a, b) => b['決標權利金_億'] - a['決標權利金_億']);
  const head = `<thead><tr><th>案名</th><th>承租人</th><th>決標權利金</th><th>當年度租金</th>
    <th>存續期間</th><th>現況</th></tr></thead>`;
  const body = rows.map((s) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:280px">${s['案名']}</td>
    <td>${s['承租人']}</td>
    <td class="num">${s['決標權利金_億'].toFixed(2)} 億</td>
    <td class="num">${s['當年度租金_億'].toFixed(2)} 億</td>
    <td>${s['存續期間']}</td>
    <td>${s['現況']}</td>
  </tr>`).join('');
  document.getElementById('supTableWrap').innerHTML = `<table class="data">${head}<tbody>${body}</tbody></table>`;
}

function renderEntrustedTable() {
  const q = (document.getElementById('entrustedSearch').value || '').trim();
  let rows = ENTRUSTED.slice();
  if (q) rows = rows.filter((r) => (r['案件名稱'] + r['辦理機關'] + r['受託單位']).includes(q));
  const head = `<thead><tr><th>案件名稱</th><th>辦理機關</th><th>委託經營期間</th><th>受託單位</th></tr></thead>`;
  const body = rows.map((r) => `<tr>
    <td style="text-align:left;white-space:normal;min-width:220px">${r['案件名稱']}</td>
    <td>${r['辦理機關']}</td>
    <td>${r['委託經營期間']}</td>
    <td>${r['受託單位']}</td>
  </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">沒有符合條件的案件</td></tr>`;
  document.getElementById('entrustedTableWrap').innerHTML =
    `<div class="card__hint" style="margin-bottom:8px">顯示 ${rows.length} / ${ENTRUSTED.length} 案</div>
     <table class="data">${head}<tbody>${body}</tbody></table>`;
}

function initMap() {
  map = L.map('supMap', { scrollWheelZoom: false }).setView([25.045, 121.56], 11.5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 17,
  }).addTo(map);
  const th = theme();
  const max = Math.max(...SUPERFICIES.map((s) => s['決標權利金_億']));
  mapLayer = L.layerGroup(SUPERFICIES.map((s) => {
    const r = 6 + Math.sqrt(s['決標權利金_億'] / max) * 24;
    const color = s['狀態'] === '已啟用' ? th.brand : th.gold;
    const marker = L.circleMarker([s.lat, s.lng], { radius: r, color: th.surface, weight: 1.5, fillColor: color, fillOpacity: 0.8 });
    marker.bindTooltip(`<b>${s['現況']}</b><br>${s['案名']}<br>決標權利金 ${s['決標權利金_億'].toFixed(1)} 億元 · ${s['狀態']}`, { sticky: true });
    return marker;
  })).addTo(map);
  document.getElementById('mapLegend').innerHTML =
    `<span><i style="background:${th.brand}"></i>已啟用</span>
     <span><i style="background:${th.gold}"></i>興建／規劃中</span>`;
  const activated = SUPERFICIES.filter((s) => s['狀態'] === '已啟用').length;
  document.getElementById('mapNote').textContent =
    `共 ${SUPERFICIES.length} 案（已啟用 ${activated}、興建／規劃中 ${SUPERFICIES.length - activated}）。座標為地號所在行政區概略位置，非精確地址。`;
}

init();
