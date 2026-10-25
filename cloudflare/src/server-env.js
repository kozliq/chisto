// Общие настройки для запуска фильтра на своём сервере (deno.js — DoH, dot.js — DoT).
const get = (k, d) => Deno.env.get(k) || d;

// Лимит на адрес за минуту. Счётчики только в памяти и обнуляются каждую минуту — никуда не пишутся.
// За мобильным NAT сидят сотни людей с одним адресом, поэтому на своём сервере лимит выше, чем у Worker.
export function makeEnv() {
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
    // Сайт и бот живут в Worker; здесь только DNS.
    ASSETS: { fetch: () => new Response('not found', { status: 404 }) },
  };
}
