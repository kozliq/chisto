#!/usr/bin/env node
// Сборка всех правил из одного места:
//   filters/build/dns.txt                   — ||домен^ из custom.txt для AdGuard Home (VPS)
//   cloudflare/src/blocklist.json           — доменный список для Worker (AdGuard DNS filter + StevenBlack + custom)
//   extension/dist/{chrome,firefox}/        — расширение: правила declarativeNetRequest + CSS
//   site/dl/chisto-{chrome,firefox}.zip     — архивы расширения для кнопки на сайте
//   site/rules/update.json                  — свежие правила, которые расширение скачивает раз в 12 часов
//   ios-app/ContentBlocker/blockerList.json — правила Safari Content Blocker
//
// Флаги: --offline   не качать списки, взять кэш filters/build/upstream/
//        --dns-only  только dns.txt (для VPS, где нужен только AdGuard Home)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseList, toDnr, toSafari, toCosmetic, toDns } from './rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const p = (...a) => path.join(ROOT, ...a);

// Списки для браузера. RU AdList — главный для рунета (Яндекс.Директ, AdFox, VK-реклама).
// Anti-adblock — против стен «отключите блокировщик»: маленький, идёт целиком, как свои правила.
const BROWSER_LISTS = [
  { id: 'antiadblock', url: 'https://easylist-downloads.adblockplus.org/antiadblockfilters.txt', share: 'all' },
  { id: 'easylist', url: 'https://easylist.to/easylist/easylist.txt', share: 0.30 },
  { id: 'ruadlist', url: 'https://easylist-downloads.adblockplus.org/ruadlist.txt', share: 0.25 },
  { id: 'adguard-ru', url: 'https://filters.adtidy.org/extension/ublock/filters/1.txt', share: 0.15 },
  { id: 'easyprivacy', url: 'https://easylist.to/easylist/easyprivacy.txt', share: 0.30 },
];
// Доменные списки для DNS на Worker. На VPS их же качает сам AdGuard Home.
const DNS_LISTS = [
  { id: 'adguard-dns', url: 'https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt' },
  { id: 'stevenblack', url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts' },
];
// Chrome гарантирует расширению 30 000 статических правил (regex — 1 000)
// и ещё 30 000 динамических «безопасных» (block/allow) — их мы наполняем обновлением с сервера.
const DNR_STATIC = 29_500;
const DNR_REGEX = 900;
const DNR_DYNAMIC = 29_000;
// Safari: 50 000 правил на один Content Blocker — работает на всех версиях iOS.
const SAFARI_BUDGET = 50_000;

const log = (...a) => console.log('[build]', ...a);
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const env = Object.fromEntries((fs.existsSync(p('.env')) ? fs.readFileSync(p('.env'), 'utf8') : '')
  .split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

// ── 1. Свои правила ──
const custom = parseList(fs.readFileSync(p('filters/custom.txt'), 'utf8'), 'custom');
log(`custom.txt: сеть ${custom.network.length}, косметика ${custom.cosmetic.length}, пропущено ${custom.skipped.length}`);
for (const s of custom.skipped) log(`  пропущено (не поддерживается): ${s}`);
const guard = fs.readFileSync(p('filters/shared-cdn.txt'), 'utf8')
  .split('\n').map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'));

// ── 2. DNS для AdGuard Home ──
const dns = toDns(custom.network, guard);
for (const w of dns.warnings) log(`  DNS: ${w}`);
write(p('filters/build/dns.txt'),
  `! Собрано tools/build.mjs из filters/custom.txt — не править руками\n! ${new Date().toISOString()}\n` +
  dns.lines.join('\n') + '\n');
log(`dns.txt: ${dns.lines.length} правил`);
if (args.has('--dns-only')) process.exit(0);

// ── 3. Загрузка списков (с кэшем) ──
async function load({ id, url }) {
  const cache = p('filters/build/upstream', `${id}.txt`);
  if (!args.has('--offline')) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < 10_000) throw new Error('подозрительно короткий список');
      write(cache, text);
      log(`${id}: скачан (${(text.length / 1024 / 1024).toFixed(1)} МБ)`);
      return text;
    } catch (e) {
      log(`${id}: не скачался (${e.message}), беру кэш`);
    }
  }
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  log(`${id}: кэша нет — пропускаю`);
  return null;
}

