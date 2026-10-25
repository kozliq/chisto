// Общие настройки для запуска фильтра на своём сервере (deno.js — DoH, dot.js — DoT).
const get = (k, d) => Deno.env.get(k) || d;

// Лимит на адрес за минуту. Счётчики только в памяти и обнуляются каждую минуту — никуда не пишутся.
// За мобильным NAT сидят сотни людей с одним адресом, поэтому на своём сервере лимит выше, чем у Worker.
// ctx для worker.fetch: на своём сервере фоновые задачи просто идут дальше.
export const ctx = { waitUntil: (p) => { p?.catch?.(() => {}); } };

export function makeEnv() {
  const pushKey = get('PUSH_KEY', '');
  const pushUrl = get('PUSH_URL', 'https://chisto.flownote.cc/api/push');
  const limit = Number(get('LIMIT_PER_MIN', 1200));
  let counts = new Map();
  setInterval(() => { counts = new Map(); }, 60_000);
  return {
    DOH_PATH: get('DOH_PATH', '/dns-query'),
    UPSTREAM: get('UPSTREAM', 'https://cloudflare-dns.com/dns-query'),
    UPSTREAM_FALLBACK: get('UPSTREAM_FALLBACK', 'https://dns.google/dns-query'),
    CACHE_MAX: get('CACHE_MAX', '50000'), // ~10 МБ памяти; живёт столько, сколько разрешает TTL ответа
    DOH_LIMIT: {
      limit({ key }) {
        const n = (counts.get(key) || 0) + 1;
        counts.set(key, n);
        return { success: n <= limit };
      },
    },
    // Счётчики для /admin: только числа и регистры HyperLogLog, без адресов. Без PUSH_KEY не считаем вовсе.
    STATS_SALT: get('STATS_SALT', ''),
    STATS_SINK: pushKey ? (batch) => fetch(pushUrl, {
      method: 'POST', body: JSON.stringify(batch),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${pushKey}` },
      signal: AbortSignal.timeout(10_000),
    }).then((r) => r.body?.cancel()).catch(() => {}) : null,
    // Сайт и бот живут в Worker; здесь только DNS.
    ASSETS: { fetch: () => new Response('not found', { status: 404 }) },
  };
}
