// Descarga la narradora de los wrap-ups (7 estados PixelLab, ids en narrator-characters.json),
// recorta la fila `idle` south-west a una tira horizontal y deja
// public/pet/wrap-ups/narrator/<estado>.{png,json}. El JSON lleva lo que necesita la animación CSS
// (cell, frames, direction); narrator.ts copia esos números.
//   node scripts/pet-pixellab/fetch-narrator.mjs [estado ...]
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { compressSheet, sheetHash } from "./sheet-postprocess.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "public", "pet", "wrap-ups", "narrator");
const FACING = "south-west";
const chars = JSON.parse(readFileSync(join(HERE, "narrator-characters.json"), "utf8"));
const states = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(chars.states);

mkdirSync(OUT, { recursive: true });
for (const st of states) {
  const id = chars.states[st];
  const url = `https://api.pixellab.ai/mcp/characters/${id}/spritesheet`;
  let res;
  for (let i = 0; i < 40; i++) {
    res = await fetch(url);
    if (res.status !== 423) break;
    console.log("423: jobs en curso, reintento en 15 s");
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const tmp = join(ROOT, ".superpowers", "brainstorm", "fetch-tmp", `narrator-${st}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "s.zip"), Buffer.from(await res.arrayBuffer()));
  try { execFileSync("tar", ["-xf", join(tmp, "s.zip"), "-C", tmp]); } catch { /* fallback */ }
  if (!readdirSync(tmp).some((f) => f.endsWith(".png"))) execFileSync("unzip", ["-o", "-q", join(tmp, "s.zip"), "-d", tmp]);
  const png = readdirSync(tmp).find((f) => f.endsWith(".png"));
  const json = JSON.parse(readFileSync(join(tmp, readdirSync(tmp).find((f) => f.endsWith(".json"))), "utf8"));
  const s = json.spritesheet;
  const row = s.rows.find((r) => r.type === "animation" && r.animation === "idle" && r.direction === FACING);
  if (!row) throw new Error(`falta idle ${FACING} en ${st}`);
  const cell = s.cell_size.width;
  const strip = await sharp(join(tmp, png)).extract({ left: 0, top: row.row * cell, width: row.frame_count * cell, height: cell }).png().toBuffer();
  const dest = join(OUT, `${st}.png`);
  writeFileSync(dest, strip);
  const r = await compressSheet(dest);
  writeFileSync(join(OUT, `${st}.json`), JSON.stringify({ state: st, character_id: id, animation_group_id: row.animation_group_id, direction: FACING, animation: "idle", cell, frames: row.frame_count, width: row.frame_count * cell, height: cell, hash: sheetHash(dest) }, null, 2) + "\n");
  rmSync(tmp, { recursive: true, force: true });
  console.log("ok", st, `${cell}px x ${row.frame_count}`, r.palette ? "paleta" : "truecolor", r.colours);
}
