// Проверка разбора DNS без сети: node test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestion, answerInfo, blockedAnswer, refused, b64urlDecode, rcode, limitKey, floorTtl, BLOCK_TTL } from './src/dns.js';
import { handleUpdate, botRequest } from './src/bot.js';

const name = (n) => n.split('.').flatMap((l) => [l.length, ...Buffer.from(l)]).concat(0);
const query = (n, type = 1) => Uint8Array.from([0x12, 0x34, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, ...name(n), 0, type, 0, 1]);

test('вопрос разбирается', () => {
  assert.deepEqual(parseQuestion(query('Stat.Example.RU')), { name: 'stat.example.ru', type: 1, cls: 1, end: 12 + 17 + 4 });
});

test('чужие пакеты отклоняются: 0 или 2 вопроса, ответ вместо запроса, opcode≠0', () => {
  const q = query('example.com');
  const with_ = (i, v) => { const c = q.slice(); c[i] = v; return c; };
  assert.equal(parseQuestion(with_(5, 0)), null);
  assert.equal(parseQuestion(with_(5, 2)), null);
  assert.equal(parseQuestion(with_(2, 0x80)), null); // QR=1
  assert.equal(parseQuestion(with_(2, 0x28)), null); // opcode UPDATE
});

test('имена: петля, ссылка вперёд, точка внутри метки, метка 0x40 — не разбираются', () => {
  const head = [0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
  assert.equal(parseQuestion(Uint8Array.from([...head, 0xc0, 12, 0, 1, 0, 1])), null);
  assert.equal(parseQuestion(Uint8Array.from([...head, 0xc0, 20, 0, 1, 0, 1, 0, 0, 0, 0])), null);
  assert.equal(parseQuestion(Uint8Array.from([...head, 4, 0x61, 0x2e, 0x62, 0x63, 2, 0x72, 0x75, 0, 0, 1, 0, 1])), null);
  assert.equal(parseQuestion(Uint8Array.from([...head, 0x41, 0x61, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0])), null);
});

test('блок-ответ: один вопрос, CD сохраняется, EDNS-запрос не ломает ответ', () => {
  const opt = [0, 0, 41, 0x10, 0, 0, 0, 0, 0, 0, 0];
  const base = query('ad.doubleclick.net');
  const q = Uint8Array.from([...base.slice(0, 3), 0x10, 0, 1, 0, 0, 0, 0, 0, 1, ...base.slice(12), ...opt]);
  const a = blockedAnswer(q, parseQuestion(q));
  assert.equal((a[4] << 8) | a[5], 1);
  assert.equal(a[3] & 0x10, 0x10);
  assert.equal(a[11], 0); // OPT не копируем
  assert.equal(a.length, base.length + 12 + 4);
});

test('класс не IN — пустой ответ без 0.0.0.0', () => {
  const q = query('ad.doubleclick.net'); q[q.length - 1] = 3; // CHAOS
  assert.equal(blockedAnswer(q, parseQuestion(q))[7], 0);
});

test('цели DNAME и HTTPS тоже проверяются; пустой ответ живёт 60 с', () => {
  const q = query('stat.site.ru');
  const target = [...name('evil.tracker')];
  const dname = [0xc0, 12, 0, 39, 0, 1, 0, 0, 1, 0, 0, target.length, ...target];
  const https = [0xc0, 12, 0, 65, 0, 1, 0, 0, 1, 0, 0, target.length + 2, 0, 1, ...target];
  const mk = (rr) => Uint8Array.from([...q.slice(0, 2), 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0, ...q.slice(12), ...rr]);
  assert.deepEqual(answerInfo(mk(dname)).cnames, ['evil.tracker']);
  assert.deepEqual(answerInfo(mk(https)).cnames, ['evil.tracker']);
  const empty = Uint8Array.from([...q.slice(0, 2), 0x81, 0x83, 0, 1, 0, 0, 0, 0, 0, 0, ...q.slice(12)]);
  assert.equal(answerInfo(empty).minTtl, 60);
  assert.equal(rcode(empty), 3);
});

test('TTL: блок живёт час, короткий TTL поднимается до 300, длинный не трогается', () => {
  const q = query('cdn.example.com');
  const blocked = blockedAnswer(q, parseQuestion(q));
  const ttlAt = (a, o) => ((a[o] << 24) >>> 0) + (a[o + 1] << 16) + (a[o + 2] << 8) + a[o + 3];
  assert.equal(ttlAt(blocked, q.length + 6), BLOCK_TTL);
  const rr = (ttl) => [0xc0, 12, 0, 1, 0, 1, (ttl >>> 24) & 255, (ttl >>> 16) & 255, (ttl >>> 8) & 255, ttl & 255, 0, 4, 1, 2, 3, 4];
  const mk = (...rrs) => Uint8Array.from([...q.slice(0, 2), 0x81, 0x80, 0, 1, 0, rrs.length, 0, 0, 0, 0, ...q.slice(12), ...rrs.flat()]);
  const a = floorTtl(mk(rr(20), rr(86400)), 300);
  assert.equal(ttlAt(a, q.length + 6), 300);
  assert.equal(ttlAt(a, q.length + 16 + 6), 86400);
  const broken = mk(rr(20)).slice(0, -2);
  assert.deepEqual(floorTtl(broken, 300), broken); // битый ответ отдаём как есть
});

test('CNAME длиннее своей записи не читается за её границей', () => {
  const q = query('stat.site.ru');
  const t = [...name('x.tracker.ru')];
  const rr = [0xc0, 12, 0, 5, 0, 1, 0, 0, 0, 60, 0, 3, ...t];
  const a = Uint8Array.from([...q.slice(0, 2), 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0, ...q.slice(12), ...rr]);
  assert.deepEqual(answerInfo(a).cnames, []);
});

test('лимит: IPv4 целиком, IPv6 по сети /64', () => {
  assert.equal(limitKey('1.2.3.4'), '1.2.3.4');
  assert.equal(limitKey('2001:db8:0:1:aaaa::1'), '2001:db8:0:1::/64');
  assert.equal(limitKey('2001:DB8:0:1:bbbb:cccc:dddd:eeee'), '2001:db8:0:1::/64');
  assert.equal(limitKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(limitKey(null), 'unknown');
});

test('блокировка: A → 0.0.0.0, AAAA → ::, id сохраняется', () => {
  const q = query('ad.doubleclick.net');
  const a = blockedAnswer(q, parseQuestion(q));
  assert.equal(a[0], 0x12); assert.equal(a[1], 0x34);
  assert.equal(a[3] & 0x0f, 0);
  assert.equal(a[7], 1);
  assert.deepEqual([...a.slice(-4)], [0, 0, 0, 0]);
  const q6 = query('ad.doubleclick.net', 28);
  assert.equal(blockedAnswer(q6, parseQuestion(q6)).length, q6.length + 12 + 16);
  const qh = query('ad.doubleclick.net', 65);
  assert.equal(blockedAnswer(qh, parseQuestion(qh))[7], 0); // HTTPS-запись: пустой ответ
});

test('CNAME-маскировка: имя цели достаётся даже со сжатием', () => {
  // stat.site.ru CNAME site.tracker.ru, где «.ru» — ссылка (сжатие) на конец имени в вопросе
  const q = query('stat.site.ru');
  const cnameRdata = [4, ...Buffer.from('site'), 7, ...Buffer.from('tracker'), 0xc0, 12 + 5 + 5];
  const rr = [0xc0, 12, 0, 5, 0, 1, 0, 0, 0, 60, 0, cnameRdata.length, ...cnameRdata];
  const a = Uint8Array.from([...q.slice(0, 2), 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0, ...q.slice(12), ...rr]);
  const info = answerInfo(a);
  assert.deepEqual(info.cnames, ['site.tracker.ru']);
  assert.equal(info.minTtl, 60);
});

test('base64url без паддинга', () => {
  const q = query('example.com');
  assert.deepEqual(b64urlDecode(Buffer.from(q).toString('base64url')), q);
});

test('битые пакеты не роняют разбор', () => {
  assert.equal(parseQuestion(Uint8Array.from([1, 2, 3])), null);
  const loop = Uint8Array.from([0, 0, 0x81, 0x80, 0, 1, 0, 1, 0, 0, 0, 0, 0xc0, 12, 0, 1, 0, 1, 0xc0, 18]);
  assert.doesNotThrow(() => answerInfo(loop));
});

test('бот: /start — кнопки устройств и «поделиться»', () => {
  const [call] = handleUpdate({ message: { chat: { id: 7 }, text: '/start' } }, 'https://chisto.example/');
  assert.equal(call.method, 'sendMessage');
  const urls = call.body.reply_markup.inline_keyboard.flat().map((b) => b.url).filter((u) => u?.startsWith('https://chisto.example/'));
  assert.deepEqual(urls, ['https://chisto.example/#ios', 'https://chisto.example/#android', 'https://chisto.example/#desktop', 'https://chisto.example/#router']);
  assert.ok(call.body.reply_markup.inline_keyboard.flat().some((b) => b.switch_inline_query === ''));
  assert.ok(call.body.reply_markup.inline_keyboard.flat().some((b) => /SECURITY\.md$/.test(b.url || '')));
});

test('бот: кнопка «прислать расширение» — ответ на нажатие + два файла', () => {
  const calls = handleUpdate({ callback_query: { id: 'q', data: 'ext', message: { chat: { id: 7 } } } }, 'https://chisto.example/');
  assert.deepEqual(calls.map((c) => c.method), ['answerCallbackQuery', 'sendDocument', 'sendDocument']);
  assert.equal(calls[1].body.document, 'https://chisto.example/dl/chisto-chrome.zip');
});

test('бот: @бот в любом чате — карточка со ссылкой', () => {
  const [call] = handleUpdate({ inline_query: { id: 'i', query: '' } }, 'https://chisto.example/');
  assert.equal(call.method, 'answerInlineQuery');
  assert.match(call.body.results[0].input_message_content.message_text, /https:\/\/chisto\.example\//);
});

test('бот: /donate — только по команде, /start о деньгах молчит', () => {
  const [d] = handleUpdate({ message: { chat: { id: 7 }, text: '/donate' } }, 'https://chisto.example/');
  assert.equal(d.method, 'donate');
  const [start] = handleUpdate({ message: { chat: { id: 7 }, text: '/start' } }, 'https://chisto.example/');
  assert.doesNotMatch(JSON.stringify(start), /donate|⭐|спасибо/i);
});

test('бот: платёж звёздами принимается, чужой — нет', () => {
  const pc = (currency, invoice_payload, total_amount) => handleUpdate({ pre_checkout_query: { id: 'p', currency, invoice_payload, total_amount } }, 'https://x/')[0].body.ok;
  assert.equal(pc('XTR', 'thanks:50', 50), true);
  assert.equal(pc('USD', 'x', 50), false);
  assert.equal(pc('XTR', 'thanks:50', 1), false);
  assert.equal(pc('XTR', 'thanks:7', 7), false);
});

test('бот: в группе молчит на обычный текст и чужие команды, в личке отвечает', () => {
  const site = 'https://x/';
  const g = (text) => handleUpdate({ message: { chat: { id: -1, type: 'supergroup' }, text } }, site, 'chisto_ads_bot');
  assert.deepEqual(g('привет всем'), []);
  assert.deepEqual(g('/help@other_bot'), []);
  assert.deepEqual(g('/weather'), []);
  assert.equal(g('/start@chisto_ads_bot').length, 1);
  assert.equal(g('/android').length, 1);
  const p = handleUpdate({ message: { chat: { id: 7, type: 'private' }, text: 'привет' } }, site);
  assert.equal(p[0].method, 'sendMessage');
});

test('бот: кривой платёж без чата не роняет разбор', () => {
  assert.doesNotThrow(() => handleUpdate({ message: { successful_payment: {} } }, 'https://x/'));
  assert.deepEqual(handleUpdate({ message: { chat: { id: 7 }, successful_payment: { currency: 'XTR' } } }, 'https://x/').length, 1);
});

test('бот: чужой секрет → 403, битый JSON → 200 (Telegram не повторяет)', async () => {
  const env = { TG_TOKEN: 't', TG_SECRET: 's' };
  const req = (secret, body) => new Request('https://x/tg', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body });
  assert.equal((await botRequest(req('nope', '{}'), env, 'https://x/')).status, 403);
  assert.equal((await botRequest(req('s', '{bad'), env, 'https://x/')).status, 200);
});

test('ANY-запрос получает REFUSED без ответов', () => {
  const q = query('example.com', 255);
  const a = refused(q, parseQuestion(q));
  assert.equal(a[3] & 0x0f, 5);
  assert.equal(a[7], 0);
});
