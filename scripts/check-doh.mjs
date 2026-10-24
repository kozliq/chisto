#!/usr/bin/env node
// Проверка сервера руками одной командой: node scripts/check-doh.mjs [--host dns.example.com]
// Сравнивает ответы нашего DoH/DoT и публичного DNS (Cloudflare) на несколько доменов.
import fs from 'node:fs';
import tls from 'node:tls';

const env = Object.fromEntries((fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '')
  .split('\n').filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const argHost = process.argv.indexOf('--host');
const HOST = argHost > 0 ? process.argv[argHost + 1] : env.DOH_HOST;
const PATH = env.DOH_PATH || '/dns-query';
const INSECURE = process.argv.includes('--insecure'); // для локальной проверки с сертификатом Caddy «local»
const argUrl = process.argv.indexOf('--url');           // например http://localhost:8787/dns-query (wrangler dev)
// У Cloudflare Worker нет DoT (порт 853) — только DoH.
// Вариант на Cloudflare (SERVER_IP пустой) — без DoT.
const NO_DOT = process.argv.includes('--no-dot') || argUrl > 0 || /\.workers\.dev$/.test(HOST || '') || !env.SERVER_IP;
if (!HOST && argUrl < 0) { console.error('Нет DOH_HOST: запустите из корня репозитория или передайте --host'); process.exit(2); }
if (INSECURE) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CASES = [
  // [домен, ожидание у нас, ожидание у публичного DNS]
  ['example.com', 'resolves', 'resolves'],
  ['cdnjs.cloudflare.com', 'resolves', 'resolves'],   // общий CDN — не должен блокироваться
  ['ad.doubleclick.net', 'blocked', 'resolves'],
  ['pagead2.googlesyndication.com', 'blocked', 'resolves'],
  ['chisto-test-ad.invalid', 'blocked', 'nxdomain'],  // только в нашем custom.txt
];

function wire(name) {
  const parts = [Buffer.from([0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0])];
  for (const l of name.split('.')) parts.push(Buffer.from([l.length]), Buffer.from(l));
  parts.push(Buffer.from([0, 0, 1, 0, 1]));
  return Buffer.concat(parts);
}
function parse(buf) {
  const rcode = buf[3] & 0x0f, an = buf.readUInt16BE(6);
  let o = 12;
  const skip = () => { for (;;) { const n = buf[o]; if (n === 0) { o++; return; } if ((n & 0xc0) === 0xc0) { o += 2; return; } o += n + 1; } };
  skip(); o += 4;
  const ips = [];
  for (let i = 0; i < an; i++) {
    skip();
    const type = buf.readUInt16BE(o), len = buf.readUInt16BE(o + 8); o += 10;
    if (type === 1 && len === 4) ips.push([...buf.subarray(o, o + 4)].join('.'));
    o += len;
  }
  return rcode === 3 ? 'nxdomain' : ips.includes('0.0.0.0') ? 'blocked' : ips.length ? 'resolves' : rcode === 0 ? 'empty' : `rcode${rcode}`;
}
async function doh(url, name) {
  const res = await fetch(`${url}?dns=${wire(name).toString('base64url')}`, { headers: { accept: 'application/dns-message' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parse(Buffer.from(await res.arrayBuffer()));
}
function dot(host, name) {
  return new Promise((resolve, reject) => {
    const q = wire(name), len = Buffer.alloc(2); len.writeUInt16BE(q.length);
    const s = tls.connect({ host, port: 853, servername: host, timeout: 5000 }, () => s.write(Buffer.concat([len, q])));
    let acc = Buffer.alloc(0);
    s.on('data', d => { acc = Buffer.concat([acc, d]); if (acc.length >= 2 && acc.length >= acc.readUInt16BE(0) + 2) { s.end(); resolve(parse(acc.subarray(2))); } });
    s.on('timeout', () => { s.destroy(); reject(new Error('timeout')); });
    s.on('error', reject);
  });
}

const ours = argUrl > 0 ? process.argv[argUrl + 1] : `https://${HOST}${PATH}`;
let fail = 0;
console.log(`Наш DoH: ${ours}\n`);
for (const [name, wantOurs, wantPublic] of CASES) {
  const r = await Promise.allSettled([doh(ours, name), NO_DOT ? Promise.resolve(wantOurs) : dot(HOST, name), doh('https://cloudflare-dns.com/dns-query', name)]);
  const [a, b, c] = r.map(x => x.status === 'fulfilled' ? x.value : `ошибка: ${x.reason.message}`);
  const ok = a === wantOurs && b === wantOurs && c === wantPublic;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(32)} DoH: ${a.padEnd(9)} DoT: ${(NO_DOT ? '—' : b).padEnd(9)} публичный: ${c}`);
}
console.log(fail ? `\nНе сошлось: ${fail}. Смотрите docs/CHECKLIST.md` : '\nВсё сходится.');
process.exit(fail ? 1 : 0);
