// Разбор правил в формате EasyList/uBlock/AdGuard и перевод в DNS, DNR (Chrome/Firefox) и Safari.
// Поддерживается только сеть и CSS. Скриптлеты (##+js), HTML-фильтры ($$), процедурная
// косметика (:has-text, :xpath, :-abp-…) и модификаторы, меняющие страницу, пропускаются.

const TYPES = {
  script: 'script', image: 'image', stylesheet: 'stylesheet', css: 'stylesheet',
  xmlhttprequest: 'xmlhttprequest', xhr: 'xmlhttprequest', subdocument: 'sub_frame', frame: 'sub_frame',
  media: 'media', font: 'font', websocket: 'websocket', ping: 'ping', beacon: 'ping',
  other: 'other', object: 'object', document: 'main_frame', doc: 'main_frame',
};
const SAFARI_TYPES = {
  script: 'script', image: 'image', stylesheet: 'style-sheet', xmlhttprequest: 'raw', sub_frame: 'document',
  media: 'media', font: 'font', websocket: 'raw', ping: 'raw', other: 'raw', main_frame: 'document',
};
// Пустышки лежат в extension/src/redirects/. Имена — как в uBlock Origin.
const REDIRECTS = {
  'noop.js': 'noop.js', noopjs: 'noop.js', 'noop.css': 'noop.css', noopcss: 'noop.css',
  'noop.html': 'noop.html', noopframe: 'noop.html', 'noop.txt': 'noop.txt', nooptext: 'noop.txt',
  '1x1.gif': '1x1.gif', '1x1-transparent.gif': '1x1.gif', '2x2.png': '1x1.gif', '2x2-transparent.png': '1x1.gif',
};
const IGNORED_OPTS = new Set(['_', 'all', 'match-case']);
const COSMETIC_EXC = { elemhide: 'elemhide', ehide: 'elemhide', generichide: 'generichide', ghide: 'generichide' };
// Процедурная косметика — нужен JS, а мы ограничиваемся CSS.
const PROCEDURAL = /:(-abp-|has-text|contains|xpath|upward|remove|matches-|min-text-length|watch-attr|others|if\(|if-not|nth-ancestor|remove-attr|remove-class|matches-path|matches-media)/;
const UNSAFE_CSS = /url\s*\(|@import|expression\s*\(|\\|javascript:|behavior\s*:/i;
const HOST = /^(?:[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?\.)+[a-z0-9-]{2,}$/;

export function parseList(text, source) {
  const network = [], cosmetic = [], skipped = [];
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    // «#» в начале — комментарий hosts-файла, если это не общее косметическое правило.
    if (line.startsWith('#') && !/^#(#|@#|\$#|@\$#|\?#|@\?#|%#|@%#)/.test(line)) continue;
    const hosts = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([a-z0-9._-]+)\s*(?:#.*)?$/i);
    if (hosts) {
      const h = hosts[1].toLowerCase();
      if (HOST.test(h) && h !== 'localhost') network.push({ source, raw: line, pattern: `||${h}^`, exception: false, opts: {} });
      continue;
    }
    const c = parseCosmetic(line, source);
    if (c === undefined) {
      const n = parseNetwork(line, source);
      if (n) network.push(n); else if (source === 'custom') skipped.push(line);
    } else if (c) cosmetic.push(c);
    else if (source === 'custom') skipped.push(line);
  }
  return { network, cosmetic, skipped };
}

// undefined — это не косметика; null — косметика, которую мы не поддерживаем.
function parseCosmetic(line, source) {
  const m = line.match(/^([^#$]*?)(#@\$\?#|#\$\?#|#@\$#|#\$#|#@\?#|#\?#|#@%#|#%#|#@#|##|\$@\$|\$\$)(.+)$/);
  if (!m) return undefined;
  const [, domainsRaw, sep, body] = m;
  if (domainsRaw && !/^[a-z0-9.*~,_-]+$/i.test(domainsRaw)) return null; // [$path=…] и прочие модификаторы
  const { include, exclude } = splitDomains(domainsRaw, ',');
  if (sep === '##' || sep === '#@#') {
    if (body.startsWith('+js(') || body.startsWith('^') || body.startsWith('+')) return null;
    let selector = body, css = null;
    const st = body.match(/^(.+?):style\((.+)\)$/);
    if (st) { selector = st[1]; css = st[2]; }
    if (!validSelector(selector)) return null;
    if (css !== null) {
      if (sep !== '##' || UNSAFE_CSS.test(css) || /[{}]/.test(css) || !include.length) return null;
      return { source, type: 'css', css: `${selector} { ${css} }`, include, exclude };
    }
    return { source, type: sep === '##' ? 'hide' : 'unhide', selector, include, exclude };
  }
  if (sep === '#$#') {
    const r = body.match(/^(.+?)\s*\{([^{}]+)\}\s*$/);
    if (!r || !include.length || UNSAFE_CSS.test(body) || !validSelector(r[1])) return null;
    return { source, type: 'css', css: `${r[1].trim()} { ${r[2].trim()} }`, include, exclude };
  }
  return null;
}

function validSelector(s) {
  if (!s || s.length > 1000 || /[{}]/.test(s) || PROCEDURAL.test(s)) return false;
  // Простая проверка баланса скобок и кавычек: битый селектор ломает весь список в Safari.
  let depthR = 0, depthS = 0, quote = null;
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depthR++; else if (ch === ')') depthR--;
    else if (ch === '[') depthS++; else if (ch === ']') depthS--;
    if (depthR < 0 || depthS < 0) return false;
  }
  return !quote && depthR === 0 && depthS === 0;
}

function splitDomains(raw, sep) {
  const include = [], exclude = [];
  for (let d of (raw || '').split(sep)) {
    d = d.trim().toLowerCase();
    if (!d) continue;
    const neg = d.startsWith('~');
    if (neg) d = d.slice(1);
    if (!/^[a-z0-9._-]+(\.\*)?$/.test(d)) continue; // non-ASCII и маски, кроме «site.*»
    (neg ? exclude : include).push(d);
  }
  return { include, exclude };
}

function parseNetwork(line, source) {
  let s = line, exception = false;
  if (s.startsWith('@@')) { exception = true; s = s.slice(2); }
  let pattern = s, optStr = '', regex = null;
  const rx = s.match(/^\/(.+)\/(?:\$([^/]*))?$/);
  if (rx) { regex = rx[1]; optStr = rx[2] || ''; pattern = ''; }
  else {
    const i = s.lastIndexOf('$');
    if (i >= 0) { pattern = s.slice(0, i); optStr = s.slice(i + 1); }
  }
  if (/[^\x21-\x7e]/.test(pattern + optStr + (regex || ''))) return null; // non-ASCII и пробелы
  const opts = { types: [], notTypes: [] };
  for (const o of optStr ? optStr.split(',') : []) {
    const [kRaw, ...vParts] = o.split('=');
    const v = vParts.join('=');
    const neg = kRaw.startsWith('~');
    const k = neg ? kRaw.slice(1) : kRaw;
    if (IGNORED_OPTS.has(k)) { if (k === 'match-case') opts.caseSensitive = true; continue; }
    if (k === 'third-party' || k === '3p') opts.thirdParty = !neg;
    else if (k === 'first-party' || k === '1p') opts.thirdParty = neg;
    else if (TYPES[k]) (neg ? opts.notTypes : opts.types).push(TYPES[k]);
    else if ((k === 'domain' || k === 'from') && v) {
      const d = splitDomains(v, '|');
      if (!d.include.length && !d.exclude.length) return null;
      opts.domains = d;
    } else if (k === 'important') opts.important = true;
    else if ((k === 'redirect' || k === 'redirect-rule') && REDIRECTS[v]) opts.redirect = REDIRECTS[v];
    else if (COSMETIC_EXC[k] && exception) opts.cosmeticException = COSMETIC_EXC[k];
    else return null; // popup, csp, removeparam, badfilter… — не поддерживаем, пропускаем правило
  }
  if (opts.redirect && (exception || !opts.types.length)) return null;
  if (!regex) {
    if (pattern.startsWith('||*')) pattern = pattern.slice(2);
    const core = pattern.replace(/[|*^]/g, '');
    // Слишком широкие шаблоны без ограничения по сайту режут нормальные страницы.
    if (core.length < 4 && !opts.domains && !opts.cosmeticException) return null;
  }
  return { source, raw: line, pattern, regex, exception, opts };
}

// ── DNS (AdGuard Home) ──
export function toDns(network, guard) {
  const lines = [], warnings = [];
  const exact = new Set(guard.filter(g => !g.startsWith('*.')));
  const tree = guard.filter(g => g.startsWith('*.')).map(g => g.slice(2));
  for (const r of network) {
    const o = r.opts;
    const m = r.pattern.match(/^\|\|([a-z0-9._-]+)\^$/);
    if (!m || r.regex || o.types.length || o.notTypes.length || o.domains || o.thirdParty !== undefined ||
        o.redirect || o.cosmeticException) continue;
    const host = m[1];
    if (!r.exception && (exact.has(host) || tree.some(t => host === t || host.endsWith('.' + t)))) {
      warnings.push(`${r.raw} — общий CDN из shared-cdn.txt, в DNS не кладу (в расширении работает)`);
      continue;
    }
    lines.push(`${r.exception ? '@@' : ''}||${host}^${o.important ? '$important' : ''}`);
  }
  return { lines: [...new Set(lines)], warnings };
}

// ── declarativeNetRequest ──
// rules — влезли в бюджет (с id), overflow — сконвертированы, но не влезли (уйдут в обновление
// с сервера как динамические правила), dropped — формат, который DNR не умеет.
export function toDnr(network, budget) {
  const rules = [], overflow = [];
  let dropped = 0, id = 1;
  const seen = new Set();
  for (const r of network) {
    const o = r.opts;
    if (o.cosmeticException) continue; // это косметика, см. toCosmetic
    const condition = {};
    if (r.regex) {
      if (/\(\?[=!<]|\\[1-9]|\\[bB]/.test(r.regex)) { dropped++; continue; }
      // Повтор {100,} и больше раздувает регулярку сверх 2 КБ памяти Chrome: правило пропускается с ошибкой на странице расширений.
      const reps = [...r.regex.matchAll(/\{(\d+)(?:,(\d*))?\}/g)].map((m) => Math.max(+m[1], +(m[2] || 0)));
      if (reps.some((n) => n >= 100)) { dropped++; continue; }
      condition.regexFilter = r.regex;
    } else if (r.pattern && r.pattern !== '*') condition.urlFilter = r.pattern;
    if (o.caseSensitive) condition.isUrlFilterCaseSensitive = true;
    if (o.thirdParty !== undefined) condition.domainType = o.thirdParty ? 'thirdParty' : 'firstParty';
    if (o.domains) {
      const inc = o.domains.include.filter(d => !d.endsWith('.*'));
      const exc = o.domains.exclude.filter(d => !d.endsWith('.*'));
      if (o.domains.include.length && !inc.length) { dropped++; continue; }
      if (inc.length) condition.initiatorDomains = inc;
      if (exc.length) condition.excludedInitiatorDomains = exc;
    }
    if (o.types.length) condition.resourceTypes = [...new Set(o.types)];
    else if (o.notTypes.length) condition.excludedResourceTypes = [...new Set(o.notTypes)];
    let action, priority;
    if (r.exception && o.types.includes('main_frame')) {
      action = { type: 'allowAllRequests' };
      condition.resourceTypes = ['main_frame', 'sub_frame'];
      priority = 4;
    } else if (r.exception) { action = { type: 'allow' }; priority = 3; }
    else if (o.redirect) { action = { type: 'redirect', redirect: { extensionPath: `/redirects/${o.redirect}` } }; priority = 2; }
    else { action = { type: 'block' }; priority = o.important ? 5 : 1; }
    if (!condition.urlFilter && !condition.regexFilter && !condition.initiatorDomains && action.type === 'block') { dropped++; continue; }
    const key = JSON.stringify([action, condition]);
    if (seen.has(key)) continue;
    seen.add(key);
    const fits = budget.rules > 0 && (!r.regex || budget.regex > 0);
    if (!fits) { if (!r.regex) overflow.push({ priority, action, condition }); continue; }
    rules.push({ id: id++, priority, action, condition });
    budget.rules--;
    if (r.regex) budget.regex--;
  }
  return { rules, overflow, dropped };
}

// ── Косметика для расширения ──
export function toCosmetic(cosmetic, network) {
  const generic = new Set();
  const specific = {}, entity = {};
  const noGeneric = new Set(), noCosmetic = new Set();
  const bucket = (d) => {
    const map = d.endsWith('.*') ? entity : specific;
    const key = d.endsWith('.*') ? d.slice(0, -2) : d;
    return (map[key] ||= { hide: [], css: [], unhide: [] });
  };
  for (const c of cosmetic) {
    if (c.type === 'hide' && !c.include.length) {
      // :has() в общих правилах тормозит каждую страницу — такие держим только точечно.
      if (!c.selector.includes(':has(')) generic.add(c.selector);
      for (const d of c.exclude) bucket(d).unhide.push(c.selector);
      continue;
    }
    if (c.type === 'unhide' && !c.include.length) continue; // общее исключение без сайта — не поддерживаем
    for (const d of c.include) bucket(d)[c.type === 'css' ? 'css' : c.type].push(c.type === 'css' ? c.css : c.selector);
    if (c.type === 'hide') for (const d of c.exclude) bucket(d).unhide.push(c.selector);
  }
  for (const r of network) {
    const m = r.opts.cosmeticException && r.pattern.match(/^\|\|([a-z0-9._-]+)\^?$/);
    if (m) (r.opts.cosmeticException === 'generichide' ? noGeneric : noCosmetic).add(m[1]);
  }
  const tidy = (map) => { for (const v of Object.values(map)) for (const k in v) v[k] = [...new Set(v[k])]; return map; };
  return { generic: [...generic], specific: tidy(specific), entity: tidy(entity), noGeneric: [...noGeneric], noCosmetic: [...noCosmetic] };
}

// ── Safari Content Blocker ──
export function toSafari(lists, max) {
  const blocks = [], hides = [], allows = [];
  let dropped = 0;
  const domainList = (ds) => ds.filter(d => !d.endsWith('.*')).map(d => `*${d}`);
  for (const list of lists) {
    for (const r of list.network) {
      const o = r.opts;
      if (o.redirect || o.cosmeticException || r.regex) { dropped++; continue; }
      if (r.exception && !o.types.includes('main_frame') && !r.pattern) { dropped++; continue; }
      const trigger = { 'url-filter': abpToSafariRegex(r.pattern) };
      if (o.thirdParty !== undefined) trigger['load-type'] = [o.thirdParty ? 'third-party' : 'first-party'];
      const types = [...new Set(o.types.map(t => SAFARI_TYPES[t]).filter(Boolean))];
      if (types.length) trigger['resource-type'] = types;
      if (o.domains) {
        const inc = domainList(o.domains.include), exc = domainList(o.domains.exclude);
        if (inc.length && exc.length) { dropped++; continue; } // Safari не умеет оба сразу
        if (o.domains.include.length && !inc.length) { dropped++; continue; }
        if (inc.length) trigger['if-domain'] = inc;
        if (exc.length) trigger['unless-domain'] = exc;
      }
      if (r.exception && o.types.includes('main_frame')) {
        // Сайт целиком в белом списке.
        const host = r.pattern.match(/^\|\|([a-z0-9._-]+)\^?$/);
        if (!host) { dropped++; continue; }
        allows.push({ trigger: { 'url-filter': '.*', 'if-domain': [`*${host[1]}`] }, action: { type: 'ignore-previous-rules' } });
      } else (r.exception ? allows : blocks).push({ trigger, action: { type: r.exception ? 'ignore-previous-rules' : 'block' } });
    }
    // Косметику берём только из custom.txt: в EasyList бывают селекторы, на которых Safari
    // отказывается компилировать весь список целиком.
    if (list === lists[0]) {
      const generic = list.cosmetic.filter(c => c.type === 'hide' && !c.include.length && !c.exclude.length).map(c => c.selector);
      for (let i = 0; i < generic.length; i += 200) {
        hides.push({ trigger: { 'url-filter': '.*' }, action: { type: 'css-display-none', selector: generic.slice(i, i + 200).join(', ') } });
      }
      for (const c of list.cosmetic) {
        if (c.type !== 'hide' || !c.include.length) { if (c.type !== 'hide') dropped++; continue; }
        const inc = domainList(c.include);
        if (!inc.length) { dropped++; continue; }
        hides.push({ trigger: { 'url-filter': '.*', 'if-domain': inc }, action: { type: 'css-display-none', selector: c.selector } });
      }
    }
  }
  const room = max - hides.length - allows.length;
  if (blocks.length > room) dropped += blocks.length - room;
  return { rules: [...blocks.slice(0, Math.max(room, 0)), ...hides, ...allows], dropped };
}

export function abpToSafariRegex(p) {
  let out = '';
  if (p.startsWith('||')) { out = '^[^:]+://+([^:/]+\\.)?'; p = p.slice(2); }
  else if (p.startsWith('|')) { out = '^'; p = p.slice(1); }
  let end = false;
  if (p.endsWith('|')) { end = true; p = p.slice(0, -1); }
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*') out += '.*';
    else if (ch === '^') out += i === p.length - 1 ? '([/:?&=].*)?$' : '[/:?&=]';
    else if ('.+?$(){}[]\\/|'.includes(ch)) out += '\\' + ch;
    else out += ch;
  }
  if (end && !out.endsWith('$')) out += '$';
  return out || '.*';
}
