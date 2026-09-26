// La mascota (ardilla) dibujada por código: 3 etapas × 6 clases × 7 animaciones, celda 80 px.
// Cuerpo, cola y ropa son formas sombreadas; la cara (ojos, nariz, boca, mofletes) está
// dibujada píxel a píxel como sellos, porque es lo que hace que la ardilla sea bonita.
// Todo frame sale de un "pose" numérico: prenda y arma son idénticas en cada frame.
(function (ART) {
  "use strict";
  const { C, R, Px, M, fill, dot, line, rot90, hex } = ART;
  const TAU = Math.PI * 2;
  const N = 80, GY = 74;

  // Rampas propias de la ardilla (tonos cálidos con desplazamiento de matiz, como la referencia)
  const K = hex("#1a0f14");               // contorno casi negro
  const FUR = [hex("#4a1d10"), hex("#8a3a1a"), hex("#bb6130"), hex("#de9150")];
  const FURD = [hex("#3a160c"), hex("#5e2614"), hex("#7a3418"), hex("#98482a")]; // frente y dorso
  const CREAM = [hex("#a86c42"), hex("#dca772"), hex("#f2cf98"), hex("#fde9c4")];
  const CREAMV = [hex("#8f7a70"), hex("#c9b8ae"), hex("#ebe0d6"), hex("#ffffff")]; // hocico canoso
  const IRIS = hex("#6b3818"), IRIS2 = hex("#9a5a2a"), PINK = hex("#e2909a"), NOSE = hex("#3a1a1c");

  const STAGES = {
    young: { hx: 34, hy: 42, hw: 13, hh: 10, bx: 37, by: 63, brx: 8.5, bry: 8.5, tier: 1, tailK: 0.82 },
    adult: { hx: 34, hy: 35, hw: 13, hh: 10, bx: 37, by: 58, brx: 10, bry: 12.5, tier: 2, tailK: 1 },
    veteran: { hx: 34, hy: 33, hw: 13, hh: 10, bx: 38, by: 56, brx: 11.5, bry: 14.5, tier: 3, tailK: 1.08 },
  };
  const CLASSES = ["barbarian", "fighter", "wizard", "cleric", "bard", "ranger"];
  const ANIMS = { idle: 8, sleepy: 8, sad: 8, joy: 9, attack: 8, hurt: 6, ko: 8 };

  // ---------- poses ----------
  function pose(anim, f) {
    const p = { ox: 0, oy: 0, head: 0, eyes: "open", ears: "up", tail: 0, arm: 1.15, weapon: -0.15, fx: [], flash: false, lie: 0, mouth: "smile", breath: 0 };
    const t = (f / (ANIMS[anim] || 8)) * TAU;
    if (anim === "idle") {
      p.head = [0, 0, 1, 1, 1, 1, 0, 0][f]; p.tail = Math.sin(t) * 0.06; p.eyes = f === 5 ? "closed" : "open"; p.weapon = -0.15 + Math.sin(t) * 0.03;
    } else if (anim === "sleepy") {
      p.head = [2, 2, 3, 3, 3, 3, 2, 2][f]; p.eyes = "closed"; p.ears = "half"; p.tail = 0.1 + Math.sin(t) * 0.03; p.mouth = "o"; p.arm = 0.95; p.weapon = 0.12;
      for (let k = 0; k < 3; k++) { const ph = (f + k * 3) % 8; p.fx.push({ k: "z", x: 50 + ph * 1.4 + k, y: 20 - ph * 1.8, s: ph > 4 ? 2 : 1, a: ph > 6 ? 0 : 1 }); }
    } else if (anim === "sad") {
      p.head = 2 + (f % 4 < 2 ? 0 : 1); p.eyes = "sad"; p.ears = "down"; p.tail = 0.22; p.mouth = "frown"; p.arm = 0.9; p.weapon = 0.18;
      p.fx.push({ k: "tear", x: 25, y: 34 + f * 2, a: f < 7 ? 1 : 0 });
    } else if (anim === "joy") {
      p.oy = [0, -2, -4, -6, -7, -6, -4, -2, 0][f]; p.eyes = "happy"; p.mouth = "open"; p.arm = 2.3; p.weapon = -0.35; p.tail = -0.1 + Math.sin(t) * 0.1;
      if (f >= 2 && f <= 7) for (let k = 0; k < 4; k++) { const a = k * 1.6 + f * 0.5; p.fx.push({ k: "spark", x: 38 + Math.cos(a) * (20 + f), y: 38 + p.oy + Math.sin(a) * (17 + f), s: (f + k) % 3 }); }
    } else if (anim === "attack") {
      p.ox = [0, 2, 3, -3, -5, -4, -2, 0][f]; p.head = [0, 1, 1, 0, 1, 1, 0, 0][f];
      p.arm = [0.5, 1.8, 2.4, 1.4, 0.9, 0.8, 0.6, 0.5][f]; p.weapon = [-0.15, 0.6, 0.9, -1.5, -2.2, -2.0, -0.9, -0.15][f];
      p.mouth = f >= 3 && f <= 5 ? "open" : "smile"; p.eyes = f >= 2 && f <= 5 ? "fierce" : "open";
      if (f === 3 || f === 4) p.fx.push({ k: "slash", x: 12, y: 44, s: f - 3 });
    } else if (anim === "hurt") {
      p.ox = [0, 3, 4, 3, 1, 0][f]; p.flash = f === 0 || f === 2; p.eyes = f <= 3 ? "x" : "open"; p.head = f <= 3 ? 1 : 0; p.ears = f <= 3 ? "down" : "up";
      p.arm = 0.95; p.weapon = 0.3; p.mouth = "frown"; p.tail = 0.2;
      if (f <= 2) p.fx.push({ k: "hit", x: 24, y: 34, s: f });
    } else if (anim === "ko") {
      p.eyes = "x"; p.ears = "down"; p.mouth = "frown"; p.arm = 0.9; p.weapon = 0.4; p.tail = 0.3;
      p.ox = [0, 1, 2, 3, 3, 3, 3, 3][f]; p.head = [1, 2, 3, 0, 0, 0, 0, 0][f]; p.lie = f >= 3 ? 1 : 0;
      if (f >= 4) for (let k = 0; k < 3; k++) { const a = f * 0.9 + k * 2.1; p.fx.push({ k: "star", x: 22 + Math.cos(a) * 9, y: 48 + Math.sin(a) * 3, s: k }); }
    }
    return p;
  }

  // ---------- sellos píxel a píxel ----------
  // K contorno · I iris · i iris claro · P pupila · w brillo · f pelo oscuro (ceja)
  const EYE = {
    open: [".KK.", "KwPK", "KPPK", "KPIK", "KIwK", ".KK."],
    openS: [".KK.", "KwPK", "KPIK", "KiIK", ".KK."],
    big: [".KKK.", "KwwPK", "KwPPK", "KPPPK", "KPIIK", "KIiwK", ".KKK."],
    bigS: [".KKK.", "KwPIK", "KPPIK", "KIiIK", ".KKK."],
    closed: [".....", ".....", "K...K", ".KKK.", "....."],
    happy: [".....", "..K..", ".K.K.", "K...K", "....."],
    x: ["K...K", ".K.K.", "..K..", ".K.K.", "K...K"],
  };
  const SEAL = { K, I: IRIS, i: IRIS2, P: K, w: C.white, f: FURD[0] };
  function stamp(px, rows, x, y, map = SEAL) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = map[r[i]]; if (c) px.set(x + i, y + j, c, 0); } });
  }

  // ---------- piezas ----------
  function ears(px, s, p) {
    const { hx, hy, hh } = s, top = hy - hh;
    const droop = p.ears === "down" ? 1 : p.ears === "half" ? 0.5 : 0;
    const ear = (cx, lean, near) => {
      const w = near ? 4.2 : 3.6, by = top + 5;
      const tipX = cx + lean + droop * 8 * Math.sign(lean), tipY = top - 7 + droop * 8;
      fill(px, M.poly([[cx - w, by], [cx + w, by], [tipX, tipY]]), FUR, { edge: true, edgeC: K });
      fill(px, M.poly([[cx - w + 2, by], [cx + w - 2, by], [cx + (tipX - cx) * 0.6, by + (tipY - by) * 0.6]]), [PINK, PINK, PINK, CREAM[3]], { flat: true });
    };
    ear(hx + 6, 2, false);
    ear(hx - 4, -2, true);
  }

  // Cabeza dibujada a mano (27×20), 3/4 mirando a la izquierda. 1-4 pelo, 5-7 crema, n nariz.
  const HEAD = [".........KKKKKKKKK.........","......KKK443332222KKK......","....KK44433222222233222KK..","...K444333322222233332221K.","..K44433333222223333332221K","..K44333333333333333332221K",".K343333333333333333332221K",".K343333333333333333332221K",".K433333333333333333332221K","KKn66363633333333333332221K","KKn66666666663333333332221K",".K776666666666333333655221K","K7666666666666633666665521K",".K66666666666663666665521K.","K6666666666666666665521K...",".K56666666666666665521K....","..K556666666666665521K.....","...K555666666665521K.......","....KK5555555521KK.........","......KKKKKKKKKKKK........."];
  function headShape(px, s) {
    const map = { K, n: NOSE, 1: FUR[0], 2: FUR[1], 3: FUR[2], 4: FUR[3], 5: CREAM[1], 6: CREAM[2], 7: CREAM[3] };
    if (s.tier === 3) Object.assign(map, { 5: CREAMV[1], 6: CREAMV[2], 7: CREAMV[3] });
    const ox = s.hx - 13, oy = s.hy - 10;
    stamp(px, HEAD, ox, oy, map);
    // coronilla más oscura: franja central de la frente
    for (const [x, y] of [[12, 1], [13, 1], [14, 1], [12, 2], [13, 2], [14, 2], [15, 2], [13, 3], [14, 3], [15, 3]]) dot(px, ox + x, oy + y, FUR[1]);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 27; x++) if (HEAD[y][x] !== ".") px.tag[(oy + y) * N + ox + x] = 999;
  }

  function face(px, s, p) {
    const ox = s.hx - 13, oy = s.hy - 10, tier = s.tier;
    const ey = oy + 5, nearX = ox + 4, farX = ox + 13;
    const open = p.eyes === "open" || p.eyes === "fierce" || p.eyes === "sad";
    if (open) { stamp(px, EYE.big, nearX - 1, ey - 1); stamp(px, EYE.open, farX, ey); }
    else { const k = p.eyes === "happy" ? "happy" : p.eyes === "x" ? "x" : "closed"; stamp(px, EYE[k], nearX, ey); stamp(px, EYE[k], farX, ey); }
    // cejas
    const bc = tier === 3 ? CREAMV[3] : FUR[0], by = ey - 2;
    if (p.eyes === "sad") for (const [x, y] of [[nearX, by + 1], [nearX + 1, by], [nearX + 2, by], [nearX + 3, by - 1], [farX, by - 1], [farX + 1, by], [farX + 2, by], [farX + 3, by + 1]]) dot(px, x, y, bc);
    else if (p.eyes === "fierce") for (const [x, y] of [[nearX, by - 1], [nearX + 1, by], [nearX + 2, by], [nearX + 3, by + 1], [farX, by + 1], [farX + 1, by], [farX + 2, by], [farX + 3, by - 1]]) dot(px, x, y, bc);
    else if (tier === 3) for (let k = -1; k < 5; k++) { dot(px, nearX + k, by, bc); if (k < 4) dot(px, farX + k, by, bc); }
    // boca bajo la nariz
    const mx = ox + 3, my = oy + 12;
    if (p.mouth === "smile") { dot(px, mx, my, K); dot(px, mx + 1, my + 1, K); dot(px, mx + 2, my + 1, K); dot(px, mx + 3, my, K); }
    else if (p.mouth === "open") { for (let k = 0; k < 4; k++) dot(px, mx + k, my, K); dot(px, mx + 1, my + 1, C.red1); dot(px, mx + 2, my + 1, C.red2); dot(px, mx, my + 1, K); dot(px, mx + 3, my + 1, K); dot(px, mx + 1, my + 2, K); dot(px, mx + 2, my + 2, K); dot(px, mx + 1, my - 1 + 1, C.white); }
    else if (p.mouth === "frown") { dot(px, mx, my + 1, K); dot(px, mx + 1, my, K); dot(px, mx + 2, my, K); dot(px, mx + 3, my + 1, K); }
    else if (p.mouth === "o") { dot(px, mx + 1, my, K); dot(px, mx + 1, my + 1, K); }
    dot(px, ox + 9, oy + 11, PINK); dot(px, ox + 10, oy + 11, PINK);
    if (tier === 3) { dot(px, farX + 4, ey - 1, K); dot(px, farX + 4, ey + 6, K); dot(px, farX + 5, ey + 7, FUR[0]); }
  }

  function paw(s, p) { const sx = s.bx - 6, sy = s.by - s.bry + 5; return [sx - Math.sin(p.arm) * 10, sy + Math.cos(p.arm) * 9]; }
  function arm(px, s, p, front) {
    const sx = front ? s.bx - 6 : s.bx + 6, sy = s.by - s.bry + 5;
    const [ex, ey] = front ? paw(s, p) : [sx + 2, sy + 8];
    fill(px, M.cap(sx, sy, ex, ey, 2.6, 2.9), front ? FUR : FURD, { edge: true, edgeC: K });
    fill(px, M.circ(ex, ey, 2.5), FUR, { edge: true, edgeC: K });
    dot(px, ex - 1, ey + 1, FUR[0]); dot(px, ex + 1, ey + 1, FUR[0]);
  }

  function tail(px, s, p) {
    const { bx, by } = s, k = s.tailK, base = [bx + 5, by + 6];
    // una "S/6": sube por la espalda, se abre y se enrosca hacia dentro arriba
    let pts = [[bx + 5, by + 8, 3.5], [bx + 14 * k, by + 3, 5.5], [bx + 19 * k, by - 7 * k, 7], [bx + 20 * k, by - 19 * k, 7.2], [bx + 16 * k, by - 29 * k, 6], [bx + 9 * k, by - 32 * k, 4.5], [bx + 6 * k, by - 28 * k, 3]];
    const R1 = (a) => a.map(([x, y, r]) => { const [rx, ry] = ART.rot(x, y, base[0], base[1], p.tail); return [rx, ry, r]; });
    pts = R1(pts);
    const m = M.tube(pts);
    fill(px, m, FUR, { deep: true, sd: 3, edge: true, edgeC: K });
    const sp = R1([[bx + 15 * k, by + 1, 1.5], [bx + 19 * k, by - 7 * k, 2.8], [bx + 19.5 * k, by - 17 * k, 3.2], [bx + 17 * k, by - 24 * k, 2.8], [bx + 13 * k, by - 26 * k, 2], [bx + 13 * k, by - 22 * k, 1.3]]);
    fill(px, M.and(M.tube(sp), m), CREAM, {});
    // mechones oscuros del borde exterior
    for (let i = 1; i < pts.length - 1; i++) { const [x, y, r] = pts[i]; dot(px, x + r - 1, y, FUR[0]); dot(px, x + r - 2, y + 3, FUR[1]); dot(px, x + r - 2, y - 3, FUR[1]); }
  }

  function body(px, s) {
    const { bx, by, brx, bry } = s;
    fill(px, M.ell(bx - 6, GY - 1, 4.5, 2.4), FUR, { edge: true, edgeC: K });
    fill(px, M.ell(bx + 4, GY - 0.5, 4, 2.2), FURD, { edge: true, edgeC: K });
    const bm = M.ell(bx, by, brx, bry);
    fill(px, bm, FUR, { edge: true, edgeC: K });
    fill(px, M.and(M.ell(bx - 3, by + 1, brx * 0.55, bry * 0.78), bm), CREAM, {});
    return bm;
  }

  // ---------- armas (ang=0 apunta arriba; negativo inclina hacia delante) ----------
  const SC = 1.25;
  function frame(x0, y0, a) { const ux = Math.sin(a), uy = -Math.cos(a), rx = Math.cos(a), ry = Math.sin(a); return (lx, ly) => [x0 + (rx * lx + ux * ly) * SC, y0 + (ry * lx + uy * ly) * SC]; }
  const polyL = (T, pts) => M.poly(pts.map(([a, b]) => T(a, b)));
  const E = { edge: true, edgeC: K };

  const WEAPONS = {
    wizard(px, x, y, a, t) {
      const T = frame(x, y, a);
      fill(px, M.cap(...T(0, -11), ...T(0, 26), 1.4), R.wood, E);
      if (t >= 2) { fill(px, M.cap(...T(-3, 24), ...T(0, 27), 1.1), R.gold, E); fill(px, M.cap(...T(3, 24), ...T(0, 27), 1.1), R.gold, E); }
      fill(px, polyL(T, [[0, 25], [3.4, 30], [0, 36 + t], [-3.4, 30]]), R.purp, { ...E, wideLight: true });
      dot(px, ...T(-1, 31), C.purp3);
    },
    fighter(px, x, y, a, t) {
      const T = frame(x, y, a);
      fill(px, M.cap(...T(0, -3), ...T(0, 2), 1.4), R.wood, E);
      fill(px, polyL(T, [[-4.5, 2], [4.5, 2], [4.5, 4], [-4.5, 4]]), t >= 3 ? R.gold : R.steel, E);
      fill(px, polyL(T, [[-2.2, 4], [2.2, 4], [2.2, 19 + t], [0, 23 + t], [-2.2, 19 + t]]), R.steel, E);
      line(px, ...T(-0.5, 5), ...T(-0.5, 19 + t), C.steel3);
    },
    barbarian(px, x, y, a, t) {
      const T = frame(x, y, a);
      fill(px, M.cap(...T(0, -6), ...T(0, 22), 1.5), R.wood, E);
      const w = 5 + t;
      fill(px, polyL(T, [[0, 14], [-w, 10], [-w - 3, 16], [-w - 3, 24], [-w, 29], [0, 23]]), R.steel, { ...E, deep: true });
      if (t >= 2) fill(px, polyL(T, [[0, 15], [4, 13], [5, 18], [4, 23], [0, 21]]), R.steel, E);
      line(px, ...T(-w - 2.6, 16), ...T(-w - 2.6, 24), C.steel3);
      fill(px, M.cap(...T(0, 12), ...T(0, 14), 1.9), R.wood, E);
    },
    cleric(px, x, y, a, t) {
      const T = frame(x, y, a);
      fill(px, M.cap(...T(0, -4), ...T(0, 16), 1.3), R.wood, E);
      const [cx, cy] = T(0, 19);
      for (let k = 0; k < 8; k++) { const q = k * TAU / 8; fill(px, M.circ(cx + Math.cos(q) * 5.8, cy + Math.sin(q) * 5.8, 1.2), R.gold, {}); }
      fill(px, M.circ(cx, cy, 4.8 + (t >= 3 ? 0.6 : 0)), R.gold, { ...E, deep: true });
      dot(px, cx, cy, C.cream3); dot(px, cx - 1, cy, C.gold3); dot(px, cx + 1, cy, C.gold3); dot(px, cx, cy - 1, C.gold3); dot(px, cx, cy + 1, C.gold3);
    },
    ranger(px, x, y, a, t) {
      const T = frame(x, y, a - 0.15);
      const arc = []; for (let i = 0; i <= 8; i++) { const v = -1 + i / 4; arc.push([...T(-5 * (1 - v * v) + 1, v * 15), 1.3]); }
      fill(px, M.tube(arc), t >= 3 ? [C.gold0, C.gold1, C.wood3, C.gold2] : R.wood, E);
      line(px, ...T(1, -15), ...T(1, 15), C.cream2);
      dot(px, ...T(-4, 0), C.red2);
    },
    bard(px, x, y, a, t, s) {
      const cx = s.bx - 2, cy = s.by + 4, q = -0.95 + a * 0.15, T = frame(cx, cy, q);
      fill(px, M.cap(...T(0, 5), ...T(0, 17), 1.4), R.wood, E);
      fill(px, polyL(T, [[-1.8, 16], [2, 16], [2.8, 21], [-1.2, 21]]), [C.wood0, C.wood0, C.wood1, C.wood2], E);
      fill(px, M.ell(cx, cy, 8.5, 7, q + Math.PI / 2), [C.wood0, C.wood2, C.wood3, C.gold2], { ...E, deep: true });
      fill(px, M.circ(...T(0, 1.5), 2), [K, K, K, K], { flat: true });
      fill(px, polyL(T, [[-2.5, -3.5], [2.5, -3.5], [2.5, -2.5], [-2.5, -2.5]]), R.wood, { flat: true });
      line(px, ...T(0, -3), ...T(0, 17), C.cream2);
      if (t >= 2) for (const k of [8, 11, 14]) dot(px, ...T(-2, k), C.gold2);
    },
  };

  // ---------- atuendos ----------
  const top = (s) => s.by - s.bry + 3;
  const cape = (px, s, ramp, extra = 0) => fill(px, M.poly([[s.bx - 6, top(s)], [s.bx + 9, top(s)], [s.bx + 15 + extra, GY], [s.bx - 2, GY]]), ramp, E);
  const OUTFIT = {
    wizard: {
      back(px, s) { if (s.tier === 3) cape(px, s, R.purp); },
      body(px, s) {
        const { bx, by, brx, bry } = s, t0 = top(s);
        fill(px, M.or(M.poly([[bx - brx + 1, t0], [bx + brx - 1, t0], [bx + brx + 3, GY], [bx - brx - 4, GY]]), M.ell(bx, by, brx + 0.5, bry)), R.blue, { ...E, deep: true, dither: true });
        fill(px, M.poly([[bx - 5, t0], [bx + 1, t0], [bx - 2, t0 + 6]]), CREAM, {});
        if (s.tier >= 2) { for (let x = bx - brx - 3; x <= bx + brx + 2; x++) dot(px, x, GY - 1, C.gold2); line(px, bx - 2, t0 + 6, bx - 3, GY - 1, C.gold2); for (const [dx, dy] of [[-6, 3], [5, -2], [2, 9], [-7, 12]]) dot(px, bx + dx, by + dy, C.gold3); }
        fill(px, M.rect(bx - brx, by + 1, brx * 2, 2), R.purp, { flat: true });
      },
      head(px, s) {
        const { hx, hy } = s, b = hy - 7;
        fill(px, M.poly([[hx - 9, b], [hx + 11, b], [hx + 8, b - 9], [hx + 14, b - 17], [hx + 18, b - 15], [hx + 12, b - 15], [hx + 2, b - 10]]), R.blue, { ...E, deep: true });
        fill(px, M.ell(hx + 1, b + 0.5, s.hw + 4, 2.4), R.blue, E);
        if (s.tier >= 2) fill(px, M.rect(hx - 8, b - 2, 19, 2), R.gold, { flat: true });
        for (const [dx, dy] of [[3, -6], [8, -11], [-2, -4]].slice(0, 1 + s.tier)) { dot(px, hx + dx, b + dy, C.gold3); dot(px, hx + dx + 1, b + dy, C.gold2); }
      },
      weapon: "wizard",
    },
    fighter: {
      back(px, s) { if (s.tier === 3) cape(px, s, R.red); },
      body(px, s) {
        const { bx, by, brx, bry } = s;
        fill(px, M.and(M.ell(bx, by - 1, brx + 0.5, bry - 1), M.rect(0, by - bry + 2, N, bry * 2)), s.tier >= 2 ? R.steel : R.wood, { ...E, deep: true });
        fill(px, M.rect(bx - brx, by + 3, brx * 2 + 1, 2), R.wood, { flat: true }); dot(px, bx - 2, by + 3, C.gold2); dot(px, bx - 2, by + 4, C.gold1);
        if (s.tier === 3) line(px, bx - 6, by - bry + 4, bx + 6, by - bry + 4, C.gold2);
      },
      head(px, s) {
        const { hx, hy, hh, hw } = s;
        fill(px, M.and(M.ell(hx + 1, hy - 2, hw + 1.5, hh + 0.5), M.rect(0, 0, N, hy - 5)), R.steel, { ...E, deep: true });
        fill(px, M.rect(hx - hw, hy - 6, hw * 2 + 2, 1), [C.steel0, C.steel0, C.steel1, C.steel1], { flat: true });
        fill(px, M.poly([[hx + 6, hy - 6], [hx + 13, hy - 6], [hx + 12, hy + 3], [hx + 8, hy + 4]]), R.steel, E);
        for (const x of [hx - 6, hx - 1, hx + 4]) dot(px, x, hy - 9, C.steel3);
        fill(px, M.tube([[hx - 1, hy - hh - 1, 2], [hx + 5, hy - hh - 5 - s.tier, 3], [hx + 12, hy - hh - 3 - s.tier, 2.8], [hx + 17, hy - hh + 3, 1.6]]), R.red, E);
      },
      front(px, s) {
        const cx = s.bx + 2, cy = s.by + 4, r = 7.5 + (s.tier === 3 ? 0.8 : 0);
        fill(px, M.circ(cx, cy, r), R.wood, { ...E, deep: true });
        fill(px, M.not(M.circ(cx, cy, r), M.circ(cx, cy, r - 1.6)), s.tier >= 2 ? R.steel : R.wood, {});
        line(px, cx - 3, cy - r + 2, cx - 3, cy + r - 2, C.wood1); line(px, cx + 3, cy - r + 2, cx + 3, cy + r - 2, C.wood1);
        fill(px, M.circ(cx, cy, 2), s.tier === 3 ? R.gold : R.steel, E);
      },
      weapon: "fighter",
    },
    barbarian: {
      body(px, s) {
        const { bx, by, brx, bry } = s, t0 = by - bry + 2, pts = [[bx - brx - 1, t0]];
        for (let i = 0; i <= 8; i++) pts.push([bx - brx - 1 + i * (brx * 2 + 2) / 8, t0 + 8 + (i % 2 ? 2 : 0)]);
        pts.push([bx + brx + 1, t0]);
        fill(px, M.and(M.poly(pts), M.ell(bx, by, brx + 1.5, bry + 1)), [C.wood0, C.grey0, C.grey1, C.grey2], { ...E, dither: true });
        fill(px, M.poly([[bx - 4, by + 5], [bx + 6, by + 5], [bx + 7, GY - 2], [bx - 6, GY - 2]]), R.wood, E);
        fill(px, M.rect(bx - brx, by + 4, brx * 2 + 1, 2), R.wood, { flat: true });
        if (s.tier >= 2) { dot(px, bx - 3, by + 4, C.cream3); dot(px, bx - 3, by + 5, C.cream1); dot(px, bx - 4, by + 4, C.cream2); }
        if (s.tier === 3) { line(px, bx - 6, by + 8, bx - 3, by + 10, C.red2); line(px, bx - 5, by + 11, bx - 2, by + 13, C.red2); }
      },
      head(px, s) {
        const { hx, hy, hh, hw } = s, h = 1 + s.tier * 0.6;
        fill(px, M.and(M.ell(hx + 1, hy - 3, hw, hh), M.rect(0, 0, N, hy - 6)), R.steel, { ...E, deep: true });
        fill(px, M.tube([[hx - 7, hy - hh + 3, 2.4], [hx - 13, hy - hh, 2], [hx - 14, hy - hh - 5 - h, 1.3], [hx - 12, hy - hh - 8 - h, 0.6]]), R.cream, E);
        fill(px, M.tube([[hx + 9, hy - hh + 3, 2.4], [hx + 15, hy - hh, 2], [hx + 16, hy - hh - 5 - h, 1.3], [hx + 14, hy - hh - 8 - h, 0.6]]), R.cream, E);
        for (const [x, y] of [[hx - 4, hy + 1], [hx - 3, hy + 2], [hx + 5, hy + 1], [hx + 6, hy + 2]]) dot(px, x, y, C.red2);
      },
      weapon: "barbarian",
    },
    cleric: {
      back(px, s) { if (s.tier >= 2) cape(px, s, R.gold, s.tier - 2); },
      body(px, s) {
        const { bx, by, brx, bry } = s, t0 = top(s);
        fill(px, M.or(M.poly([[bx - brx + 1, t0], [bx + brx - 1, t0], [bx + brx + 2, GY], [bx - brx - 3, GY]]), M.ell(bx, by, brx + 0.5, bry)), R.white, { ...E, deep: true, dither: true });
        fill(px, M.rect(bx - 3, t0 + 1, 6, GY - t0 - 1), R.gold, E);
        dot(px, bx, by, C.cream3); for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0]]) dot(px, bx + dx, by + dy, C.gold3);
      },
      head(px, s) {
        const { hx, hy, hw } = s;
        fill(px, M.and(M.circ(hx, hy, hw + 0.6), M.rect(0, hy - 7, N, 2)), R.gold, { flat: true });
        fill(px, M.poly([[hx - 5, hy - 7], [hx - 1, hy - 13], [hx + 3, hy - 7]]), R.gold, E);
        dot(px, hx - 1, hy - 10, C.blue3); dot(px, hx - 1, hy - 9, C.blue1);
        if (s.tier === 3) for (let k = 0; k < 7; k++) { const q = Math.PI * (1.15 + k * 0.12); dot(px, hx + 2 + Math.cos(q) * (hw + 5), hy - 4 + Math.sin(q) * (s.hh + 5), C.gold3); }
      },
      weapon: "cleric",
    },
    bard: {
      body(px, s) {
        const { bx, by, brx, bry } = s;
        fill(px, M.and(M.ell(bx, by - 1, brx + 0.5, bry - 1), M.rect(0, by - bry + 2, N, bry * 2 - 2)), R.red, { ...E, deep: true });
        fill(px, M.rect(bx - brx, by + 5, brx * 2 + 1, 2), R.gold, { flat: true });
        for (let k = 0; k < 3; k++) dot(px, bx - 2, by - bry + 5 + k * 3, C.gold3);
        if (s.tier >= 2) fill(px, M.circ(bx + brx - 1, by - bry + 6, 3.6), R.purp, E);
      },
      head(px, s) {
        const { hx, hy, hh, hw } = s, y = hy - hh + 2, fl = 9 + s.tier * 2;
        fill(px, M.tube([[hx + 7, y - 1, 1.3], [hx + 10, y - fl * 0.5, 2.4], [hx + 15, y - fl, 1.5], [hx + 18, y - fl - 2, 0.5]]), s.tier === 3 ? R.gold : R.cream, E);
        fill(px, M.ell(hx + 2, y, hw + 1.5, 4, -0.18), R.purp, { ...E, deep: true });
        fill(px, M.rect(hx - 9, y + 1, 20, 1), R.gold, { flat: true });
      },
      weapon: "bard",
    },
    ranger: {
      back(px, s) {
        const x = s.bx + 7, y = s.by - s.bry + 2;
        for (let k = 0; k < 2 + (s.tier >= 2 ? 1 : 0); k++) { line(px, x + k * 2, y + 2, x + 3 + k * 2, y - 8, C.wood2); dot(px, x + 3 + k * 2, y - 9, C.red2); dot(px, x + 4 + k * 2, y - 9, C.cream2); dot(px, x + 2 + k * 2, y - 9, C.red2); }
        fill(px, M.poly([[x - 1, y + 1], [x + 4, y - 1], [x + 10, y + 13], [x + 5, y + 15]]), R.wood, E);
      },
      body(px, s) {
        const { bx, by, brx, bry } = s, t0 = by - bry + 2;
        fill(px, M.and(M.ell(bx, by - 1, brx + 0.5, bry - 1), M.rect(0, t0, N, bry * 2)), R.leaf, { ...E, deep: true });
        fill(px, M.poly([[bx - brx - 1, t0], [bx + brx + 1, t0], [bx + brx + 3, t0 + 9 + s.tier], [bx - brx - 2, t0 + 6]]), R.leafL, { ...E, dither: true });
        fill(px, M.rect(bx - brx, by + 4, brx * 2 + 1, 2), R.wood, { flat: true }); dot(px, bx - 3, by + 4, C.gold2);
      },
      head(px, s) {
        const { hx, hy, hw, hh } = s;
        const hood = M.not(M.ell(hx + 2, hy - 1, hw + 2.5, hh + 1.5), M.ell(hx - 5, hy + 2.5, 10, 10));
        fill(px, M.and(hood, M.rect(0, 0, N, hy + 9)), R.leafL, { ...E, deep: true, dither: true });
      },
      earsOver: true,
      weapon: "ranger",
    },
  };

  // ---------- efectos ----------
  function fx(px, list) {
    for (const e of list) {
      if (e.k === "z" && e.a) { const x = Math.round(e.x), y = Math.round(e.y);
        const z = e.s > 1 ? [[0, 0], [1, 0], [2, 0], [3, 0], [2, 1], [1, 2], [0, 3], [1, 3], [2, 3], [3, 3]] : [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]];
        for (const [a, b] of z) dot(px, x + a + 1, y + b + 1, C.blue0); for (const [a, b] of z) dot(px, x + a, y + b, C.cream3); }
      if (e.k === "tear" && e.a) { dot(px, e.x, e.y, C.water2); dot(px, e.x, e.y + 1, C.water1); dot(px, e.x - 1, e.y + 1, C.water3); }
      if (e.k === "spark") { const x = Math.round(e.x), y = Math.round(e.y), c = [C.gold3, C.cream3, C.gold2][e.s];
        dot(px, x, y, c); if (e.s !== 2) { dot(px, x - 1, y, C.gold2); dot(px, x + 1, y, C.gold2); dot(px, x, y - 1, C.gold2); dot(px, x, y + 1, C.gold2); } }
      if (e.k === "star") { const x = Math.round(e.x), y = Math.round(e.y); dot(px, x, y, C.gold3); dot(px, x - 1, y, C.gold2); dot(px, x + 1, y, C.gold2); dot(px, x, y - 1, C.gold2); }
      if (e.k === "slash") for (let i = 0; i < 18; i++) { const a = Math.PI * (0.55 + i * 0.04) + e.s * 0.15, r = 23 - e.s; const x = 30 + Math.cos(a) * r, y = e.y + Math.sin(a) * r * 0.9 - 4;
        dot(px, x, y, e.s ? C.cream2 : C.white); if (i > 3 && i < 14) dot(px, x + 1, y, C.gold3); }
      if (e.k === "hit") { const r = 3 + e.s * 2; for (let k = 0; k < 8; k++) { const a = k * TAU / 8; line(px, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, e.x + Math.cos(a) * (r + 2), e.y + Math.sin(a) * (r + 2), k % 2 ? C.gold3 : C.white); } }
    }
  }

  function outlineDark(px) {
    const add = [];
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      if (px.alpha(x, y) > 0) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => px.alpha(x + dx, y + dy) > 200)) add.push([x, y]);
    }
    for (const [x, y] of add) px.set(x, y, K, 0);
  }

  // ---------- composición ----------
  function drawPet(stage, cls, anim = "idle", f = 0) {
    const base = STAGES[stage], p = pose(anim, f), o = OUTFIT[cls];
    const s = { ...base, hx: base.hx + p.ox, hy: base.hy + p.head, bx: base.bx + p.ox, by: base.by };
    const px = new Px(N, N);
    arm(px, s, p, false);
    tail(px, s, p);
    if (o.back) o.back(px, s, p);
    body(px, s);
    o.body(px, s, p);
    if (o.front) o.front(px, s, p);
    if (!o.earsOver) ears(px, s, p);
    headShape(px, s);
    face(px, s, p);
    o.head(px, s, p);
    if (o.earsOver) ears(px, s, p);
    const [wx, wy] = paw(s, p);
    WEAPONS[o.weapon](px, wx, wy, p.weapon, s.tier, s);
    arm(px, s, p, true);
    let out = px;
    if (p.oy) { const j = new Px(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = px.get(x, y); if (c[3]) j.set(x, y + p.oy, c); } out = j; }
    outlineDark(out);
    if (p.lie) { const r = rot90(out, -1); out = new Px(N, N); out.blit(r, 6, 8); }
    if (p.flash) for (let i = 0; i < out.d.length; i += 4) if (out.d[i + 3]) for (let j = 0; j < 3; j++) out.d[i + j] = 255 - ((255 - out.d[i + j]) >> 2);
    fx(out, p.fx);
    return out;
  }

  // bellota (etapa 0), 64 px
  function drawAcorn(anim = "idle", f = 0) {
    const px = new Px(64, 64); const sway = anim === "ready" ? [0, -2, 0, 2, 0, -2, 0, 2][f % 8] : [0, 0, 1, 1, 0, 0, -1, -1][f % 8] * 0.5;
    const a = sway * 0.06, cx = 32, cy = 38, T = (x, y) => ART.rot(x, y, cx, 52, a);
    const W = (m) => (x, y) => { const [u, v] = T(x + 0.5, y + 0.5); return m(u - 0.5, v - 0.5); };
    fill(px, W(M.ell(cx, cy + 3, 13, 14)), FUR, { deep: true });
    fill(px, W(M.and(M.ell(cx, cy - 6, 15, 9), M.rect(0, 0, 64, cy - 1))), R.wood, { edge: true, edgeC: K, deep: true });
    const [sx, sy] = T(cx + 1, cy - 15); fill(px, M.cap(sx, sy + 1, sx + 2, sy - 4, 1.4, 1), R.wood, {});
    const [lx, ly] = T(cx + 4, cy - 17); fill(px, M.ell(lx + 3, ly - 1, 4, 2, -0.5), R.leafL, E);
    if (anim === "ready" && f % 4 >= 2) { const [kx, ky] = T(cx - 4, cy + 4); line(px, kx, ky, kx + 3, ky + 3, C.cream3); line(px, kx + 3, ky + 3, kx + 1, ky + 6, C.cream3); }
    outlineDark(px);
    return px;
  }

  Object.assign(ART, { STAGES, CLASSES, ANIMS, drawPet, drawAcorn, pose, PET_CELL: N, PET_GROUND: GY });
})(typeof window !== "undefined" ? window.ART : globalThis.ART);