// ── 4. Доменный список для Worker ──
let fullDomains = [];
{
  const block = new Set(), allow = new Set();
  const exact = new Set(guard.filter(g => !g.startsWith('*.')));
  const tree = guard.filter(g => g.startsWith('*.')).map(g => g.slice(2));
  const guarded = (h) => exact.has(h) || tree.some(t => h === t || h.endsWith('.' + t));
  for (const l of DNS_LISTS) {
    const text = await load(l);
    if (!text) continue;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      let m = line.match(/^(@@)?\|\|([a-z0-9._-]+)\^(?:\$important)?$/);
      if (m) { (m[1] ? allow : block).add(m[2]); continue; }
      m = line.match(/^0\.0\.0\.0\s+([a-z0-9._-]+)\s*(?:#.*)?$/i);
      if (m && m[1] !== '0.0.0.0') block.add(m[1].toLowerCase());
    }
  }
  for (const r of dns.lines) {
    const m = r.match(/^(@@)?\|\|([a-z0-9._-]+)\^/);
    if (m) (m[1] ? allow : block).add(m[2]);
  }
  for (const h of [...block]) if (guarded(h)) block.delete(h);
  // Поддомены уже заблокированного домена не нужны: Worker проверяет родителей сам.
  const minimal = [...block].filter(h => {
    for (let i = h.indexOf('.'); i >= 0; i = h.indexOf('.', i + 1)) if (block.has(h.slice(i + 1))) return false;
    return true;
  }).sort();
  fullDomains = minimal;
  write(p('cloudflare/src/blocklist.json'), JSON.stringify({ updated: new Date().toISOString(), block: minimal, allow: [...allow].sort() }));
  log(`Worker: блокируется ${minimal.length} доменов, исключений ${allow.size}`);
}

// ── 5. Расширение ──
const upstream = [];
for (const u of BROWSER_LISTS) {
  const text = await load(u);
  if (text) upstream.push({ ...u, ...parseList(text, u.id) });
}
// Свои правила — без ограничений. Остаток статического бюджета делим между списками,
// внутри списка сначала правила без привязки к сайтам — они полезны везде.
// Что не влезло — уходит в update.json и ставится как динамические правила.
const regex = { regex: DNR_REGEX };
// Один общий бюджет регулярок: каждый список вычитает из него то, что потратил.
const customBudget = { rules: Infinity, regex: regex.regex };
const customDnr = toDnr(custom.network, customBudget);
regex.regex = customBudget.regex;
const rulesets = [{ id: 'custom', ...customDnr }];
let left = DNR_STATIC - customDnr.rules.length;
for (const u of upstream.filter(u => u.share === 'all')) {
  const b = { rules: left, regex: regex.regex };
  const r = toDnr(u.network, b);
  regex.regex = b.regex;
  left -= r.rules.length;
  rulesets.push({ id: u.id, ...r });
}
for (const u of upstream.filter(u => u.share !== 'all')) {
  const general = u.network.filter(r => !r.opts.domains), scoped = u.network.filter(r => r.opts.domains);
  const b = { rules: Math.floor(left * u.share), regex: regex.regex };
  rulesets.push({ id: u.id, ...toDnr([...general, ...scoped], b) });
  regex.regex = b.regex;
}
for (const r of rulesets) log(`DNR ${r.id}: ${r.rules.length} статических, в обновление ${r.overflow.length}, не поддерживается ${r.dropped}`);

const cosmetic = toCosmetic([...custom.cosmetic, ...upstream.flatMap(u => u.cosmetic)],
  [...custom.network, ...upstream.flatMap(u => u.network)]);
log(`косметика: общих селекторов ${cosmetic.generic.length}, сайтов ${Object.keys(cosmetic.specific).length}`);

// Обновление с сервера: свежие свои правила (заменяют статический custom, так работает откат)
// + не влезшие в статику правила списков. Только данные (JSON), не код.
const customOnly = toCosmetic(custom.cosmetic, custom.network);
const safe = (r) => ['block', 'allow', 'allowAllRequests'].includes(r.action.type);
// Порядок важен: в Firefox влезает только ~5 000. Сначала свои, потом anti-adblock и русские списки,
// потом EasyList и EasyPrivacy поровну.
const over = Object.fromEntries(rulesets.map(r => [r.id, r.overflow.filter(safe)]));
const ruPart = [...(over.antiadblock ?? []), ...(over.ruadlist ?? []), ...(over['adguard-ru'] ?? [])];
const half = Math.max(0, Math.floor((DNR_DYNAMIC - customDnr.rules.length - ruPart.length) / 2));
const dynamic = [...customDnr.rules, ...ruPart, ...(over.easylist ?? []).slice(0, half), ...(over.easyprivacy ?? []).slice(0, half)]
  .slice(0, DNR_DYNAMIC).map(({ priority, action, condition }) => ({ priority, action, condition }));
const update = {
  version: new Date().toISOString(),
  replacesStatic: ['custom'],
  dnr: dynamic,
  cosmetic: { specific: customOnly.specific, entity: customOnly.entity, generic: customOnly.generic,
    noGeneric: customOnly.noGeneric, noCosmetic: customOnly.noCosmetic },
};
write(p('site/rules/update.json'), JSON.stringify(update));
log(`site/rules/update.json: ${dynamic.length} динамических правил`);

const SHARDS = 32;
const shardOf = (key) => { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % SHARDS; };
const heavy = (sel) => /\[[^\]]*\*=/.test(sel) || sel.includes(':has(');
const light = cosmetic.generic.filter(sel => !heavy(sel));
log(`косметика: общих лёгких ${light.length}, тяжёлых убрано из общих ${cosmetic.generic.length - light.length}`);
const host = env.DOH_HOST && env.DOH_HOST !== 'dns.example.com' ? env.DOH_HOST : '';
const base = JSON.parse(fs.readFileSync(p('extension/manifest.base.json'), 'utf8'));
for (const target of ['chrome', 'firefox']) {
  const dist = p('extension/dist', target);
  fs.rmSync(dist, { recursive: true, force: true });
  fs.cpSync(p('extension/src'), dist, { recursive: true });
  for (const r of rulesets) write(path.join(dist, 'rules', `${r.id}.json`), JSON.stringify(r.rules));
  // Общий CSS — только дешёвые селекторы. Подстроки в атрибутах ([href*=…], [style*=…]) на каждой
  // странице заставляют браузер сверять строки у каждого элемента — они остаются лишь точечно, по сайтам.
  write(path.join(dist, 'cosmetic', 'generic.css'),
    light.map(s => `${s}{display:none!important}`).join('\n') + '\n');
  write(path.join(dist, 'cosmetic', 'generic.json'), JSON.stringify(light));
  // Точечные правила режем на шарды по хешу домена: фон читает 1–2 небольших файла, а не 2 МБ JSON.
  const shards = Array.from({ length: SHARDS }, () => ({}));
  for (const [k, v] of Object.entries(cosmetic.specific)) shards[shardOf(k)][k] = v;
  shards.forEach((sh, i) => write(path.join(dist, 'cosmetic', 's', `${i}.json`), JSON.stringify(sh)));
  write(path.join(dist, 'cosmetic', 'meta.json'), JSON.stringify({
    shards: SHARDS, entity: cosmetic.entity, noGeneric: cosmetic.noGeneric, noCosmetic: cosmetic.noCosmetic,
  }));
  // http — только для локальной проверки (wrangler dev на 127.0.0.1).
  const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https';
  write(path.join(dist, 'config.json'), JSON.stringify({
    updateUrl: host ? `${scheme}://${host}/rules/update.json` : '',
    dynamicLimit: target === 'firefox' ? 4_900 : DNR_DYNAMIC,
  }));
  const manifest = structuredClone(base);
  manifest.declarative_net_request = {
    rule_resources: rulesets.map(r => ({ id: r.id, enabled: true, path: `rules/${r.id}.json` })),
  };
  if (target === 'firefox') {
    manifest.background = { scripts: ['background.js'], type: 'module' };
    manifest.browser_specific_settings = { gecko: { id: 'chisto@flownote.cc', strict_min_version: '128.0', data_collection_permissions: { required: ['none'] } } };
  } else {
    manifest.background = { service_worker: 'background.js', type: 'module' };
    manifest.minimum_chrome_version = '121';
  }
  write(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
  write(p('site/dl', `chisto-${target}.zip`), zipDir(dist));
  log(`расширение ${target}: extension/dist/${target}, site/dl/chisto-${target}.zip`);
}
if (!host) log('  DOH_HOST не задан — расширение не будет скачивать обновления правил');

// ── 5б. Наборы доменов для VPN-клиентов (Shadowrocket, sing-box, Clash/Mihomo, Happ, V2Ray) ──
// «lite» — домены из русских списков, EasyPrivacy и наших правил (без общих CDN из shared-cdn.txt):
// влезает в Shadowrocket на iPhone. «full» — тот же список, что режет наш DoH.
{
  const lite = new Set();
  const sources = [custom.network, ...upstream.filter(u => ['ruadlist', 'adguard-ru', 'easyprivacy', 'antiadblock'].includes(u.id)).map(u => u.network)];
  for (const net of sources) {
    for (const l of toDns(net, guard).lines) {
      const m = l.match(/^\|\|([a-z0-9._-]+)\^/);
      if (m && !l.startsWith('@@') && /\.[a-z][a-z0-9-]+$/.test(m[1])) lite.add(m[1]);
    }
  }
  const dedupe = (list) => { const set = new Set(list); return [...set].filter(h => { for (let i = h.indexOf('.'); i >= 0; i = h.indexOf('.', i + 1)) if (set.has(h.slice(i + 1))) return false; return true; }).sort(); };
  const sets = { lite: dedupe([...lite]), full: fullDomains.filter(h => /\.[a-z][a-z0-9-]+$/.test(h)) };
  const head = (name) => `# Чисто — ${name}. Собрано tools/build.mjs ${new Date().toISOString().slice(0, 10)}. https://chisto.flownote.cc`;
  for (const [kind, list] of Object.entries(sets)) {
    write(p('site/rules', `domains-${kind}.txt`), `${head('домены рекламы и трекеров')}\n${list.join('\n')}\n`);
    write(p('site/rules', `shadowrocket-${kind}.list`), `${head('Shadowrocket, правило REJECT')}\n${list.map(h => `DOMAIN-SUFFIX,${h}`).join('\n')}\n`);
    write(p('site/rules', `clash-${kind}.txt`), `${list.map(h => `+.${h}`).join('\n')}\n`);
    write(p('site/rules', `singbox-${kind}.json`), JSON.stringify({ version: 2, rules: [{ domain_suffix: list }] }));
  }
  log(`наборы для VPN: lite ${sets.lite.length}, full ${sets.full.length} доменов`);
}

// ── 6. Safari Content Blocker ──
const safari = toSafari([custom, ...upstream], SAFARI_BUDGET);
write(p('ios-app/ContentBlocker/blockerList.json'), JSON.stringify(safari.rules));
log(`Safari: ${safari.rules.length} правил${safari.dropped ? `, не влезло/не поддерживается ${safari.dropped}` : ''}`);

// ── zip без зависимостей ──
function zipDir(dir) {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else files.push({ name: path.relative(dir, full).split(path.sep).join('/'), data: fs.readFileSync(full) });
    }
  })(dir);
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const comp = zlib.deflateRawSync(f.data, { level: 9 });
    const crc = zlib.crc32(f.data) >>> 0;
    const head = (sig, size) => { const b = Buffer.alloc(size); b.writeUInt32LE(sig, 0); return b; };
    const local = head(0x04034b50, 30);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, comp);
    const c = head(0x02014b50, 46);
    c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
