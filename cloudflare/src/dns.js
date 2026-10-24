// Минимальная работа с DNS wire format (RFC 1035) — без зависимостей.

export function readName(buf, off) {
  const labels = [];
  let jumped = false, next = off, guard = 0;
  while (guard++ < 128) {
    if (off >= buf.length) return null;
    const len = buf[off];
    if (len === 0) { if (!jumped) next = off + 1; break; }
    if ((len & 0xc0) === 0xc0) {
      if (off + 1 >= buf.length) return null;
      if (!jumped) next = off + 2;
      off = ((len & 0x3f) << 8) | buf[off + 1];
      jumped = true;
      continue;
    }
    if (off + 1 + len > buf.length) return null;
    labels.push(String.fromCharCode(...buf.subarray(off + 1, off + 1 + len)));
    off += 1 + len;
  }
  return { name: labels.join('.').toLowerCase(), next };
}

const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

export function parseQuestion(q) {
  if (q.length < 17 || u16(q, 4) < 1) return null;
  const n = readName(q, 12);
  if (!n || n.next + 4 > q.length) return null;
  return { name: n.name, type: u16(q, n.next), end: n.next + 4 };
}

/** Имена из CNAME-ответов: так ловим трекеры, спрятанные под поддоменом самого сайта. */
export function answerInfo(a) {
  const out = { cnames: [], minTtl: 300 };
  if (a.length < 12) return out;
  const qd = u16(a, 4), an = u16(a, 6);
  let o = 12;
  for (let i = 0; i < qd; i++) { const n = readName(a, o); if (!n) return out; o = n.next + 4; }
  for (let i = 0; i < an; i++) {
    const n = readName(a, o);
    if (!n || n.next + 10 > a.length) return out;
    o = n.next;
    const type = u16(a, o), ttl = u32(a, o + 4), rdlen = u16(a, o + 8);
    o += 10;
    out.minTtl = Math.min(out.minTtl, ttl);
    if (type === 5) { const c = readName(a, o); if (c) out.cnames.push(c.name); }
    o += rdlen;
  }
  return out;
}

function header(q, end, ancount, rcode) {
  const r = new Uint8Array(end);
  r.set(q.subarray(0, end));
  r[2] = 0x80 | (q[2] & 0x01); // QR=1, RD как в запросе
  r[3] = 0x80 | rcode;         // RA=1
  r[6] = 0; r[7] = ancount; r[8] = 0; r[9] = 0; r[10] = 0; r[11] = 0;
  return r;
}

/** Блокировка: 0.0.0.0 на A, :: на AAAA, пустой ответ на остальные типы. */
export function blockedAnswer(q, question) {
  const rdata = question.type === 1 ? new Uint8Array(4) : question.type === 28 ? new Uint8Array(16) : null;
  const head = header(q, question.end, rdata ? 1 : 0, 0);
  if (!rdata) return head;
  const rr = new Uint8Array(12 + rdata.length);
  rr.set([0xc0, 12, 0, question.type, 0, 1, 0, 0, 0, 10, 0, rdata.length]);
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

export function b64urlDecode(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
