// DNS-over-TLS (порт 853) для Android «Частный DNS»: тот же фильтр, что в Worker, под Deno.
// Каждое сообщение DNS идёт с двумя байтами длины впереди (RFC 7858); внутри отдаём его тому же worker.fetch.
// Запуск: deno run --allow-net --allow-env --allow-read src/dot.js   (CERT_FILE, KEY_FILE — сертификат для имени сервера)
import worker from './worker.js';
import { makeEnv } from './server-env.js';

const env = makeEnv();
const MAX_MSG = 4096;
const IDLE_MS = 15_000;     // молчит дольше — закрываем
const MAX_CONNS = Number(Deno.env.get('MAX_CONNS') || 3000);
let conns = 0;

async function readExact(conn, n) {
  const buf = new Uint8Array(n);
  for (let off = 0; off < n;) {
    const got = await conn.read(buf.subarray(off));
    if (got === null) return null;
    off += got;
  }
  return buf;
}

async function serve(conn) {
  const ip = conn.remoteAddr.hostname;
  let timer;
  const idle = () => { clearTimeout(timer); timer = setTimeout(() => conn.close(), IDLE_MS); };
  try {
    for (;;) {
      idle();
      const head = await readExact(conn, 2);
      if (!head) return;
      const len = (head[0] << 8) | head[1];
      if (!len || len > MAX_MSG) return;
      const msg = await readExact(conn, len);
      if (!msg) return;
      const res = await worker.fetch(new Request('https://dot/dns-query', {
        method: 'POST', body: msg,
        headers: { 'content-type': 'application/dns-message', 'cf-connecting-ip': ip },
      }), env);
      if (!res.ok) return; // лимит или мусор — просто закрываем соединение
      const answer = new Uint8Array(await res.arrayBuffer());
      const out = new Uint8Array(answer.length + 2);
      out[0] = answer.length >> 8; out[1] = answer.length & 0xff;
      out.set(answer, 2);
      await conn.write(out);
    }
  } catch {
    // разорванное соединение — обычное дело
  } finally {
    clearTimeout(timer);
    try { conn.close(); } catch {}
  }
}

const listener = Deno.listenTls({
  port: Number(Deno.env.get('PORT') || 853),
  cert: Deno.readTextFileSync(Deno.env.get('CERT_FILE')),
  key: Deno.readTextFileSync(Deno.env.get('KEY_FILE')),
});
for await (const conn of listener) {
  if (conns >= MAX_CONNS) { try { conn.close(); } catch {} continue; }
  conns++;
  serve(conn).finally(() => conns--);
}
