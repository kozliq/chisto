const ext = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
let host = null;
try { const u = new URL(tab?.url ?? ''); if (/^https?:$/.test(u.protocol)) host = u.hostname.replace(/^www\./, ''); } catch {}

async function render() {
  const s = await ext.storage.local.get({ paused: false, allowSites: [], skipVideoAds: true });
  const siteOff = host && s.allowSites.includes(host);
  // Щит «включён», только если защита работает и здесь, и везде.
  $('shield').setAttribute('aria-pressed', String(!s.paused && !siteOff));
  $('state').textContent = s.paused ? 'Выключено везде' : siteOff ? 'Выключено на этом сайте' : 'Защита работает';
  $('siteRow').hidden = !host || s.paused;
  $('skipRow').hidden = s.paused;
  $('site').textContent = host ?? '';
  $('toggleSite').textContent = siteOff ? 'включить здесь' : 'выключить здесь';
  $('toggleSkip').textContent = `Реклама блогеров на YouTube: ${s.skipVideoAds ? 'пропускается' : 'не трогаем'}`;
}

$('shield').onclick = async () => {
  const s = await ext.storage.local.get({ paused: false, allowSites: [] });
  // Выключено на этом сайте — щит включает его обратно, а не ставит паузу везде.
  if (!s.paused && host && s.allowSites.includes(host)) {
    await ext.storage.local.set({ allowSites: s.allowSites.filter((h) => h !== host) });
  } else {
    await ext.storage.local.set({ paused: !s.paused });
  }
  await render();
  if (tab?.id) ext.tabs.reload(tab.id);
};
$('toggleSite').onclick = async (e) => {
  e.preventDefault();
  const s = await ext.storage.local.get({ allowSites: [] });
  const set = new Set(s.allowSites);
  set.has(host) ? set.delete(host) : set.add(host);
  await ext.storage.local.set({ allowSites: [...set] });
  await render();
  ext.tabs.reload(tab.id);
};
$('toggleSkip').onclick = async (e) => {
  e.preventDefault();
  const { skipVideoAds } = await ext.storage.local.get({ skipVideoAds: true });
  await ext.storage.local.set({ skipVideoAds: !skipVideoAds });
  await render();
};
render();
