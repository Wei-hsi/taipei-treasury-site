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
          <span class="suite-brand__title">臺北市資料大平臺 · 開放資料應用</span><br>
          <span class="suite-brand__sub">Taipei Finance Open Data Suite（學習版）</span>
        </span>
      </a>
      <nav class="suite-nav" aria-label="應用切換">${nav}</nav>
    </div>
  </div>`;

  const mount = document.getElementById('suite');
  if (mount) mount.outerHTML = html;
  else document.body.insertAdjacentHTML('afterbegin', html);
  document.title = (APPS.find((a) => a.key === activeKey)?.label || '臺北市資料大平臺') + ' · 臺北市資料大平臺開放資料（學習版）';
}

/*
 * 資料載入防呆：在各頁 init() 最前面呼叫，確認 _data.js 內的全域變數都存在。
 * 若有遺漏（常見原因：_data.js 上傳失敗或路徑錯誤），會在畫面上顯示明確錯誤訊息，
 * 而不是讓整個頁面卡在「載入中」卻不知道為什麼。
 * 用法：if (!dataGuard(['PROPERTY','IDLE_LAND'], '市有土地活化地圖')) return;
 */
function dataGuard(dataMap, appLabel) {
  const missing = Object.entries(dataMap).filter(([, v]) => typeof v === 'undefined').map(([k]) => k);
  if (missing.length === 0) return true;
  const msg = `⚠️ ${appLabel || '這個頁面'}的資料檔沒有正確載入（缺少：${missing.join('、')}）。
    最常見原因是 _data.js 檔案上傳失敗或路徑不對，
    請確認這個資料夾裡的 _data.js 檔案存在、大小不是 0KB，且路徑正確，重新上傳後整理再試一次。`;
  const period = document.getElementById('period');
  if (period) { period.textContent = ''; }
  const banner = document.createElement('div');
  banner.className = 'card';
  banner.style.cssText = 'margin-top:16px;border-left:3px solid var(--neg);background:var(--surface-2);white-space:pre-line;font-size:13.5px;color:var(--text-2);padding:14px 16px';
  banner.textContent = msg;
  const main = document.querySelector('main.wrap');
  if (main) main.insertBefore(banner, main.children[1] || null);
  console.error('[dataGuard]', appLabel, '缺少全域變數:', missing);
  return false;
}
