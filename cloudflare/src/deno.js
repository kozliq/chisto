// Тот же DoH-фильтр, что в Worker, — на своём сервере под Deno.
// Нужен, чтобы телефоны не съедали бесплатный лимит Workers (100 000 запросов в сутки на аккаунт).
// Запуск: deno run --allow-net --allow-env src/deno.js   (слушает только 127.0.0.1, снаружи — через туннель)
import worker from './worker.js';

const get = (k, d) => Deno.env.get(k) || d;
const PORT = Number(get('PORT', 8053));
const LIMIT = Number(get('LIMIT_PER_MIN', 120));

// Лимит на адрес за минуту. Счётчики только в памяти и обнуляются каждую минуту — никуда не пишутся.
let counts = new Map();
setInterval(() => { counts = new Map(); }, 60_000);
const DOH_LIMIT = {
  limit({ key }) {
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    return { success: n <= LIMIT };
  },
};

const env = {
  DOH_PATH: get('DOH_PATH', '/dns-query'),
  UPSTREAM: get('UPSTREAM', 'https://cloudflare-dns.com/dns-query'),
  UPSTREAM_FALLBACK: get('UPSTREAM_FALLBACK', 'https://dns.google/dns-query'),
  CACHE_MAX: get('CACHE_MAX', '50000'), // ~10 МБ памяти; живёт столько, сколько разрешает TTL ответа
  DOH_LIMIT,
  // Сайт и бот живут в Worker; здесь только DNS.
  ASSETS: { fetch: () => new Response('not found', { status: 404 }) },
};

const cors = { 'access-control-allow-origin': '*' }; // проверка «Фильтр жив» на сайте ходит сюда из браузера

Deno.serve({ hostname: '127.0.0.1', port: PORT }, async (request) => {
  if (new URL(request.url).pathname === '/tg') return new Response('not found', { status: 404 });
  const res = await worker.fetch(request, env);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
