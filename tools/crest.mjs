#!/usr/bin/env node
// Рисует герб «Чисто» (site/crest.svg): Прометей с факелом против гидры-рекламы,
// которая лезет из всплывающего окна. У гидры отрастают головы — война вечна, но свет сильнее.
// Фигуры собираются из сужающихся кривых, поэтому позу можно править числами ниже.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const C = {
  azure: '#163a8f', hatch: '#2a5bd3', gold: '#e2b64f', goldDark: '#a8822f', goldLight: '#fff1c4',
  argent: '#eef3ff', shade: '#c2cff0', cape: '#93a9e2', sable: '#0a0f1e', gules: '#d0343c', ink: '#10275f',
};
const f = (n) => Math.round(n * 10) / 10;

// Кубическая Безье и её производная.
const bez = (p, t) => {
  const u = 1 - t;
  return [0, 1].map(k => u * u * u * p[0][k] + 3 * u * u * t * p[1][k] + 3 * u * t * t * p[2][k] + t * t * t * p[3][k]);
};
const bezd = (p, t) => {
  const u = 1 - t;
  return [0, 1].map(k => 3 * u * u * (p[1][k] - p[0][k]) + 6 * u * t * (p[2][k] - p[1][k]) + 3 * t * t * (p[3][k] - p[2][k]));
};

// Сужающийся «мазок» вдоль кривой: ширина w0 → w1, скруглённые концы.
function taper(p, w0, w1, ease = (t) => t) {
  const L = [], R = [], N = 32;
  for (let i = 0; i <= N; i++) {
    const t = i / N, [x, y] = bez(p, t), [dx, dy] = bezd(p, t);
    const len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const w = (w0 + (w1 - w0) * ease(t)) / 2;
    L.push([x + nx * w, y + ny * w]); R.push([x - nx * w, y - ny * w]);
  }
  const r0 = w0 / 2, r1 = w1 / 2;
  return `M${L.map(q => q.map(f).join(' ')).join(' L')} A${f(r1)} ${f(r1)} 0 0 0 ${R.at(-1).map(f).join(' ')} L${R.reverse().map(q => q.map(f).join(' ')).join(' L')} A${f(r0)} ${f(r0)} 0 0 0 ${L[0].map(f).join(' ')} Z`;
}
// Отрезок с двумя контрольными точками по третям — для конечностей.
const seg = (a, b, bend = [0, 0]) => [a, [a[0] + (b[0] - a[0]) / 3 + bend[0], a[1] + (b[1] - a[1]) / 3 + bend[1]],
  [a[0] + 2 * (b[0] - a[0]) / 3 + bend[0], a[1] + 2 * (b[1] - a[1]) / 3 + bend[1]], b];

