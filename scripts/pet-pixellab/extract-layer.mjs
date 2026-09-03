// Extrae una capa de clase (outfit/accessory) de un sprite editado por PixelLab: píxeles de
// <edited> que caen dentro de la máscara (alpha de <mask> dilatado r) y difieren de <base>
// más de <tol> (suma de |dR|+|dG|+|dB|; un píxel transparente en base siempre difiere).
//   node scripts/pet-pixellab/extract-layer.mjs <base.png> <edited.png> <mask.png> <out.png> [r=2] [tol=60]
// base = ardilla desnuda IA; edited = la misma con la prenda; mask = la prenda procedural.
import { W, H, raw, fromRaw, alphaMask } from "./lib.mjs";

const [base, edited, mask, out, rS = "2", tolS = "60"] = process.argv.slice(2);
if (!base || !edited || !mask || !out) { console.error("uso: extract-layer.mjs <base> <edited> <mask> <out> [r] [tol]"); process.exit(1); }
const [A, B, M] = [await raw(base), await raw(edited), await alphaMask(mask, +rS)];
const o = Buffer.alloc(W * H * 4);
let n = 0;
for (let i = 0; i < W * H; i++) {
  const p = i * 4;
  if (B[p + 3] === 0 || !M[i]) continue;
  const d = A[p + 3] === 0 ? Infinity : Math.abs(A[p] - B[p]) + Math.abs(A[p + 1] - B[p + 1]) + Math.abs(A[p + 2] - B[p + 2]);
  if (d > +tolS) { o.set(B.subarray(p, p + 4), p); n++; }
}
await fromRaw(o).toFile(out);
console.log("ok", out, n, "px");
