// Общие счётчики для страницы /admin (только цифры автору).
// Хранятся: сколько запросов, сколько заблокировано, сколько скачали — по дням.
// НЕ хранятся: домены, IP-адреса, id людей. «Сколько устройств» считает HyperLogLog:
// 256 маленьких чисел на день, по которым человека восстановить нельзя.
// Нет привязки D1 (env.DB) — всё молча отключается, Worker работает как раньше.

const M = 256;              // регистров HyperLogLog (ошибка около 6,5%)
const FLUSH_MS = 120000;    // копим в памяти и пишем раз в 2 минуты: бесплатный лимит D1 — 100 000 записей в сутки
const FLUSH_EVENTS = 500;
const KEEP_DAYS = 90;
const TZ_HOURS = 6;         // граница суток для счётчиков: UTC+6

/** Дата ГГГГ-ММ-ДД (UTC+6). */
export function dayOf(now = Date.now()) {
  return new Date(now + TZ_HOURS * 3600e3).toISOString().slice(0, 10);
}

async function sha(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Номер регистра и «ранг» (позиция первой единицы) из хеша. */
export function slot(h) {
  const idx = h[0];
  let rank = 1;
  for (let i = 1; i < 5 && rank <= 32; i++) {
    const b = h[i];
    if (b === 0) { rank += 8; continue; }
    rank += Math.clz32(b) - 24;
    break;
  }
  return [idx, Math.min(rank, 33)];
}

const enc = (regs) => Array.from(regs, (r) => String.fromCharCode(48 + r)).join('');
const dec = (s) => Uint8Array.from({ length: M }, (_, i) => (s && s.length === M ? Math.max(0, s.charCodeAt(i) - 48) : 0));

/** Сколько разных значений видели, по регистрам. */
export function estimate(regs) {
  let sum = 0, zeros = 0;
  for (const r of regs) { sum += 2 ** -r; if (r === 0) zeros++; }
  const raw = (0.7213 / (1 + 1.079 / M)) * M * M / sum;
  return Math.round(raw <= 2.5 * M && zeros ? M * Math.log(M / zeros) : raw);
}

const createTables = (db) => db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS stats (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, k))'),
  db.prepare('CREATE TABLE IF NOT EXISTS uniq (day TEXT NOT NULL, name TEXT NOT NULL, regs TEXT NOT NULL, PRIMARY KEY (day, name))'),
]);

export class Stats {
  constructor() { this.reset(); this.last = 0; this.ready = false; }

  reset() { this.counts = new Map(); this.regs = new Map(); this.events = 0; }

  add(day, key, n = 1) {
    const k = `${day}|${key}`;
    this.counts.set(k, (this.counts.get(k) || 0) + n);
    this.events++;
  }

  /** Запомнить, что видели id (IP, чат): в память идёт только ранг хеша, сам id не остаётся. */
  async seen(day, name, id, salt) {
    const [idx, rank] = slot(await sha(`${day}|${name}|${id}|${salt}`));
    const k = `${day}|${name}`;
    let regs = this.regs.get(k);
    if (!regs) this.regs.set(k, regs = new Uint8Array(M));
    if (rank > regs[idx]) regs[idx] = rank;
    this.events++;
  }

  /** Свои DNS-серверы (Deno) копят счётчики у себя и отдают их Worker пачкой: см. take() и merge(). */
  take(now = Date.now()) {
    const out = { counts: Object.fromEntries(this.counts), regs: Object.fromEntries([...this.regs].map(([k, r]) => [k, enc(r)])) };
    this.reset();
    this.last = now;
    return out;
  }

  /** Принять пачку от своего сервера. Пишем только известные ключи и только числа. */
  merge(batch) {
    for (const [k, n] of Object.entries(batch?.counts ?? {})) {
      const [day, key] = String(k).split('|');
      if (/^\d{4}-\d\d-\d\d$/.test(day) && PUSH_KEYS.has(key) && Number.isSafeInteger(n) && n > 0 && n < 1e9) this.add(day, key, n);
    }
    for (const [k, s] of Object.entries(batch?.regs ?? {})) {
      const [day, name] = String(k).split('|');
      if (!/^\d{4}-\d\d-\d\d$/.test(day) || name !== 'dns' || typeof s !== 'string' || s.length !== M) continue;
      const mine = dec(s), kk = `${day}|${name}`;
      let regs = this.regs.get(kk);
      if (!regs) this.regs.set(kk, regs = new Uint8Array(M));
      for (let i = 0; i < M; i++) if (mine[i] > regs[i] && mine[i] <= 33) regs[i] = mine[i];
      this.events++;
    }
  }

  due(now = Date.now()) { return this.events > 0 && (this.events >= FLUSH_EVENTS || now - this.last >= FLUSH_MS); }