// Голова гидры (смотрит вправо): вытянутая морда, раскрытая пасть с зубами, гребень, глаз.
function hydraHead(x, y, angle, s, open = 1) {
  const j = 9 * open, w = f(1.7 / s);
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${s})">
    <path d="M-2 -6 L-14 -16 L-4 -10 L-12 -24 L2 -12 L-2 -22 L8 -13 Z" fill="${C.sable}" stroke="${C.argent}" stroke-width="${w}" stroke-linejoin="round"/>
    <path d="M-6 -7 C4 -15 22 -15 34 -11 L48 -7 C50 -6 50 -3 47 -2 L30 -1 C22 0 14 1 8 2 L36 ${f(6 + j)} C40 ${f(8 + j)} 39 ${f(11 + j)} 35 ${f(11 + j)} L18 ${f(10 + j / 2)} C8 9 0 9 -6 8 Z" fill="${C.sable}" stroke="${C.argent}" stroke-width="${w}" stroke-linejoin="round"/>
    <path d="M22 -1 l3 5 l3 -5 M32 -1.5 l3 4.5 l3 -5 M24 ${f(8 + j / 2)} l3 -5 l3 5" fill="${C.argent}"/>
    <ellipse cx="17" cy="-8" rx="3" ry="2.2" fill="${C.gules}"/>
    <path d="M34 ${f(2 + j / 2)} L52 ${f(-1 + j / 2)} L46 ${f(3 + j / 2)} L52 ${f(7 + j / 2)} Z" fill="${C.gules}"/>
  </g>`;
}
// Шея гидры: чёрная с серебряной окантовкой.
const neck = (p, w0, w1) => `<path d="${taper(p, w0 + 5, w1 + 4)}" fill="${C.argent}"/><path d="${taper(p, w0, w1)}" fill="${C.sable}"/>`;

const shield = 'M50 60 H350 V250 Q350 400 200 480 Q50 400 50 250 Z';
const inner = 'M63 73 H337 V250 Q337 391 200 465 Q63 391 63 250 Z';

// ── Прометей: выпад влево, стоит на окне-рекламе и на земле ──
const J = {
  head: [212, 196], neck: [218, 214], s1: [208, 226], s2: [238, 226], hip: [236, 294],
  k1: [200, 332], a1: [182, 370], toe1: [164, 378],
  k2: [258, 334], a2: [272, 378], toe2: [288, 384],
  e2: [258, 198], w2: [268, 164], e1: [186, 250], w1: [166, 262],
};
const calf = (t) => t < 0.35 ? t * 0.5 : 0.175 + (t - 0.35) * 1.27;   // икра: ширина держится, потом сужается
const hero = [];
// плащ: струится назад от плеч
hero.push(`<path d="M232 218 C268 206 312 226 338 268 C322 276 308 290 300 310 C292 290 272 272 252 266 C246 250 240 236 232 218 Z" fill="${C.cape}"/>`);
hero.push(`<path d="M248 226 C278 228 306 246 324 270 M246 238 C270 246 292 266 304 290 M244 252 C260 262 276 278 286 296" stroke="${C.azure}" stroke-width="1.5" fill="none" opacity="0.5"/>`);
// дальние конечности — оттенком
hero.push(`<path d="${taper(seg(J.hip, J.k2, [4, -2]), 24, 16)}" fill="${C.shade}"/>`);
hero.push(`<path d="${taper(seg(J.k2, J.a2, [3, -1]), 16, 9, calf)}" fill="${C.shade}"/>`);
hero.push(`<path d="${taper(seg(J.a2, J.toe2), 9, 6)}" fill="${C.shade}"/>`);
hero.push(`<path d="${taper(seg(J.s2, J.e2, [5, 2]), 15, 12)}" fill="${C.shade}"/>`);
hero.push(`<path d="${taper(seg(J.e2, J.w2, [2, 0]), 12, 9)}" fill="${C.shade}"/>`);
// корпус: широкие плечи, грудь, талия
hero.push(`<path d="M200 226 C204 214 218 210 230 212 C240 212 248 218 248 228 C248 248 244 266 244 284 L226 292 C220 276 212 262 206 248 C202 240 200 234 200 226 Z" fill="${C.argent}"/>`);
// хитон с поясом и складками
hero.push(`<path d="M220 272 L248 270 C254 288 262 304 268 318 C250 326 222 326 202 318 C208 302 214 288 220 272 Z" fill="${C.argent}"/>`);
hero.push(`<path d="M218 278 C230 282 240 282 250 276" stroke="${C.gold}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`);
hero.push(`<path d="M214 292 L208 316 M228 286 L226 320 M242 286 L250 318 M256 296 L262 314" stroke="${C.shade}" stroke-width="1.5" fill="none"/>`);
hero.push(`<path d="M242 218 L216 272" stroke="${C.gold}" stroke-width="3.4" stroke-linecap="round"/>`);
// ближние конечности
hero.push(`<path d="${taper(seg(J.hip, J.k1, [-6, 2]), 25, 17)}" fill="${C.argent}"/>`);
hero.push(`<path d="${taper(seg(J.k1, J.a1, [-3, 0]), 17, 9, calf)}" fill="${C.argent}"/>`);
hero.push(`<path d="${taper(seg(J.a1, J.toe1), 9, 6)}" fill="${C.argent}"/>`);
hero.push(`<path d="${taper(seg(J.s1, J.e1, [-2, 5]), 16, 12)}" fill="${C.argent}"/>`);
hero.push(`<path d="${taper(seg(J.e1, J.w1, [0, 2]), 12, 9)}" fill="${C.argent}"/>`);
hero.push(`<circle cx="${J.w1[0] - 2}" cy="${J.w1[1]}" r="6" fill="${C.argent}"/>`);
// шея, голова в профиль с бородой, лавровый венок
hero.push(`<path d="${taper(seg(J.neck, [214, 204]), 14, 12)}" fill="${C.argent}"/>`);
hero.push(`<path d="M214 178 C225 178 231 188 229 199 C228 207 223 212 218 214 L216 222 L206 222 C203 220 201 216 201 211 L198 206 L200 203 L195 197 L199 193 C200 184 206 178 214 178 Z" fill="${C.argent}"/>`);
hero.push(`<path d="M216 179 C228 178 236 188 234 200 C233 208 228 212 222 214 C226 206 226 196 220 190 Z" fill="${C.shade}"/>`);
hero.push(`<path d="M202 184 C210 175 224 176 229 186" stroke="${C.gold}" stroke-width="3" fill="none" stroke-linecap="round"/>`);
hero.push(`<path d="M206 181 c-3 -6 -8 -6 -9 -5 c2 3 5 5 9 5 M213 178 c-1 -6 -5 -8 -7 -8 c0 4 3 7 7 8 M221 178 c1 -6 5 -8 8 -8 c0 4 -3 7 -8 8 M227 183 c4 -4 9 -4 10 -3 c-2 3 -6 4 -10 3" fill="${C.gold}"/>`);

