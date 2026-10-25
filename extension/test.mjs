// Проверка логики расширения без браузера: node --test extension/test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// skip.js — обычный скрипт страницы; грузим его в песочницу без DOM и достаём функции.
const ctx = { URL, TextEncoder, crypto, setTimeout, fetch: () => Promise.reject(new Error('нет сети')) };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('./src/skip.js', import.meta.url), 'utf8') +
  ';globalThis.fromDescription = fromDescription; globalThis.merge = merge;', ctx);
// Массивы из песочницы — «чужие» для assert, поэтому сравниваем через JSON.
const plain = (x) => JSON.parse(JSON.stringify(x));

test('таймкоды: строка с рекламой → до следующего таймкода', () => {
  const d = '0:00 Вступление\n02:15 Реклама Т-Банка\n3:40 Обзор\n1:02:03 Итоги';
  assert.deepEqual(plain(ctx.fromDescription(d)),
    [{ start: 135, end: 220, source: 'таймкоды в описании' }]);
});

test('таймкоды: интеграция, партнёр, промокод — тоже реклама', () => {
  const d = '00:00 Начало\n01:00 Интеграция\n02:00 Тест\n05:00 Партнёр выпуска — Авито\n06:30 Дальше\n08:00 Промокод в описании\n09:00 Конец';
  assert.deepEqual(plain(ctx.fromDescription(d).map((s) => [s.start, s.end])), [[60, 120], [300, 390], [480, 540]]);
});

test('без следующего таймкода и слишком длинные вставки не трогаем', () => {
  assert.equal(ctx.fromDescription('00:00 Начало\n10:00 Реклама').length, 0);
  assert.equal(ctx.fromDescription('00:00 Реклама\n30:00 Конец').length, 0);
});

test('обычные главы и пустое описание — без пропусков', () => {
  assert.equal(ctx.fromDescription('0:00 Вступление\n1:00 Сборка\n5:00 Итоги').length, 0);
  assert.equal(ctx.fromDescription('').length, 0);
  assert.equal(ctx.fromDescription(undefined).length, 0);
});

test('перекрывающиеся вставки склеиваются, крошечные выкидываются', () => {
  const m = ctx.merge([{ start: 10, end: 30, source: 'a' }, { start: 25, end: 40, source: 'b' }, { start: 50, end: 50.5, source: 'c' }]);
  assert.deepEqual(plain(m.map((s) => [s.start, s.end])), [[10, 40]]);
});

// ── Гонка на старте: ролик с рекламой с 0:00 ──
const load2 = (extra) => {
  const c = { URL, TextEncoder, crypto, setTimeout, clearTimeout, fetch: () => Promise.reject(new Error('нет сети')) };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(new URL('./src/skip.js', import.meta.url), 'utf8') + extra, c);
  return c;
};
const c2 = load2(';globalThis.skipTarget = skipTarget; globalThis.startsAtZero = startsAtZero; globalThis.withTimeout = withTimeout;');

test('вставка с 0:00 → перемотка на конец + 0.05 до первого timeupdate', () => {
  const segs = [{ start: 0, end: 42, source: 'x' }];
  assert.equal(c2.startsAtZero(segs).end, 42);
  const hit = c2.skipTarget(0.1, segs, new Set(), 600);
  assert.equal(hit.to, 42.05);
});

test('вставка с 0.5 с — ещё «с нуля», с 0.6 — уже нет', () => {
  assert.ok(c2.startsAtZero([{ start: 0.5, end: 30 }]));
  assert.equal(c2.startsAtZero([{ start: 0.6, end: 30 }]), null);
});

test('перемотка не выходит за конец ролика', () => {
  assert.equal(c2.skipTarget(590, [{ start: 580, end: 600 }], new Set(), 600).to, 600);
});

test('«Вернуть» отключает вставку', () => {
  assert.equal(c2.skipTarget(5, [{ start: 0, end: 30 }], new Set(['0']), 600), null);
});

test('ожидание сети не дольше таймаута', async () => {
  const slow = new Promise((r) => setTimeout(() => r('поздно'), 400));
  const t = Date.now();
  assert.equal(await c2.withTimeout(slow, 350), null);
  assert.ok(Date.now() - t < 390);
  assert.deepEqual(plain(await c2.withTimeout(Promise.resolve([1]), 350)), [1]);
});
