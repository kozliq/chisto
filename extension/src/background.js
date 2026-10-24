// Фон расширения: сетевые правила работают сами (declarativeNetRequest),
// здесь — косметика (CSS), выключение на отдельных сайтах и обновление правил с сервера.
const ext = globalThis.browser ?? globalThis.chrome;
const ALLOW_SITE_BASE = 100000; // id правил «выключено на этом сайте»; правила с сервера — от 1
const UPDATE_EVERY_MIN = 12 * 60;

let data = null;
let genericList = null;
let config = null;

async function loadJson(file) {
  const res = await fetch(ext.runtime.getURL(file));
  return res.json();
}
const cosmeticData = async () => (data ??= await loadJson('cosmetic/specific.json'));
const getConfig = async () => (config ??= await loadJson('config.json'));
const settings = () => ext.storage.local.get({ paused: false, allowSites: [] });

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : null;
  } catch { return null; }
}

// a.b.example.com → a.b.example.com, b.example.com, example.com, com
function suffixes(host) {
  const parts = host.split('.');
  return parts.map((_, i) => parts.slice(i).join('.'));
}
const matchesSite = (host, list) => suffixes(host).some(h => list.includes(h));

function collect(d, host) {
  const hit = suffixes(host).map(h => d.specific[h]).filter(Boolean);
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i++) if (d.entity[labels[i]]) hit.push(d.entity[labels[i]]);
  return hit;
}

async function cssFor(host) {
  const d = await cosmeticData();
  const { remote } = await ext.storage.local.get({ remote: null });
  const r = remote?.cosmetic;
  if (matchesSite(host, d.noCosmetic) || (r && matchesSite(host, r.noCosmetic))) return { useGenericFile: false, css: '' };
  const hit = [...collect(d, host), ...(r ? collect(r, host) : [])];
  const unhide = new Set(hit.flatMap(h => h.unhide));
  const hide = hit.flatMap(h => h.hide).filter(s => !unhide.has(s));
  const extraGeneric = (r?.generic ?? []).filter(s => !unhide.has(s));
  let css = [...hide, ...extraGeneric].map(s => `${s}{display:none!important}`).join('\n') + '\n' +
    hit.flatMap(h => h.css).join('\n');
  const generic = !matchesSite(host, d.noGeneric) && !(r && matchesSite(host, r.noGeneric));
  // Если на сайте есть исключения из общих правил — собираем общий CSS без них.
  if (generic && unhide.size) {
    genericList ??= await loadJson('cosmetic/generic.json');
    css += '\n' + genericList.filter(s => !unhide.has(s)).map(s => `${s}{display:none!important}`).join('\n');
    return { useGenericFile: false, css };
  }
  return { useGenericFile: generic, css };
}

ext.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  const host = hostOf(url);
  if (!host || tabId < 0) return;
  const s = await settings();
  if (s.paused || matchesSite(host, s.allowSites)) return;
  const { useGenericFile, css } = await cssFor(host);
  const target = { tabId, frameIds: [frameId] };
  try {
    if (useGenericFile) await ext.scripting.insertCSS({ target, files: ['cosmetic/generic.css'], origin: 'USER' });
    if (css.trim()) await ext.scripting.insertCSS({ target, css, origin: 'USER' });
  } catch {
    // Служебные страницы браузера и магазина расширений закрыты для расширений — это нормально.
  }
});

const staticIds = () => ext.runtime.getManifest().declarative_net_request.rule_resources.map(r => r.id);

// Пауза и сайты-исключения: одно правило allowAllRequests на сайт.
async function applySettings() {
  const s = await settings();
  const { remote } = await ext.storage.local.get({ remote: null });
  const old = (await ext.declarativeNetRequest.getDynamicRules()).filter(r => r.id >= ALLOW_SITE_BASE);
  await ext.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map(r => r.id),
    addRules: s.allowSites.map((site, i) => ({
      id: ALLOW_SITE_BASE + i,
      priority: 100,
      action: { type: 'allowAllRequests' },
      condition: { requestDomains: [site], resourceTypes: ['main_frame', 'sub_frame'] },
    })),
  });
  const replaced = new Set(remote?.replacesStatic ?? []);
  const ids = staticIds();
  if (s.paused) {
    await ext.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: ids });
  } else {
    await ext.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: ids.filter(id => !replaced.has(id)),
      disableRulesetIds: ids.filter(id => replaced.has(id)),
    });
  }
  // Пауза выключает и правила с сервера: временно убираем их, возвращаем при снятии паузы.
  await applyRemoteRules(s.paused ? [] : remote?.dnr ?? []);
}

async function applyRemoteRules(rules) {
  const old = (await ext.declarativeNetRequest.getDynamicRules()).filter(r => r.id < ALLOW_SITE_BASE);
  const { dynamicLimit } = await getConfig();
  let limit = Math.min(rules.length, dynamicLimit);
  // Лимит динамических правил разный в разных браузерах — при отказе уменьшаем порцию.
  for (;;) {
    try {
      await ext.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: old.map(r => r.id),
        addRules: rules.slice(0, limit).map((r, i) => ({ ...r, id: i + 1 })),
      });
      return limit;
    } catch (e) {
      if (limit <= 100) throw e;
      limit = Math.floor(limit / 2);
    }
  }
}

// Раз в 12 часов спрашиваем у нашего сервера свежий update.json. Отправляется только сам запрос
// файла — без адресов страниц и истории. Ответ — данные (правила), не код.
async function updateRules() {
  const { updateUrl } = await getConfig();
  if (!updateUrl) return;
  try {
    const res = await fetch(updateUrl, { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) return;
    const remote = await res.json();
    const { remote: current } = await ext.storage.local.get({ remote: null });
    if (current?.version === remote.version || !Array.isArray(remote.dnr)) return;
    await ext.storage.local.set({ remote, updatedAt: Date.now() });
    await applySettings();
  } catch {
    // Нет сети или сервер недоступен — работаем на встроенных правилах.
  }
}

ext.storage.onChanged.addListener((changes) => {
  if ('paused' in changes || 'allowSites' in changes) applySettings();
});
ext.runtime.onInstalled.addListener(async () => {
  await applySettings();
  ext.alarms.create('update', { periodInMinutes: UPDATE_EVERY_MIN, delayInMinutes: 1 });
  updateRules();
});
ext.runtime.onStartup?.addListener(() => { applySettings(); });
ext.alarms.onAlarm.addListener((a) => { if (a.name === 'update') updateRules(); });
