const ext = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
let host = null;
try { const u = new URL(tab?.url ?? ''); if (/^https?:$/.test(u.protocol)) host = u.hostname.replace(/^www\./, ''); } catch {}

async function render() {
  const s = await ext.storage.local.get({ paused: false, allowSites: [] });
  const siteOff = host && s.allowSites.includes(host);
  $('state').textContent = s.paused ? 'На паузе везде' : siteOff ? 'Выключено на этом сайте' : 'Защита работает';
  $('state').classList.toggle('off', s.paused || siteOff);
  $('site').textContent = host ?? 'Служебная страница';
  $('toggleSite').textContent = siteOff ? 'Включить на этом сайте' : 'Выключить на этом сайте';
  $('toggleSite').hidden = !host;
  $('togglePause').textContent = s.paused ? 'Снять с паузы' : 'Поставить на паузу везде';
}

$('toggleSite').onclick = async (e) => {
  e.preventDefault();
  const s = await ext.storage.local.get({ allowSites: [] });
  const set = new Set(s.allowSites);
  set.has(host) ? set.delete(host) : set.add(host);
  await ext.storage.local.set({ allowSites: [...set] });
  await render();
  ext.tabs.reload(tab.id);
};
$('togglePause').onclick = async (e) => {
  e.preventDefault();
  const s = await ext.storage.local.get({ paused: false });
  await ext.storage.local.set({ paused: !s.paused });
  await render();
  ext.tabs.reload(tab.id);
};
render();
