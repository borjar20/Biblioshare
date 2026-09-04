// Empaqueta frames sueltos (p. ej. los de animate_image) en un sheet con el MISMO layout JSON que
// exporta PixelLab, para que fetch-character.mjs --gen los trate como cualquier otro sheet.
//   node scripts/pet-pixellab/pack-strip.mjs <out-basename> <cell> <anim>=<dir> [<anim>=<dir> ...]
// Ej.: node scripts/pet-pixellab/pack-strip.mjs public/pet/sheets/acorn 64 idle=scripts/pet-pixellab/ref/acorn/idle ready=scripts/pet-pixellab/ref/acorn/ready
// Fila 0 = "rotations" con una sola dirección south (frame 0 de la primera animación); una fila por animación.
import sharp from "sharp";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [out, cellS, ...pairs] = process.argv.slice(2);
if (!out || !cellS || pairs.length === 0) { console.error("uso: pack-strip.mjs <out-basename> <cell> <anim>=<dir> ..."); process.exit(1); }
const cell = Number(cellS);
const anims = pairs.map((p) => { const [name, dir] = p.split("="); const files = readdirSync(dir).filter((f) => /^\d+\.png$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b)).map((f) => join(dir, f)); if (files.length === 0) throw new Error(`sin frames en ${dir}`); return { name, files }; });
const rows = [{ row: 0, type: "rotations", frame_count: 1, directions: ["south"], files: [anims[0].files[0]] }, ...anims.map((a, i) => ({ row: i + 1, type: "animation", frame_count: a.files.length, animation: a.name, direction: "south", files: a.files }))];
const columns = Math.max(...rows.map((r) => r.files.length));
const width = columns * cell, height = rows.length * cell;
const comps = [];
for (const r of rows) for (let i = 0; i < r.files.length; i++) {
  const meta = await sharp(r.files[i]).metadata();
  if (meta.width > cell || meta.height > cell) throw new Error(`${r.files[i]} (${meta.width}x${meta.height}) no cabe en una celda de ${cell}`);
  // pivote centrado, como PixelLab
  comps.push({ input: r.files[i], left: i * cell + Math.floor((cell - meta.width) / 2), top: r.row * cell + Math.floor((cell - meta.height) / 2) });
}
await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(`${out}.png`);
const layout = { character: { name: out.split(/[\\/]/).pop(), size: { width: cell, height: cell }, directions: 1, view: "side" }, spritesheet: { path: `${out.split(/[\\/]/).pop()}.png`, cell_size: { width: cell, height: cell }, sheet_size: { width, height }, columns, pivot: "cell-center", rows: rows.map(({ files, ...r }) => r) }, export_version: "1.0", export_date: new Date().toISOString(), packed_by: "scripts/pet-pixellab/pack-strip.mjs" };
writeFileSync(`${out}.json`, JSON.stringify(layout, null, 2) + "\n");
console.log("ok", `${out}.png`, `${width}x${height}`, rows.length, "filas");
