// Тот же DoH-фильтр, что в Worker, — на своём сервере под Deno.
// Нужен, чтобы телефоны не съедали бесплатный лимит Workers (100 000 запросов в сутки на аккаунт).
// Запуск: deno run --allow-net --allow-env src/deno.js   (слушает только 127.0.0.1, снаружи — через туннель)
import worker from './worker.js';
import { makeEnv, ctx } from './server-env.js';

const env = makeEnv();
const cors = { 'access-control-allow-origin': '*' }; // проверка «Фильтр жив» на сайте ходит сюда из браузера

Deno.serve({ hostname: '127.0.0.1', port: Number(Deno.env.get('PORT') || 8053) }, async (request) => {
  if (new URL(request.url).pathname === '/tg') return new Response('not found', { status: 404 });
  const res = await worker.fetch(request, env, ctx);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});
