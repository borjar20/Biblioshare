// Insignias PROVISIONALES de los logros, 32×32, una por familia (spec
// logros-niveles §3). Mismos nombres que src/lib/pet/badges.ts; el arte IA
// curado las sustituye. `node scripts/pet-badges.mjs`
import { join } from "node:path";
import { writePng } from "./lib/png.mjs";

const W = 32, H = 32;
const C = {
  ink: "#2a231d", paper: "#fffdf8", gold: "#d8a83a", goldD: "#a87c22", red: "#a83a3a", redD: "#7a2626",
  blue: "#3f5f8a", blueD: "#2c4463", green: "#4f7a4a", greenD: "#37552f", purple: "#6a4c8a", purpleD: "#4a3360",
  steel: "#8a94a0", steelD: "#5c6670", wood: "#6b4a2b", acorn: "#8a5a2b", acornD: "#5e3d1c", orange: "#d97a4a", cream: "#f3dcc4",
};
const grid = () => Array.from({ length: H }, () => Array(W).fill(null));
const px = (g, x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c; };
const rect = (g, x0, y0, w, h, c) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(g, x, y, c); };
const circle = (g, cx, cy, r, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) g[y][x] = c; };
const ellipse = (g, cx, cy, rx, ry, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) g[y][x] = c; };
const line = (g, x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) px(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c); };
function tri(g, ax, ay, bx, by, cx, cy, c) {
  const s = (p1x, p1y, p2x, p2y, p3x, p3y) => (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d1 = s(x, y, ax, ay, bx, by), d2 = s(x, y, bx, by, cx, cy), d3 = s(x, y, cx, cy, ax, ay);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) g[y][x] = c;
  }
}
function outline(g) {
  const out = g.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx])) out[y][x] = C.ink;
  }
  return out;
}

const BADGES = {
  // libro cerrado
  finished: () => { const g = grid(); rect(g, 7, 6, 18, 22, C.red); rect(g, 7, 6, 4, 22, C.redD); rect(g, 12, 9, 11, 2, C.cream); rect(g, 12, 13, 11, 2, C.cream); return outline(g); },
  // reloj de arena
  sessions: () => { const g = grid(); rect(g, 8, 5, 16, 3, C.wood); rect(g, 8, 24, 16, 3, C.wood); tri(g, 9, 8, 23, 8, 16, 16, C.gold); tri(g, 9, 24, 23, 24, 16, 16, C.goldD); return outline(g); },
  // pantalla
  episodes: () => { const g = grid(); rect(g, 5, 7, 22, 15, C.steelD); rect(g, 7, 9, 18, 11, C.blue); rect(g, 13, 23, 6, 2, C.steel); rect(g, 10, 25, 12, 2, C.steelD); return outline(g); },
  // pluma
  notes: () => { const g = grid(); ellipse(g, 17, 12, 6, 9, C.purple); ellipse(g, 19, 10, 3, 6, C.paper); line(g, 15, 18, 8, 27, C.wood); line(g, 16, 18, 9, 27, C.wood); return outline(g); },
  // estrella
  reviews: () => { const g = grid(); tri(g, 16, 4, 6, 26, 26, 26, C.gold); tri(g, 16, 28, 6, 8, 26, 8, C.gold); circle(g, 16, 16, 3, C.goldD); return outline(g); },
  // brújula
  genres: () => { const g = grid(); circle(g, 16, 16, 12, C.paper); circle(g, 16, 16, 10, C.cream); tri(g, 16, 6, 13, 16, 19, 16, C.red); tri(g, 16, 26, 13, 16, 19, 16, C.steelD); circle(g, 16, 16, 2, C.ink); return outline(g); },
  // llama
  streak: () => { const g = grid(); ellipse(g, 16, 19, 8, 9, C.orange); tri(g, 16, 3, 9, 18, 23, 18, C.orange); ellipse(g, 16, 22, 4, 5, C.gold); return outline(g); },
  // bocadillo
  posts: () => { const g = grid(); ellipse(g, 16, 14, 12, 9, C.blue); tri(g, 9, 20, 15, 20, 8, 27, C.blue); rect(g, 10, 12, 12, 2, C.paper); rect(g, 10, 16, 8, 2, C.paper); return outline(g); },
  // cadena
  sagas: () => { const g = grid(); ellipse(g, 11, 16, 6, 4, C.steel); ellipse(g, 11, 16, 3, 1.5, null); ellipse(g, 21, 16, 6, 4, C.steel); ellipse(g, 21, 16, 3, 1.5, null); return outline(g); },
  // diana
  missions: () => { const g = grid(); circle(g, 16, 16, 12, C.red); circle(g, 16, 16, 9, C.paper); circle(g, 16, 16, 6, C.red); circle(g, 16, 16, 3, C.paper); return outline(g); },
  // bellota
  stage: () => { const g = grid(); ellipse(g, 16, 19, 7, 9, C.acorn); ellipse(g, 16, 11, 9, 4, C.acornD); rect(g, 15, 4, 2, 4, C.wood); return outline(g); },
};

const OUT = join(process.cwd(), "public", "pet", "badges");
for (const [name, draw] of Object.entries(BADGES)) writePng(draw(), W, H, join(OUT, `${name}.png`));
console.log(`public/pet/badges generado (${Object.keys(BADGES).length})`);
