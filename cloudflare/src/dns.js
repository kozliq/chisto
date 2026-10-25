// Минимальная работа с DNS wire format (RFC 1035) — без зависимостей.

export function readName(buf, off, end = buf.length) {
  const labels = [];
  let jumped = false, next = off, total = 0;
  for (let guard = 0; ; guard++) {
    if (guard >= 128 || off >= end) return null;
    const len = buf[off];
    if (len === 0) { if (!jumped) next = off + 1; break; }
    if ((len & 0xc0) === 0xc0) {
      if (off + 1 >= end) return null;
      if (!jumped) next = off + 2;
      const ptr = ((len & 0x3f) << 8) | buf[off + 1];
      // Ссылка (сжатие) может вести только назад — иначе это петля или мусор.
      if (ptr >= off) return null;
      off = ptr;
      jumped = true;
      continue;
    }
    if (len & 0xc0) return null; // 0x40/0x80 — устаревшие расширенные метки
    if (off + 1 + len > end) return null;
    const label = buf.subarray(off + 1, off + 1 + len);
    // Точка или нулевой байт внутри метки подменили бы имя при сверке со списком.
    if (label.includes(0x2e) || label.includes(0)) return null;
    total += len + 1;
    if (total > 255) return null;
    labels.push(String.fromCharCode(...label));
    off += 1 + len;
  }
  return { name: labels.join('.').toLowerCase(), next };
}

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

export function parseQuestion(q) {
  // Ровно один вопрос, обычный запрос (QR=0, opcode=0) — всё остальное не от устройства.
  if (q.length < 17 || u16(q, 4) !== 1 || (q[2] & 0xf8) !== 0) return null;
  const n = readName(q, 12);
  if (!n || n.next + 4 > q.length) return null;
  return { name: n.name, type: u16(q, n.next), cls: u16(q, n.next + 2), end: n.next + 4 };
}

export const rcode = (a) => (a.length >= 4 ? a[3] & 0x0f : 2);

/** Имена-цели из ответа (CNAME, DNAME, HTTPS/SVCB): так ловим трекеры под поддоменом самого сайта. */
export function answerInfo(a) {
  const out = { cnames: [], minTtl: 300 };
  if (a.length < 12) return out;
  const qd = u16(a, 4), an = u16(a, 6);
  // Пустой ответ (NXDOMAIN, нет записи) недолго держим в кэше.
  if (an === 0) out.minTtl = 60;
  let o = 12;
  for (let i = 0; i < qd; i++) { const n = readName(a, o); if (!n) return out; o = n.next + 4; }
  for (let i = 0; i < an; i++) {
    const n = readName(a, o);
    if (!n || n.next + 10 > a.length) return out;
    o = n.next;
    const type = u16(a, o), ttl = u32(a, o + 4), rdlen = u16(a, o + 8);
    o += 10;
    if (o + rdlen > a.length) return out;
    out.minTtl = Math.min(out.minTtl, ttl);
    let target = null;
    if (type === 5 || type === 39) target = readName(a, o, o + rdlen);
    else if ((type === 64 || type === 65) && rdlen > 2) target = readName(a, o + 2, o + rdlen);
    if (target?.name) out.cnames.push(target.name);
    o += rdlen;
  }
  return out;
}

/**
 * Нижняя граница TTL в ответе: телефон дольше держит адрес у себя и реже спрашивает сервер.
 * Бесплатный Worker считает каждый запрос, а у CDN TTL бывает 20–60 секунд.
 */
export function floorTtl(a, min) {
  if (a.length < 12) return a;
  const qd = u16(a, 4), an = u16(a, 6);
  const out = a.slice();
  let o = 12;
  for (let i = 0; i < qd; i++) { const n = readName(a, o); if (!n) return a; o = n.next + 4; }
  for (let i = 0; i < an; i++) {
    const n = readName(a, o);
    if (!n || n.next + 10 > a.length) return a;
    o = n.next;
    const rdlen = u16(a, o + 8);
    if (o + 10 + rdlen > a.length) return a;
    if (u32(a, o + 4) < min) out.set([min >>> 24, (min >>> 16) & 0xff, (min >>> 8) & 0xff, min & 0xff], o + 4);
    o += 10 + rdlen;
  }
  return out;
}

function header(q, end, ancount, rcode) {
  const r = new Uint8Array(end);
  r.set(q.subarray(0, end));
  r[2] = 0x80 | (q[2] & 0x01);         // QR=1, RD как в запросе
  r[3] = 0x80 | (q[3] & 0x10) | rcode; // RA=1, CD как в запросе
  r[4] = 0; r[5] = 1;
  r[6] = 0; r[7] = ancount; r[8] = 0; r[9] = 0; r[10] = 0; r[11] = 0;
  return r;
}

/** Блокировка: 0.0.0.0 на A, :: на AAAA, пустой ответ на остальные типы и классы. */
export const BLOCK_TTL = 3600; // реклама не переедет: час держим 0.0.0.0 в кэше телефона

export function blockedAnswer(q, question) {
  const inet = question.cls === 1;
  const rdata = !inet ? null : question.type === 1 ? new Uint8Array(4) : question.type === 28 ? new Uint8Array(16) : null;
  const head = header(q, question.end, rdata ? 1 : 0, 0);
  if (!rdata) return head;
  const rr = new Uint8Array(12 + rdata.length);
  rr.set([0xc0, 12, 0, question.type, 0, 1, 0, 0, BLOCK_TTL >> 8, BLOCK_TTL & 0xff, 0, rdata.length]);
  const out = new Uint8Array(head.length + rr.length);
  out.set(head); out.set(rr, head.length);
  return out;
}

export function servfail(q, question) {
  return header(q, question.end, 0, 2);
}

export function refused(q, question) {
  return header(q, question.end, 0, 5);
}

/** Ключ лимита: IPv4 целиком, IPv6 по сети /64 — иначе лимит обходится сменой адреса. */
export function limitKey(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return full.slice(0, 4).map((x) => x.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

export function b64urlDecode(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
