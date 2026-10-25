// Страница установки: определяем устройство, показываем нужную кнопку, проверяем, что DoH жив.
(() => {
  const cfg = window.CHISTO || {};
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const dohPath = cfg.dohPath || '/dns-query';
  // DNS может жить на отдельном адресе (свой сервер), сайт и правила — на dohHost.
  const dnsHost = cfg.dnsHost || cfg.dohHost;
  // На своём же хосте ходим относительным адресом — так работает и локальная проверка по http.
  const dohUrl = !dnsHost ? '' : location.host === dnsHost ? `${location.origin}${dohPath}` : `https://${dnsHost}${dohPath}`;

  // ── подставляем значения из .env ──
  $$('[data-brand]').forEach((e) => (e.textContent = cfg.brand || 'Чисто'));
  $$('[data-host]').forEach((e) => (e.textContent = dnsHost || '—'));
  // DoT (Android «Частный DNS») может жить на третьем адресе: Worker и туннель порт 853 не умеют.
  $$('[data-dot]').forEach((e) => (e.textContent = cfg.dotHost || dnsHost || '—'));
  $$('[data-dot-ip]').forEach((e) => (e.textContent = cfg.dotIp || cfg.serverIp || '—'));
  $$('[data-doh]').forEach((e) => (e.textContent = dnsHost ? `https://${dnsHost}${dohPath}` : '—'));
  $$('[data-ip]').forEach((e) => (e.textContent = cfg.serverIp || '—'));
  if (cfg.brand) document.title = `${cfg.brand} — блокировка рекламы`;
  // У варианта на Cloudflare Worker нет DoT (порт 853): прячем то, что без него не работает.
  if (!cfg.hasDot) $$('[data-needs-dot]').forEach((e) => e.remove());
  else $$('[data-no-dot]').forEach((e) => e.remove());
  // Без своего IP (вариант на Worker) ручная настройка Windows невозможна — там нужен адрес сервера.
  if (!cfg.serverIp) $$('[data-needs-ip]').forEach((e) => e.remove());
  if (cfg.apkReady) {
    $('#chromeTitle').textContent = 'Только в Chrome — за минуту';
    $('#chromeIntro').textContent = 'Если приложение ставить не хочется: защищён будет только браузер Chrome.';
  } else $('#apkBlock').remove();
  if (cfg.tgBot) $('#barTg').href = `https://t.me/${cfg.tgBot}`;

  // ── устройство ──
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isFirefox = /Firefox\//.test(ua) && !isIOS;
  const isMacSafari = /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua) && !isIOS;
  const detected = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  const names = { ios: 'iPhone или iPad', android: 'Android', desktop: 'компьютер', router: 'роутер', vpn: 'VPN' };

  function show(p) {
    if (!names[p]) p = detected;
    $$('[data-section]').forEach((s) => (s.hidden = s.dataset.section !== p));
    $$('.platforms a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.p === p)));
  }
  // Своё устройство подписываем у вкладки, без отдельной фразы «угадали / не угадали».
  const mine = $(`.platforms a[data-p="${detected}"]`);
  if (mine) mine.dataset.me = '';
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));

  // ── iOS: ссылка на приложение, если опубликовано ──
  if (cfg.tgBot) {
    $('#tgLine').hidden = false;
    $('#tgLink').href = `https://t.me/${cfg.tgBot}`;
    $('#tgLink').textContent = `@${cfg.tgBot}`;
  }
  if (cfg.iosAppUrl) { $('#iosApp').hidden = false; $('#iosAppLink').href = cfg.iosAppUrl; }

  // ── Рамки с адресами: кнопка «Скопировать» берёт текст соседнего <code> ──
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.copybox .copy');
    if (!b || b.dataset.own) return;
    const code = b.previousElementSibling;
    try { await navigator.clipboard.writeText(code.textContent); b.textContent = 'Скопировано'; }
    catch {
      // Буфер не дали — выделяем адрес, остаётся «Копировать» в меню.
      getSelection().selectAllChildren(code);
      b.textContent = 'Адрес выделен — скопируйте';
    }
    setTimeout(() => (b.textContent = 'Скопировать'), 2500);
  });
  const btc = $('#btcCopy');
  if (btc) btc.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await navigator.clipboard.writeText($('#btcAddr').textContent); btc.textContent = 'Скопировано'; }
    catch { btc.textContent = 'Выделите адрес выше и скопируйте'; }
  });

  // ── Компьютер: магазин, если опубликовано, иначе архив ──
  const store = isFirefox ? cfg.firefoxAmoUrl : cfg.chromeStoreUrl;
  const ext = $('#extLink');
  if (store) {
    ext.href = store;
    $('#extLabel').textContent = isFirefox ? 'Установить из addons.mozilla.org' : 'Установить из Chrome Web Store';
    $('#extManualNote').textContent = 'Если магазин не открывается — можно поставить из архива:';
    $('#extCount').textContent = '1 клик — «Установить» в магазине.';
  } else {
    $('#extCount').textContent = '3 шага, один раз. Потом правила обновляются сами.';
    if (cfg.tgBot) $('#extManualNote').innerHTML = `В магазинах расширения пока нет — оно ставится из архива с этого сайта (или файлом из бота <a href="https://t.me/${cfg.tgBot}" rel="noopener">@${cfg.tgBot}</a>). Три шага, один раз:`;
    ext.href = isFirefox ? 'dl/chisto-firefox.zip' : 'dl/chisto-chrome.zip';
    ext.setAttribute('download', '');
    $('#extLabel').textContent = isFirefox ? 'Скачать расширение для Firefox' : 'Скачать расширение';
  }
  $('#stepsChrome').hidden = isFirefox;
  $('#stepsFirefox').hidden = !isFirefox;
  if (isMacSafari) {
    $('#extLabel').textContent = 'Расширение для Chrome / Firefox';
    $('#extManualNote').textContent = 'Для Safari на Mac расширения нет — поставьте профиль ниже (раздел «macOS»). Для других браузеров:';
  }


  // ── «Использую VPN»: DNS-адрес + список доменов для клиента ──
  // Профиль и «Частный DNS» при VPN не работают, поэтому показываем готовые строки для вставки.
  const rulesBase = cfg.dohHost ? (location.host === cfg.dohHost ? `${location.origin}/rules/` : `https://${cfg.dohHost}/rules/`) : 'rules/';
  const doh = dohUrl || `https://${dnsHost}${dohPath}`;
  const list = (name, kind = 'lite') => `${rulesBase}${name}-${kind}.${name === 'shadowrocket' ? 'list' : name === 'singbox' ? 'json' : 'txt'}`;
  // Российские сайты — напрямую, мимо VPN: через иностранный сервер Rutube, VK и банки грузятся бесконечно или не открываются.
  // Вся зона .ru/.su/.рф + домены VK и Яндекса вне .ru. DNS «Чисто» при этом работает и для них.
  const ruDomains = ['ru', 'su', 'xn--p1ai', 'vk.com', 'vk.me', 'userapi.com', 'vkuseraudio.net', 'vkuservideo.net', 'vk-cdn.net', 'mycdn.me', 'yandex.net', 'yandex.com', 'yastatic.net'];
  const CLIENTS = {
    // Happ — самый частый клиент в РФ, поэтому первый и по умолчанию. Своя страница: renderHapp.
    happ: { label: 'Happ', custom: () => renderHapp() },
    shadowrocket: {
      label: 'Shadowrocket',
      dns: doh,
      dnsSteps: 'Настройки → DNS → «Добавить» → вставьте адрес. Или строкой в конфиге: dns-server = адрес, system',
      list: list('shadowrocket'), full: list('shadowrocket', 'full'),
      listSteps: 'Конфиг → «Правила» → «Добавить правило» → тип RULE-SET, URL — адрес списка, действие REJECT. Российские сайты — напрямую (DIRECT): правила в куске ниже.',
      snippet: `[General]\ndns-server = ${doh}, system\n\n[Rule]\nRULE-SET,${list('shadowrocket')},REJECT\n${ruDomains.map((d) => `DOMAIN-SUFFIX,${d},DIRECT`).join('\n')}\nGEOIP,RU,DIRECT`,
    },
    singbox: {
      label: 'sing-box',
      dns: doh,
      dnsSteps: 'sing-box 1.12 и новее. Добавьте сервер в «dns» (строка ниже) и укажите его в dns.final или в правиле для нужных доменов.',
      list: list('singbox'), full: list('singbox', 'full'),
      listSteps: 'Добавьте rule_set и правило reject в «route» (строка ниже). Список обновляется раз в сутки. Второе правило пускает российские сайты напрямую (нужен outbound с тегом direct).',
      snippet: JSON.stringify({
        dns: { servers: [{ type: 'https', tag: 'chisto', server: dnsHost, path: dohPath, domain_resolver: 'local' }] },
        route: {
          rule_set: [{ type: 'remote', tag: 'chisto-ads', format: 'source', url: list('singbox'), download_detour: 'direct', update_interval: '1d' }],
          rules: [{ rule_set: 'chisto-ads', action: 'reject' }, { domain_suffix: ruDomains, outbound: 'direct' }],
        },
      }, null, 2),
    },
    v2ray: {
      label: 'V2Ray / Xray',
      dns: doh,
      dnsSteps: 'v2rayNG, V2Box, Streisand и др.: в настройках DNS (или в JSON-конфиге, блок «dns» → «servers») добавьте адрес первым.',
      list: null,
      listSteps: 'В правила маршрутизации добавьте домен-правило geosite:category-ads-all с действием block, а geosite:category-ru и geoip:ru — с действием direct (российские сайты напрямую). Свой список из 46 тысяч доменов в эти клиенты руками не вставить — его работу делает DoH.',
      snippet: JSON.stringify({ dns: { servers: [doh, '1.1.1.1'] } }, null, 2),
    },
    clash: {
      label: 'Clash / Mihomo',
      dns: doh,
      dnsSteps: 'В конфиге добавьте адрес в dns.nameserver (блок ниже).',
      list: list('clash'), full: list('clash', 'full'),
      listSteps: 'Добавьте rule-provider и правило REJECT в «rules» (блок ниже). Правила DIRECT пускают российские сайты напрямую.',
      snippet: `dns:\n  enable: true\n  nameserver:\n    - ${doh}\n\nrule-providers:\n  chisto:\n    type: http\n    behavior: domain\n    format: text\n    url: "${list('clash')}"\n    path: ./ruleset/chisto.txt\n    interval: 86400\n\nrules:\n  - RULE-SET,chisto,REJECT\n${ruDomains.map((d) => `  - DOMAIN-SUFFIX,${d},DIRECT`).join('\n')}\n  - GEOIP,RU,DIRECT`,
    },
  };

  function copyBtn(text, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy';
    b.dataset.own = '1';
    b.textContent = label;
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); b.textContent = 'Скопировано'; }
      catch { b.textContent = 'Выделите текст выше и скопируйте'; }
      setTimeout(() => (b.textContent = label), 2500);
    });
    return b;
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

  function item(title, value, steps, copyLabel, extra) {
    const wrap = el('div', 'vpn-item');
    wrap.append(el('h3', '', title));
    if (value) { const box = el('div', 'copybox'); box.append(el('code', '', value), copyBtn(value, copyLabel)); wrap.append(box); }
    if (steps) wrap.append(el('p', 'hint', steps));
    if (extra) wrap.append(extra);
    return wrap;
  }

  // Профиль маршрутизации Happ (формат happ.su/main/dev-docs/routing): DNS «Чисто» внутри туннеля режет рекламу,
  // российские сайты напрямую. Ставится ссылкой happ://routing/onadd/…
  // На iPhone у туннеля лимит 50 МБ: полные geo-базы и geosite:category-ads-all его рвут, поэтому
  // свои маленькие базы site/happ/*.dat (только Россия, ~0,4 МБ, tools/happ-geo.mjs) и без больших списков.
  // Имя новое: у профиля «Чисто» Happ мог оставить старые тяжёлые базы (обновляет их не чаще раза в неделю).
  // IP — адрес Cloudflare, за которым стоит DNS-хост: любой их узел отвечает на это имя.
  const happIp = '104.21.82.19';
  const siteOrigin = cfg.dohHost ? `https://${cfg.dohHost}` : location.origin;
  const happProfile = {
    Name: `${cfg.brand || 'Чисто'} — Россия напрямую`,
    GlobalProxy: 'true',
    RemoteDNSType: 'DoH', RemoteDNSDomain: doh, RemoteDNSIP: happIp,
    DomesticDNSType: 'DoH', DomesticDNSDomain: doh, DomesticDNSIP: happIp,
    Geoipurl: `${siteOrigin}/happ/geoip.dat`,
    Geositeurl: `${siteOrigin}/happ/geosite.dat`,
    DnsHosts: { [dnsHost]: happIp },
    DirectSites: ['geosite:category-ru', ...ruDomains.map((d) => `domain:${d}`)],
    DirectIp: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '224.0.0.0/4', '255.255.255.255', 'geoip:ru'],
    ProxySites: [], ProxyIp: [],
    BlockSites: [], BlockIp: [],
    DomainStrategy: 'IPIfNonMatch',
    FakeDNS: 'false',
  };
  // base64url без «=», как в официальном конструкторе routing.happ.su: «/» в ссылке ломает разбор.
  const happLink = 'happ://routing/onadd/' + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(happProfile))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  // Happ: одна кнопка и два шага — всё лишнее спрятано под «Не получилось?».
  function renderHapp() {
    const body = $('#vpnBody');
    const p = (cls, html) => { const e = el('p', cls); e.innerHTML = html; return e; };
    const ol = (...lis) => { const o = el('ol', 'steps'); for (const html of lis) { const li = el('li'); li.innerHTML = html; o.append(li); } return o; };

    const main = el('div', 'vpn-item');
    main.append(p('', 'Happ настроится сам, вручную ничего вводить не&nbsp;нужно.'));
    const a = el('a', 'action');
    a.href = happLink;
    const mark = el('span', 'mark', '+'); mark.setAttribute('aria-hidden', 'true');
    a.append(mark, el('span', '', 'Добавить в Happ'));
    main.append(a, ol(
      'Нажмите кнопку на&nbsp;телефоне или компьютере, где стоит Happ, и&nbsp;согласитесь открыть Happ. Если он спросит, в&nbsp;какую подписку,&nbsp;— выберите свой VPN.',
      'В&nbsp;Happ выключите VPN большой круглой кнопкой и&nbsp;включите снова.',
      'Готово. Проверка: откройте <a href="https://ad.doubleclick.net" rel="noopener">ad.doubleclick.net</a>&nbsp;— если страница не&nbsp;открылась, реклама режется.',
    ));
    main.append(p('hint', '<b>Rutube, VK, банки и&nbsp;Госуслуги идут напрямую, мимо VPN</b>&nbsp;— так они открываются быстро и&nbsp;не&nbsp;грузятся бесконечно. Реклама на&nbsp;них всё равно режется. Остальное&nbsp;— через VPN, как раньше.'));

    const more = el('details', 'more-ios');
    more.append(el('summary', '', 'Не получилось?'));
    more.append(p('', '<b>Кнопка не открыла Happ.</b> Скопируйте ссылку, затем в&nbsp;Happ: шестерёнка → «Маршрутизация» → «•••» вверху справа → «Импорт профиля».'));
    const box = el('div', 'copybox'); box.append(el('code', '', 'Ссылка для Happ'), copyBtn(happLink, 'Скопировать ссылку'));
    more.append(box);
    more.append(p('', '<b>Под серверами написано «JSON»</b> (например, «VLESS | xhttp | TLS | JSON»). Такие подписки Happ менять не&nbsp;даёт. Подключайтесь к&nbsp;серверу без пометки JSON или поставьте на&nbsp;компьютер <a href="#desktop">расширение</a>.'));
    more.append(p('', '<b>Ошибка «Лимит памяти туннеля превышен»</b>&nbsp;— это старая версия нашей настройки. В&nbsp;Happ: шестерёнка → «Маршрутизация» → профиль «Чисто» → внизу «Удалить конфигурацию». Потом нажмите «Добавить в&nbsp;Happ» ещё раз.'));
    more.append(p('', '<b>Rutube или VK бесконечно грузятся с&nbsp;VPN</b>&nbsp;— нажмите «Добавить в&nbsp;Happ» ещё раз (профиль обновится) и&nbsp;переподключите VPN. Если серверы с&nbsp;пометкой JSON&nbsp;— см. выше: к&nbsp;ним настройка не&nbsp;применяется.'));
    more.append(p('', '<b>Реклама вернулась</b> после обновления подписки&nbsp;— просто нажмите «Добавить в&nbsp;Happ» ещё раз.'));
    more.append(p('', '<b>Как выключить:</b> в&nbsp;Happ «•••» рядом с&nbsp;подпиской → «Маршрутизация» → выключите «Включить маршрутизацию», затем выключите и&nbsp;включите VPN.'));
    body.append(main, more);
  }

  function renderVpn(id) {
    const c = CLIENTS[id];
    const body = $('#vpnBody');
    body.replaceChildren();
    $$('#vpnPick button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.c === id)));
    try { localStorage.setItem('chistoVpnClient', id); } catch { /* приватный режим — не страшно */ }
    const genericOff = $('#p-vpn > p.off'); // общее «Как выключить» — у Happ своё
    if (genericOff) genericOff.hidden = Boolean(c.custom);
    if (c.custom) return c.custom();
    body.append(item('1. Адрес DNS', c.dns, c.dnsSteps, 'Скопировать'));
    let extra = null;
    if (c.full) {
      extra = el('p', 'vpn-sizes');
      extra.append('Нужна максимальная блокировка? ');
      const a = el('a', '', 'Полный список (223 тыс. доменов — для sing-box и Clash, на iPhone может быть тяжело)');
      a.href = c.full; a.rel = 'noopener';
      extra.append(a);
    }
    if (c.list) body.append(item('2. Список рекламных доменов', c.list, c.listSteps, 'Скопировать', extra));
    else body.append(item('2. Блокировка доменов', null, c.listSteps));
    if (c.snippet) {
      const box = el('div', 'copybox code');
      box.append(el('pre', '', c.snippet), copyBtn(c.snippet, 'Скопировать'));
      body.append(item('Готовый кусок настроек — вставить целиком', null, null, null, box));
    }
  }

  if ($('#vpnPick')) {
    for (const [id, c] of Object.entries(CLIENTS)) {
      const b = el('button', '', c.label);
      b.type = 'button'; b.dataset.c = id; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => renderVpn(id));
      $('#vpnPick').append(b);
    }
    let last = 'happ';
    try { last = localStorage.getItem('chistoVpnClient') || last; } catch { /* нет хранилища */ }
    renderVpn(CLIENTS[last] ? last : 'happ');
  }

  // ── Статус фильтра: два DoH-запроса ──
  // example.com должен резолвиться, тестовый рекламный домен — превращаться в 0.0.0.0.
  function query(name) {
    const labels = name.split('.');
    const len = 12 + labels.reduce((n, l) => n + l.length + 1, 0) + 1 + 4;
    const b = new Uint8Array(len);
    b[2] = 0x01; b[5] = 0x01; // RD, QDCOUNT=1 (ID=0 — рекомендация RFC 8484 для кэша)
    let o = 12;
    for (const l of labels) { b[o++] = l.length; for (const ch of l) b[o++] = ch.charCodeAt(0); }
    b[o++] = 0; b[o++] = 0; b[o++] = 1; b[o++] = 0; b[o++] = 1; // QTYPE A, QCLASS IN
    return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function answers(buf) {
    const d = new DataView(buf);
    const rcode = d.getUint8(3) & 0x0f;
    const an = d.getUint16(6);
    let o = 12;
    const skipName = () => {
      while (true) {
        const n = d.getUint8(o);
        if (n === 0) { o += 1; return; }
        if ((n & 0xc0) === 0xc0) { o += 2; return; }
        o += n + 1;
      }
    };
    skipName(); o += 4;
    const ips = [];
    for (let i = 0; i < an; i++) {
      skipName();
      const type = d.getUint16(o), rdlen = d.getUint16(o + 8);
      o += 10;
      if (type === 1 && rdlen === 4) ips.push([0, 1, 2, 3].map((k) => d.getUint8(o + k)).join('.'));
      o += rdlen;
    }
    return { rcode, ips };
  }
  async function resolve(name) {
    const t = performance.now();
    const res = await fetch(`${dohUrl}?dns=${query(name)}`, { headers: { accept: 'application/dns-message' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ...answers(await res.arrayBuffer()), ms: Math.round(performance.now() - t) };
  }
  async function check() {
    const st = $('#status'), txt = $('#statusText');
    if (!dohUrl) { st.className = 'status bad'; txt.textContent = 'Сайт не настроен: нет config.js'; return; }
    try {
      const [good, ad] = await Promise.all([resolve('example.com'), resolve('chisto-test-ad.invalid')]);
      const goodOk = good.rcode === 0 && good.ips.some((ip) => ip !== '0.0.0.0');
      const adBlocked = ad.ips.includes('0.0.0.0');
      if (goodOk && adBlocked) { st.className = 'status ok'; txt.textContent = `Фильтр жив · ответ ${good.ms} мс`; }
      else if (goodOk) { st.className = 'status warn'; txt.textContent = 'Сервер отвечает, но тестовый рекламный домен не заблокирован'; }
      else { st.className = 'status warn'; txt.textContent = 'Сервер отвечает, но обычные сайты не резолвятся'; }
    } catch {
      st.className = 'status bad'; txt.textContent = 'Сервер DNS сейчас не отвечает';
    }
  }
  check();
})();
