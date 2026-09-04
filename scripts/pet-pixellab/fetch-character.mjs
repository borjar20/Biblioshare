// Descarga el spritesheet de un *state* de PixelLab y lo deja en public/pet/sheets/<stage>/<cls>.{png,json}
// (ya en paleta, sin pérdida: sheet-postprocess.mjs); después regenera src/lib/pet/sheets.gen.ts a partir de
// TODOS los JSON presentes, con el hash y la caja del personaje de cada PNG.
//   node scripts/pet-pixellab/fetch-character.mjs <stage> <class>        # usa characters.json
//   node scripts/pet-pixellab/fetch-character.mjs --gen                  # solo regenerar sheets.gen.ts
//   node scripts/pet-pixellab/fetch-character.mjs --compress             # paleta sobre todos los sheets + --gen
// Reintenta mientras el endpoint devuelva 423 (jobs en curso). Necesita `tar` (bsdtar de Windows 10 / macOS / Linux)
// para el zip; si el `tar` del PATH no soporta zip (p. ej. GNU tar en Git Bash), recurre a `unzip`.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cellBox, compressSheet, sheetHash } from "./sheet-postprocess.mjs";

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
  await compressAndReport(join(dir, `${cls}.png`), `${stage}/${cls}`);
  console.log("ok", `public/pet/sheets/${stage}/${cls}.{png,json}`);
}

// Paleta sin pérdida (#1072): PixelLab exporta RGBA truecolor con < 256 colores; a paleta pesa
// ~1/3. Si un sheet superase los 256 colores se deja como está (y se avisa: cuantizar sería con
// pérdida).
async function compressAndReport(png, label) {
  const r = await compressSheet(png);
  const pct = r.before ? Math.round((1 - r.after / r.before) * 100) : 0;
  console.log(r.palette ? "paleta" : "SIN paleta (>256 colores)", label, `${r.colours} colores`, `${r.before} → ${r.after} B (−${pct} %)`);
  return r;
}

function sheetPngs() {
  const out = [];
  for (const stage of STAGES) for (const cls of CLASSES) {
    const png = join(SHEETS, stage, `${cls}.png`);
    if (existsSync(png)) out.push({ png, label: `${stage}/${cls}` });
  }
  const acorn = join(SHEETS, "acorn.png");
  if (existsSync(acorn)) out.push({ png: acorn, label: "acorn" });
  return out;
}

async function compressAll() {
  let before = 0, after = 0;
  for (const { png, label } of sheetPngs()) {
    const r = await compressAndReport(png, label);
    before += r.before;
    after += r.after;
  }
  console.log("total", `${before} → ${after} B (−${before ? Math.round((1 - after / before) * 100) : 0} %)`);
}

// Derivados del PNG que viajan en sheets.gen.ts: hash para `?v=` en sheetSrc() (#1058) y caja
// real del personaje dentro de la celda para la zona táctil de la compañera (#1074).
async function derivedFrom(png, cell) {
  return { hash: sheetHash(png), box: await cellBox(png, cell) };
}

function entryFrom(stage, cls, layout) {
  const s = layout.spritesheet;
  const rot = s.rows.find((r) => r.type === "rotations");
  if (!rot) throw new Error(`sin fila de rotaciones en ${stage}/${cls}`);
  if (s.cell_size.width !== s.cell_size.height) throw new Error(`celda no cuadrada en ${stage}/${cls}`);
  const anims = {};
  for (const name of ANIMS) {
    const r = s.rows.find((x) => x.type === "animation" && x.animation === name && x.direction === FACING);
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

async function generate() {
  const out = {};
  for (const stage of STAGES) {
    out[stage] = {};
    for (const cls of CLASSES) {
      const f = join(SHEETS, stage, `${cls}.json`);
      if (!existsSync(f)) continue; // todavía no descargado: el test del manifiesto lo delatará
      const entry = entryFrom(stage, cls, JSON.parse(readFileSync(f, "utf8")));
      out[stage][cls] = { ...entry, ...(await derivedFrom(join(SHEETS, stage, `${cls}.png`), entry.cell)) };
    }
  }
  // La bellota no tiene etapa/clase ni rotaciones de 8 direcciones: es un sheet aparte
  // empaquetado por pack-strip.mjs (ver acornEntryFrom), de ahí que viva fuera del bucle.
  const acornJson = join(SHEETS, "acorn.json");
  if (existsSync(acornJson)) {
    const entry = acornEntryFrom(JSON.parse(readFileSync(acornJson, "utf8")));
    out.acorn = { ...entry, ...(await derivedFrom(join(SHEETS, "acorn.png"), entry.cell)) };
  }
  const body = JSON.stringify(out, null, 2);
  const ts = `// GENERADO por scripts/pet-pixellab/fetch-character.mjs — no editar a mano.
// Layout de cada spritesheet de public/pet/sheets/<stage>/<class>.png y acorn.png (spec sprites-personaje §5),
// más dos derivados del PNG: \`hash\` (sha1 corto; sheetSrc() lo pone en \`?v=\`, #1058) y \`box\` (caja real del
// personaje dentro de la celda, unión de todos los frames; zona táctil de la compañera, #1074).
export type PetAnimName = "idle" | "sleepy" | "sad" | "joy";
export type SheetRow = { row: number; frames: number };
export type SheetBox = { x: number; y: number; w: number; h: number };
export type SheetEntry = {
  cell: number;
  width: number;
  height: number;
  columns: number;
  directions: readonly string[];
  rotationsRow: number;
  anims: Record<PetAnimName, SheetRow>;
  hash: string;
  box: SheetBox;
};
export type AcornAnimName = "idle" | "ready";
export type AcornSheetEntry = { cell: number; width: number; height: number; columns: number; anims: Record<AcornAnimName, SheetRow>; hash: string; box: SheetBox };
export const PET_SHEETS = ${body} as const satisfies Record<"young" | "adult" | "veteran", Record<string, SheetEntry>> & { acorn: AcornSheetEntry };
`;
  writeFileSync(GEN, ts);
  const n = STAGES.reduce((a, stage) => a + Object.keys(out[stage]).length, 0);
  console.log("ok", "src/lib/pet/sheets.gen.ts", n, "combinaciones");
}

const [a, b] = process.argv.slice(2);
if (a === "--gen") await generate();
else if (a === "--compress") { await compressAll(); await generate(); }
else if (STAGES.includes(a) && CLASSES.includes(b)) { await fetchSheet(a, b); await generate(); }
else { console.error("uso: fetch-character.mjs <stage> <class> | --gen | --compress"); process.exit(1); }
