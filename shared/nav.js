/*
 * 共用頁首 + 四應用切換列（忠實對齊參考網站 shared/suite.js 的結構與 class 命名）。
 * 每個應用在自己的 index.html 呼叫 renderSuite('tax_dashboard') 之類。
 */
const APPS = [
  { key: 'tax_dashboard',   label: '稅收儀表板', icon: 'M3 13h2v6H3zM10 5h2v14h-2zM17 9h2v10h-2z' },
  { key: 'bot_cases',       label: '促參透明',   icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6' },
  { key: 'money_healthy',   label: '市庫健康',   icon: 'M3 12h4l2 6 4-12 2 6h6' },
  { key: 'land_active_map', label: '活化地圖',   icon: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14' },
];

function icon(d) {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

function renderSuite(activeKey) {
  const nav = APPS.map((a) => {
    const active = a.key === activeKey ? ' class="active"' : '';
    const href = `../${a.key}/index.html`;
    return `<a href="${href}"${active}>${icon(a.icon)}${a.label}</a>`;
  }).join('');

  const html = `
  <div class="suite-bar">
    <div class="suite-bar__inner">
      <a class="suite-brand" href="../index.html">
        <span class="suite-brand__mark" aria-hidden="true">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>
        </span>
        <span>
          <span class="suite-brand__title">臺北市財政局 · 開放資料應用</span><br>
          <span class="suite-brand__sub">Taipei Finance Open Data Suite（學習版）</span>
        </span>
      </a>
      <nav class="suite-nav" aria-label="應用切換">${nav}</nav>
    </div>
  </div>`;

  const mount = document.getElementById('suite');
  if (mount) mount.outerHTML = html;
  else document.body.insertAdjacentHTML('afterbegin', html);
  document.title = (APPS.find((a) => a.key === activeKey)?.label || '臺北市財政局') + ' · 臺北市財政局開放資料（學習版）';
}
