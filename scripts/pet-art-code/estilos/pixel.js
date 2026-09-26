// Baja un SVG a pixel art: raster 4x, promedio por caja, cuantiza a la paleta del estilo, contorno 1px.
(function (G) {
  "use strict";
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function pixelize(svgStr, H, palHex, ink) {
    return new Promise((res) => {
      const W = Math.round(H * 400 / 520), K = 4;
      const img = new Image();
      img.onload = () => {
        const big = document.createElement("canvas"); big.width = W * K; big.height = H * K;
        const b = big.getContext("2d"); b.drawImage(img, 0, 0, W * K, H * K);
        const src = b.getImageData(0, 0, W * K, H * K).data;
        const pal = palHex.map(hex), inkC = hex(ink);
        const out = new Uint8ClampedArray(W * H * 4), A = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          let r = 0, g = 0, bl = 0, a = 0;
          for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) { const k = ((y * K + j) * W * K + x * K + i) * 4, al = src[k + 3]; r += src[k] * al; g += src[k + 1] * al; bl += src[k + 2] * al; a += al; }
          if (a / (K * K) < 110) continue;
          r /= a; g /= a; bl /= a;
          let best = 0, bd = 1e9; for (let p = 0; p < pal.length; p++) { const [pr, pg, pb] = pal[p]; const d = (pr - r) ** 2 * 0.3 + (pg - g) ** 2 * 0.59 + (pb - bl) ** 2 * 0.11; if (d < bd) { bd = d; best = p; } }
          const o = (y * W + x) * 4; out[o] = pal[best][0]; out[o + 1] = pal[best][1]; out[o + 2] = pal[best][2]; out[o + 3] = 255; A[y * W + x] = 1;
        }
        // limpieza: un píxel cuyo color no se repite en sus 8 vecinos toma el color mayoritario
        const col = (k) => (out[k * 4] << 16) | (out[k * 4 + 1] << 8) | out[k * 4 + 2];
        const fix = [];
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const k = y * W + x; if (!A[k]) continue; const me = col(k); const cnt = new Map(); let same = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { if (!i && !j) continue; const n = k + j * W + i; if (!A[n]) continue; const c = col(n); if (c === me) same++; cnt.set(c, (cnt.get(c) || 0) + 1); }
          if (same === 0) { let bc = me, bn = 0; for (const [c, n] of cnt) if (n > bn) { bn = n; bc = c; } fix.push([k, bc]); } }
        for (const [k, c] of fix) { out[k * 4] = c >> 16; out[k * 4 + 1] = (c >> 8) & 255; out[k * 4 + 2] = c & 255; }
        // contorno exterior de 1 px en tinta
        const add = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (A[y * W + x]) continue; if ((x > 0 && A[y * W + x - 1]) || (x < W - 1 && A[y * W + x + 1]) || (y > 0 && A[(y - 1) * W + x]) || (y < H - 1 && A[(y + 1) * W + x])) add.push(y * W + x); }
        for (const k of add) { out[k * 4] = inkC[0]; out[k * 4 + 1] = inkC[1]; out[k * 4 + 2] = inkC[2]; out[k * 4 + 3] = 255; }
        const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").putImageData(new ImageData(out, W, H), 0, 0);
        res(c);
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr.replace("<svg ", '<svg width="400" height="520" '));
    });
  }
  G.pixelize = pixelize;
})(window);