  async flush(db, now = Date.now()) {
    const counts = this.counts, regs = this.regs;
    this.reset();
    this.last = now;
    try {
      if (!this.ready) { await createTables(db); this.ready = true; }
      const ops = [];
      for (const [k, n] of counts) {
        const [day, key] = k.split('|');
        ops.push(db.prepare('INSERT INTO stats (day, k, n) VALUES (?, ?, ?) ON CONFLICT (day, k) DO UPDATE SET n = n + excluded.n').bind(day, key, n));
      }
      for (const [k, mine] of regs) {
        const [day, name] = k.split('|');
        const row = await db.prepare('SELECT regs FROM uniq WHERE day = ? AND name = ?').bind(day, name).first();
        const merged = dec(row?.regs);
        for (let i = 0; i < M; i++) if (mine[i] > merged[i]) merged[i] = mine[i];
        ops.push(db.prepare('INSERT OR REPLACE INTO uniq (day, name, regs) VALUES (?, ?, ?)').bind(day, name, enc(merged)));
      }
      // раз за запуск подчищаем старые регистры; счётчики по дням — копейки, их оставляем навсегда
      if (!this.cleaned) {
        this.cleaned = true;
        const old = dayOf(now - KEEP_DAYS * 86400e3);
        ops.push(db.prepare('DELETE FROM uniq WHERE day < ?').bind(old));
      }
      if (ops.length) await db.batch(ops);
    } catch {
      // статистика не должна ронять сервер; потерянные цифры — не беда
    }
  }
}

/** Что считать по апдейту бота. calls — то, что бот ответил (handleUpdate). Возвращает { keys, user }. */
export function botEvents(update, calls) {
  const keys = {};
  const has = (m) => calls.some((c) => c.method === m);
  if (update.message && !update.message.successful_payment && calls.length) keys.bot_msg = 1;
  if (has('sendDocument')) keys.bot_ext = 1;
  if (has('donate')) keys.bot_donate = 1;
  if (has('answerInlineQuery')) keys.bot_inline = 1;
  const paid = update.message?.successful_payment;
  if (paid?.currency === 'XTR') { keys.bot_pay = 1; keys.bot_stars = Number(paid.total_amount) || 0; }
  const who = update.message?.chat?.id ?? update.callback_query?.from?.id ?? update.inline_query?.from?.id;
  return { keys, user: Object.keys(keys).length && who != null ? who : null };
}

/** Какие скачивания считать по пути запроса. */
export const DOWNLOADS = {
  '/dl/chisto.mobileconfig': 'dl_ios',
  '/dl/chisto.apk': 'dl_apk',
  '/dl/chisto-chrome.zip': 'dl_chrome',
  '/dl/chisto-firefox.zip': 'dl_firefox',
};

/** Сравнение ключа за одинаковое время (через хеши, чтобы не зависеть от длины). */
export async function sameKey(got, want) {
  if (!want || !got) return false;
  const [a, b] = await Promise.all([sha(got), sha(want)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const DAYS_SHOWN = 30;

/** Что принимаем от своих серверов: только DNS-счётчики. */
const PUSH_KEYS = new Set(['dns', 'blocked', 'limited']);

/** Всё для страницы /admin. */
export async function adminNumbers(db, now = Date.now()) {
  const today = dayOf(now);
  const since = dayOf(now - (DAYS_SHOWN - 1) * 86400e3);
  await createTables(db); // свежая база: таблиц ещё нет, пока никто не заходил
  const [{ results: rows = [] }, { results: u = [] }] = await Promise.all([
    db.prepare('SELECT day, k, n FROM stats WHERE day >= ?').bind(since).all(),
    db.prepare('SELECT day, name, regs FROM uniq WHERE day >= ?').bind(since).all(),
  ]);
  const total = await db.prepare('SELECT k, SUM(n) AS n FROM stats GROUP BY k').all().then((r) => r.results || []);
  const by = {};
  for (const r of rows) (by[r.day] ||= {})[r.k] = r.n;
  const regs = {};
  for (const r of u) (regs[r.day] ||= {})[r.name] = dec(r.regs);
  const week = dayOf(now - 6 * 86400e3);
  const uniq = (name, from) => {
    const merged = new Uint8Array(M);
    for (const [day, o] of Object.entries(regs)) {
      if (day < from || !o[name]) continue;
      for (let i = 0; i < M; i++) if (o[name][i] > merged[i]) merged[i] = o[name][i];
    }
    return estimate(merged);
  };
  const days = Object.keys(by).sort().reverse().map((day) => ({
    day, ...by[day],
    dns_users: regs[day]?.dns ? estimate(regs[day].dns) : 0,
    bot_users: regs[day]?.bot ? estimate(regs[day].bot) : 0,
    site_users: regs[day]?.site ? estimate(regs[day].site) : 0,
  }));
  const sum = (from, k) => Object.entries(by).reduce((s, [d, o]) => s + (d >= from ? o[k] || 0 : 0), 0);
  const keys = ['dns', 'blocked', 'limited', 'site', 'dl_ios', 'dl_apk', 'dl_chrome', 'dl_firefox', 'bot_msg', 'bot_ext', 'bot_donate', 'bot_inline', 'bot_pay', 'bot_stars'];
  const span = (from) => Object.fromEntries([
    ...keys.map((k) => [k, sum(from, k)]),
    ['dns_users', uniq('dns', from)], ['bot_users', uniq('bot', from)], ['site_users', uniq('site', from)],
  ]);
  return {
    time: new Date(now + TZ_HOURS * 3600e3).toISOString().slice(11, 16),
    today, days,
    now: span(today), week: span(week), month: span(since),
    all: Object.fromEntries(total.map((r) => [r.k, r.n])),
    limit: 100000,
  };
}
