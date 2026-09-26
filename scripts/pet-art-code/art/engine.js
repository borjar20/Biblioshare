// Motor de pixel art: todo se dibuja por código, sin IA ni imágenes de entrada.
// Formas vectoriales -> máscara -> relleno con rampa de 4 tonos (sombreado por luz
// arriba-izquierda) -> contorno selectivo. Una sola paleta maestra para todo.
(function (ART) {
  "use strict";
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

  // Paleta maestra (48 colores). Toda rampa sale de aquí: sprites, fondos, UI.
  const P = {
    ink: "#1c1220", ink2: "#2e1f2c",
    fur0: "#4a2216", fur1: "#8a3b1e", fur2: "#c2622b", fur3: "#e89a4f",
    cream0: "#a8765a", cream1: "#e0b98a", cream2: "#f6e2bd", cream3: "#fff6e0",
    grey0: "#6b6272", grey1: "#9a93a0", grey2: "#cfc8cf",
    blue0: "#1d2a5c", blue1: "#2c4a9a", blue2: "#4a78d0", blue3: "#8fb6ee",
    purp0: "#3b1d5a", purp1: "#6c35a8", purp2: "#a86be0", purp3: "#e2b8ff",
    red0: "#5a1420", red1: "#9c2232", red2: "#d8423e", red3: "#f78a6a",
    gold0: "#6e4a12", gold1: "#b07a1c", gold2: "#e8b83a", gold3: "#fff08a",
    steel0: "#2c3444", steel1: "#56627a", steel2: "#98a6ba", steel3: "#e4ecf4",
    wood0: "#3a2012", wood1: "#633a1e", wood2: "#94602e", wood3: "#c8904a",
    leaf0: "#132a1e", leaf1: "#1f4a2a", leaf2: "#357a36", leaf3: "#6cb04a", leaf4: "#b4dc6a",
    moss0: "#243320", moss1: "#3c5a2a", moss2: "#6a8a3a",
    teal0: "#0f2428", teal1: "#1b4040", teal2: "#2e6a5e", teal3: "#5aa08a",
    sky0: "#9ad0c0", sky1: "#dff0c8", white: "#ffffff",
    rose1: "#c85a8a", rose2: "#f0a0c0",
    water1: "#3a8ab0", water2: "#7cd0e0", water3: "#d8f8ff",
  };
  const C = {}; for (const k in P) C[k] = hex(P[k]);

  // Rampas: [oscuro, sombra, base, luz]
  const R = {
    fur: [C.fur0, C.fur1, C.fur2, C.fur3],
    furV: [C.fur0, C.fur1, "#b25a2e", "#d68a52"].map((c) => (typeof c === "string" ? hex(c) : c)),
    cream: [C.cream0, C.cream1, C.cream2, C.cream3],
    grey: [C.grey0, C.grey0, C.grey1, C.grey2],
    blue: [C.blue0, C.blue1, C.blue2, C.blue3],
    purp: [C.purp0, C.purp1, C.purp2, C.purp3],
    red: [C.red0, C.red1, C.red2, C.red3],
    gold: [C.gold0, C.gold1, C.gold2, C.gold3],
    steel: [C.steel0, C.steel1, C.steel2, C.steel3],
    wood: [C.wood0, C.wood1, C.wood2, C.wood3],
    leaf: [C.leaf0, C.leaf1, C.leaf2, C.leaf3],
    leafL: [C.leaf1, C.leaf2, C.leaf3, C.leaf4],
    white: [C.grey1, C.grey2, C.cream3, C.white],
    moss: [C.moss0, C.moss1, C.moss2, C.leaf3],
    teal: [C.teal0, C.teal1, C.teal2, C.teal3],
    ink: [C.ink, C.ink, C.ink2, C.ink2],
    rose: [C.red1, C.rose1, C.rose2, C.cream3],
  };

  class Px {
    constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); this.tag = new Int16Array(w * h); }
    inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    set(x, y, c, tag) {
      x |= 0; y |= 0; if (!this.inb(x, y) || !c) return;
      const i = (y * this.w + x) * 4, a = c[3] === undefined ? 255 : c[3];
      if (a >= 255) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; }
      else { const k = a / 255; for (let j = 0; j < 3; j++) this.d[i + j] = this.d[i + j] * (1 - k) + c[j] * k; this.d[i + 3] = Math.max(this.d[i + 3], a); }
      if (tag !== undefined) this.tag[y * this.w + x] = tag;
    }
    get(x, y) { if (!this.inb(x, y)) return null; const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
    alpha(x, y) { return this.inb(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
    clear() { this.d.fill(0); this.tag.fill(0); }
    blit(src, ox, oy, opt = {}) {
      for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
        const sx = opt.flip ? src.w - 1 - x : x;
        const c = src.get(sx, y); if (c[3] === 0) continue;
        this.set(ox + x, oy + y, opt.tint ? mix(c, opt.tint, opt.tintK || 0.5) : c);
      }
    }
  }
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] === undefined ? 255 : a[3]];

  // ---- Máscaras: funciones (x,y)->bool en coordenadas de centro de píxel ----
  const M = {
    ell: (cx, cy, rx, ry, rot = 0) => { const c = Math.cos(rot), s = Math.sin(rot); return (x, y) => { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; const u = dx * c + dy * s, v = -dx * s + dy * c; return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1; }; },
    circ: (cx, cy, r) => M.ell(cx, cy, r, r),
    rect: (x0, y0, w, h) => (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h,
    // cápsula entre dos puntos (radio r0 -> r1)
    cap: (x0, y0, x1, y1, r0, r1 = r0) => (x, y) => {
      const px = x + 0.5, py = y + 0.5, vx = x1 - x0, vy = y1 - y0, L = vx * vx + vy * vy || 1;
      let t = ((px - x0) * vx + (py - y0) * vy) / L; t = Math.max(0, Math.min(1, t));
      const qx = x0 + vx * t - px, qy = y0 + vy * t - py, r = r0 + (r1 - r0) * t; return qx * qx + qy * qy <= r * r;
    },
    poly: (pts) => (x, y) => {
      const px = x + 0.5, py = y + 0.5; let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    },
    or: (...ms) => (x, y) => ms.some((m) => m(x, y)),
    and: (a, b) => (x, y) => a(x, y) && b(x, y),
    not: (a, b) => (x, y) => a(x, y) && !b(x, y),
    // tubo a lo largo de una polilínea con radios por punto
    tube: (pts) => { const segs = []; for (let i = 0; i < pts.length - 1; i++) segs.push(M.cap(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i][2], pts[i + 1][2])); return M.or(...segs); },
  };

  // Rota un punto (x,y) alrededor de (ox,oy)
  const rot = (x, y, ox, oy, a) => { const c = Math.cos(a), s = Math.sin(a); return [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]; };

  let TAGN = 1;
  // Rellena una máscara con una rampa, sombreado por luz arriba-izquierda.
  // opt.edge: separa con una línea oscura de lo que ya había debajo (contorno interior)
  // opt.flat: sin sombreado; opt.dither: sombra con tramado 50%
  function fill(px, mask, ramp, opt = {}) {
    const tag = TAGN++;
    const x0 = Math.max(0, opt.x0 || 0), y0 = Math.max(0, opt.y0 || 0), x1 = Math.min(px.w, opt.x1 || px.w), y1 = Math.min(px.h, opt.y1 || px.h);
    const lx = opt.lx || -1, ly = opt.ly || -1, sd = opt.sd || 2;
    const cells = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (mask(x, y)) cells.push([x, y]);
    const out = [];
    for (const [x, y] of cells) {
      let c = ramp[2];
      if (!opt.flat) {
        const lit = !mask(x + lx, y + ly) || (opt.wideLight && !mask(x + lx * 2, y + ly * 2));
        const sh = !mask(x - lx * sd, y - ly * sd) || !mask(x - lx * sd, y) || !mask(x, y - ly * sd);
        const deep = !mask(x - lx, y - ly) && !mask(x - lx, y);
        if (sh) c = (opt.dither && (x + y) % 2) ? ramp[2] : ramp[1];
        if (deep && ramp[0] && opt.deep) c = ramp[0];
        if (lit && !sh) c = ramp[3];
      }
      let isEdge = false;
      if (opt.edge) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!mask(nx, ny) && px.alpha(nx, ny) > 0 && px.tag[ny * px.w + nx] !== tag) { isEdge = true; break; }
        }
      }
      out.push([x, y, isEdge ? (opt.edgeC || ramp[0]) : c]);
    }
    for (const [x, y, c] of out) px.set(x, y, c, tag);
    return tag;
  }
  const dot = (px, x, y, c) => px.set(x, y, c, 0);
  function line(px, x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { px.set(x0, y0, c, 0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }

  // Contorno selectivo: el borde exterior toma el tono más oscuro del vecino, no negro plano.
  function outline(px, opt = {}) {
    const add = [];
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      if (px.alpha(x, y) > 0) continue;
      let n = null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (px.alpha(x + dx, y + dy) > 200) { n = px.get(x + dx, y + dy); break; } }
      if (n) add.push([x, y, opt.color || mix(mix(n, C.ink, 0.72), C.ink, 0.2)]);
    }
    for (const [x, y, c] of add) px.set(x, y, c, 0);
  }

  // Rota un sprite 90° (sin pérdida) — para caídas/KO
  function rot90(px, dir = 1) {
    const o = new Px(px.h, px.w);
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) { const c = px.get(x, y); if (!c[3]) continue; if (dir > 0) o.set(px.h - 1 - y, x, c); else o.set(y, px.w - 1 - x, c); }
    return o;
  }

  // Tramado ordenado Bayer 4x4 para degradados
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

  // RNG determinista (mismo resultado siempre: reproducible sin guardar seeds de API)
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  // ruido de valor 2D suave
  function noise2(seed) {
    const r = rng(seed), T = new Float32Array(256 * 256); for (let i = 0; i < T.length; i++) T[i] = r();
    const g = (x, y) => T[((y & 255) << 8) | (x & 255)];
    return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return (g(xi, yi) * (1 - u) + g(xi + 1, yi) * u) * (1 - v) + (g(xi, yi + 1) * (1 - u) + g(xi + 1, yi + 1) * u) * v; };
  }

  Object.assign(ART, { P, C, R, Px, M, fill, dot, line, outline, rot, rot90, mix, hex, bayer, rng, noise2 });
})(typeof window !== "undefined" ? (window.ART = window.ART || {}) : (globalThis.ART = globalThis.ART || {}));
