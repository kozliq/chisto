#!/usr/bin/env node
// Логотипы «Чисто» для Телеграма: три простых гербовых щита с ОДНИМ образом (как в геральдике:
// щит + одна фигура). Пишет brand/logo-{a,b,c}.svg, brand/sheet.html, brand/banner-{a,b,c}.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'brand');
fs.mkdirSync(OUT, { recursive: true });

const K = { ink: '#140f10', red: '#c8141a', fire: '#ff5b2e', glow: '#ffc7a3', bone: '#f2ebe6', shade: '#bdb0aa' };

const SHIELD = 'M20 20 H380 V215 C380 340 300 420 200 466 C100 420 20 340 20 215 Z';
const SHIELD_IN = 'M36 36 H364 V212 C364 328 292 402 200 446 C108 402 36 328 36 212 Z';

// Пламя: большая капля с язычком; второй слой — светлая сердцевина.
const flame = (x, y, s, outer, inner) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M0 -150 C14 -108 62 -86 62 -20 C62 30 36 60 0 60 C-36 60 -62 30 -62 -20 C-62 -50 -48 -70 -32 -88 C-32 -60 -18 -52 -12 -60 C-4 -80 -16 -112 0 -150 Z" fill="${outer}"/>
  <path d="M0 -62 C8 -40 30 -26 30 2 C30 30 16 46 0 46 C-16 46 -30 30 -30 2 C-30 -14 -20 -26 -12 -36 C-10 -22 -4 -20 -2 -26 C2 -38 -6 -48 0 -62 Z" fill="${inner}"/>
</g>`;

// Буквы AD рисуем контурами, чтобы не зависеть от шрифтов. Размер 98×40.
const AD = (x, y, s, color) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}" fill-rule="evenodd">
  <path d="M0 40 L18 0 H30 L48 40 H36 L32 30 H16 L12 40 Z M20 21 H28 L24 9 Z"/>
  <path d="M54 0 H74 C92 0 98 12 98 20 C98 28 92 40 74 40 H54 Z M65 9 H72 C80 9 85 14 85 20 C85 26 80 31 72 31 H65 Z"/>
</g>`;

const wrap = (inner, field, line, edge = K.ink) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 486">
  <path d="${SHIELD}" fill="${field}" stroke="${edge}" stroke-width="9" stroke-linejoin="round"/>
  <path d="${SHIELD_IN}" fill="none" stroke="${line}" stroke-width="3"/>
  ${inner}
</svg>`;

// A — один факел на чёрном: огонь, который не гаснет.
const A = wrap(`
  ${flame(200, 235, 1.28, K.fire, K.glow)}
  <path d="M158 262 H242 L230 300 H170 Z" fill="${K.bone}"/>
  <path d="M170 300 H230 L222 318 H178 Z" fill="${K.shade}"/>
  <path d="M184 318 H216 L212 420 H188 Z" fill="${K.bone}"/>
  <path d="M163 276 H237" stroke="${K.ink}" stroke-width="4"/>
  <circle cx="92" cy="140" r="5" fill="${K.fire}"/><circle cx="312" cy="170" r="4" fill="${K.fire}"/>
  <circle cx="120" cy="90" r="3" fill="${K.glow}"/><circle cx="290" cy="100" r="5" fill="${K.glow}"/>
`, K.ink, K.fire, K.bone);

// B — рекламный зверь: морда с одним глазом (слежка) и табличкой AD вместо пасти; его пронзает меч света.
const half = `
  <path d="M200 128 L258 146 L290 220 L268 306 L200 408 Z" fill="${K.ink}"/>
  <path d="M256 150 C322 160 362 116 356 52 C326 96 288 108 244 112 Z" fill="${K.ink}"/>
