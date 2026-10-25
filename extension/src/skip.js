// Пропуск рекламных вставок внутри роликов YouTube (интеграции блогеров: банки, маркетплейсы и т.п.).
// Где реклама — узнаём из двух мест:
//  1) открытая база SponsorBlock (sponsor.ajay.app): уходят только первые 4 символа хеша id ролика,
//     под них подходят тысячи разных видео — какой ролик смотрите, база не узнаёт;
//  2) таймкоды в описании: «02:15 Реклама», «Интеграция», «Партнёр выпуска» и т.п.
// Кнопка «Отметить рекламу» — если вставки нет в базе: отмечаете начало и конец, у вас она
// пропускается сразу, а по желанию отправляется в SponsorBlock — и пропускается у всех.
// Данные SponsorBlock — CC BY-NC-SA 4.0, https://sponsor.ajay.app
const ext = globalThis.browser ?? globalThis.chrome;
const API = 'https://sponsor.ajay.app/api';
const CATEGORIES = ['sponsor', 'selfpromo'];
const AD_WORDS = /реклам|интеграц|спонсор|партн[её]р|промокод|промо\b|sponsor|\bad\b|advert/i;
const TIME = /(?:^|\s|\()((?:\d{1,2}:)?\d{1,2}:\d{2})(?=\s|$|\)|[-–—.,:])/;

let videoId = null;
let segments = [];          // [{ start, end, source }]
let ignored = new Set();    // вставки, которые человек вернул кнопкой «Вернуть»
let markStart = null;
let enabled = true;
let video = null;

