// Genera los PNG PROVISIONALES de la mascota en public/pet/ (spec §5). Mismos
// nombres que espera src/lib/pet/manifest.ts; el arte IA curado los sustituye.
//   node scripts/pet-sprites.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 40, H = 40;
const C = {
  fur: "#b0542f", furD: "#9a4526", furL: "#c96b42", cream: "#f3dcc4", creamD: "#e2c4a4",
  nose: "#7a4a2a", ink: "#2a231d", white: "#fffdf8", tailL: "#d97a4a", grey: "#b9b2a8",
  blue: "#3f5f8a", blueD: "#2c4463", gold: "#d8a83a", goldD: "#a87c22",
  green: "#4f7a4a", greenD: "#37552f", red: "#a83a3a", redD: "#7a2626",
  purple: "#6a4c8a", purpleD: "#4a3360", paper: "#fffdf8", steel: "#8a94a0", steelD: "#5c6670",
  white2: "#f4efe6", wood: "#6b4a2b", leaf: "#5e8a4a", leafD: "#3f5f33", acorn: "#8a5a2b", acornD: "#5e3d1c",
};

const grid = () => Array.from({ length: H }, () => Array(W).fill(null));
const px = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
function circle(g, cx, cy, r, c) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = c; }
function ellipse(g, cx, cy, rx, ry, c) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g[y][x] = c; }
function rect(g, x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(g, x, y, c); }
function tri(g, ax, ay, bx, by, cx, cy, c) {
  const s = (p1x, p1y, p2x, p2y, p3x, p3y) => (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) g[y][x] = c;
  }
}
function line(g, x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) px(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); }
function outline(g, color = C.ink) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx])) out[y][x] = color;
  }
  return out;
}
function shade(g, from, dark, light) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x] !== from) continue;
    const b = g[y + 1]?.[x], r = g[y]?.[x + 1], a = g[y - 1]?.[x], l = g[y]?.[x - 1];
    if (!b || b === C.ink || !r || r === C.ink) out[y][x] = dark;
    else if ((!a || a === C.ink) && (!l || l === C.ink)) out[y][x] = light;
  }
  return out;
}
// ---- PNG RGBA sin dependencias ----
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cc]); };
function png(g, file) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const i = y * (W * 4 + 1) + 1 + x * 4, c = g[y][x];
      if (!c) continue;
      raw[i] = parseInt(c.slice(1, 3), 16); raw[i + 1] = parseInt(c.slice(3, 5), 16); raw[i + 2] = parseInt(c.slice(5, 7), 16); raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

// ---- Etapas: proporciones (spec §1). Pivotes del manifiesto: cabeza [15,25], cuerpo [15,35], cola [27,33], mano [11,27]. ----
const STAGES = {
  young:   { headR: 9,  headY: 18, bodyRx: 6, bodyRy: 5, bodyY: 31, tailK: 0.75, grey: false },
  adult:   { headR: 8,  headY: 17, bodyRx: 8, bodyRy: 7, bodyY: 29, tailK: 1,    grey: false },
  veteran: { headR: 8,  headY: 17, bodyRx: 8, bodyRy: 7, bodyY: 29, tailK: 1.1,  grey: true },
};
const TAIL = [[27, 31, 3.5], [30, 27, 4], [32, 22, 4.5], [32, 16, 5], [30, 10, 4.5], [26, 6, 3.5]];

