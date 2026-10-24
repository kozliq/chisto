// Проверка разбора DNS без сети: node test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestion, answerInfo, blockedAnswer, refused, b64urlDecode } from './src/dns.js';
import { handleUpdate } from './src/bot.js';

const name = (n) => n.split('.').flatMap((l) => [l.length, ...Buffer.from(l)]).concat(0);
const query = (n, type = 1) => Uint8Array.from([0x12, 0x34, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, ...name(n), 0, type, 0, 1]);

test('вопрос разбирается', () => {
  assert.deepEqual(parseQuestion(query('Stat.Example.RU')), { name: 'stat.example.ru', type: 1, end: 12 + 17 + 4 });
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
  const urls = call.body.reply_markup.inline_keyboard.flat().map((b) => b.url).filter(Boolean);
  assert.deepEqual(urls, ['https://chisto.example/#ios', 'https://chisto.example/#android', 'https://chisto.example/#desktop', 'https://chisto.example/#router']);
  assert.ok(call.body.reply_markup.inline_keyboard.flat().some((b) => b.switch_inline_query === ''));
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
  const ok = handleUpdate({ pre_checkout_query: { id: 'p', currency: 'XTR', invoice_payload: 'thanks:50' } }, 'https://x/');
  assert.equal(ok[0].body.ok, true);
  const bad = handleUpdate({ pre_checkout_query: { id: 'p', currency: 'USD', invoice_payload: 'x' } }, 'https://x/');
  assert.equal(bad[0].body.ok, false);
});

test('ANY-запрос получает REFUSED без ответов', () => {
  const q = query('example.com', 255);
  const a = refused(q, parseQuestion(q));
  assert.equal(a[3] & 0x0f, 5);
  assert.equal(a[7], 0);
});
