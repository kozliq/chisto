// DoH-фильтр на Cloudflare Workers.
// Рекламный/трекерный домен → 0.0.0.0. Остальное → пересылаем публичному DoH и отдаём ответ.
// Ничего не пишем в журналы: ни console.log, ни хранилищ. Observability выключен в wrangler.jsonc.
import LIST from './blocklist.json';
import { parseQuestion, answerInfo, blockedAnswer, servfail, refused, b64urlDecode } from './dns.js';
import { botRequest } from './bot.js';

const BLOCK = new Set(LIST.block);
const ALLOW = new Set(LIST.allow);

function isBlocked(name) {
  let d = name;
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
  for (const url of [env.UPSTREAM, env.UPSTREAM_FALLBACK]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/dns-message', accept: 'application/dns-message' },
        body: query,
      });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      // пробуем запасной
    }
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Telegram-бот (webhook). Без TG_TOKEN в секретах Worker отвечает 403.
    if (url.pathname === '/tg' && request.method === 'POST') return botRequest(request, env, `${url.origin}/`);
    if (url.pathname !== (env.DOH_PATH || '/dns-query')) return env.ASSETS.fetch(request);

    let query;
    if (request.method === 'GET') {
      const dns = url.searchParams.get('dns');
      if (!dns) return new Response('Это DoH-адрес. Нужен параметр ?dns=', { status: 400 });
      try { query = b64urlDecode(dns); } catch { return new Response('bad dns param', { status: 400 }); }
    } else if (request.method === 'POST') {
      if (!(request.headers.get('content-type') || '').startsWith('application/dns-message')) {
        return new Response('unsupported media type', { status: 415 });
      }
      query = new Uint8Array(await request.arrayBuffer());
    } else {
      return new Response('method not allowed', { status: 405 });
    }
    if (query.length > 4096) return new Response('too large', { status: 413 });

    // Один адрес не может съесть весь бесплатный лимит Worker (100 000 запросов в сутки).
    if (env.DOH_LIMIT) {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown';
      const { success } = await env.DOH_LIMIT.limit({ key: ip });
      if (!success) return new Response('slow down', { status: 429, headers: { 'retry-after': '60' } });
    }

    const question = parseQuestion(query);
    if (!question) return new Response('bad query', { status: 400 });
    // ANY-запросы не нужны обычным устройствам и годятся только для усиления атак.
    if (question.type === 255) return reply(refused(query, question), 300);
    if (isBlocked(question.name)) return reply(blockedAnswer(query, question));

    const answer = await upstream(env, query);
    if (!answer) return reply(servfail(query, question), 0);

    // CNAME-маскировка: трекер прячется под stat.site.ru → CNAME → tracker.example.
    const info = answerInfo(answer);
    if (info.cnames.some(isBlocked)) return reply(blockedAnswer(query, question));
    return reply(answer, info.minTtl);
  },
};
