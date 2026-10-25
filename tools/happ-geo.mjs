#!/usr/bin/env node
// Маленькие geo-файлы для профиля Happ (кнопка «Добавить в Happ» на сайте):
//   site/happ/geosite.dat — только category-ru (российские сервисы)
//   site/happ/geoip.dat   — только ru и private
// Полные базы Loyalsoldier весят ~28 МБ и на iPhone не влезают в лимит туннеля 50 МБ
// («Лимит памяти туннеля превышен»). Наши — сотни килобайт.
//
// Запуск: node tools/happ-geo.mjs   (качает свежие базы Loyalsoldier и режет их)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'site', 'happ');
const SRC = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/';
const KEEP = { 'geosite.dat': ['CATEGORY-RU'], 'geoip.dat': ['RU', 'PRIVATE'] };

// Файл — protobuf-список: поле 1 = запись (страна/категория), внутри у записи поле 1 = её код.
// Нужные записи копируем байт в байт, остальные выбрасываем.
function varint(buf, i) {
  let r = 0, s = 0, c;
  do { c = buf[i++]; r += (c & 0x7f) * 2 ** s; s += 7; } while (c & 0x80);
  return [r, i];
}
function* entries(buf) {
  for (let i = 0; i < buf.length;) {
    const start = i;
    let key, len;
    [key, i] = varint(buf, i);
    if ((key & 7) !== 2) throw new Error('неожиданный формат geo-файла');
    [len, i] = varint(buf, i);
    yield { raw: buf.subarray(start, i + len), body: buf.subarray(i, i + len) };
    i += len;
  }
}
function code(body) {
  for (const f of entries(body)) {
    if (f.raw[0] === 0x0a) return f.body.toString().toUpperCase();
  }
  return '';
}

fs.mkdirSync(OUT, { recursive: true });
for (const [file, keep] of Object.entries(KEEP)) {
  const res = await fetch(SRC + file);
  if (!res.ok) throw new Error(`${file}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const parts = [...entries(buf)].filter((e) => keep.includes(code(e.body)));
  if (parts.length !== keep.length) throw new Error(`${file}: нашлось ${parts.length} из ${keep.length}`);
  const out = Buffer.concat(parts.map((e) => e.raw));
  fs.writeFileSync(path.join(OUT, file), out);
  console.log(`${file}: ${(buf.length / 1e6).toFixed(1)} МБ → ${(out.length / 1e3).toFixed(0)} КБ (${keep.join(', ')})`);
}