function tail(s) {
  let g = grid();
  for (const [cx, cy, r] of TAIL) circle(g, 27 + (cx - 27) * s.tailK, 33 + (cy - 33) * s.tailK, r * s.tailK, C.furD);
  for (const [cx, cy, r] of TAIL) circle(g, 27 + (cx - 27) * s.tailK - 1, 33 + (cy - 33) * s.tailK - 1, r * s.tailK - 2.2, s.grey && cy < 12 ? C.grey : C.tailL);
  return outline(g);
}
function body(s) {
  let g = grid();
  ellipse(g, 15, s.bodyY, s.bodyRx, s.bodyRy, C.fur);
  ellipse(g, 9, 34, 3.5, 2, C.furD); ellipse(g, 21, 34, 3.5, 2, C.furD);
  ellipse(g, 15, s.bodyY + 1, s.bodyRx * 0.56, s.bodyRy * 0.72, C.cream);
  g = shade(g, C.fur, C.furD, C.furL);
  return outline(g);
}
function head(s) {
  let g = grid();
  circle(g, 15, s.headY, s.headR, C.fur);
  const t = s.headY - s.headR + 3;
  tri(g, 9, t, 8, t - 8, 14, t - 2, C.fur); tri(g, 21, t, 22, t - 8, 16, t - 2, C.fur);
  tri(g, 10, t - 1, 9.5, t - 6, 13, t - 2, C.cream); tri(g, 20, t - 1, 20.5, t - 6, 17, t - 2, C.cream);
  ellipse(g, 15, s.headY + 4, 4.5, 3, C.cream);
  g = shade(g, C.fur, C.furD, C.furL);
  g = outline(g);
  if (s.grey) { px(g, 20, s.headY - 3, C.grey); px(g, 21, s.headY - 2, C.grey); }
  return g;
}
function hand() { const g = grid(); ellipse(g, 11, 27, 2, 1.5, C.fur); ellipse(g, 19, 27, 2, 1.5, C.fur); return outline(g); }

function face(mood) {
  const g = grid(), y = 17;
  if (mood === "sleepy" || mood === "blink") { line(g, 11, y, 13, y, C.ink); line(g, 17, y, 19, y, C.ink); }
  else if (mood === "sad") { rect(g, 11, y, 2, 2, C.ink); rect(g, 17, y, 2, 2, C.ink); px(g, 11, y - 1, C.ink); px(g, 18, y - 1, C.ink); }
  else { rect(g, 11, y - 1, 2, 3, C.ink); rect(g, 17, y - 1, 2, 3, C.ink); px(g, 12, y - 1, C.white); px(g, 18, y - 1, C.white); }
  rect(g, 14, y + 3, 2, 1, C.nose);
  if (mood === "happy") { px(g, 13, y + 5, C.nose); px(g, 14, y + 6, C.nose); px(g, 15, y + 6, C.nose); px(g, 16, y + 5, C.nose); px(g, 9, y + 3, "#e8a084"); px(g, 21, y + 3, "#e8a084"); }
  else if (mood === "sad") { px(g, 13, y + 6, C.nose); px(g, 14, y + 5, C.nose); px(g, 15, y + 5, C.nose); px(g, 16, y + 6, C.nose); }
  else line(g, 13, y + 5, 16, y + 5, C.nose);
  return g;
}

function acorn() {
  let g = grid();
  ellipse(g, 20, 24, 8, 10, C.acorn); ellipse(g, 20, 17, 9, 4, C.acornD); rect(g, 19, 9, 2, 5, C.wood);
  g = shade(g, C.acorn, C.acornD, "#a8703a");
  return outline(g);
}

