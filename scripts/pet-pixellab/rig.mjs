// Recompone piezas sueltas (en orden, la última arriba) en un 40×40: para comprobar que las
// piezas IA encajan antes de copiarlas a public/pet/.
//   node scripts/pet-pixellab/rig.mjs <out.png> <tail> <body> [outfit-torso] <head> [face] [outfit-hat] <hand> [accessory]
import { compose } from "./lib.mjs";

const [out, ...files] = process.argv.slice(2);
if (!out || files.length === 0) { console.error("uso: rig.mjs <out.png> <pieza.png>..."); process.exit(1); }
await compose(files).toFile(out);
console.log("ok", out);
