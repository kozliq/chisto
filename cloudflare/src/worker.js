// DoH-фильтр на Cloudflare Workers.
// Рекламный/трекерный домен → 0.0.0.0. Остальное → пересылаем публичному DoH и отдаём ответ.
// Ничего не пишем в журналы: ни console.log, ни хранилищ. Observability выключен в wrangler.jsonc.
import LIST from './blocklist.json' with { type: 'json' };
import { parseQuestion, answerInfo, blockedAnswer, servfail, refused, b64urlDecode, rcode, limitKey, floorTtl, BLOCK_TTL } from './dns.js';
import { botRequest } from './bot.js';

const BLOCK = new Set(LIST.block);
const ALLOW = new Set(LIST.allow);
const MAX_QUERY = 4096;
const MIN_TTL = 300; // меньше запросов к бесплатному лимиту: 5 минут адрес живёт в кэше телефона

function isBlocked(name) {
  let d = name;
  if (!d) return false;
  for (;;) {
    if (ALLOW.has(d)) return false;
    if (BLOCK.has(d)) return true;
    const i = d.indexOf('.');
    if (i < 0) return false;
    d = d.slice(i + 1);
  }
}

const reply = (body, maxAge = 10) => new Response(body, {
  headers: { 'content-type': 'application/dns-message', 'cache-control': `max-age=${maxAge}` },
});

async function upstream(env, query) {
  let last = null;
  for (const url of [env.UPSTREAM, env.UPSTREAM_FALLBACK]) {
    if (!url) continue;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
        body: query,
        // Завис основной — не ждём до лимита Worker, идём к запасному.
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) continue;
      last = new Uint8Array(await res.arrayBuffer());
      // SERVFAIL у одного сервера — повод спросить второй.
      if (rcode(last) !== 2) return last;
    } catch {
      // пробуем запасной
    }
  }
  return last;
}

// Кэш ответов в памяти процесса — на своём сервере (CACHE_MAX > 0): популярные домены не ходят
// к публичному DNS каждый раз. Ключ — весь запрос без ID, так что флаги и EDNS тоже учитываются.
const cache = new Map();
async function cachedUpstream(env, query) {
  const max = Number(env.CACHE_MAX || 0);
  if (!max) return upstream(env, query);
  const key = String.fromCharCode.apply(null, query.subarray(2));
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) {
    const a = hit.answer.slice();
    a[0] = query[0]; a[1] = query[1];
    return a;
  }
  const answer = await upstream(env, query);
  if (answer && (rcode(answer) === 0 || rcode(answer) === 3)) {
    const ttl = Math.min(Math.max(answerInfo(answer).minTtl, 30), 3600);
    cache.delete(key);
    if (cache.size >= max) cache.delete(cache.keys().next().value);
    cache.set(key, { answer, until: Date.now() + ttl * 1000 });
  }
  return answer;
}

/** Тело POST читаем не больше лимита: мегабайтное тело не попадает в память. */
async function readLimited(request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_QUERY) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_QUERY) { reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Telegram-бот (webhook). Без TG_TOKEN в секретах Worker отвечает 403.
    if (url.pathname === '/tg' && request.method === 'POST') return botRequest(request, env, `${url.origin}/`);
    if (url.pathname !== (env.DOH_PATH || '/dns-query')) return env.ASSETS.fetch(request);

    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }
    const dnsParam = request.method === 'GET' ? url.searchParams.get('dns') : null;
    if (request.method === 'GET' && !dnsParam) {
      return new Response('Это DoH-адрес. Нужен параметр ?dns=', { status: 400 });
    }

    // Один адрес не может съесть весь бесплатный лимит Worker (100 000 запросов в сутки).
    // Проверяем до чтения тела, чтобы отказ ничего не стоил.
    if (env.DOH_LIMIT) {
      const { success } = await env.DOH_LIMIT.limit({ key: limitKey(request.headers.get('cf-connecting-ip')) });
      if (!success) return new Response('slow down', { status: 429, headers: { 'retry-after': '60' } });
    }

    let query;
    if (request.method === 'GET') {
      if (dnsParam.length > MAX_QUERY * 2 || !/^[A-Za-z0-9_-]+=*$/.test(dnsParam)) {
        return new Response('bad dns param', { status: 400 });
      }
      try { query = b64urlDecode(dnsParam.replace(/=+$/, '')); } catch { return new Response('bad dns param', { status: 400 }); }
    } else {
      if (!(request.headers.get('content-type') || '').startsWith('application/dns-message')) {
        return new Response('unsupported media type', { status: 415 });
      }
      query = await readLimited(request);
      if (!query) return new Response('too large', { status: 413 });
    }
    if (query.length > MAX_QUERY) return new Response('too large', { status: 413 });

    const question = parseQuestion(query);
    if (!question) return new Response('bad query', { status: 400 });
    // ANY-запросы не нужны обычным устройствам и годятся только для усиления атак.
    if (question.type === 255) return reply(refused(query, question), 300);
    if (isBlocked(question.name)) return reply(blockedAnswer(query, question), BLOCK_TTL);

    const answer = await cachedUpstream(env, query);
    if (!answer) return reply(servfail(query, question), 0);

    // CNAME-маскировка: трекер прячется под stat.site.ru → CNAME → tracker.example.
    const info = answerInfo(answer);
    if (info.cnames.some(isBlocked)) return reply(blockedAnswer(query, question), BLOCK_TTL);
    if (rcode(answer) !== 0) return reply(answer, info.minTtl); // ошибки и NXDOMAIN — как пришли
    return reply(floorTtl(answer, MIN_TTL), Math.max(info.minTtl, MIN_TTL));
  },
};
