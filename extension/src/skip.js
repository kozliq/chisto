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

async function fromSponsorBlock(id) {
  try {
    const prefix = (await sha256Hex(id)).slice(0, 4);
    const res = await fetch(`${API}/skipSegments/${prefix}?categories=${encodeURIComponent(JSON.stringify(CATEGORIES))}`,
      { credentials: 'omit' });
    if (!res.ok) return [];
    const list = await res.json();
    const hit = Array.isArray(list) ? list.find((v) => v.videoID === id) : null;
    return (hit?.segments ?? [])
      .filter((s) => s.actionType === 'skip' && Array.isArray(s.segment))
      .map((s) => ({ start: +s.segment[0], end: +s.segment[1], source: 'база SponsorBlock' }))
      .filter((s) => Number.isFinite(s.start) && s.end > s.start);
  } catch {
    return [];
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

async function load(id) {
  segments = [];
  ignored = new Set();
  markStart = null;
  const [sb, mine] = await Promise.all([fromSponsorBlock(id), local(id)]);
  if (id !== videoId) return;
  // Описание дорисовывается позже плеера — ждём его до 10 секунд.
  let desc = [];
  for (let i = 0; i < 10 && !desc.length; i++) {
    desc = fromDescription(descriptionText());
    if (!desc.length) await new Promise((r) => setTimeout(r, 1000));
    if (id !== videoId) return;
  }
  segments = merge([...sb, ...mine, ...desc]);
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

function onTime() {
  if (!enabled || !video || video.paused && video.currentTime === 0) return;
  const t = video.currentTime;
  for (const s of segments) {
    const key = `${s.start}`;
    if (ignored.has(key)) continue;
    if (t >= s.start && t < s.end - 0.3) {
      video.currentTime = s.end;
      toast(`Пропущена реклама ${fmt(s.start)}–${fmt(s.end)} · ${s.source}`, 'Вернуть', () => {
        ignored.add(key);
        video.currentTime = s.start;
      });
      return;
    }
  }
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

function tick() {
  const v = document.querySelector('#movie_player video, video.html5-main-video');
  if (v && v !== video) {
    video?.removeEventListener('timeupdate', onTime);
    video = v;
    video.addEventListener('timeupdate', onTime);
  }
  const id = currentId();
  if (id !== videoId) {
    videoId = id;
    if (id) load(id);
  }
  if (id) ensureBar() && renderControls();
}

if (typeof document !== 'undefined' && ext?.storage) {
  refreshSettings();
  ext.storage.onChanged.addListener(refreshSettings);
  document.addEventListener('yt-navigate-finish', tick);
  setInterval(tick, 1000);
  tick();
}
