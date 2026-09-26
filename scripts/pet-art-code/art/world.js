// Fondos procedurales (cualquier tamaño/aspecto, animados, con hora del día) y enemigos.
(function (ART) {
  "use strict";
  const { C, R, Px, M, fill, dot, line, outline, rot90, mix, bayer, rng, noise2 } = ART;
  const TAU = Math.PI * 2;

  // degradado con tramado entre colores de la paleta
  function ditherPick(cols, v, x, y) { v = Math.max(0, Math.min(0.9999, v)) * (cols.length - 1); const i = Math.floor(v), f = v - i; return f > bayer(x, y) ? cols[Math.min(i + 1, cols.length - 1)] : cols[i]; }

  function canopy(px, cx, cy, r, ramp, n, sq = 1) {
    const x0 = Math.floor(cx - r * 1.4), x1 = Math.ceil(cx + r * 1.4), y0 = Math.floor(cy - r * 1.4 * sq), y1 = Math.ceil(cy + r * 1.4 * sq);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!px.inb(x, y)) continue;
      const dx = (x - cx) / r, dy = (y - cy) / (r * sq), d = Math.hypot(dx, dy);
      const nn = n(x * 0.18, y * 0.18), nb = n(x * 0.5 + 40, y * 0.5);
      if (d + (nn - 0.5) * 0.55 + (nb - 0.5) * 0.25 > 1) continue;
      const v = 0.55 - (dx + dy) * 0.32 + (nb - 0.5) * 0.5 - d * 0.15;
      px.set(x, y, ditherPick(ramp, v, x, y));
    }
  }
  function trunk(px, x, yTop, yBot, w0, w1, ramp, n, lean = 0) {
    for (let y = Math.max(0, yTop); y < Math.min(px.h, yBot); y++) {
      const t = (y - yTop) / (yBot - yTop), w = w0 + (w1 - w0) * t * t * t, cx = x + lean * (1 - t);
      for (let xx = Math.floor(cx - w / 2); xx < cx + w / 2; xx++) {
        const u = (xx - (cx - w / 2)) / w; const bark = n(xx * 0.9, y * 0.08);
        let v = 0.85 - u * 0.9 + (bark - 0.5) * 0.5;
        px.set(xx, y, ditherPick(ramp, v, xx, y));
      }
    }
  }
  function root(px, pts, ramp) { fill(px, M.tube(pts), ramp, { deep: true, edge: true, sd: 3, x0: Math.min(...pts.map((p) => p[0])) - 8, x1: Math.max(...pts.map((p) => p[0])) + 8, y0: Math.min(...pts.map((p) => p[1])) - 8, y1: Math.max(...pts.map((p) => p[1])) + 8 }); }

  function ground(px, y0, n, ramp, clearing) {
    for (let y = y0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const nn = n(x * 0.06, y * 0.12), nb = n(x * 0.3, y * 0.6);
      let v = 0.35 + (nn - 0.5) * 0.8 + (y - y0) / (px.h - y0) * 0.1;
      if (clearing) { const dx = (x - clearing[0]) / clearing[2], dy = (y - clearing[1]) / clearing[3]; const d = dx * dx + dy * dy; if (d < 1) v += (1 - d) * 0.6; }
      v += (nb - 0.5) * 0.18;
      px.set(x, y, ditherPick(ramp, v, x, y));
    }
  }

  function mushroom(px, x, y, cap) { fill(px, M.rect(x - 1, y - 3, 2, 3), R.cream, { flat: true, x0: x - 3, x1: x + 3, y0: y - 6, y1: y + 1 }); fill(px, M.ell(x, y - 3.5, 3, 2), cap, { x0: x - 4, x1: x + 4, y0: y - 7, y1: y }); dot(px, x - 1, y - 4, C.cream3); }
  function flower(px, x, y, c) { dot(px, x, y, c); dot(px, x - 1, y, c); dot(px, x + 1, y, c); dot(px, x, y - 1, c); dot(px, x, y, C.gold2); dot(px, x, y + 1, C.leaf2); }

  // ---------- escenas ----------
  // Cada escena: build(w,h) -> {base Px, anim(px, t, tod)} ; tod: 0 día, 1 atardecer, 2 noche
  const SCENES = {};

  SCENES.camp = function (w, h) {
    const n = noise2(7), r = rng(11), base = new Px(w, h), gy = Math.round(h * 0.7);
    const sky = [C.teal1, C.teal2, C.teal3, C.sky0, C.sky1];
    for (let y = 0; y < gy; y++) for (let x = 0; x < w; x++) { const v = 1 - Math.abs(x - w * 0.42) / (w * 0.9) - y / (gy * 1.4); base.set(x, y, ditherPick(sky, v, x, y)); }
    // bosque lejano
    const far = [C.teal0, C.teal1, C.teal2, C.teal3];
    for (let i = 0; i < 14; i++) { const x = (i / 13) * w + (r() - 0.5) * 16; trunk(base, x, 0, gy + 4, 4 + r() * 4, 7 + r() * 5, [C.teal1, C.teal1, C.teal2, C.teal2], n); }
    for (let i = 0; i < 12; i++) canopy(base, (i / 11) * w + (r() - 0.5) * 20, gy * 0.18 + r() * gy * 0.25, 22 + r() * 10, far, n);
    // árboles medios
    const mid = [C.leaf0, C.leaf1, C.leaf2, C.leaf3];
    for (const fx of [0.06, 0.3, 0.9, 0.98]) trunk(base, fx * w, 0, gy + 8, 10, 16, R.wood.slice(0, 3).concat([C.wood2]), n, (r() - 0.5) * 6);
    ground(base, gy - 6, n, [C.moss0, C.moss1, C.moss2, C.leaf3, C.leaf4], [w * 0.45, h * 0.95, w * 0.45, h * 0.28]);
    // gran árbol-madriguera
    const tx = Math.round(w * 0.6), tw = Math.min(w * 0.3, 80);
    trunk(base, tx, 0, gy + 4, tw * 0.55, tw * 1.25, [C.wood0, C.wood1, C.wood2, C.wood3], n);
    for (const [dx, len, dip] of [[-0.42, 0.3, 4], [-0.2, 0.14, 8], [0.42, 0.28, 3], [0.22, 0.12, 9]]) {
      const sx = tx + dx * tw, sg = Math.sign(dx), L = len * w;
      root(base, [[sx, gy - 18, 9], [sx + sg * L * 0.25, gy - 8, 7], [sx + sg * L * 0.55, gy - 2 + dip * 0.3, 4.5], [sx + sg * L * 0.8, gy + dip * 0.6, 2.8], [sx + sg * L, gy + dip, 1.2]], [C.wood0, C.wood1, C.wood2, C.wood3]);
    }
    // puerta con estanterías
    const dw = Math.round(tw * 0.5), dh = Math.round(tw * 0.62), dx0 = tx - dw / 2, dy0 = gy - dh;
    const door = M.or(M.rect(dx0, dy0 + dw / 2, dw, dh - dw / 2), M.ell(tx, dy0 + dw / 2, dw / 2, dw / 2));
    fill(base, M.not(M.or(M.rect(dx0 - 3, dy0 + dw / 2, dw + 6, dh - dw / 2), M.ell(tx, dy0 + dw / 2, dw / 2 + 3, dw / 2 + 3)), door), [C.wood0, C.wood1, C.wood2, C.wood3], { deep: true, x0: dx0 - 6, x1: dx0 + dw + 6, y0: dy0 - 6, y1: gy + 2 });
    fill(base, door, [C.ink, C.wood0, C.wood0, C.wood1], { flat: true, x0: dx0, x1: dx0 + dw, y0: dy0, y1: gy });
    const bookC = [C.red1, C.blue1, C.leaf2, C.gold1, C.purp1, C.red2, C.teal2, C.cream1];
    for (let sy = dy0 + 6; sy < gy - 3; sy += 8) {
      for (let x = dx0 + 1; x < dx0 + dw - 1; x++) if (door(x, sy)) dot(base, x, sy, C.wood2);
      for (let x = dx0 + 2; x < dx0 + dw - 2;) { const bw = 1 + ((r() * 2) | 0), bh = 4 + ((r() * 3) | 0), c = bookC[(r() * bookC.length) | 0];
        for (let k = 0; k < bw; k++) for (let j = 1; j <= bh && j < 8; j++) if (door(x + k, sy - j)) dot(base, x + k, sy - j, j === bh ? mix(c, C.white, 0.3) : c);
        x += bw + (r() < 0.2 ? 1 : 0); }
    }
    // copa enorme
    const cr = [C.leaf0, C.leaf1, C.leaf2, C.leaf3, C.leaf4];
    for (let i = 0; i < 9; i++) canopy(base, tx + (r() - 0.5) * w * 0.7, h * 0.02 + r() * h * 0.2, 26 + r() * 16, cr, n, 0.7);
    for (let i = 0; i < 5; i++) canopy(base, (i < 2 ? 0 : w) + (r() - 0.5) * 30, h * 0.1 + r() * h * 0.3, 20 + r() * 10, mid, n, 0.8);
    // setas, flores, piedras
    for (let i = 0; i < 6; i++) mushroom(base, tx + (r() - 0.5) * tw * 1.6, gy + r() * 6, i % 2 ? R.red : [C.wood1, C.wood2, C.cream1, C.cream2]);
    for (let i = 0; i < 40; i++) flower(base, r() * w, gy + 4 + r() * (h - gy - 6), [C.cream3, C.rose2, C.gold3][i % 3]);
    // arbustos del primer plano
    for (const [bx, by] of [[0, h], [w * 0.12, h + 6], [w, h], [w * 0.88, h + 8]]) canopy(base, bx, by, 26, [C.leaf0, C.leaf0, C.leaf1, C.leaf2, C.leaf3], n, 0.7);
    const lant = [Math.round(dx0 + dw + 6), dy0 + dw / 2];
    const emit = (px, t, tod) => {
      // farol colgante
      const [lx, ly] = lant; line(px, lx, ly - 8, lx, ly - 3, C.ink);
      fill(px, M.rect(lx - 2, ly - 3, 5, 6), [C.ink, C.ink, C.ink2, C.ink2], { flat: true, x0: lx - 3, x1: lx + 4, y0: ly - 4, y1: ly + 4 });
      const fl = 0.8 + 0.2 * Math.sin(t * 9) + 0.1 * Math.sin(t * 23);
      fill(px, M.rect(lx - 1, ly - 2, 3, 4), [C.gold2, C.gold2, fl > 0.85 ? C.gold3 : C.gold2, C.cream3], { flat: true, x0: lx - 2, x1: lx + 3, y0: ly - 3, y1: ly + 3 });
      glow(px, lx, ly, (tod === 2 ? 30 : 16) * fl, C.gold2, tod === 2 ? 0.5 : 0.25);
      if (tod === 2) glow(px, tx, gy - dh * 0.4, dw * 0.8, C.gold1, 0.18); // luz de la madriguera
    };
    return { base, emit, rays: true, motes: 14, groundY: gy, spot: [w * 0.4, gy + (h - gy) * 0.45] };
  };

  SCENES.battle = function (w, h) {
    const n = noise2(23), r = rng(5), base = new Px(w, h), gy = Math.round(h * 0.62);
    const sky = [C.teal1, C.teal2, C.teal3, C.sky0, C.sky1];
    for (let y = 0; y < gy; y++) for (let x = 0; x < w; x++) { const v = 1.05 - Math.abs(x - w * 0.5) / (w * 0.55) - y / (gy * 1.1); base.set(x, y, ditherPick(sky, v, x, y)); }
    const far = [C.teal0, C.teal1, C.teal2, C.teal3];
    for (let i = 0; i < 10; i++) trunk(base, w * 0.2 + (i / 9) * w * 0.6, 0, gy, 3 + r() * 3, 6 + r() * 3, [C.teal1, C.teal1, C.teal2, C.teal3], n);
    for (let i = 0; i < 9; i++) canopy(base, w * 0.15 + (i / 8) * w * 0.7, gy * 0.25 + r() * 20, 18 + r() * 8, far, n);
    // rocas y cascada
    const cx = w * 0.5, wy = gy - 26;
    for (const [dx, dy, rr] of [[-18, 4, 11], [16, 2, 12], [-28, 14, 9], [27, 14, 9], [0, -14, 10]]) fill(base, M.ell(cx + dx, wy + dy + 12, rr, rr * 0.8), [C.teal0, C.grey0, C.grey1, C.grey2], { deep: true, dither: true, x0: cx + dx - rr - 1, x1: cx + dx + rr + 1, y0: wy + dy - rr, y1: wy + dy + rr + 14 });
    fill(base, M.ell(cx, gy + 2, 30, 6), [C.water1, C.water1, C.water2, C.water3], { x0: cx - 32, x1: cx + 32, y0: gy - 6, y1: gy + 10 });
    ground(base, gy, n, [C.moss0, C.moss1, C.moss2, C.leaf3, C.leaf4], [w * 0.5, h * 0.8, w * 0.45, h * 0.28]);
    fill(base, M.ell(cx, gy + 3, 30, 5), [C.water1, C.water1, C.water2, C.water3], { x0: cx - 32, x1: cx + 32, y0: gy - 3, y1: gy + 10 });
    // arco de árboles
    trunk(base, w * 0.05, 0, gy + 30, 22, 38, [C.wood0, C.wood1, C.wood2, C.moss1], n, 10);
    trunk(base, w * 0.95, 0, gy + 30, 22, 38, [C.wood0, C.wood1, C.wood2, C.moss1], n, -10);
    trunk(base, w * 0.2, 0, gy + 2, 8, 12, [C.wood0, C.wood1, C.wood2, C.moss1], n, 4);
    trunk(base, w * 0.8, 0, gy + 2, 8, 12, [C.wood0, C.wood1, C.wood2, C.moss1], n, -4);
    for (const [x, sg] of [[w * 0.05, 1], [w * 0.95, -1]]) for (const [L, dy] of [[0.18, 0], [0.1, 10]]) root(base, [[x, gy + 14 + dy, 10], [x + sg * L * w * 0.4, gy + 22 + dy, 6], [x + sg * L * w * 0.75, gy + 28 + dy, 3.5], [x + sg * L * w, gy + 34 + dy, 1.2]], [C.wood0, C.wood1, C.wood2, C.moss2]);
    const cr = [C.leaf0, C.leaf1, C.leaf2, C.leaf3, C.leaf4];
    for (let i = 0; i < 10; i++) { const side = i % 2 ? 0.1 : 0.9; canopy(base, side * w + (r() - 0.5) * w * 0.3, r() * h * 0.22, 24 + r() * 14, cr, n, 0.7); }
    for (let i = 0; i < 4; i++) canopy(base, w * 0.35 + r() * w * 0.3, -4 + r() * 10, 20 + r() * 6, cr, n, 0.5);
    for (let i = 0; i < 8; i++) mushroom(base, (i % 2 ? w * 0.08 : w * 0.92) + (r() - 0.5) * 30, gy + 16 + r() * 20, [C.wood1, C.wood2, C.cream1, C.cream2]);
    for (let i = 0; i < 30; i++) flower(base, r() * w, gy + 6 + r() * (h - gy - 8), i % 2 ? C.cream3 : C.white);
    for (let i = 0; i < 5; i++) fill(base, M.ell(w * (0.2 + r() * 0.6), gy + 14 + r() * (h - gy - 20), 8 + r() * 6, 2.5), [C.moss1, C.moss2, C.leaf3, C.leaf4], { flat: false });
    const emit = (px, t, tod) => {
      // cascada animada
      for (let y = wy - 22; y < gy; y++) for (let x = cx - 4; x <= cx + 4; x++) { const k = (y * 2 - Math.floor(t * 30) + (x * 5) % 7) % 9; px.set(x, y, k < 2 ? C.water3 : k < 5 ? C.water2 : C.water1); }
      for (let i = 0; i < 6; i++) { const a = (t * 2 + i / 6) % 1; const rx = cx + (i - 2.5) * 5 * (0.5 + a); dot(px, rx, gy + 1 + a * 3, C.water3); }
      if (tod === 2) for (let i = 0; i < 12; i++) { const x = (i * 37 + Math.sin(t + i) * 6) % w, y = gy + 20 + ((i * 53) % (h - gy - 24)); glow(px, x, y, 6, C.teal3, 0.3); }
    };
    return { base, emit, rays: true, motes: 10, groundY: gy, spot: [w * 0.5, h * 0.82] };
  };

  SCENES.gathering = function (w, h) {
    const n = noise2(41), r = rng(3), base = new Px(w, h), gy = Math.round(h * 0.6);
    const sky = [C.ink, C.blue0, C.teal0, C.teal1];
    for (let y = 0; y < gy; y++) for (let x = 0; x < w; x++) { const v = 0.9 - y / gy * 0.8 - Math.abs(x - w / 2) / w * 0.3; base.set(x, y, ditherPick(sky, v, x, y)); }
    for (let i = 0; i < 40; i++) dot(base, r() * w, r() * gy * 0.5, i % 5 ? C.grey2 : C.cream3);
    const far = [C.ink, C.teal0, C.teal0, C.teal1];
    for (let i = 0; i < 16; i++) canopy(base, (i / 15) * w, gy * 0.55 + r() * 20, 18 + r() * 8, far, n);
    for (let i = 0; i < 12; i++) trunk(base, (i / 11) * w + (r() - 0.5) * 10, gy * 0.4, gy + 2, 3, 5, [C.ink, C.teal0, C.teal0, C.teal1], n);
    ground(base, gy - 2, n, [C.ink, C.moss0, C.moss0, C.moss1, C.moss2], [w * 0.5, h * 0.8, w * 0.42, h * 0.25]);
    // troncos para sentarse y piedras de la hoguera
    const fx0 = w * 0.5, fy = h * 0.8;
    for (const [dx, dy, lw] of [[-0.3, -0.02, 30], [0.3, -0.02, 30], [0, -0.14, 34]]) { const x = fx0 + dx * w, y = fy + dy * h; fill(base, M.cap(x - lw / 2, y, x + lw / 2, y, 4.5), R.wood, { deep: true, x0: x - lw, x1: x + lw, y0: y - 8, y1: y + 8 }); fill(base, M.ell(x - lw / 2, y, 2, 4), [C.wood1, C.wood2, C.wood3, C.cream1], { x0: x - lw, x1: x, y0: y - 6, y1: y + 6 }); }
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; fill(base, M.ell(fx0 + Math.cos(a) * 12, fy + 6 + Math.sin(a) * 4, 3, 2.2), [C.ink, C.grey0, C.grey1, C.grey2], { x0: fx0 - 20, x1: fx0 + 20, y0: fy - 4, y1: fy + 16 }); }
    for (const [x, y] of [[fx0 - 6, fy + 5], [fx0 + 6, fy + 5]]) fill(base, M.cap(x - 5, y + 2, x + 5, y - 2, 1.8), R.wood, { x0: x - 8, x1: x + 8, y0: y - 6, y1: y + 6 });
    for (const bx of [-10, w + 10]) canopy(base, bx, h * 0.55, 34, [C.ink, C.leaf0, C.leaf0, C.leaf1], n, 1.4);
    const emit = (px, t) => {
      // hoguera animada: llamas a partir de ruido desplazado en el tiempo
      const nf = noise2(99);
      for (let y = fy - 18; y < fy + 4; y++) for (let x = fx0 - 7; x <= fx0 + 7; x++) {
        const u = (x - fx0) / 7, v = (fy + 4 - y) / 22; const q = nf(x * 0.5, y * 0.35 + t * 9) * 0.9 + 0.35 - v - Math.abs(u) * (0.6 + v);
        if (q > 0.05) px.set(x, y, q > 0.45 ? C.cream3 : q > 0.3 ? C.gold3 : q > 0.15 ? C.gold2 : C.red2);
      }
      glow(px, fx0, fy - 4, 46 + Math.sin(t * 11) * 3, C.gold1, 0.28);
      for (let i = 0; i < 5; i++) { const a = (t * 0.7 + i / 5) % 1; dot(px, fx0 + Math.sin(i * 3 + t * 4) * 5 * a, fy - 12 - a * 30, a < 0.6 ? C.gold3 : C.red3); }
    };
    return { base, emit, rays: false, motes: 0, fireflies: 14, groundY: gy, spot: [fx0 - w * 0.3, fy - 4], night: true };
  };

  function glow(px, cx, cy, r, c, k) {
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (!px.inb(x, y)) continue; const d = Math.hypot(x - cx, y - cy) / r; if (d >= 1) continue;
      // luz por bandas tramadas (nada de degradado suave: se mantiene "pixel")
      const lv = (1 - d) * k * 2.2; const band = lv > 0.6 ? 0.6 : lv > 0.3 ? 0.35 : lv > bayer(x, y) * 0.3 ? 0.15 : 0; if (!band) continue;
      const o = px.get(x, y); px.set(x, y, mix(o, c, band)); }
  }

  const TOD = [
    null,
    { mul: [1.05, 0.82, 0.7], add: [30, 6, 0] },   // atardecer
    { mul: [0.32, 0.42, 0.7], add: [4, 8, 26] },   // noche
  ];
  // Renderiza un frame de escena
  function renderScene(sc, t, tod, out) {
    const { base } = sc, w = base.w, h = base.h;
    out.d.set(base.d);
    // rayos de luz animados
    if (sc.rays && tod !== 2) for (let y = 0; y < sc.groundY + 10; y++) for (let x = 0; x < w; x++) {
      const k = ((x - y * 0.55 + t * 4) % 46 + 46) % 46; if (k > 9) continue;
      const a = (1 - y / (sc.groundY + 10)) * (k < 3 || k > 7 ? 0.5 : 1); if (a * 0.5 > bayer(x, y)) { const o = out.get(x, y); out.set(x, y, mix(o, C.sky1, 0.22)); }
    }
    const tint = sc.night ? null : TOD[tod];
    if (tint) for (let i = 0; i < out.d.length; i += 4) for (let j = 0; j < 3; j++) out.d[i + j] = out.d[i + j] * tint.mul[j] + tint.add[j];
    sc.emit(out, t, sc.night ? 2 : tod);
    // motas de polen (día) o luciérnagas (noche)
    const nm = tod === 2 || sc.night ? (sc.fireflies || 16) : sc.motes;
    for (let i = 0; i < nm; i++) {
      const sp = 0.15 + (i % 5) * 0.05, x = ((i * 97.3 + t * 6 * sp * 10 + Math.sin(t * sp * 3 + i) * 8) % w + w) % w, y = h * 0.25 + ((i * 61.7) % (h * 0.65)) + Math.sin(t * 1.3 + i * 2) * 5;
      if (tod === 2 || sc.night) { const on = Math.sin(t * 2 + i * 1.7) > -0.2; if (on) { glow(out, x, y, 5, C.leaf4, 0.35); dot(out, x, y, C.gold3); } }
      else if ((i + Math.floor(t * 3)) % 3) dot(out, x, y, C.cream3);
    }
    return out;
  }

  // ---------- enemigos ----------
  const ENEMY_ANIMS = { idle: 8, attack: 8, hurt: 6, ko: 8 };
  function epose(anim, f) {
    const p = { ox: 0, oy: 0, legs: f % 2, jaw: 0, flash: false, lie: 0, eye: "open", fx: [] };
    if (anim === "idle") { p.oy = [0, 0, 1, 1, 1, 1, 0, 0][f]; p.legs = (f >> 1) % 2; }
    if (anim === "attack") { p.ox = [0, 3, 4, -3, -6, -5, -2, 0][f] * -1; p.jaw = f >= 3 && f <= 5 ? 1 : 0; p.eye = f >= 2 && f <= 5 ? "angry" : "open"; if (f === 4) p.fx.push({ k: "hit", x: 60, y: 40, s: 1 }); }
    if (anim === "hurt") { p.ox = [0, -3, -4, -3, -1, 0][f]; p.flash = f === 0 || f === 2; p.eye = f <= 3 ? "x" : "open"; }
    if (anim === "ko") { p.ox = [0, -1, -2, -3, -3, -3, -3, -3][f]; p.eye = "x"; p.lie = f >= 3 ? 1 : 0; }
    return p;
  }
  // Escarabajo "caparazón": mira a la derecha (hacia la mascota)
  function beetle(anim, f) {
    const p = epose(anim, f), px = new Px(80, 80), x = 40 + p.ox, y = 48 + p.oy;
    // patas traseras
    for (let k = 0; k < 3; k++) { const lx = x - 10 + k * 9, dl = (k + p.legs) % 2 ? 1 : -1; fill(px, M.tube([[lx, y + 6, 1.4], [lx - 3 + dl, y + 12, 1.2], [lx - 1 + dl * 2, y + 17, 1]]), R.steel, { edge: true }); }
    // cuerpo
    fill(px, M.ell(x + 12, y + 2, 7, 6), [C.blue0, C.blue0, C.blue1, C.blue2], { edge: true });
    // cabeza + cuerno
    fill(px, M.tube([[x + 17, y, 3], [x + 23, y - 5 - p.jaw * 2, 2.2], [x + 24, y - 12 - p.jaw * 3, 1.4], [x + 21, y - 15 - p.jaw * 3, 0.8]]), R.gold, { edge: true, deep: true });
    fill(px, M.ell(x + 17, y + 3, 5, 4.5), R.blue, { edge: true });
    dot(px, x + 19, y + 1, p.eye === "x" ? C.ink : C.gold3); dot(px, x + 20, y + 1, p.eye === "angry" ? C.red2 : C.ink); if (p.eye === "angry") dot(px, x + 19, y, C.red2);
    // élitros
    const shell = M.ell(x - 1, y - 2, 17, 13, -0.08);
    fill(px, shell, [C.blue0, C.blue1, C.blue2, C.blue3], { edge: true, deep: true, dither: true, wideLight: true });
    line(px, x + 1, y - 14, x - 3, y + 10, C.blue0); line(px, x + 2, y - 14, x - 2, y + 10, C.gold1);
    for (const [a, b] of [[-9, -6], [-11, 0], [6, -9], [9, -3]]) { dot(px, x + a, y + b, C.blue3); dot(px, x + a + 1, y + b - 1, C.steel3); }
    // borde dorado del caparazón
    for (let yy = 0; yy < 80; yy++) for (let xx = 0; xx < 80; xx++) if (shell(xx, yy) && !shell(xx, yy + 2) && px.get(xx, yy)[3]) dot(px, xx, yy, C.gold1);
    for (let k = 0; k < 3; k++) { const lx = x - 6 + k * 9, dl = (k + p.legs + 1) % 2 ? 1 : -1; fill(px, M.tube([[lx, y + 8, 1.6], [lx + 2 + dl, y + 13, 1.3], [lx + 1 + dl * 2, y + 18, 1.1]]), R.steel, { edge: true }); }
    return finishEnemy(px, p, true);
  }
  // "Brote": criatura-planta
  function sprout(anim, f) {
    const p = epose(anim, f), px = new Px(80, 80), x = 40 + p.ox, y = 42 + p.oy;
    const sw = Math.sin(f / 8 * TAU) * 1.2;
    // piernas-raíz
    fill(px, M.tube([[x - 3, y + 14, 3], [x - 5 - p.legs, y + 22, 2.4], [x - 7 - p.legs, y + 25, 1.5]]), R.wood, { edge: true });
    fill(px, M.tube([[x + 3, y + 14, 3], [x + 4 + p.legs, y + 22, 2.4], [x + 6 + p.legs, y + 25, 1.5]]), R.wood, { edge: true });
    // cuerpo de corteza
    fill(px, M.ell(x, y + 6, 9, 11), [C.wood0, C.wood1, C.wood2, C.wood3], { edge: true, deep: true, dither: true });
    for (let k = 0; k < 4; k++) line(px, x - 5 + k * 3, y + 2 + (k % 2) * 2, x - 5 + k * 3, y + 12 + (k % 2), C.wood1);
    // brazos-rama
    const ar = p.jaw ? -8 : 0;
    fill(px, M.tube([[x + 7, y + 4, 2.2], [x + 13, y + 6 + ar, 1.8], [x + 17 + (p.jaw ? 6 : 0), y + 4 + ar, 1.2]]), R.wood, { edge: true });
    // cara
    dot(px, x + 2, y + 1, C.ink); dot(px, x + 6, y + 1, C.ink); dot(px, x + 2, y, p.eye === "angry" ? C.red2 : C.leaf4); dot(px, x + 6, y, p.eye === "angry" ? C.red2 : C.leaf4);
    if (p.eye === "x") { dot(px, x + 1, y, C.ink); dot(px, x + 3, y + 2, C.ink); dot(px, x + 5, y, C.ink); dot(px, x + 7, y + 2, C.ink); }
    line(px, x + 3, y + 5, x + 6, y + 5, C.ink); if (p.jaw) { dot(px, x + 4, y + 6, C.red1); dot(px, x + 5, y + 6, C.red1); }
    // corona de hojas
    const L = (ang, len, ramp) => { const ex = x + Math.cos(ang) * len + sw, ey = y - 8 + Math.sin(ang) * len; fill(px, M.tube([[x, y - 6, 1.5], [(x + ex) / 2, (y - 8 + ey) / 2, 3.2], [ex, ey, 0.8]]), ramp, { edge: true }); };
    for (let k = 0; k < 7; k++) L(-Math.PI * (0.1 + k * 0.13), 13 + (k % 2) * 3, k % 2 ? R.leaf : R.leafL);
    dot(px, x - 6 + sw, y - 16, C.red2); dot(px, x + 7 + sw, y - 17, C.red2);
    return finishEnemy(px, p);
  }
  function finishEnemy(px, p, flipKo) {
    outline(px); let out = px;
    if (p.lie && flipKo) { out = new Px(80, 80); let maxY = 0; for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (px.alpha(x, y)) maxY = y;
      for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) { const c = px.get(x, y); if (c[3]) out.set(x, maxY - y + (maxY - 30), c); } }
    else if (p.lie) { const r = rot90(px, 1); out = new Px(80, 80); out.blit(r, 0, 10); }
    if (p.flash) for (let i = 0; i < out.d.length; i += 4) if (out.d[i + 3]) for (let j = 0; j < 3; j++) out.d[i + j] = 255 - ((255 - out.d[i + j]) >> 2);
    for (const e of p.fx) if (e.k === "hit") for (let k = 0; k < 8; k++) { const a = k * TAU / 8, r = 4; line(out, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, e.x + Math.cos(a) * (r + 3), e.y + Math.sin(a) * (r + 3), k % 2 ? C.gold3 : C.white); }
    return out;
  }

  Object.assign(ART, { SCENES, renderScene, ENEMY_ANIMS, ENEMIES: { caparazon: beetle, brote: sprout }, glow, ditherPick, canopy });
})(typeof window !== "undefined" ? window.ART : globalThis.ART);