// ── Гидра из всплывающего окна ──
const hydra = [];
// окно-туловище, на котором стоит герой
hydra.push(`<g transform="rotate(-8 160 382)">
  <rect x="104" y="356" width="104" height="56" rx="3" fill="${C.sable}" stroke="${C.argent}" stroke-width="2.6"/>
  <rect x="104" y="356" width="104" height="13" rx="2" fill="${C.argent}"/>
  <circle cx="112" cy="362.5" r="2.4" fill="${C.sable}"/><circle cx="120" cy="362.5" r="2.4" fill="${C.sable}"/>
  <path d="M193 358.5 l8 8 M201 358.5 l-8 8" stroke="${C.gules}" stroke-width="2.6" stroke-linecap="round"/>
  <text x="156" y="400" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="25" font-weight="700" letter-spacing="2" fill="${C.argent}">AD</text>
</g>`);
// шеи: змеиные изгибы
hydra.push(neck([[150, 358], [158, 330], [118, 318], [136, 286]], 20, 11));   // главная, пронзённая копьём
hydra.push(neck([[128, 360], [104, 318], [62, 312], [84, 250]], 18, 10));     // отпрянула от света
hydra.push(neck([[116, 366], [86, 356], [66, 346], [76, 318]], 15, 9));       // нижняя
hydra.push(neck([[172, 358], [170, 346], [164, 338], [160, 330]], 8, 5));     // новая — только отросла
hydra.push(hydraHead(136, 284, -22, 0.82, 1.3));
hydra.push(hydraHead(84, 248, -62, 0.74, 0.9));
hydra.push(hydraHead(76, 316, -46, 0.6, 1));
hydra.push(hydraHead(160, 330, -72, 0.36, 0.8));

// ── Свет факела и копьё ──
const flame = [272, 120];
const rays = [];
for (let i = 0; i < 15; i++) {
  const a = (118 + i * 9) * Math.PI / 180, r0 = 36, r1 = 280;
  rays.push(`M${f(flame[0] + Math.cos(a) * r0)} ${f(flame[1] + Math.sin(a) * r0)} L${f(flame[0] + Math.cos(a) * r1)} ${f(flame[1] + Math.sin(a) * r1)}`);
}
const light = `<path d="${rays.join(' ')}" stroke="${C.gold}" stroke-width="1.3" opacity="0.32"/>
  <circle cx="${flame[0]}" cy="${flame[1]}" r="34" fill="${C.gold}" opacity="0.13"/>`;
// земля: тёмный холм в штриховку под ногами
const ground = `<path d="M40 404 C110 386 170 392 214 394 C250 396 280 390 360 372 L360 520 L40 520 Z" fill="#0f2a6b"/>
  <path d="M60 412 H340 M70 422 H330 M84 432 H316 M100 442 H300 M118 452 H282" stroke="#1d47a8" stroke-width="1.2"/>`;
const spear = `<path d="M214 234 L152 274" stroke="${C.gold}" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M140 282 L155 266 L160 278 Z" fill="${C.gold}" stroke="${C.goldDark}" stroke-width="1"/>`;
const torch = `<path d="M264 180 L274 136" stroke="${C.goldDark}" stroke-width="7" stroke-linecap="round"/>
  <path d="M266 150 L276 146 M264 158 L274 154" stroke="${C.gold}" stroke-width="2"/>
  <path d="M272 84 C286 100 292 114 284 128 C292 126 296 118 297 110 C306 126 298 142 276 144 C258 144 252 128 258 116 C260 122 264 126 268 128 C262 114 264 98 272 84 Z" fill="${C.gold}"/>
  <path d="M274 108 C280 116 282 126 276 136 C270 136 266 130 268 124 C269 118 272 112 274 108 Z" fill="${C.goldLight}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" role="img" aria-label="Герб «Чисто»: Прометей с факелом пронзает гидру-рекламу">
  <title>Герб «Чисто» — Lux fortior</title>
  <defs>
    <clipPath id="crest-clip"><path d="${shield}"/></clipPath>
    <pattern id="crest-azure" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="${C.azure}"/><rect y="2.4" width="6" height="1.1" fill="${C.hatch}"/>
    </pattern>
  </defs>
  <path d="M200 4 C214 20 222 32 214 46 C224 42 230 34 232 28 C240 44 232 56 222 60 H178 C168 56 160 44 168 28 C170 34 176 42 186 46 C178 32 186 20 200 4 Z" fill="${C.gold}"/>
  <path d="${shield}" fill="url(#crest-azure)"/>
  <g clip-path="url(#crest-clip)">
    ${light}
    ${ground}
    ${hydra.join('\n    ')}
    ${spear}
    ${hero.join('\n    ')}
    ${torch}
  </g>
  <path d="${shield}" fill="none" stroke="${C.gold}" stroke-width="9"/>
  <path d="${inner}" fill="none" stroke="${C.gold}" stroke-width="1.4"/>
  <path d="M70 470 L104 470 L96 486 L104 502 L70 502 L80 486 Z" fill="${C.goldDark}"/>
  <path d="M330 470 L296 470 L304 486 L296 502 L330 502 L320 486 Z" fill="${C.goldDark}"/>
  <path d="M96 462 Q200 486 304 462 L304 494 Q200 518 96 494 Z" fill="${C.gold}"/>
  <text x="200" y="491" text-anchor="middle" font-family="Literata, Georgia, 'Times New Roman', serif" font-size="16" font-weight="700" letter-spacing="4" fill="${C.ink}">LUX · FORTIOR</text>
</svg>
`;
fs.writeFileSync(path.join(ROOT, 'site/crest.svg'), svg);
console.log('site/crest.svg');