`;
const B = wrap(`
  <g>${half}<g transform="translate(400 0) scale(-1 1)">${half}</g><rect x="198" y="128" width="4" height="262" fill="${K.ink}"/></g>
  ${flame(200, 150, 0.5, K.fire, K.glow)}
  <ellipse cx="200" cy="220" rx="48" ry="27" fill="${K.bone}"/>
  <circle cx="200" cy="220" r="18" fill="${K.red}"/><rect x="196" y="203" width="8" height="34" rx="3" fill="${K.ink}"/>
  <path d="M146 222 C170 182 230 182 254 222" fill="none" stroke="${K.red}" stroke-width="8"/>
  <rect x="146" y="298" width="108" height="58" fill="${K.bone}" stroke="${K.red}" stroke-width="5"/>
  ${AD(157, 306, 0.86, K.ink)}
`, K.red, K.ink);

// C — факел рассекает табличку AD пополам: на белом, красное пламя.
const C = wrap(`
  ${flame(200, 190, 1.0, K.red, K.fire)}
  <path d="M164 214 H236 L226 244 H174 Z" fill="${K.ink}"/>
  <path d="M186 244 H214 L211 300 H189 Z" fill="${K.ink}"/>
  <g transform="rotate(-8 134 352)"><rect x="76" y="326" width="116" height="54" fill="${K.ink}"/>${AD(88, 334, 0.92, K.bone)}</g>
  <g transform="rotate(10 268 352)"><rect x="214" y="326" width="116" height="54" fill="${K.ink}"/>${AD(226, 334, 0.92, K.bone)}</g>
  <path d="M198 296 L206 330 L196 346 L208 372 L200 400" fill="none" stroke="${K.fire}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
`, K.bone, K.red);

const logos = { a: A, b: B, c: C };
for (const [k, svg] of Object.entries(logos)) fs.writeFileSync(path.join(OUT, `logo-${k}.svg`), svg);

// Лист для выбора и баннеры 1280×720 (16:9, как картинка в описании бота).
const fontCss = `@font-face{font-family:U;src:url(../site/fonts/unbounded-cyrillic-wght-normal.woff2);font-weight:200 900}
@font-face{font-family:M;src:url(../site/fonts/manrope-cyrillic-wght-normal.woff2);font-weight:200 800}`;
fs.writeFileSync(path.join(OUT, 'sheet.html'), `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#141011;width:1500px;height:620px}
.r{display:flex;justify-content:space-around;align-items:center;height:620px}
.r div{width:400px;text-align:center;font:600 22px sans-serif;color:#f2ebe6}.r svg{width:400px;height:486px;display:block;margin-bottom:12px}
</style><div class="r">${Object.entries(logos).map(([k, s]) => `<div>${s}${k.toUpperCase()}</div>`).join('')}</div>`);

for (const [k, svg] of Object.entries(logos)) {
  fs.writeFileSync(path.join(OUT, `banner-${k}.html`), `<!doctype html><meta charset="utf-8"><style>${fontCss}
html,body{margin:0;width:1280px;height:720px;overflow:hidden;background:#141011}
.b{position:relative;width:1280px;height:720px;background:radial-gradient(circle at 24% 50%,#3a1a14 0,#141011 62%)}
.b svg{position:absolute;left:110px;top:70px;height:580px}
.t{position:absolute;left:640px;top:150px;right:80px;color:#f2ebe6}
h1{font:800 140px/1 U,sans-serif;margin:0 0 34px;letter-spacing:-2px}
p{font:600 38px/1.35 M,sans-serif;margin:0 0 10px;color:#f2ebe6}
p.s{color:#ff5b2e;font-weight:800;margin-top:26px;white-space:nowrap;font-size:34px}
hr{width:120px;border:0;border-top:5px solid #ff5b2e;margin:0 0 30px;text-align:left}
</style><div class="b">${svg}<div class="t"><h1>Чисто</h1><hr><p>Убирает рекламу и слежку</p><p>на телефоне и компьютере.</p><p class="s">Бесплатно. Без регистрации.</p></div></div>`);
}
console.log('ok', OUT);
