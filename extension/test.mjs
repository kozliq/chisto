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