const toSeconds = (t) => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function currentId() {
  const u = new URL(location.href);
  if (u.pathname === '/watch') return u.searchParams.get('v');
  return null;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Ответы SponsorBlock по id ролика: повторный заход и ролик, на который навели мышь, — без ожидания сети.
const sbCache = new Map();
const SB_CACHE_MAX = 60;

function fromSponsorBlock(id) {
  if (!sbCache.has(id)) {
    if (sbCache.size >= SB_CACHE_MAX) sbCache.delete(sbCache.keys().next().value);
    const p = askSponsorBlock(id);
    sbCache.set(id, p);
    p.then((list) => { if (!list.ok) sbCache.delete(id); });
  }
  return sbCache.get(id).then((r) => r.list);
}

async function askSponsorBlock(id) {
  try {
    const prefix = (await sha256Hex(id)).slice(0, 4);
    const res = await fetch(`${API}/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}`,
      { credentials: 'omit' });
    // 404 — у этого префикса нет ни одной вставки: ответ тоже окончательный.
    if (!res.ok) return { ok: res.status === 404, list: [] };
    const list = await res.json();
    const hit = Array.isArray(list) ? list.find((v) => v.videoID === id) : null;
    const segs = (hit?.segments ?? [])
      .filter((s) => s.actionType === 'skip' && Array.isArray(s.segment))
      .map((s) => ({ start: +s.segment[0], end: +s.segment[1], source: 'база SponsorBlock' }))
      .filter((s) => Number.isFinite(s.start) && s.end > s.start);
    return { ok: true, list: segs };
  } catch {
    return { ok: false, list: [] };
  }
}

/** Таймкоды из описания: строка с рекламным словом — начало, следующий таймкод — конец. */
function fromDescription(text) {
  const marks = [];
  for (const line of String(text || '').split('\n')) {
    const m = TIME.exec(line);
    if (m) marks.push({ t: toSeconds(m[1]), ad: AD_WORDS.test(line.replace(m[1], '')) });
  }
  marks.sort((a, b) => a.t - b.t);
  const out = [];
  marks.forEach((m, i) => {
    const next = marks.slice(i + 1).find((n) => n.t > m.t);
    // Без следующего таймкода конец неизвестен — такую вставку не трогаем, чтобы не промотать ролик.
    if (m.ad && next && next.t - m.t <= 600) out.push({ start: m.t, end: next.t, source: 'таймкоды в описании' });
  });
  return out;
}

function descriptionText() {
  const el = document.querySelector('ytd-watch-metadata #description, #description-inline-expander, #description');
  return el?.innerText ?? '';
}

async function local(id) {
  const { mySegments = {} } = await ext.storage.local.get('mySegments');
  return (mySegments[id] ?? []).map((s) => ({ ...s, source: 'ваша отметка' }));
}

// Быстрая часть (SponsorBlock + свои отметки) стартует сразу при смене ролика и не ждёт описания.
let fast = Promise.resolve([]);
let fastReady = false;

function startFast(id) {
  fastReady = false;
  fast = Promise.all([fromSponsorBlock(id), local(id)]).then(([sb, mine]) => {
    if (id !== videoId) return [];
    const list = merge([...sb, ...mine]);
    segments = merge([...segments, ...list]);
    fastReady = true;
    return list;
  });
  return fast;
}

async function load(id) {
  const quick = await fast;
  if (id !== videoId) return;
  // Описание дорисовывается позже плеера — ждём его до 10 секунд.
  let desc = [];
  for (let i = 0; i < 10 && !desc.length; i++) {
    desc = fromDescription(descriptionText());
    if (!desc.length) await new Promise((r) => setTimeout(r, 1000));
    if (id !== videoId) return;
  }
  segments = merge([...quick, ...desc, ...segments]);
  renderControls();
}

function merge(list) {
  const sorted = list.filter((s) => s.end - s.start >= 1).sort((a, b) => a.start - b.start);
  const out = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end + 0.5) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

const GATE_MS = 350;       // столько держим уже играющий ролик ради ответа сети
const GATE_LOADING_MS = 1500; // пока плеер сам грузится и кадра ещё нет, ждать можно дольше — этого не видно
const START_EPS = 0.5;     // вставка «с нуля»: начало не позже 0:00.5
const SEEK_PAD = 0.05;

const inAd = () => !!document.querySelector('#movie_player.ad-showing');

/** Куда перемотать, если время t внутри вставки; иначе null. */
function skipTarget(t, list, skipped, duration) {
  for (const s of list) {
    if (skipped.has(`${s.start}`)) continue;
    if (t >= s.start && t < s.end - 0.3) {
      const to = s.end + SEEK_PAD;
      return { seg: s, to: Number.isFinite(duration) && duration > 0 ? Math.min(to, duration) : to };
    }
  }
  return null;
}

function jump(v, hit) {
  const { seg, to } = hit;
  const key = `${seg.start}`;
  v.currentTime = to;
  toast(`Пропущена реклама ${fmt(seg.start)}–${fmt(seg.end)} · ${seg.source}`, 'Вернуть', () => {
    ignored.add(key);
    v.currentTime = seg.start;
  });
}

function checkSkip() {
  if (!enabled || !video || !videoId || inAd()) return;
  if (video.paused && video.currentTime === 0) return;
  const hit = skipTarget(video.currentTime, segments, ignored, video.duration);
  if (hit) jump(video, hit);
}

// Проверка не только по редкому timeupdate (~4 раза в секунду): пока играет — каждый кадр,
// если браузер умеет requestVideoFrameCallback, иначе таймером 100 мс.
let frameLoop = 0;
function watchFrames(v) {
  const run = ++frameLoop;
  if (typeof v.requestVideoFrameCallback === 'function') {
    const step = () => { if (run !== frameLoop) return; checkSkip(); v.requestVideoFrameCallback(step); };
    v.requestVideoFrameCallback(step);
  } else {
    const timer = setInterval(() => { if (run !== frameLoop) clearInterval(timer); else checkSkip(); }, 100);
  }
}

// ── Старт с нуля: не даём вставке сыграть, пока ждём ответ SponsorBlock ──
let hold = null; // { id, ours (ждём своей паузы), held (мы ставили на паузу), cancelled, done }

const startsAtZero = (list) => list.find((s) => s.start <= START_EPS) ?? null;

/** Ждём промис сегментов не дольше ms; по таймауту возвращаем null (скип случится позже по кадрам). */
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((r) => { timer = setTimeout(() => r(null), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function gateStart(v, id) {
  if (!enabled || inAd() || !id || id !== videoId) return;
  if (v.currentTime > START_EPS) return;                   // продолжение с середины или ссылка с ?t=
  if (hold?.id === id && !hold.done) return;               // уже ждём этот ролик
  const h = (hold = { id, ours: false, held: false, cancelled: false, done: false });
  const onPause = () => { if (h.ours) h.ours = false; else h.cancelled = true; }; // пауза не наша — человек остановил сам
  v.addEventListener('pause', onPause);
  if (!fastReady && !v.paused) { h.ours = h.held = true; v.pause(); }
  // Кадра ещё нет (readyState < 3) — плеер всё равно грузится, ждём ответа дольше; дальше пауза уже заметна.
  const list = fastReady ? segments : await withTimeout(fast, v.readyState < 3 ? GATE_LOADING_MS : GATE_MS);
  v.removeEventListener('pause', onPause);
  h.done = true;
  if (id !== videoId || h.id !== id) return;
  const first = startsAtZero(list ?? segments);
  if (first && enabled) {
    const hit = skipTarget(Math.max(v.currentTime, first.start), [first], ignored, v.duration);
    if (hit) jump(v, hit);                                  // до запуска воспроизведения, без ожидания timeupdate
  }
  if (h.held && !h.cancelled && v.paused) resume(v);
}

function resume(v) {
  const p = v.play();
  if (p?.catch) p.catch(() => document.querySelector('.ytp-play-button')?.click());
}

// ── Интерфейс поверх плеера: только текст, без плашек-кнопок ──
const STYLE = `
.chisto-bar{position:absolute;left:12px;top:12px;z-index:60;font:500 15px/1.4 system-ui,sans-serif;color:#f0ebee;
  text-shadow:0 1px 3px #000,0 0 8px #000;display:flex;gap:16px;align-items:baseline;pointer-events:auto}
.chisto-bar a{color:#f0ebee;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.chisto-bar .chisto-msg{color:#f0ebee}
.ytp-autohide .chisto-bar .chisto-mark{opacity:0;transition:opacity .3s}
`;
let bar, msg, markLink, toastTimer;

function ensureBar() {
  const player = document.querySelector('#movie_player');
  if (!player) return null;
  if (bar?.isConnected) return bar;
  if (!document.getElementById('chisto-style')) {
    const st = document.createElement('style');
    st.id = 'chisto-style';
    st.textContent = STYLE;
    document.head.append(st);
  }
  bar = document.createElement('div');
  bar.className = 'chisto-bar';
  markLink = document.createElement('a');
  markLink.className = 'chisto-mark';
  markLink.addEventListener('click', onMark);
  msg = document.createElement('span');
  msg.className = 'chisto-msg';
  bar.append(markLink, msg);
  player.append(bar);
  return bar;
}

function renderControls() {
  if (!ensureBar()) return;
  markLink.hidden = !enabled;
  markLink.textContent = markStart === null ? 'Отметить рекламу' : `Конец рекламы (начало ${fmt(markStart)})`;
}

function toast(text, actionText, action) {
  if (!ensureBar()) return;
  msg.replaceChildren(document.createTextNode(text + (actionText ? ' · ' : '')));
  if (actionText) {
    const a = document.createElement('a');
    a.textContent = actionText;
    a.addEventListener('click', (e) => { e.stopPropagation(); action(); msg.replaceChildren(); });
    msg.append(a);
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => msg.replaceChildren(), 8000);
}

async function onMark(e) {
  e.stopPropagation();
  if (!video || !videoId) return;
  if (markStart === null) {
    markStart = video.currentTime;
    renderControls();
    toast('Начало отмечено. Нажмите ещё раз, когда реклама закончится');
    return;
  }
  const seg = { start: Math.min(markStart, video.currentTime), end: Math.max(markStart, video.currentTime) };
  markStart = null;
  renderControls();
  if (seg.end - seg.start < 2) { toast('Слишком коротко — отметка не сохранена'); return; }
  const { mySegments = {} } = await ext.storage.local.get('mySegments');
  mySegments[videoId] = [...(mySegments[videoId] ?? []), seg].slice(-20);
  await ext.storage.local.set({ mySegments });
  segments = merge([...segments, { ...seg, source: 'ваша отметка' }]);
  toast(`Запомнил ${fmt(seg.start)}–${fmt(seg.end)}`, 'Отправить в SponsorBlock, чтобы пропускалось у всех', () => submit(videoId, seg));
}

async function submit(id, seg) {
  try {
    let { sbUserId } = await ext.storage.local.get('sbUserId');
    if (!sbUserId) {
      sbUserId = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
      await ext.storage.local.set({ sbUserId });
    }
    const q = new URLSearchParams({ videoID: id, userID: sbUserId, category: 'sponsor',
      startTime: seg.start.toFixed(3), endTime: seg.end.toFixed(3), userAgent: 'Chisto/0.2' });
    const res = await fetch(`${API}/skipSegments?${q}`, { method: 'POST', credentials: 'omit' });
    toast(res.ok ? 'Отправлено. Спасибо — теперь пропустится и у других' : `SponsorBlock не принял (${res.status})`);
  } catch {
    toast('Нет связи с SponsorBlock — отметка осталась у вас');
  }
}

// ── Следим за сменой ролика (YouTube — одностраничный сайт) ──
async function refreshSettings() {
  const s = await ext.storage.local.get({ paused: false, skipVideoAds: true, allowSites: [] });
  enabled = s.skipVideoAds && !s.paused && !s.allowSites.some((h) => location.hostname.endsWith(h));
  renderControls();
}

function bindVideo(v) {
  if (v === video) return;
  video?.removeEventListener('timeupdate', checkSkip);
  video = v;
  video.addEventListener('timeupdate', checkSkip);
  video.addEventListener('playing', () => watchFrames(video), { once: false });
  if (!video.paused) watchFrames(video);
}

function switchTo(id) {
  if (id === videoId) return;
  videoId = id;
  hold = null;
  segments = [];
  ignored = new Set();
  markStart = null;
  if (id) { startFast(id); load(id); }
}

function tick() {
  const v = document.querySelector('#movie_player video, video.html5-main-video');
  if (v) bindVideo(v);
  switchTo(currentId());
  if (videoId) ensureBar() && renderControls();
}

// Медиа-события не всплывают, но ловятся на document в фазе перехвата: <video> ещё может не быть
// в DOM, а мы уже на месте — и успеваем до первого кадра. Опрос раз в секунду остаётся страховкой.
const onMedia = (e) => {
  const v = e.target;
  if (!(v instanceof HTMLVideoElement) || !v.matches('#movie_player video, video.html5-main-video')) return;
  bindVideo(v);
  switchTo(currentId());
  gateStart(v, videoId);
};

/** Наведение на ролик в ленте дольше 150 мс — заранее спрашиваем SponsorBlock (те же 4 символа хеша). */
let hoverTimer = 0;
function onHover(e) {
  const a = e.target instanceof Element ? e.target.closest('a[href*="/watch?v="]') : null;
  clearTimeout(hoverTimer);
  if (!a || !enabled) return;
  const id = new URL(a.href, location.href).searchParams.get('v');
  if (id && !sbCache.has(id)) hoverTimer = setTimeout(() => fromSponsorBlock(id), e.type === 'touchstart' ? 0 : 150);
}

/** Соединение с SponsorBlock открываем сразу: на медленном VPN одно рукопожатие TLS — это секунды. */
function preconnect() {
  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = 'https://sponsor.ajay.app';
  link.crossOrigin = 'anonymous';
  const root = document.head || document.documentElement;
  if (root) root.append(link);
  else document.addEventListener('readystatechange', preconnect, { once: true }); // корня ещё нет — сразу как появится
}

if (typeof document !== 'undefined' && ext?.storage) {
  preconnect();
  document.addEventListener('pointerover', onHover, { capture: true, passive: true });
  document.addEventListener('touchstart', onHover, { capture: true, passive: true });
  // Запрос к SponsorBlock уходит на document_start, не дожидаясь плеера.
  switchTo(currentId());
  refreshSettings();
  ext.storage.onChanged.addListener(refreshSettings);
  for (const ev of ['loadstart', 'loadedmetadata', 'canplay', 'play']) document.addEventListener(ev, onMedia, true);
  document.addEventListener('yt-navigate-start', (e) => {
    const id = e.detail?.endpoint?.watchEndpoint?.videoId;
    if (id) switchTo(id);
  });
  document.addEventListener('yt-navigate-finish', tick);
  setInterval(tick, 1000);
  tick();
}
