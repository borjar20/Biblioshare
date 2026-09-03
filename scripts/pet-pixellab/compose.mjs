// Aplana la mascota tal y como la pinta <PetSprite> (orden del manifiesto) a un PNG 40×40.
// Es el init_image que se le da a PixelLab (create_image_pixflux) para el sprite plano.
//   node scripts/pet-pixellab/compose.mjs <stage> <class|none> <mood|none> <out.png>
// stage: young | adult | veteran | acorn.  class none = ardilla desnuda.  mood none = sin cara.
import { join } from "node:path";
import { PET, compose } from "./lib.mjs";

const [stage, cls = "none", mood = "none", out] = process.argv.slice(2);
if (!stage || !out) { console.error("uso: compose.mjs <stage> <class|none> <mood|none> <out.png>"); process.exit(1); }
const TORSO = new Set(["cleric"]); // clases cuyo outfit se pega al cuerpo (manifest.ts)
const L = [];
if (stage === "acorn") L.push("acorn.png");
else {
  L.push(`${stage}/tail.png`, `${stage}/body.png`);
  if (cls !== "none" && TORSO.has(cls)) L.push(`class/${cls}/${stage}/outfit.png`);
  L.push(`${stage}/head.png`);
  if (mood !== "none") L.push(`face/${mood}.png`);
  if (cls !== "none" && !TORSO.has(cls)) L.push(`class/${cls}/${stage}/outfit.png`);
  L.push(`${stage}/hand.png`);
  if (cls !== "none") L.push(`class/${cls}/${stage}/accessory.png`);
}
await compose(L.map((f) => join(PET, f))).toFile(out);
console.log("ok", out, L.length, "capas");
