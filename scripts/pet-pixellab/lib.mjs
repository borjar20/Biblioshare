// Utilidades compartidas del pipeline de arte de la mascota con PixelLab
// (spec docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md).
// Lienzo lógico 40×40 (src/lib/pet/manifest.ts). Todo es RGBA crudo vía sharp.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const W = 40, H = 40;
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PET = join(ROOT, "public", "pet");

export const raw = (file) => sharp(file).ensureAlpha().raw().toBuffer();
export const fromRaw = (buf) => sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png();
export const empty = () => sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

/** Compone ficheros en orden (el último arriba) sobre un lienzo 40×40 transparente. */
export const compose = (files) => empty().composite(files.map((f) => ({ input: f }))).png();

/** Máscara binaria (Uint8Array W*H) del alpha de un PNG, dilatada r píxeles (vecindad cuadrada). */
export async function alphaMask(file, r = 0) {
  const b = await raw(file);
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = b[i * 4 + 3] > 0 ? 1 : 0;
  if (r === 0) return m;
  const o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0;
    for (let dy = -r; dy <= r && !v; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && m[yy * W + xx]) { v = 1; break; }
    }
    o[y * W + x] = v;
  }
  return o;
}
