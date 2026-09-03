// Descarga el spritesheet de un *state* de PixelLab y lo deja en public/pet/sheets/<stage>/<cls>.{png,json};
// después regenera src/lib/pet/sheets.gen.ts a partir de TODOS los JSON presentes.
//   node scripts/pet-pixellab/fetch-character.mjs <stage> <class>        # usa characters.json
//   node scripts/pet-pixellab/fetch-character.mjs --gen                  # solo regenerar sheets.gen.ts
// Reintenta mientras el endpoint devuelva 423 (jobs en curso). Necesita `tar` (bsdtar de Windows 10 / macOS / Linux)
// para el zip; si el `tar` del PATH no soporta zip (p. ej. GNU tar en Git Bash), recurre a `unzip`.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SHEETS = join(ROOT, "public", "pet", "sheets");
const GEN = join(ROOT, "src", "lib", "pet", "sheets.gen.ts");
const CHARS = join(HERE, "characters.json");
const STAGES = ["young", "adult", "veteran"];
const CLASSES = ["barbarian", "fighter", "wizard", "cleric", "bard", "ranger"];
const ANIMS = ["idle", "sleepy", "sad", "joy"];
// Única dirección animada (enmienda 2026-09-03, Task 2b) — debe coincidir con PET_FACING de
// src/lib/pet/manifest.ts. La bellota (acornEntryFrom) no cambia: sigue en "south".
const FACING = "south-west";

function extractZip(zip, dir) {
  try {
    execFileSync("tar", ["-xf", zip, "-C", dir]);
    if (readdirSync(dir).some((f) => f.endsWith(".png"))) return;
  } catch {
    // sigue con el fallback
  }
  execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
}

async function fetchSheet(stage, cls) {
  const chars = JSON.parse(readFileSync(CHARS, "utf8"));
  const id = chars[stage]?.classes?.[cls]?.character_id;
  if (!id) throw new Error(`characters.json no tiene character_id para ${stage}/${cls}`);
  const url = `https://api.pixellab.ai/mcp/characters/${id}/spritesheet`;
  let res;
  for (let i = 0; i < 40; i++) {
    res = await fetch(url);
    if (res.status !== 423) break;
    console.log("423: jobs en curso, reintento en 15 s");
    await new Promise((r) => setTimeout(r, 15000));
  }
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const tmp = join(ROOT, ".superpowers", "brainstorm", "fetch-tmp", `${stage}-${cls}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const zip = join(tmp, "sheet.zip");
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  extractZip(zip, tmp);
  const png = readdirSync(tmp).find((f) => f.endsWith(".png"));
  const json = readdirSync(tmp).find((f) => f.endsWith(".json"));
  if (!png || !json) throw new Error(`zip sin png/json: ${readdirSync(tmp).join(", ")}`);
  const dir = join(SHEETS, stage);
  mkdirSync(dir, { recursive: true });
  renameSync(join(tmp, png), join(dir, `${cls}.png`));
  renameSync(join(tmp, json), join(dir, `${cls}.json`));
  rmSync(tmp, { recursive: true, force: true });
  console.log("ok", `public/pet/sheets/${stage}/${cls}.{png,json}`);
}

function entryFrom(stage, cls, layout) {
  const s = layout.spritesheet;
  const rot = s.rows.find((r) => r.type === "rotations");
  if (!rot) throw new Error(`sin fila de rotaciones en ${stage}/${cls}`);
  if (s.cell_size.width !== s.cell_size.height) throw new Error(`celda no cuadrada en ${stage}/${cls}`);
  const anims = {};
  for (const name of ANIMS) {
    let r = s.rows.find((x) => x.type === "animation" && x.animation === name && x.direction === FACING);
    if (!r) {
      // TRANSITORIO (migración a 64 px): los sheets aún no regenerados solo tienen filas "south".
      // Se quita en Task 6 del plan 2026-09-03-mascota-64px-heroe, cuando las 18 estén en FACING.
      r = s.rows.find((x) => x.type === "animation" && x.animation === name && x.direction === "south");
      if (r) console.warn(`aviso: ${stage}/${cls} ${name} sin fila ${FACING}, usando south (sheet pendiente de regenerar)`);
    }
    if (!r) throw new Error(`falta animación ${name} (${FACING}) en ${stage}/${cls}`);
    anims[name] = { row: r.row, frames: r.frame_count };
  }
  return { cell: s.cell_size.width, width: s.sheet_size.width, height: s.sheet_size.height, columns: s.columns, directions: rot.directions, rotationsRow: rot.row, anims };
}

const ACORN_ANIMS = ["idle", "ready"];
function acornEntryFrom(layout) {
  const s = layout.spritesheet;
  if (s.cell_size.width !== s.cell_size.height) throw new Error("celda no cuadrada en acorn");
  const anims = {};
  for (const name of ACORN_ANIMS) {
    const r = s.rows.find((x) => x.type === "animation" && x.animation === name && x.direction === "south");
    if (!r) throw new Error(`falta animación ${name} (south) en acorn`);
    anims[name] = { row: r.row, frames: r.frame_count };
  }
  return { cell: s.cell_size.width, width: s.sheet_size.width, height: s.sheet_size.height, columns: s.columns, anims };
}

function generate() {
  const out = {};
  for (const stage of STAGES) {
    out[stage] = {};
    for (const cls of CLASSES) {
      const f = join(SHEETS, stage, `${cls}.json`);
      if (!existsSync(f)) continue; // todavía no descargado: el test del manifiesto lo delatará
      out[stage][cls] = entryFrom(stage, cls, JSON.parse(readFileSync(f, "utf8")));
    }
  }
  // La bellota no tiene etapa/clase ni rotaciones de 8 direcciones: es un sheet aparte
  // empaquetado por pack-strip.mjs (ver acornEntryFrom), de ahí que viva fuera del bucle.
  const acornJson = join(SHEETS, "acorn.json");
  if (existsSync(acornJson)) out.acorn = acornEntryFrom(JSON.parse(readFileSync(acornJson, "utf8")));
  const body = JSON.stringify(out, null, 2);
  const ts = `// GENERADO por scripts/pet-pixellab/fetch-character.mjs — no editar a mano.
// Layout de cada spritesheet de public/pet/sheets/<stage>/<class>.png y acorn.png (spec sprites-personaje §5).
export type PetAnimName = "idle" | "sleepy" | "sad" | "joy";
export type SheetRow = { row: number; frames: number };
export type SheetEntry = {
  cell: number;
  width: number;
  height: number;
  columns: number;
  directions: readonly string[];
  rotationsRow: number;
  anims: Record<PetAnimName, SheetRow>;
};
export type AcornAnimName = "idle" | "ready";
export type AcornSheetEntry = { cell: number; width: number; height: number; columns: number; anims: Record<AcornAnimName, SheetRow> };
export const PET_SHEETS = ${body} as const satisfies Record<"young" | "adult" | "veteran", Record<string, SheetEntry>> & { acorn: AcornSheetEntry };
`;
  writeFileSync(GEN, ts);
  const n = STAGES.reduce((a, stage) => a + Object.keys(out[stage]).length, 0);
  console.log("ok", "src/lib/pet/sheets.gen.ts", n, "combinaciones");
}

const [a, b] = process.argv.slice(2);
if (a === "--gen") generate();
else if (STAGES.includes(a) && CLASSES.includes(b)) { await fetchSheet(a, b); generate(); }
else { console.error("uso: fetch-character.mjs <stage> <class> | --gen"); process.exit(1); }