// Ropa (pegada a cabeza o cuerpo) y accesorio (mano) por clase. Mismo dibujo
// para las tres etapas: la composición lo escala con la pieza.
function cls(name) {
  const outfit = grid(), acc = grid();
  if (name === "barbarian") {
    tri(outfit, 6, 12, 4, 3, 10, 10, C.steelD); tri(outfit, 24, 12, 26, 3, 20, 10, C.steelD);
    rect(outfit, 8, 9, 14, 3, C.steel); rect(outfit, 8, 11, 14, 1, C.steelD); line(outfit, 18, 14, 20, 16, C.redD);
    rect(acc, 3, 22, 2, 14, C.wood); ellipse(acc, 3, 22, 4, 3, C.steel); ellipse(acc, 3, 22, 2, 1.5, C.steelD);
  }
  if (name === "fighter") {
    rect(outfit, 7, 9, 16, 5, C.steel); rect(outfit, 7, 13, 16, 1, C.steelD); rect(outfit, 11, 15, 8, 1, C.ink); px(outfit, 15, 8, C.red); px(outfit, 15, 7, C.red);
    rect(acc, 3, 14, 2, 16, C.white2); rect(acc, 1, 28, 6, 2, C.gold); rect(acc, 3, 30, 2, 4, C.wood);
    rect(acc, 24, 22, 7, 9, C.red); rect(acc, 25, 23, 5, 7, C.redD); rect(acc, 27, 23, 1, 7, C.gold); rect(acc, 25, 26, 5, 1, C.gold);
  }
  if (name === "wizard") {
    tri(outfit, 6, 11, 15, -6, 24, 11, C.blue); rect(outfit, 5, 10, 20, 3, C.blueD); px(outfit, 15, 2, C.gold); px(outfit, 14, 3, C.gold); px(outfit, 16, 3, C.gold); px(outfit, 15, 4, C.gold);
    rect(acc, 26, 14, 2, 20, C.wood); circle(acc, 27, 13, 2.2, C.purple); px(acc, 26, 12, "#c9a6f0"); px(acc, 31, 10, C.gold); px(acc, 23, 9, C.gold);
  }
  if (name === "cleric") {
    ellipse(outfit, 15, 30, 8.5, 7, C.white2); rect(outfit, 8, 24, 14, 2, C.gold); rect(outfit, 14, 27, 2, 6, C.gold); rect(outfit, 12, 29, 6, 2, C.gold);
    rect(acc, 25, 20, 2, 14, C.wood); rect(acc, 23, 17, 6, 5, C.steel); px(acc, 24, 18, C.steelD); px(acc, 27, 20, C.steelD);
  }
  if (name === "bard") {
    ellipse(outfit, 15, 10, 8, 3, C.green); rect(outfit, 8, 9, 14, 2, C.greenD); tri(outfit, 7, 10, 12, 4, 16, 10, C.green); line(outfit, 19, 8, 26, 2, C.red); line(outfit, 20, 8, 27, 3, C.redD);
    ellipse(acc, 14, 30, 4, 3.5, C.goldD); ellipse(acc, 14, 30, 2.5, 2, C.gold); rect(acc, 17, 24, 2, 7, C.nose); line(acc, 14, 27, 17, 25, C.ink); px(acc, 14, 30, C.ink);
  }
  if (name === "ranger") {
    ellipse(outfit, 15, 10, 9, 4, C.leaf); rect(outfit, 6, 9, 18, 3, C.leafD); rect(outfit, 6, 11, 3, 6, C.leaf); rect(outfit, 21, 11, 3, 6, C.leaf);
    for (let y = 16; y <= 36; y++) px(acc, Math.round(3 + 3 * Math.sin((y - 16) / 20 * Math.PI)), y, C.wood);
    line(acc, 3, 16, 3, 36, C.creamD); rect(acc, 24, 22, 3, 10, C.wood); px(acc, 25, 20, C.red);
  }
  return { outfit, acc };
}

const OUT = join(process.cwd(), "public", "pet");
png(acorn(), join(OUT, "acorn.png"));
for (const mood of ["happy", "neutral", "sleepy", "sad", "blink"]) png(face(mood), join(OUT, "face", `${mood}.png`));
for (const [name, s] of Object.entries(STAGES)) {
  png(head(s), join(OUT, name, "head.png"));
  png(body(s), join(OUT, name, "body.png"));
  png(tail(s), join(OUT, name, "tail.png"));
  png(hand(), join(OUT, name, "hand.png"));
  for (const c of ["barbarian", "fighter", "wizard", "cleric", "bard", "ranger"]) {
    const { outfit, acc } = cls(c);
    png(outfit, join(OUT, "class", c, name, "outfit.png"));
    png(acc, join(OUT, "class", c, name, "accessory.png"));
  }
}
console.log("public/pet generado");
