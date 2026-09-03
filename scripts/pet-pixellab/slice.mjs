// Trocea un sprite plano generado por PixelLab en las piezas del rig (tail/body/head/hand)
// usando como máscaras los alphas de las piezas procedurales de esa etapa, dilatados, por orden
// z (mano > cabeza > cuerpo > cola): cada píxel va a la pieza más alta cuya máscara lo cubre.
// La recomposición de las cuatro piezas devuelve el plano exacto.
//   node scripts/pet-pixellab/slice.mjs <flat.png> <stage> <outdir> [dilate=2]
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { PET, W, H, raw, fromRaw, alphaMask } from "./lib.mjs";

const [flat, stage, outdir, dil = "2"] = process.argv.slice(2);
if (!flat || !stage || !outdir) { console.error("uso: slice.mjs <flat.png> <stage> <outdir> [dilate]"); process.exit(1); }
const ORDER = ["hand", "head", "body", "tail"];
const masks = await Promise.all(ORDER.map((p) => alphaMask(join(PET, stage, `${p}.png`), +dil)));
const src = await raw(flat);
const owner = new Int8Array(W * H).fill(-1);
for (let i = 0; i < W * H; i++) {
  if (src[i * 4 + 3] === 0) continue;
  owner[i] = masks.findIndex((m) => m[i]);
  if (owner[i] < 0) owner[i] = ORDER.indexOf("tail"); // huérfanos: a la capa de fondo
}
mkdirSync(outdir, { recursive: true });
for (let k = 0; k < ORDER.length; k++) {
  const buf = Buffer.alloc(W * H * 4);
  let n = 0;
  for (let i = 0; i < W * H; i++) if (owner[i] === k) { buf.set(src.subarray(i * 4, i * 4 + 4), i * 4); n++; }
  await fromRaw(buf).toFile(join(outdir, `${ORDER[k]}.png`));
  console.log(ORDER[k], n, "px");
}
