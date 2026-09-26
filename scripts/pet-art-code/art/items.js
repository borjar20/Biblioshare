// Botín (6 objetos), efectos de combate (5 × 9 frames), insignias (11) y UI nine-slice.
(function (ART) {
  "use strict";
  const { C, R, Px, M, fill, dot, line, outline, mix, bayer } = ART;
  const TAU = Math.PI * 2;
  const S = 32;

  const LOOT = {
    sharp_bookmark() { const px = new Px(S, S);
      fill(px, M.poly([[11, 4], [21, 4], [21, 22], [16, 28], [11, 22]]), [C.red0, C.fur1, C.fur2, C.fur3], { deep: true });
      fill(px, M.poly([[13, 6], [19, 6], [19, 20], [16, 24], [13, 20]]), R.cream, {});
      for (const y of [9, 12, 15]) line(px, 14, y, 18, y, C.cream0);
      fill(px, M.tube([[16, 4, 1], [15, 1, 1.2], [18, 1, 1.2], [16, 4, 1]]), R.red, {});
      line(px, 17, 2, 22, 7, C.red2); line(px, 22, 7, 22, 12, C.red1); dot(px, 22, 13, C.red2); dot(px, 21, 13, C.red1); dot(px, 23, 13, C.red1);
      outline(px); return px; },
    heavy_ink_quill() { const px = new Px(S, S);
      fill(px, M.tube([[23, 4, 1.5], [21, 7, 4.5], [17, 12, 5], [13, 18, 3.5], [10, 22, 1.2]]), R.purp, { deep: true, dither: true });
      line(px, 23, 4, 9, 23, C.purp0);
      for (let k = 0; k < 4; k++) { dot(px, 20 - k * 3 + 3, 10 + k * 3, C.purp3); }
      fill(px, M.poly([[10, 21], [13, 24], [7, 29], [6, 28]]), R.gold, { edge: true });
      dot(px, 7, 28, C.ink); fill(px, M.ell(6, 30.5, 2, 1.3), [C.ink, C.ink, C.ink2, C.blue1], {}); dot(px, 5, 30, C.blue3);
      outline(px); return px; },
    librarian_loupe() { const px = new Px(S, S);
      fill(px, M.cap(18, 18, 27, 27, 2.2), R.wood, { deep: true });
      fill(px, M.circ(13, 13, 9), R.gold, { deep: true });
      fill(px, M.circ(13, 13, 6.5), [C.blue1, C.water1, C.water2, C.water3], { dither: true });
      line(px, 9, 11, 11, 9, C.white); dot(px, 9, 12, C.water3);
      fill(px, M.cap(19, 19, 21, 21, 2.6), R.gold, {});
      outline(px); return px; },
    last_page_amulet() { const px = new Px(S, S);
      for (let a = 0; a < 18; a++) { const q = Math.PI * (1.05 + a / 18 * 0.9); dot(px, 16 + Math.cos(q) * 9, 12 + Math.sin(q) * 9, a % 2 ? C.fur2 : C.fur3); }
      fill(px, M.poly([[8, 12], [24, 11], [25, 27], [9, 28]]), R.cream, { deep: true });
      fill(px, M.poly([[19, 11], [24, 11], [24, 16]]), [C.cream0, C.cream0, C.cream1, C.cream1], { flat: true });
      for (const y of [15, 18, 21]) line(px, 11, y, 20, y - 0.5, C.cream0);
      fill(px, M.circ(17, 24, 3.2), R.red, { deep: true }); dot(px, 16, 23, C.red3);
      outline(px); return px; },
    loan_pendant() { const px = new Px(S, S);
      for (let a = 0; a < 16; a++) { const q = Math.PI * (1.1 + a / 16 * 0.8); dot(px, 16 + Math.cos(q) * 7, 9 + Math.sin(q) * 7, a % 2 ? C.gold1 : C.gold2); }
      fill(px, M.poly([[9, 9], [23, 9], [25, 13], [25, 27], [7, 27], [7, 13]]), R.wood, { deep: true });
      fill(px, M.poly([[10, 11], [22, 11], [23, 14], [23, 25], [9, 25], [9, 14]]), R.gold, {});
      dot(px, 16, 12, C.ink); fill(px, M.circ(16, 19, 4), R.cream, {});
      line(px, 16, 19, 16, 16, C.ink); line(px, 16, 19, 18, 20, C.ink);
      outline(px); return px; },
    streak_medallion() { const px = new Px(S, S);
      fill(px, M.poly([[10, 2], [15, 2], [16, 10], [11, 10]]), R.red, {}); fill(px, M.poly([[17, 2], [22, 2], [21, 10], [16, 10]]), [C.red0, C.red1, C.red1, C.red2], {});
      fill(px, M.circ(16, 19, 10), [C.fur0, C.fur1, C.gold1, C.gold2], { deep: true });
      fill(px, M.circ(16, 19, 7.5), [C.gold0, C.gold1, C.gold1, C.gold2], {});
      fill(px, M.ell(16, 21, 3.2, 3.6), [C.gold0, C.gold1, C.gold2, C.gold3], {}); fill(px, M.and(M.ell(16, 18, 4, 2.4), M.rect(0, 0, S, 19)), [C.fur0, C.fur1, C.fur1, C.gold1], {});
      dot(px, 16, 15, C.gold0); dot(px, 10, 12, C.gold3); dot(px, 23, 13, C.gold3); dot(px, 24, 25, C.gold3);
      outline(px); return px; },
  };

  // Efectos: 9 frames de 32×32 generados como función del tiempo
  const FX = {
    damage(f) { const px = new Px(S, S), k = f / 8, r = 3 + k * 11, a = f < 7;
      if (!a) return px; for (let i = 0; i < 4; i++) { const q = i * TAU / 4 + 0.78; fill(px, M.poly([[16, 16], [16 + Math.cos(q - 0.35) * r * 0.45, 16 + Math.sin(q - 0.35) * r * 0.45], [16 + Math.cos(q) * r, 16 + Math.sin(q) * r], [16 + Math.cos(q + 0.35) * r * 0.45, 16 + Math.sin(q + 0.35) * r * 0.45]]), [C.fur1, C.fur2, C.gold2, C.gold3], { flat: true }); }
      fill(px, M.circ(16, 16, Math.max(1, 4 - k * 3)), R.cream, { flat: true }); return px; },
    shield(f) { const px = new Px(S, S), r = 6 + Math.min(f, 5) * 1.5, fade = f > 6;
      for (let a = 0; a < 64; a++) { const q = a / 64 * TAU; const x = 16 + Math.cos(q) * r, y = 16 + Math.sin(q) * r; if (fade && a % 2) continue; dot(px, x, y, C.water2); if (a % 4 === 0) dot(px, x - Math.cos(q), y - Math.sin(q), C.water3); }
      const q = f * 0.8; dot(px, 16 + Math.cos(q) * r, 16 + Math.sin(q) * r, C.gold3); dot(px, 16 - Math.cos(q) * r, 16 - Math.sin(q) * r, C.gold3); return px; },
    heal(f) { const px = new Px(S, S);
      for (let i = 0; i < 3; i++) { const q = i * TAU / 3 + f * 0.35, y = 18 - f * 1.2 + i; const x = 16 + Math.cos(q) * 8; fill(px, M.ell(x, y + Math.sin(q) * 3, 2.2, 1.3, q), R.leafL, { flat: false }); }
      const y = 17 - f * 0.6; if (f < 8) { line(px, 16, y - 3, 16, y + 3, C.gold3); line(px, 13, y, 19, y, C.gold3); dot(px, 16, y, C.cream3); } return px; },
    cooldown(f) { const px = new Px(S, S), q = -Math.PI / 2 + f / 8 * TAU;
      for (let a = 0; a < 40; a++) { const t = a / 40 * TAU; dot(px, 16 + Math.cos(t) * 10, 16 + Math.sin(t) * 10, t < (q + Math.PI / 2) ? C.gold2 : C.gold0); }
      line(px, 16, 16, 16 + Math.cos(q) * 8, 16 + Math.sin(q) * 8, C.gold3); dot(px, 16, 16, C.cream3); return px; },
    vulnerability(f) { const px = new Px(S, S), o = Math.min(f, 6) * 0.9;
      for (const s of [-1, 1]) { for (let a = 0; a < 14; a++) { const t = Math.PI / 2 + s * (0.3 + a / 14 * 2.4); dot(px, 16 + s * o + Math.cos(t) * 9, 16 + Math.sin(t) * 10, a % 3 ? C.rose1 : C.purp2); } }
      const k = f % 3 === 0 ? 3 : 2; line(px, 16, 16 - k, 16, 16 + k, C.cream3); line(px, 16 - k, 16, 16 + k, 16, C.cream3); return px; },
  };

  // Insignias: medallón común + pictograma propio por familia
  const BADGE_ICON = {
    finished(px) { fill(px, M.rect(10, 11, 12, 11), R.red, {}); fill(px, M.rect(11, 12, 10, 8), R.cream, { flat: true }); line(px, 12, 17, 15, 19, C.leaf2); line(px, 15, 19, 20, 13, C.leaf2); },
    sessions(px) { fill(px, M.poly([[9, 13], [16, 15], [16, 23], [9, 21]]), R.cream, {}); fill(px, M.poly([[16, 15], [23, 13], [23, 21], [16, 23]]), R.cream, {}); line(px, 16, 15, 16, 23, C.cream0); line(px, 18, 11, 18, 17, C.red2); },
    streak(px) { fill(px, M.tube([[16, 23, 4], [15, 17, 3], [17, 12, 1.2], [15, 9, 0.5]]), [C.red1, C.red2, C.gold2, C.gold3], {}); fill(px, M.ell(16, 21, 2, 2.5), [C.gold2, C.gold2, C.gold3, C.cream3], {}); },
    reviews(px) { const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 7, q = -Math.PI / 2 + i * TAU / 10; pts.push([16 + Math.cos(q) * r, 17 + Math.sin(q) * r]); } fill(px, M.poly(pts), R.gold, {}); },
    notes(px) { fill(px, M.rect(10, 9, 11, 14), R.cream, {}); for (const y of [12, 15, 18]) line(px, 12, y, 18, y, C.cream0); line(px, 23, 9, 15, 21, C.purp1); dot(px, 15, 22, C.ink); },
    posts(px) { fill(px, M.ell(16, 15, 7, 5), R.white, {}); fill(px, M.poly([[12, 18], [16, 19], [11, 23]]), R.white, { flat: true }); for (const x of [13, 16, 19]) dot(px, x, 15, C.blue1); },
    genres(px) { const cs = [R.red, R.blue, R.leafL, R.gold]; cs.forEach((c, i) => fill(px, M.rect(9 + i * 4, 10 + (i % 2) * 2, 3, 13 - (i % 2) * 2), c, {})); },
    sagas(px) { for (const [x, y] of [[12, 13], [20, 13], [16, 20]]) fill(px, M.circ(x, y, 3), R.gold, {}); line(px, 12, 13, 20, 13, C.gold0); line(px, 12, 13, 16, 20, C.gold0); line(px, 20, 13, 16, 20, C.gold0); },
    episodes(px) { fill(px, M.circ(16, 16, 7), R.purp, {}); fill(px, M.poly([[14, 12], [20, 16], [14, 20]]), R.cream, { flat: true }); },
    missions(px) { fill(px, M.poly([[12, 8], [13, 8], [13, 24], [12, 24]]), R.wood, { flat: true }); fill(px, M.poly([[13, 9], [22, 11], [13, 16]]), R.red, {}); },
    stage(px) { fill(px, M.ell(16, 18, 5, 5.5), R.fur, {}); fill(px, M.and(M.ell(16, 14, 6, 4), M.rect(0, 0, S, 16)), R.wood, {}); line(px, 16, 10, 17, 8, C.wood1); fill(px, M.ell(19, 9, 2, 1, -0.4), R.leafL, { flat: true }); },
  };
  function badge(fam, locked) {
    const px = new Px(S, S);
    fill(px, M.circ(16, 16, 14), R.wood, { deep: true });
    fill(px, M.circ(16, 16, 11.5), locked ? [C.ink, C.grey0, C.grey0, C.grey1] : [C.moss0, C.moss1, C.leaf1, C.moss2], { dither: true });
    BADGE_ICON[fam](px);
    outline(px);
    if (locked) for (let i = 0; i < px.d.length; i += 4) if (px.d[i + 3]) { const g = (px.d[i] + px.d[i + 1] + px.d[i + 2]) / 3; px.d[i] = px.d[i + 1] = px.d[i + 2] = g * 0.7; }
    return px;
  }

  // UI nine-slice: 24×24 (tile 8) — marcos generados, centro plano para repetir sin costuras
  function frame(kind) {
    const n = 24, px = new Px(n, n);
    const pal = { moss: [C.moss0, C.moss1, C.moss2, C.leaf3, C.moss0], wood: [C.wood0, C.wood1, C.wood2, C.wood3, C.wood1], parchment: [C.cream0, C.cream1, C.cream2, C.cream3, C.cream2] }[kind];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.min(x, y, n - 1 - x, n - 1 - y);
      let c = pal[4];
      if (d === 0) c = C.ink; else if (d === 1) c = (x + y) % 5 ? pal[3] : pal[2]; else if (d === 2) c = pal[2]; else if (d === 3) c = pal[1]; else if (d === 4) c = pal[0];
      if (kind === "moss" && d <= 2 && ((x * 7 + y * 3) % 11 === 0)) c = C.leaf4;
      if (kind === "wood" && d >= 1 && d <= 3 && (x % 6 === 0 || y % 6 === 0) && d !== 1) c = pal[1];
      px.set(x, y, c);
    }
    if (kind === "wood") for (const [x, y] of [[4, 4], [n - 5, 4], [4, n - 5], [n - 5, n - 5]]) { dot(px, x, y, C.steel2); dot(px, x + 1, y + 1, C.steel0); dot(px, x, y + 1, C.steel1); }
    if (kind === "parchment") for (const [x, y] of [[2, 2], [n - 3, 2], [2, n - 3], [n - 3, n - 3]]) dot(px, x, y, C.red1);
    return px;
  }
  function plank(state) { // 48×16, nine-slice 6
    const w = 48, h = 16, px = new Px(w, h), off = state === "pressed" ? 1 : 0;
    const ramp = state === "hover" ? [C.wood1, C.wood2, C.wood3, C.gold2] : [C.wood0, C.wood1, C.wood2, C.wood3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      let c = e ? C.ink : y === 1 + off ? ramp[3] : y >= h - 3 + off ? ramp[0] : ramp[2];
      if (state === "pressed" && y === 1) c = ramp[0];
      if (!e && (y === 6 || y === 11) && (x * 13) % 7) c = ramp[1];
      px.set(x, y, c);
    }
    for (const x of [3, w - 4]) { dot(px, x, 4 + off, C.steel2); dot(px, x, h - 5 + off, C.steel2); }
    return px;
  }

  Object.assign(ART, { LOOT, FX, BADGE_ICON, badge, frame, plank });
})(typeof window !== "undefined" ? window.ART : globalThis.ART);
