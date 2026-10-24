// Страница установки: определяем устройство, показываем нужную кнопку, проверяем, что DoH жив.
(() => {
  const cfg = window.CHISTO || {};
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const dohPath = cfg.dohPath || '/dns-query';
  // На своём же хосте ходим относительным адресом — так работает и локальная проверка по http.
  const dohUrl = !cfg.dohHost ? '' : location.host === cfg.dohHost ? `${location.origin}${dohPath}` : `https://${cfg.dohHost}${dohPath}`;

  // ── подставляем значения из .env ──
  $$('[data-brand]').forEach((e) => (e.textContent = cfg.brand || 'Чисто'));
  $$('[data-host]').forEach((e) => (e.textContent = cfg.dohHost || '—'));
  $$('[data-doh]').forEach((e) => (e.textContent = cfg.dohHost ? `https://${cfg.dohHost}${dohPath}` : '—'));
  $$('[data-ip]').forEach((e) => (e.textContent = cfg.serverIp || '—'));
  if (cfg.brand) document.title = `${cfg.brand} — блокировка рекламы`;
  // У варианта на Cloudflare Worker нет DoT (порт 853): прячем то, что без него не работает.
  if (!cfg.hasDot) $$('[data-needs-dot]').forEach((e) => e.remove());
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
  const names = { ios: 'iPhone или iPad', android: 'Android', desktop: 'компьютер', router: 'роутер' };

  function show(p) {
    if (!names[p]) p = detected;
    $$('[data-section]').forEach((s) => (s.hidden = s.dataset.section !== p));
    $$('.platforms a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.p === p)));
    $('#detected').textContent = p === detected
      ? `Похоже, у вас ${names[detected]}. Не угадали — выберите выше.`
      : `Выбрано вручную: ${names[p]}.`;
  }
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));

  // ── iOS: ссылка на приложение, если опубликовано ──
  if (cfg.tgBot) {
    $('#tgLine').hidden = false;
    $('#tgLink').href = `https://t.me/${cfg.tgBot}`;
    $('#tgLink').textContent = `@${cfg.tgBot}`;
  }
  if (cfg.iosAppUrl) { $('#iosApp').hidden = false; $('#iosAppLink').href = cfg.iosAppUrl; }

  // ── Android: копирование адресов ──
  function copyOnClick(id, value, done) {
    const link = $(id);
    if (!link) return;
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const label = link.querySelector('span:last-child');
      try { await navigator.clipboard.writeText(value); label.textContent = done; }
      catch { label.textContent = `Выделите и скопируйте: ${value}`; }
    });
  }
  const btc = $('#btcCopy');
  if (btc) btc.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await navigator.clipboard.writeText($('#btcAddr').textContent); btc.textContent = 'Скопировано'; }
    catch { btc.textContent = 'Выделите адрес выше и скопируйте'; }
  });
  copyOnClick('#copyHost', cfg.dohHost, 'Скопировано — вставьте в «Частный DNS»');
  copyOnClick('#copyDoh', `https://${cfg.dohHost}${dohPath}`, 'Скопировано — вставьте в Chrome');

  // ── Компьютер: магазин, если опубликовано, иначе архив ──
  const store = isFirefox ? cfg.firefoxAmoUrl : cfg.chromeStoreUrl;
  const ext = $('#extLink');
  if (store) {
    ext.href = store;
    $('#extLabel').textContent = isFirefox ? 'Установить из addons.mozilla.org' : 'Установить из Chrome Web Store';
    $('#extManualNote').textContent = 'Если магазин недоступен — можно поставить из архива:';
    $('#extCount').textContent = '1 клик — «Установить» в магазине.';
  } else {
    $('#extCount').textContent = '3 шага, один раз. Потом правила обновляются сами.';
    if (cfg.tgBot) $('#extManualNote').innerHTML = `В магазинах расширения пока нет — ставится из архива с сайта (или файлом из бота <a href="https://t.me/${cfg.tgBot}" rel="noopener">@${cfg.tgBot}</a>) за три шага:`;
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
