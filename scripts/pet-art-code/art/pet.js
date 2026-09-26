// La mascota (ardilla) dibujada por código: 3 etapas × 6 clases × 7 animaciones.
// Todo frame sale de un "pose" (números), así que prenda y arma son idénticas en cada
// frame por construcción: no hay deriva entre frames ni re-rolls.
(function (ART) {
  "use strict";
  const { C, R, Px, M, fill, dot, line, outline, rot90, mix } = ART;
  const TAU = Math.PI * 2;

  const STAGES = {
    young: { hx: 28, hy: 34, hr: 12, bx: 30, by: 50, brx: 7.5, bry: 7.5, eye: 4, tier: 1, tailK: 0.78 },
    adult: { hx: 28, hy: 27, hr: 10.5, bx: 31, by: 45, brx: 9, bry: 11, eye: 3, tier: 2, tailK: 1 },
    veteran: { hx: 27, hy: 25, hr: 10.5, bx: 31, by: 43, brx: 10.5, bry: 13, eye: 3, tier: 3, tailK: 1.08 },
  };
  const CLASSES = ["barbarian", "fighter", "wizard", "cleric", "bard", "ranger"];
  const ANIMS = { idle: 8, sleepy: 8, sad: 8, joy: 9, attack: 8, hurt: 6, ko: 8 };

  // ---------- poses ----------
  function pose(anim, f) {
    const p = { ox: 0, oy: 0, head: 0, eyes: "open", ears: "up", tail: 0, arm: 0.5, weapon: -0.15, fx: [], flash: false, lie: 0, mouth: "smile" };
    const t = (f / (ANIMS[anim] || 8)) * TAU;
    if (anim === "idle") {
      p.head = [0, 0, 1, 1, 1, 1, 0, 0][f]; p.tail = Math.sin(t) * 0.07; p.eyes = f === 5 ? "closed" : "open";
      p.weapon = -0.15 + Math.sin(t) * 0.03;
    } else if (anim === "sleepy") {
      p.head = [2, 2, 3, 3, 3, 3, 2, 2][f]; p.eyes = "closed"; p.ears = "half"; p.tail = 0.12 + Math.sin(t) * 0.03; p.mouth = "o";
      p.arm = 0.25; p.weapon = 0.25;
      for (let k = 0; k < 3; k++) { const ph = (f + k * 3) % 8; p.fx.push({ k: "z", x: 40 + ph * 1.3 + k, y: 18 - ph * 1.6, s: ph > 4 ? 2 : 1, a: ph > 6 ? 0 : 1 }); }
    } else if (anim === "sad") {
      p.head = 2 + (f % 4 < 2 ? 0 : 1); p.eyes = "sad"; p.ears = "down"; p.tail = 0.28; p.mouth = "frown"; p.arm = 0.2; p.weapon = 0.35;
      p.fx.push({ k: "tear", x: 22, y: 30 + f * 2, a: f < 7 ? 1 : 0 });
    } else if (anim === "joy") {
      const jy = [0, -2, -4, -5, -6, -5, -4, -2, 0][f]; p.oy = jy; p.eyes = "happy"; p.mouth = "open"; p.arm = 2.3; p.weapon = -0.35;
      p.tail = -0.1 + Math.sin(t) * 0.1; p.squash = f === 0 || f === 8;
      if (f >= 2 && f <= 7) for (let k = 0; k < 4; k++) { const a = k * 1.6 + f * 0.5; p.fx.push({ k: "spark", x: 30 + Math.cos(a) * (16 + f), y: 30 + jy + Math.sin(a) * (14 + f), s: (f + k) % 3 }); }
    } else if (anim === "attack") {
      const ox = [0, 2, 3, -3, -5, -4, -2, 0][f]; p.ox = ox; p.head = [0, 1, 1, 0, 1, 1, 0, 0][f];
      p.arm = [0.5, 1.8, 2.4, 1.4, 0.9, 0.8, 0.6, 0.5][f]; p.weapon = [-0.15, 0.6, 0.9, -1.5, -2.2, -2.0, -0.9, -0.15][f]; p.mouth = f >= 3 && f <= 5 ? "open" : "smile";
      p.eyes = f >= 2 && f <= 5 ? "fierce" : "open";
      if (f === 3 || f === 4) p.fx.push({ k: "slash", x: 10, y: 34, s: f - 3 });
    } else if (anim === "hurt") {
      p.ox = [0, 3, 4, 3, 1, 0][f]; p.flash = f === 0 || f === 2; p.eyes = f <= 3 ? "x" : "open"; p.head = f <= 3 ? 1 : 0; p.ears = f <= 3 ? "down" : "up";
      p.arm = 0.1; p.weapon = 0.5; p.mouth = "frown"; p.tail = 0.2;
      if (f <= 2) p.fx.push({ k: "hit", x: 22, y: 30, s: f });
    } else if (anim === "ko") {
      p.eyes = "x"; p.ears = "down"; p.mouth = "frown"; p.arm = 0.2; p.weapon = 0.8; p.tail = 0.3;
      p.ox = [0, 1, 2, 3, 3, 3, 3, 3][f]; p.head = [1, 2, 3, 0, 0, 0, 0, 0][f]; p.lie = f >= 3 ? 1 : 0;
      if (f >= 4) for (let k = 0; k < 3; k++) { const a = f * 0.9 + k * 2.1; p.fx.push({ k: "star", x: 20 + Math.cos(a) * 7, y: 38 + Math.sin(a) * 2.5, s: k }); }
    }
    return p;
  }

  // ---------- piezas ----------
  function ears(px, s, p) {
    const { hx, hy, hr } = s; const top = hy - hr;
    const droop = p.ears === "down" ? 1 : p.ears === "half" ? 0.5 : 0;
    const ear = (cx, lean) => {
      const bx0 = cx - 3, bx1 = cx + 3, by = top + 4;
      const tipX = cx + lean + droop * 7 * Math.sign(lean || 1), tipY = top - 5 + droop * 7;
      fill(px, M.poly([[bx0, by], [bx1, by], [tipX, tipY]]), R.fur, { edge: true });
      fill(px, M.poly([[cx - 1.2, by], [cx + 1.5, by], [tipX * 0.7 + cx * 0.3, tipY * 0.6 + by * 0.4]]), [C.rose1, C.rose1, C.rose1, C.rose1], { flat: true });
      // mechón de la punta
      if (!droop) { dot(px, tipX, tipY - 1, C.fur1); dot(px, tipX + (lean > 0 ? 1 : -1), tipY - 2, C.fur0); }
    };
    ear(hx + 6, 2);   // oreja lejana
    ear(hx - 3, -2);  // oreja cercana
  }

  function eyes(px, s, p) {
    const { hx, hy, eye } = s; const ey = hy - 1;
    const E = [[hx - 6, eye], [hx + 2, eye - 1]];
    for (const [x, h] of E) {
      if (p.eyes === "open" || p.eyes === "fierce" || p.eyes === "sad") {
        for (let j = 0; j < h; j++) { dot(px, x, ey + j, C.ink); dot(px, x + 1, ey + j, C.ink); }
        dot(px, x, ey, C.white); if (h >= 4) dot(px, x + 1, ey + h - 1, C.ink2);
        if (p.eyes === "sad") { dot(px, x - 1, ey - 2, C.fur0); dot(px, x, ey - 3, C.fur0); dot(px, x + 1, ey - 3, C.fur0); }
        if (p.eyes === "fierce") { dot(px, x - 1, ey - 2, C.fur0); dot(px, x, ey - 2, C.fur0); dot(px, x + 1, ey - 1, C.fur0); dot(px, x + 2, ey - 1, C.fur0); }
      } else if (p.eyes === "closed") {
        dot(px, x - 1, ey + 1, C.ink); dot(px, x, ey + 2, C.ink); dot(px, x + 1, ey + 2, C.ink); dot(px, x + 2, ey + 1, C.ink);
      } else if (p.eyes === "happy") {
        dot(px, x - 1, ey + 2, C.ink); dot(px, x, ey + 1, C.ink); dot(px, x + 1, ey + 1, C.ink); dot(px, x + 2, ey + 2, C.ink);
      } else if (p.eyes === "x") {
        dot(px, x - 1, ey, C.ink); dot(px, x + 1, ey, C.ink); dot(px, x, ey + 1, C.ink); dot(px, x - 1, ey + 2, C.ink); dot(px, x + 1, ey + 2, C.ink);
      }
    }
    // rubor
    dot(px, hx - 8, hy + 3, C.rose1); dot(px, hx - 7, hy + 3, C.rose1);
  }

  function face(px, s, p) {
    const { hx, hy } = s;
    // hocico crema
    fill(px, M.ell(hx - 5.5, hy + 4.5, 6.5, 4.5), s.tier === 3 ? [C.cream0, C.grey2, C.cream2, C.cream3] : R.cream, {});
    // nariz
    dot(px, hx - 11, hy + 2, C.ink); dot(px, hx - 10, hy + 2, C.ink); dot(px, hx - 11, hy + 1, C.red1);
    // boca
    const my = hy + 4;
    if (p.mouth === "smile") { dot(px, hx - 10, my, C.ink); dot(px, hx - 9, my + 1, C.ink); dot(px, hx - 8, my, C.ink); }
    else if (p.mouth === "open") { dot(px, hx - 10, my, C.ink); dot(px, hx - 9, my, C.ink); dot(px, hx - 10, my + 1, C.red1); dot(px, hx - 9, my + 1, C.red2); dot(px, hx - 8, my, C.ink); }
    else if (p.mouth === "frown") { dot(px, hx - 10, my + 1, C.ink); dot(px, hx - 9, my, C.ink); dot(px, hx - 8, my + 1, C.ink); }
    else if (p.mouth === "o") { dot(px, hx - 9, my, C.ink2); dot(px, hx - 9, my + 1, C.ink2); }
    // mechón de barbilla
    dot(px, hx - 6, hy + 9, C.cream1); dot(px, hx - 5, hy + 10, C.cream1);
    if (s.tier === 3) { // veterana: cejas canosas, barba y cicatriz
      for (const x of [hx - 7, hx - 6, hx - 5, hx + 1, hx + 2, hx + 3]) dot(px, x, hy - 3, C.grey2);
      dot(px, hx - 8, hy - 4, C.grey2); dot(px, hx + 4, hy - 4, C.grey2);
      fill(px, M.poly([[hx - 8, hy + 7], [hx - 2, hy + 7], [hx - 5, hy + 12]]), [C.grey1, C.grey1, C.grey2, C.cream3], { flat: false });
      dot(px, hx + 4, hy - 1, C.fur0); dot(px, hx + 5, hy, C.fur0); dot(px, hx + 5, hy + 1, C.fur0);
    }
    eyes(px, s, p);
  }

  // mano delantera: devuelve la posición de la pata
  function paw(s, p) { const sx = s.bx - 4, sy = s.by - s.bry + 5; return [sx - Math.sin(p.arm) * 6.5, sy + Math.cos(p.arm) * 6.5]; } // arm: 0 = colgando, >0 hacia delante/arriba
  function arm(px, s, p, front, ramp) {
    const sx = front ? s.bx - 4 : s.bx + 5, sy = s.by - s.bry + 5;
    const [ex, ey] = front ? paw(s, p) : [sx + 2, sy + 7];
    fill(px, M.cap(sx, sy, ex, ey, 2.3, 2.6), ramp || R.fur, { edge: true });
    fill(px, M.circ(ex, ey, 2.1), R.fur, { edge: !!ramp });
  }

  function tail(px, s, p) {
    const { bx, by } = s, k = s.tailK;
    const base = [bx + 5, by + 6];
    let pts = [[bx + 4, by + 7, 3.5], [bx + 11 * k, by + 4, 5], [bx + 15 * k, by - 5 * k, 6.5], [bx + 14 * k, by - 14 * k, 6.5], [bx + 15 * k, by - 21 * k, 5], [bx + 20 * k, by - 23 * k, 3.5], [bx + 22 * k, by - 20 * k, 2]];
    pts = pts.map(([x, y, r]) => { const [rx, ry] = ART.rot(x, y, base[0], base[1], p.tail); return [rx, ry, r]; });
    const m = M.tube(pts);
    fill(px, m, R.fur, { deep: true, sd: 3 });
    // espiral clara interior
    const inner = pts.slice(1, 6).map(([x, y, r], i) => [x + 1.5, y + 0.5, r * 0.4]);
    fill(px, M.and(M.tube(inner), m), [C.fur2, C.fur3, C.cream1, C.cream2], {});
    // mechones del borde (textura de pelo)
    for (let i = 1; i < pts.length - 1; i++) { const [x, y, r] = pts[i]; dot(px, x + r - 1, y - 1, C.fur1); dot(px, x + r - 2, y + 2, C.fur1); dot(px, x - r + 2, y, C.fur3); }
  }

  function body(px, s, p) {
    const { bx, by, brx, bry } = s;
    // pies
    fill(px, M.ell(bx - 5, 57, 4, 2.2), R.fur, {}); fill(px, M.ell(bx + 3, 57.5, 3.5, 2), R.fur, {});
    const bm = M.ell(bx, by, brx, bry);
    fill(px, bm, R.fur, { edge: true });
    fill(px, M.and(M.ell(bx - 2.5, by + 1, brx * 0.55, bry * 0.75), bm), R.cream, {});
    return bm;
  }

  function headShape(px, s, p) { return fill(px, M.circ(s.hx, s.hy, s.hr), R.fur, { edge: true, wideLight: true }); }

  // ---------- armas (ang=0 apunta arriba; negativo inclina hacia delante/izquierda) ----------
  function frame(x0, y0, a) { const ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a); return (lx, ly) => [x0 + rx * lx + ux * ly, y0 + ry * lx + uy * ly]; }
  const polyL = (T, pts) => M.poly(pts.map(([a, b]) => T(a, b)));

  const WEAPONS = {
    wizard(px, x, y, a, t) {
      const T = frame(x, y, a);
      fill(px, M.cap(...T(0, -12), ...T(0, 26), 1.2), R.wood, { flat: false, edge: true });
      const [cx, cy] = T(0, 29);
      if (t >= 2) fill(px, M.cap(...T(-3, 24), ...T(0, 27), 1), R.gold, {}), fill(px, M.cap(...T(3, 24), ...T(0, 27), 1), R.gold, {});
      fill(px, polyL(T, [[0, 26], [3.2, 30], [0, 35 + t], [-3.2, 30]]), R.purp, { edge: true });
      return [cx, cy];
    },
    fighter(px, x, y, a, t) {
      const T = frame(x, y, a);
      fill(px, M.cap(...T(0, -3), ...T(0, 2), 1.3), R.wood, {});                       // empuñadura
      fill(px, polyL(T, [[-4.5, 2], [4.5, 2], [4.5, 4], [-4.5, 4]]), t >= 3 ? R.gold : R.steel, { edge: true }); // guarda
      fill(px, polyL(T, [[-2, 4], [2, 4], [2, 19 + t], [0, 23 + t], [-2, 19 + t]]), R.steel, { edge: true });
      line(px, ...T(0, 5), ...T(0, 18 + t), C.steel3);
      return T(0, 23);
    },
    barbarian(px, x, y, a, t) {
      const T = frame(x, y, a);
      fill(px, M.cap(...T(0, -6), ...T(0, 22), 1.4), R.wood, { edge: true });
      const w = 5 + t;
      fill(px, polyL(T, [[0, 14], [-w, 10], [-w - 3, 16], [-w - 3, 24], [-w, 29], [0, 23]]), R.steel, { edge: true, deep: true });
      if (t >= 2) fill(px, polyL(T, [[0, 15], [4, 13], [5, 18], [4, 23], [0, 21]]), R.steel, { edge: true });
      line(px, ...T(-w - 3, 16), ...T(-w - 3, 24), C.steel3);
      fill(px, M.cap(...T(0, 12), ...T(0, 14), 1.8), R.wood, {});
      return T(-w, 20);
    },
    cleric(px, x, y, a, t) {
      const T = frame(x, y, a);
      fill(px, M.cap(...T(0, -4), ...T(0, 16), 1.2), R.wood, { edge: true });
      const [cx, cy] = T(0, 19);
      fill(px, M.circ(cx, cy, 4 + (t >= 3 ? 0.6 : 0)), R.gold, { edge: true, deep: true });
      for (let k = 0; k < 8; k++) { const q = k * TAU / 8; dot(px, cx + Math.cos(q) * 5.6, cy + Math.sin(q) * 5.6, C.gold1); }
      dot(px, cx, cy, C.cream3); dot(px, cx - 1, cy, C.gold3); dot(px, cx + 1, cy, C.gold3); dot(px, cx, cy - 1, C.gold3); dot(px, cx, cy + 1, C.gold3);
      return [cx, cy];
    },
    ranger(px, x, y, a, t) {
      const T = frame(x, y, a - 0.15);
      const arc = [];
      for (let i = 0; i <= 8; i++) { const v = -1 + i / 4; arc.push([...T(-5 * (1 - v * v) + 1, v * 15), 1.1]); }
      fill(px, M.tube(arc), t >= 3 ? [C.gold0, C.gold1, C.wood3, C.gold2] : R.wood, { edge: true });
      line(px, ...T(1, -15), ...T(1, 15), C.cream2);
      dot(px, ...T(-4, 0), C.red2);
      return T(0, 15);
    },
    bard(px, x, y, a, t, s) {
      // laúd cruzado sobre la barriga: cuerpo fijo, mástil hacia arriba-delante; el brazo rasguea
      const cx = s.bx - 1, cy = s.by + 3, q = -0.95 + a * 0.15;
      const T = frame(cx, cy, q);
      fill(px, M.cap(...T(0, 5), ...T(0, 17), 1.3), R.wood, { edge: true });
      fill(px, polyL(T, [[-1.8, 16], [2, 16], [2.8, 21], [-1.2, 21]]), [C.wood0, C.wood0, C.wood1, C.wood2], {});
      fill(px, M.ell(cx, cy, 7, 5.5, q + Math.PI / 2), [C.wood0, C.wood2, C.wood3, C.gold2], { edge: true, deep: true });
      fill(px, M.circ(...T(0, 1.5), 1.6), [C.ink, C.ink, C.ink, C.ink], { flat: true });
      fill(px, polyL(T, [[-2.5, -3.5], [2.5, -3.5], [2.5, -2.5], [-2.5, -2.5]]), R.wood, { flat: true });
      line(px, ...T(0, -3), ...T(0, 17), C.cream2);
      if (t >= 2) for (const k of [8, 11, 14]) dot(px, ...T(-2, k), C.gold2);
      return [cx, cy];
    },
  };

  // ---------- atuendos ----------
  const OUTFIT = {
    wizard: {
      back(px, s, p) { if (s.tier === 3) fill(px, M.poly([[s.bx - 6, s.by - s.bry + 3], [s.bx + 9, s.by - s.bry + 3], [s.bx + 14, 58], [s.bx - 2, 58]]), R.purp, { edge: true }); },
      body(px, s) {
        const { bx, by, brx, bry } = s, top = by - bry + 3;
        const robe = M.poly([[bx - brx + 1, top], [bx + brx - 1, top], [bx + brx + 2, 58], [bx - brx - 3, 58]]);
        fill(px, M.or(robe, M.ell(bx, by, brx + 0.5, bry)), R.blue, { edge: true, deep: true, dither: true });
        fill(px, M.poly([[bx - 4, top], [bx + 1, top], [bx - 1.5, top + 5]]), R.fur, {});
        if (s.tier >= 2) { for (let x = bx - brx - 2; x <= bx + brx + 1; x++) dot(px, x, 57, C.gold2); dot(px, bx - 3, by + 2, C.gold3); dot(px, bx + 4, by - 1, C.gold3); dot(px, bx + 1, by + 7, C.gold3); }
        fill(px, M.rect(bx - brx, by + 1, brx * 2, 2), R.purp, { flat: true });
      },
      head(px, s) {
        const { hx, hy, hr } = s, by = hy - hr + 4;
        fill(px, M.poly([[hx - 8, by], [hx + 10, by], [hx + 7, by - 8], [hx + 13, by - 15], [hx + 16, by - 13], [hx + 11, by - 13], [hx + 2, by - 9]]), R.blue, { edge: true, deep: true });
        fill(px, M.ell(hx + 1, by + 0.5, hr + 3, 2.4), R.blue, { edge: true });
        if (s.tier >= 2) fill(px, M.rect(hx - 7, by - 2, 17, 2), R.gold, { flat: true });
        dot(px, hx + 3, by - 6, C.gold3); dot(px, hx + 8, by - 10, C.gold3); if (s.tier === 3) { dot(px, hx - 1, by - 4, C.gold3); dot(px, hx + 15, by - 13, C.gold2); }
      },
      weapon: "wizard",
    },
    fighter: {
      back(px, s) { if (s.tier === 3) fill(px, M.poly([[s.bx - 5, s.by - s.bry + 3], [s.bx + 8, s.by - s.bry + 3], [s.bx + 13, 58], [s.bx - 1, 58]]), R.red, { edge: true }); },
      body(px, s) {
        const { bx, by, brx, bry } = s;
        fill(px, M.and(M.ell(bx, by - 1, brx + 0.5, bry - 1), M.rect(0, by - bry + 2, 64, bry * 2)), s.tier >= 2 ? R.steel : R.wood, { edge: true, deep: true });
        fill(px, M.rect(bx - brx, by + 3, brx * 2 + 1, 2), R.wood, { flat: true }); dot(px, bx - 2, by + 3, C.gold2); dot(px, bx - 2, by + 4, C.gold1);
        if (s.tier === 3) { line(px, bx - 5, by - bry + 4, bx + 5, by - bry + 4, C.gold2); }
      },
      head(px, s) {
        const { hx, hy, hr } = s;
        fill(px, M.and(M.ell(hx + 1, hy - 2, hr + 1.5, hr), M.rect(0, 0, 64, hy - 4)), R.steel, { edge: true, deep: true });
        fill(px, M.rect(hx - hr, hy - 5, hr * 2 + 2, 1), [C.steel0, C.steel0, C.steel1, C.steel1], { flat: true });
        fill(px, M.poly([[hx + 5, hy - 5], [hx + 11, hy - 5], [hx + 10, hy + 2], [hx + 7, hy + 3]]), R.steel, { edge: true }); // carrillera trasera
        fill(px, M.rect(hx - 5, hy - 5, 2, 5), R.steel, { edge: true }); // nasal
        const pl = [[hx - 1, hy - hr - 1, 1.8], [hx + 4, hy - hr - 4 - s.tier, 2.6], [hx + 10, hy - hr - 2 - s.tier, 2.4], [hx + 14, hy - hr + 3, 1.6]];
        fill(px, M.tube(pl), R.red, { edge: true });
      },
      front(px, s, p) { // escudo sobre la barriga
        const cx = s.bx + 1, cy = s.by + 3, r = 6 + (s.tier === 3 ? 0.8 : 0);
        fill(px, M.circ(cx, cy, r), R.wood, { edge: true, deep: true });
        fill(px, M.not(M.circ(cx, cy, r), M.circ(cx, cy, r - 1.4)), s.tier >= 2 ? R.steel : R.wood, {});
        fill(px, M.circ(cx, cy, 1.8), s.tier === 3 ? R.gold : R.steel, {});
      },
      weapon: "fighter",
    },
    barbarian: {
      body(px, s) {
        const { bx, by, brx, bry } = s;
        // piel de lobo sobre los hombros, borde irregular
        const top = by - bry + 2; const pts = [[bx - brx - 1, top]];
        for (let i = 0; i <= 8; i++) pts.push([bx - brx - 1 + i * (brx * 2 + 2) / 8, top + 7 + (i % 2 ? 2 : 0)]);
        pts.push([bx + brx + 1, top]);
        fill(px, M.and(M.poly(pts), M.ell(bx, by, brx + 1.5, bry + 1)), [C.wood0, C.grey0, C.grey1, C.grey2], { edge: true, dither: true });
        fill(px, M.poly([[bx - 3, by + 5], [bx + 5, by + 5], [bx + 6, 57], [bx - 5, 57]]), [C.wood0, C.wood1, C.wood2, C.wood3], { edge: true });
        fill(px, M.rect(bx - brx, by + 4, brx * 2 + 1, 2), R.wood, { flat: true });
        if (s.tier >= 2) { dot(px, bx - 3, by + 4, C.cream2); dot(px, bx - 3, by + 5, C.cream1); dot(px, bx - 4, by + 4, C.cream2); }
        // pintura de guerra en la barriga
        if (s.tier === 3) { line(px, bx - 5, by + 7, bx - 2, by + 9, C.red2); line(px, bx - 4, by + 10, bx - 1, by + 12, C.red2); }
      },
      head(px, s) {
        const { hx, hy, hr } = s;
        fill(px, M.and(M.ell(hx + 1, hy - 2, hr, hr - 1), M.rect(0, 0, 64, hy - 5)), R.steel, { edge: true, deep: true });
        const h = 1 + s.tier * 0.5;
        fill(px, M.tube([[hx - 6, hy - hr + 3, 2.2], [hx - 11, hy - hr, 1.8], [hx - 12, hy - hr - 4 - h, 1.2], [hx - 10, hy - hr - 7 - h, 0.6]]), R.cream, { edge: true });
        fill(px, M.tube([[hx + 8, hy - hr + 3, 2.2], [hx + 13, hy - hr, 1.8], [hx + 14, hy - hr - 4 - h, 1.2], [hx + 12, hy - hr - 7 - h, 0.6]]), R.cream, { edge: true });
        // pintura de guerra en la mejilla
        dot(px, hx - 3, hy + 1, C.red2); dot(px, hx - 2, hy + 2, C.red2); dot(px, hx + 4, hy + 1, C.red2); dot(px, hx + 5, hy + 2, C.red2);
      },
      weapon: "barbarian",
    },
    cleric: {
      back(px, s) { if (s.tier >= 2) fill(px, M.poly([[s.bx - 5, s.by - s.bry + 3], [s.bx + 8, s.by - s.bry + 3], [s.bx + 12 + s.tier, 58], [s.bx - 1, 58]]), R.gold, { edge: true }); },
      body(px, s) {
        const { bx, by, brx, bry } = s, top = by - bry + 3;
        fill(px, M.or(M.poly([[bx - brx + 1, top], [bx + brx - 1, top], [bx + brx + 1, 58], [bx - brx - 2, 58]]), M.ell(bx, by, brx + 0.5, bry)), R.white, { edge: true, deep: true, dither: true });
        fill(px, M.rect(bx - 3, top + 1, 5, 58 - top - 1), R.gold, { flat: false, edge: true });
        const cy = by; dot(px, bx - 1, cy, C.cream3); for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) dot(px, bx - 1 + dx, cy + dy, C.gold3);
      },
      head(px, s) {
        const { hx, hy, hr } = s;
        fill(px, M.and(M.circ(hx, hy, hr + 0.6), M.rect(0, hy - 6, 64, 2)), R.gold, { flat: true });
        fill(px, M.poly([[hx - 4, hy - 6], [hx - 1, hy - 11], [hx + 2, hy - 6]]), R.gold, { edge: true });
        dot(px, hx - 1, hy - 8, C.blue3); dot(px, hx - 1, hy - 7, C.blue1);
        if (s.tier === 3) for (let k = 0; k < 7; k++) { const q = Math.PI * (1.15 + k * 0.12); dot(px, hx + 2 + Math.cos(q) * (hr + 4), hy - 4 + Math.sin(q) * (hr + 3), C.gold3); }
      },
      weapon: "cleric",
    },
    bard: {
      body(px, s) {
        const { bx, by, brx, bry } = s;
        fill(px, M.and(M.ell(bx, by - 1, brx + 0.5, bry - 1), M.rect(0, by - bry + 2, 64, bry * 2 - 2)), R.red, { edge: true, deep: true });
        fill(px, M.rect(bx - brx, by + 4, brx * 2 + 1, 2), R.gold, { flat: true });
        for (let k = 0; k < 3; k++) dot(px, bx - 2, by - bry + 5 + k * 3, C.gold3);
        if (s.tier >= 2) fill(px, M.circ(bx + brx - 1, by - bry + 5, 3.2), R.purp, { edge: true });
      },
      head(px, s) {
        const { hx, hy, hr } = s, y = hy - hr + 2;
        fill(px, M.ell(hx + 2, y, hr + 1.5, 3.6, -0.18), R.purp, { edge: true, deep: true });
        fill(px, M.rect(hx - 8, y + 1, 18, 1), R.gold, { flat: true });
        // pluma
        const fl = 8 + s.tier * 2;
        fill(px, M.tube([[hx + 6, y - 1, 1.2], [hx + 9, y - fl * 0.5, 2.2], [hx + 14, y - fl, 1.4], [hx + 17, y - fl - 2, 0.5]]), s.tier === 3 ? R.gold : R.cream, { edge: true });
      },
      weapon: "bard",
    },
    ranger: {
      back(px, s, p) { // carcaj
        const x = s.bx + 6, y = s.by - s.bry + 2;
        for (let k = 0; k < 2 + (s.tier >= 2 ? 1 : 0); k++) { line(px, x + k * 2, y + 2, x + 3 + k * 2, y - 7, C.wood2); dot(px, x + 3 + k * 2, y - 8, C.red2); dot(px, x + 4 + k * 2, y - 8, C.cream2); dot(px, x + 2 + k * 2, y - 8, C.red2); }
        fill(px, M.poly([[x - 1, y + 1], [x + 4, y - 1], [x + 9, y + 12], [x + 4, y + 14]]), R.wood, { edge: true });
      },
      body(px, s) {
        const { bx, by, brx, bry } = s, top = by - bry + 2;
        fill(px, M.and(M.ell(bx, by - 1, brx + 0.5, bry - 1), M.rect(0, top, 64, bry * 2)), R.leaf, { edge: true, deep: true });
        // capa corta
        fill(px, M.poly([[bx - brx - 1, top], [bx + brx + 1, top], [bx + brx + 3, top + 8 + s.tier], [bx - brx - 2, top + 5]]), R.leafL, { edge: true, dither: true });
        fill(px, M.rect(bx - brx, by + 3, brx * 2 + 1, 2), R.wood, { flat: true }); dot(px, bx - 3, by + 3, C.gold2);
      },
      head(px, s) {
        const { hx, hy, hr } = s;
        const hood = M.not(M.ell(hx + 2, hy - 1, hr + 2, hr + 1), M.ell(hx - 4, hy + 2.5, 8, 8.5));
        fill(px, M.and(hood, M.rect(0, 0, 64, hy + 8)), R.leafL, { edge: true, deep: true, dither: true });
        dot(px, hx - 3, hy - hr + 1, C.leaf4);
      },
      earsOver: true,
      weapon: "ranger",
    },
  };

  // ---------- efectos ----------
  function fx(px, list) {
    for (const e of list) {
      if (e.k === "z" && e.a) { const x = Math.round(e.x), y = Math.round(e.y), c = C.cream3, o = C.blue0;
        const z = e.s > 1 ? [[0, 0], [1, 0], [2, 0], [3, 0], [2, 1], [1, 2], [0, 3], [1, 3], [2, 3], [3, 3]] : [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]];
        for (const [a, b] of z) { dot(px, x + a + 1, y + b + 1, o); } for (const [a, b] of z) dot(px, x + a, y + b, c); }
      if (e.k === "tear" && e.a) { dot(px, e.x, e.y, C.water2); dot(px, e.x, e.y + 1, C.water1); dot(px, e.x - 1, e.y + 1, C.water3); }
      if (e.k === "spark") { const x = Math.round(e.x), y = Math.round(e.y), c = [C.gold3, C.cream3, C.gold2][e.s];
        dot(px, x, y, c); if (e.s !== 2) { dot(px, x - 1, y, C.gold2); dot(px, x + 1, y, C.gold2); dot(px, x, y - 1, C.gold2); dot(px, x, y + 1, C.gold2); } }
      if (e.k === "star") { const x = Math.round(e.x), y = Math.round(e.y); dot(px, x, y, C.gold3); dot(px, x - 1, y, C.gold2); dot(px, x + 1, y, C.gold2); dot(px, x, y - 1, C.gold2); }
      if (e.k === "slash") { for (let i = 0; i < 16; i++) { const a = Math.PI * (0.55 + i * 0.045) + e.s * 0.15; const r = 19 - e.s; const x = 24 + Math.cos(a) * r, y = e.y + Math.sin(a) * r * 0.9 - 4;
        dot(px, x, y, e.s ? C.cream2 : C.white); if (i > 3 && i < 13) dot(px, x + 1, y, C.gold3); } }
      if (e.k === "hit") { const r = 3 + e.s * 2; for (let k = 0; k < 8; k++) { const a = k * TAU / 8; line(px, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, e.x + Math.cos(a) * (r + 2), e.y + Math.sin(a) * (r + 2), k % 2 ? C.gold3 : C.white); } }
    }
  }

  // ---------- composición ----------
  function drawPet(stage, cls, anim = "idle", f = 0) {
    const base = STAGES[stage], p = pose(anim, f), o = OUTFIT[cls];
    const s = { ...base, hx: base.hx + p.ox, hy: base.hy + p.oy + p.head, bx: base.bx + p.ox, by: base.by + p.oy };
    const px = new Px(64, 64);
    arm(px, { ...s, bx: s.bx }, p, false);
    tail(px, s, p);
    if (o.back) o.back(px, s, p);
    // pies (siguen el salto)
    body(px, { ...s, by: s.by }, p);
    if (p.oy) { // en el aire los pies se despegan del suelo: redibuja pies desplazados
    }
    o.body(px, s, p);
    if (o.front) o.front(px, s, p);
    if (!o.earsOver) ears(px, s, p);
    headShape(px, s, p);
    face(px, s, p);
    o.head(px, s, p);
    if (o.earsOver) ears(px, s, p);
    const [wx, wy] = paw(s, p);
    WEAPONS[o.weapon](px, wx, wy, p.weapon, s.tier, s);
    arm(px, s, p, true);
    let out = px;
    if (p.oy) { // salto: desplaza todo el sprite hacia arriba y deja sombra en el suelo
      const j = new Px(64, 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const c = px.get(x, y); if (c[3]) j.set(x, y + p.oy, c); } out = j;
    }
    outline(out);
    if (p.lie) { const r = rot90(out, -1); out = new Px(64, 64); out.blit(r, 4, 6); }
    if (p.flash) for (let i = 0; i < out.d.length; i += 4) if (out.d[i + 3]) { out.d[i] = 255 - ((255 - out.d[i]) >> 2); out.d[i + 1] = 255 - ((255 - out.d[i + 1]) >> 2); out.d[i + 2] = 255 - ((255 - out.d[i + 2]) >> 2); }
    fx(out, p.fx);
    return out;
  }

  // sombra de suelo aparte (el componente la pinta bajo el sprite)
  function shadow(px, anim, f) { const p = pose(anim, f); const w = 11 + Math.round(p.oy / 3); fill(px, M.ell(32 + p.ox, 58.5, w, 2), [C.ink, C.ink, C.ink, C.ink].map((c) => [c[0], c[1], c[2], 90]), { flat: true }); }

  // bellota (etapa 0)
  function drawAcorn(anim = "idle", f = 0) {
    const px = new Px(64, 64); const sway = anim === "ready" ? [0, -2, 0, 2, 0, -2, 0, 2][f % 8] : [0, 0, 1, 1, 0, 0, -1, -1][f % 8] * 0.5;
    const a = sway * 0.06, cx = 32, cy = 38;
    const T = (x, y) => ART.rot(x, y, cx, 52, a);
    fill(px, (x, y) => { const [u, v] = T(x + 0.5, y + 0.5); return M.ell(cx, cy + 3, 13, 14)(u - 0.5, v - 0.5); }, R.fur, { deep: true, edge: false });
    fill(px, (x, y) => { const [u, v] = T(x + 0.5, y + 0.5); return M.poly([[cx - 1, cy + 16], [cx + 1, cy + 16], [cx, cy + 19]])(u - 0.5, v - 0.5); }, R.fur, {});
    fill(px, (x, y) => { const [u, v] = T(x + 0.5, y + 0.5); return M.and(M.ell(cx, cy - 6, 15, 9), M.rect(0, 0, 64, cy - 1))(u - 0.5, v - 0.5); }, R.wood, { edge: true, deep: true });
    // escamas de la cúpula
    for (let y = cy - 12; y < cy - 2; y += 3) for (let x = cx - 13 + (y % 2) * 2; x < cx + 13; x += 4) { const [u, v] = ART.rot(x, y, cx, 52, -a); if (px.alpha(Math.round(u), Math.round(v))) { dot(px, u, v, C.wood1); dot(px, u + 1, v, C.wood3); } }
    const [sx, sy] = T(cx + 1, cy - 15); fill(px, M.cap(sx, sy + 1, sx + 2, sy - 4, 1.4, 1), R.wood, {});
    const [lx, ly] = T(cx + 4, cy - 17); fill(px, M.ell(lx + 3, ly - 1, 4, 2, -0.5), R.leafL, { edge: true });
    // grieta cuando está lista para eclosionar
    if (anim === "ready" && f % 4 >= 2) { const [kx, ky] = T(cx - 4, cy + 4); line(px, kx, ky, kx + 3, ky + 3, C.cream3); line(px, kx + 3, ky + 3, kx + 1, ky + 6, C.cream3); }
    outline(px);
    if (anim === "ready") fx(px, [{ k: "spark", x: 14 + (f % 4) * 2, y: 20 + (f % 3) * 3, s: f % 3 }, { k: "spark", x: 50 - (f % 3) * 2, y: 24 + (f % 4), s: (f + 1) % 3 }]);
    return px;
  }

  Object.assign(ART, { STAGES, CLASSES, ANIMS, drawPet, drawAcorn, shadow, pose });
})(typeof window !== "undefined" ? window.ART : globalThis.ART);
