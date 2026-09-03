# Mascota: sprites de personaje PixelLab — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el rig por partes de la mascota por sprite sheets de un personaje PixelLab (18 combinaciones etapa × clase, 8 rotaciones + 4 animaciones sur), sin cambiar la API de `<PetSprite>` ni sus consumidores.

**Architecture:** El arte se genera con el MCP `pixellab` (un personaje por etapa, un *state* por clase, animaciones por *state*) y se descarga con `scripts/pet-pixellab/fetch-character.mjs`, que deja `public/pet/sheets/<stage>/<class>.{png,json}` y genera el módulo tipado `src/lib/pet/sheets.gen.ts`. `manifest.ts` describe sheets y animaciones; `<PetSprite>` pinta una celda del sheet con `background-position` animado por `steps()`. El rig (piezas, caras, capas, scripts) se borra.

**Tech Stack:** Next.js (app router, componente servidor sin estado), CSS Modules, Vitest + Testing Library (jsdom), Node 22 ESM, `sharp`, MCP `pixellab`, `gh`.

Spec: `docs/superpowers/specs/2026-09-03-mascota-sprites-personaje-design.md`. Pipeline y brief por pieza: `docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`.

## Global Constraints

- Lienzo del personaje **40×40**, `view: low top-down`, `no_background`. Celda del sheet la fija PixelLab (52×52 para 40 px); **no se recorta**.
- Nombres de animación exactos al llamar a `animate_character`: `idle`, `sleepy`, `sad`, `joy` (`animation_name`). Solo dirección `south` en esta fase.
- Fichero por combinación: `public/pet/sheets/<stage>/<class>.png` y `.json`; etapas `young | adult | veteran`; clases en el orden de `PET_CLASSES` (`barbarian, fighter, wizard, cleric, bard, ranger`).
- API de `<PetSprite>` intacta: `stage, petClass, mood, scale (1|2|3), reaction?, label` (+ `direction?` nueva, por defecto `south`). `data-mood`, `data-reaction`, `role="img"`, `aria-label` se conservan.
- Cada tanda de generación anota generaciones gastadas (`get_balance` antes y después) en el resumen de la tarea.
- Candidatos y hojas de contacto a `.superpowers/brainstorm/pixellab-2026-09-03/` (no versionado); a `public/pet/` solo lo elegido.
- Node en esta máquina: forzar v22 (`fnm use 22`) si el shell arranca con v20 (vitest rompe con v20).
- Commits en la rama `feat/pet-sprites-pixellab`, mensajes en español con tipo (`feat|fix|docs|test|chore(pet)`), pie:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MAe5vgjS1WbkyRKC8pfRDf
  ```

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `scripts/pet-pixellab/characters.json` (nuevo) | IDs de PixelLab: etapa → `base` + `classes.<cls>.character_id` + `anims.<name>` (group id). Fuente para regenerar sin rehacer. |
| `scripts/pet-pixellab/fetch-character.mjs` (nuevo) | Descarga el spritesheet zip de un *state*, lo coloca en `public/pet/sheets/`, regenera `src/lib/pet/sheets.gen.ts`. |
| `scripts/pet-pixellab/ref/{young,adult,veteran}.png` (nuevo) | Ardilla plana IA usada como `reference_image` de cada personaje base. |
| `scripts/pet-pixellab/sheet.mjs` (existe) | Hoja de contacto ×6. Se queda. |
| `src/lib/pet/sheets.gen.ts` (generado) | `PET_SHEETS[stage][cls] = { cell, width, height, columns, directions, rotationsRow, anims }`. |
| `src/lib/pet/manifest.ts` (reescribir) | `PET_MANIFEST`: bellota, ruta de sheet, animaciones (fps, loop), `moodAnim`. |
| `src/lib/pet/manifest.test.ts` (reescribir) | Existe cada PNG y cada entrada generada con 8 direcciones y 4 animaciones. |
| `src/components/pet/pet-sprite.tsx` (reescribir) | Pinta una celda del sheet; elige fila por humor/reacción; columna por dirección. |
| `src/components/pet/pet-sprite.module.css` (reescribir) | `@keyframes strip`, evolución, `prefers-reduced-motion`. |
| `src/components/pet/pet-sprite.test.tsx` (reescribir) | Fila/frames/columna por props; bellota; data-attributes. |
| Borrar | `public/pet/{young,adult,veteran,face,class}/`, `scripts/pet-sprites.mjs`, `scripts/pet-pixellab/{lib,compose,slice,extract-layer,rig}.mjs`. |
| Doc | spec canónica PixelLab, `.claude/agents/pet-artist.md`, `AGENTS.md` (bloque pixel-art), `decisiones.md`, issues. |

---

### Task 1: `fetch-character.mjs` + `characters.json` + generador de `sheets.gen.ts`

**Files:**
- Create: `scripts/pet-pixellab/characters.json`
- Create: `scripts/pet-pixellab/fetch-character.mjs`
- Create (generado): `src/lib/pet/sheets.gen.ts`

**Interfaces:**
- Consumes: endpoint `GET https://api.pixellab.ai/mcp/characters/<id>/spritesheet` (zip: `<name>.png` + `<name>.json`; HTTP 423 mientras haya jobs). Formato del JSON (visto el 2026-09-03):
  ```json
  { "spritesheet": { "path": "X.png", "cell_size": {"width":52,"height":52}, "sheet_size": {"width":468,"height":260}, "columns": 9, "pivot": "cell-center",
      "rows": [ {"row":0,"type":"rotations","frame_count":8,"directions":["south","south-east","east","north-east","north","north-west","west","south-west"]},
                {"row":1,"type":"animation","frame_count":9,"animation":"joy","animation_group_id":"…","direction":"south"} ] } }
  ```
- Produces: `src/lib/pet/sheets.gen.ts` con exactamente esta forma (Task 4 y 5 dependen de ella):
  ```ts
  // GENERADO por scripts/pet-pixellab/fetch-character.mjs — no editar a mano.
  export type PetAnimName = "idle" | "sleepy" | "sad" | "joy";
  export type SheetRow = { row: number; frames: number };
  export type SheetEntry = {
    cell: number;            // lado de la celda en px (52)
    width: number;           // ancho del sheet en px
    height: number;          // alto del sheet en px
    columns: number;
    directions: readonly string[]; // orden de columnas de la fila de rotaciones
    rotationsRow: number;
    anims: Record<PetAnimName, SheetRow>; // solo dirección sur
  };
  export const PET_SHEETS = { young: { barbarian: {...}, ... }, adult: {...}, veteran: {...} } as const satisfies Record<"young"|"adult"|"veteran", Record<string, SheetEntry>>;
  ```
  Si a una combinación le falta una animación, el generador **falla** con mensaje `falta animación <name> (south) en <stage>/<cls>` — no genera entradas incompletas.

- [ ] **Step 1: `characters.json` sembrado con lo que ya existe**

Los ids del personaje base adulto y del estado mago ya se generaron en la prueba del 2026-09-03; se reutilizan (ahorra ~30 gens).

```json
{
  "young":   { "base": null, "classes": {} },
  "adult":   { "base": "72a0972d-3e0b-4a08-b856-b175ab542235",
               "classes": { "wizard": { "character_id": "f19a4575-f675-4410-9853-e6a4310da6b3", "anims": {} } } },
  "veteran": { "base": null, "classes": {} }
}
```

- [ ] **Step 2: escribir `fetch-character.mjs`**

```js
// Descarga el spritesheet de un *state* de PixelLab y lo deja en public/pet/sheets/<stage>/<cls>.{png,json};
// después regenera src/lib/pet/sheets.gen.ts a partir de TODOS los JSON presentes.
//   node scripts/pet-pixellab/fetch-character.mjs <stage> <class>        # usa characters.json
//   node scripts/pet-pixellab/fetch-character.mjs --gen                  # solo regenerar sheets.gen.ts
// Reintenta mientras el endpoint devuelva 423 (jobs en curso). Necesita `tar` (bsdtar de Windows 10 / macOS / Linux) para el zip.
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
  execFileSync("tar", ["-xf", zip, "-C", tmp]);
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
    const r = s.rows.find((x) => x.type === "animation" && x.animation === name && x.direction === "south");
    if (!r) throw new Error(`falta animación ${name} (south) en ${stage}/${cls}`);
    anims[name] = { row: r.row, frames: r.frame_count };
  }
  return { cell: s.cell_size.width, width: s.sheet_size.width, height: s.sheet_size.height, columns: s.columns, directions: rot.directions, rotationsRow: rot.row, anims };
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
  const body = JSON.stringify(out, null, 2);
  const ts = `// GENERADO por scripts/pet-pixellab/fetch-character.mjs — no editar a mano.
// Layout de cada spritesheet de public/pet/sheets/<stage>/<class>.png (spec sprites-personaje §5).
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
export const PET_SHEETS = ${body} as const satisfies Record<"young" | "adult" | "veteran", Record<string, SheetEntry>>;
`;
  writeFileSync(GEN, ts);
  const n = Object.values(out).reduce((a, s) => a + Object.keys(s).length, 0);
  console.log("ok", "src/lib/pet/sheets.gen.ts", n, "combinaciones");
}

const [a, b] = process.argv.slice(2);
if (a === "--gen") generate();
else if (STAGES.includes(a) && CLASSES.includes(b)) { await fetchSheet(a, b); generate(); }
else { console.error("uso: fetch-character.mjs <stage> <class> | --gen"); process.exit(1); }
```

- [ ] **Step 3: probar contra el estado mago que ya existe**

Run: `node scripts/pet-pixellab/fetch-character.mjs adult wizard`
Expected: `ok public/pet/sheets/adult/wizard.{png,json}` y después **error** `falta animación idle (south) en adult/wizard` (el estado mago todavía no tiene animaciones: el generador falla a propósito). Comprobar que existen `public/pet/sheets/adult/wizard.png` (~30 KB) y `.json`.

Run: `node scripts/pet-pixellab/fetch-character.mjs --gen`
Expected: mismo error. Correcto: hasta Task 3 no hay animaciones. Borrar ahora esos dos ficheros para que el commit no lleve un sheet sin animaciones: `rm public/pet/sheets/adult/wizard.*`.

- [ ] **Step 4: commit**

```bash
git add scripts/pet-pixellab/characters.json scripts/pet-pixellab/fetch-character.mjs
git commit -m "chore(pet): fetch-character.mjs descarga sheets de PixelLab y genera sheets.gen.ts"
```

---

### Task 2: arte — personajes base (3) y estados de clase (18)

Agente: `pet-artist` (o el hilo principal con las herramientas `mcp__pixellab__*`). No hay tests: la verificación es visual (hojas de contacto) y el registro en `characters.json`.

**Files:**
- Create: `scripts/pet-pixellab/ref/{young,adult,veteran}.png`
- Modify: `scripts/pet-pixellab/characters.json`

**Interfaces:**
- Produces: `characters.json` con `base` y los 18 `classes.<cls>.character_id` rellenos.

- [ ] **Step 1: referencias planas al repo**

Copiar de `.superpowers/brainstorm/pixellab-2026-09-03/`: `c_young_nude.png → scripts/pet-pixellab/ref/young.png`, `c_adult_nude.png → ref/adult.png`, `c_vet_nude.png → ref/veteran.png`. Si la carpeta no existe (otra máquina), regenerarlas: `create_image_pixflux` con `init_image` = ardilla procedural aplanada (commit `00ef75be` tiene `compose.mjs`), fuerza 150, brief de la spec canónica §5.

- [ ] **Step 2: `get_balance` y anotar**

- [ ] **Step 3: personajes base de cría y veterana** (adulta ya existe: `72a0972d-…`)

```
create_character(mode="v3", name="Ardilla base cría",    view="low top-down",
  reference_image_base64=<ref/young.png>,
  description="baby chibi red squirrel mascot with oversized head and tiny body, small fluffy tail, cream belly, standing on two feet, game character, pixel art, black outline, flat shading")
create_character(mode="v3", name="Ardilla base veterana", view="low top-down",
  reference_image_base64=<ref/veteran.png>,
  description="old veteran chibi red squirrel mascot, big fluffy tail with grey white streaks of age, small scar over one eyebrow, cream belly, standing on two feet, game character, pixel art, black outline, flat shading")
```
Esperar `get_character` = completed (3-5 min). Descargar las 8 rotaciones de cada uno (URLs `rotations/<dir>.png`) y montar `sheet.mjs` → `.superpowers/brainstorm/pixellab-2026-09-03/rot_<stage>.png`. Criterio: las 8 direcciones son la misma ardilla y la etapa se distingue de la adulta (cabezona / canas). Si no, `delete_character` y repetir con otra `seed` o descripción. Anotar `base` en `characters.json`.

- [ ] **Step 4: 18 estados de clase** (mago adulto ya existe: `f19a4575-…`)

Por cada etapa y clase, `create_character_state(character_id=<base de la etapa>, state_name="<cls>-<stage>", use_color_palette_from_reference=false, edit_description=…)` con estos briefs (spec canónica §5):

| Clase | `edit_description` |
|---|---|
| barbarian | `wearing a grey iron horned helmet and holding a small iron mace in the left paw` |
| fighter | `wearing a steel helmet with a red plume and holding a short sword in the left paw` |
| wizard | `wearing a blue pointed wizard hat with gold stars and holding a thin wooden staff with a glowing purple crystal` |
| cleric | `wearing a white tabard with a gold cross over the torso and holding a small wooden holy symbol in the left paw` |
| bard | `wearing a green feathered cap and holding a small lute` |
| ranger | `wearing a green hood and holding a short bow in the left paw` |

Lanzar de 4 en 4 (cada uno 30-90 s, 20-40 gens). Al completar cada uno: descargar sus 8 rotaciones, hoja de contacto `rot_<stage>_<cls>.png`, criterio: prenda y objeto visibles en las 8 direcciones y la ardilla sigue siendo la misma. Re-roll con `delete_character` + repetir si falla. Anotar `character_id` en `characters.json`.

- [ ] **Step 5: hoja de contacto de las 18 vistas sur** → `.superpowers/brainstorm/pixellab-2026-09-03/all_south.png` y enviarla al usuario (SendUserFile). `get_balance` y anotar gasto.

- [ ] **Step 6: commit**

```bash
git add scripts/pet-pixellab/ref scripts/pet-pixellab/characters.json
git commit -m "feat(pet): personajes PixelLab por etapa y estados de clase (ids en characters.json)"
```

---

### Task 3: arte — animaciones (72) y descarga de sheets

**Files:**
- Modify: `scripts/pet-pixellab/characters.json` (`anims`)
- Create: `public/pet/sheets/<stage>/<class>.{png,json}` × 18
- Create (generado): `src/lib/pet/sheets.gen.ts`

**Interfaces:**
- Consumes: `characters.json` de Task 2; `fetch-character.mjs` de Task 1.
- Produces: `PET_SHEETS` completo (18 entradas, 4 animaciones cada una).

- [ ] **Step 1: por cada uno de los 18 `character_id` de clase, 4 animaciones dirección sur**

```
animate_character(character_id=<id>, template_animation_id="breathing-idle", directions=["south"], animation_name="idle")
animate_character(character_id=<id>, mode="v3", directions=["south"], frame_count=8, animation_name="sleepy",
  action_description="dozing off: eyes closed, head nodding slowly, slow breathing, tail drooping")
animate_character(character_id=<id>, mode="v3", directions=["south"], frame_count=8, animation_name="sad",
  action_description="sad and droopy: ears down, head lowered, tail hanging low, slow sigh")
animate_character(character_id=<id>, mode="v3", directions=["south"], frame_count=8, animation_name="joy",
  action_description="happy celebration: hops up with both paws raised, tail flicks up, lands back in the same spot")
```
`animation_name` es exactamente `idle|sleepy|sad|joy`: el JSON exportado lo usa como `animation` y el generador busca ese nombre. Lanzar por lotes de un personaje (4 jobs) y seguir con el siguiente sin esperar; ~1 gen por animación.

- [ ] **Step 2: revisar cada personaje al completar** (`get_character`): descargar los frames sur de las 4 animaciones, `sheet.mjs` → `anim_<stage>_<cls>.png`. Criterio: la ardilla mantiene identidad en todos los frames; `joy` tiene salto visible; `sleepy` ojos cerrados; `sad` orejas/cola caídas. Si una falla: `delete_animation(character_id, animation_group_id=<group>)` y repetir con otra `seed`. Anotar `anims.<name> = <animation_group_id>` en `characters.json`.

- [ ] **Step 3: descargar los 18 sheets**

Run (por cada combinación): `node scripts/pet-pixellab/fetch-character.mjs <stage> <class>`
Expected: `ok public/pet/sheets/<stage>/<class>.{png,json}` y `ok src/lib/pet/sheets.gen.ts N combinaciones` (N crece hasta 18). Si sale `falta animación …`, esa animación no terminó o el nombre no coincide: revisar en `get_character`.

- [ ] **Step 4: comprobar el generado**

Run: `npx tsc --noEmit -p .`
Expected: sin errores (el `satisfies` valida la forma). Abrir `src/lib/pet/sheets.gen.ts`: 3 etapas × 6 clases, cada `anims` con `idle`, `sleepy`, `sad`, `joy`, `directions` de 8.

- [ ] **Step 5: `get_balance`, anotar gasto total de Task 2+3. Commit**

```bash
git add public/pet/sheets src/lib/pet/sheets.gen.ts scripts/pet-pixellab/characters.json
git commit -m "feat(pet): spritesheets PixelLab de las 18 combinaciones etapa × clase con idle/sleepy/sad/joy"
```

---

### Task 4: manifiesto nuevo + test

**Files:**
- Modify: `src/lib/pet/manifest.ts` (reescribir entero)
- Modify: `src/lib/pet/manifest.test.ts` (reescribir entero)

**Interfaces:**
- Consumes: `PET_SHEETS`, `PetAnimName`, `SheetEntry` de `src/lib/pet/sheets.gen.ts`; `PET_CLASSES`, `PetClass`, `PetMood`, `PetStage` de `./classes`.
- Produces (Task 5 depende de esto):
  ```ts
  export type DrawnStage = Exclude<PetStage, "acorn">;
  export type PetDirection = "south" | "south-east" | "east" | "north-east" | "north" | "north-west" | "west" | "south-west";
  export const DRAWN_STAGES: readonly DrawnStage[];
  export const PET_MANIFEST: {
    acorn: { src: "/pet/acorn.png" };
    anims: Record<PetAnimName, { fps: number; loop: boolean }>;
    moodAnim: Record<PetMood, PetAnimName>;
  };
  export function sheetSrc(stage: DrawnStage, cls: PetClass): string;   // "/pet/sheets/<stage>/<cls>.png"
  export function sheetEntry(stage: DrawnStage, cls: PetClass): SheetEntry;
  ```

- [ ] **Step 1: escribir el test (falla)**

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PET_CLASSES } from "./classes";
import { DRAWN_STAGES, PET_MANIFEST, sheetEntry, sheetSrc } from "./manifest";

const PUBLIC = join(process.cwd(), "public");
const exists = (src: string) => existsSync(join(PUBLIC, src));
const ANIMS = ["idle", "sleepy", "sad", "joy"] as const;

// Que falte un sheet o una animación en prod se caza AQUÍ, no mirando la app
// (spec sprites-personaje §5).
describe("manifiesto de la mascota", () => {
  it("existe la bellota", () => {
    expect(exists(PET_MANIFEST.acorn.src)).toBe(true);
  });

  it("existe el sheet PNG de cada etapa × clase", () => {
    for (const stage of DRAWN_STAGES) for (const cls of PET_CLASSES) {
      expect(exists(sheetSrc(stage, cls)), `${stage}/${cls}`).toBe(true);
    }
  });

  it("cada entrada generada tiene 8 direcciones y las cuatro animaciones sur", () => {
    for (const stage of DRAWN_STAGES) for (const cls of PET_CLASSES) {
      const e = sheetEntry(stage, cls);
      expect(e.directions.length, `${stage}/${cls} direcciones`).toBe(8);
      expect(e.directions[0]).toBe("south");
      expect(e.cell).toBeGreaterThanOrEqual(40);
      for (const a of ANIMS) expect(e.anims[a].frames, `${stage}/${cls} ${a}`).toBeGreaterThan(0);
    }
  });

  it("todo humor apunta a una animación con fps", () => {
    for (const anim of Object.values(PET_MANIFEST.moodAnim)) {
      expect(PET_MANIFEST.anims[anim].fps).toBeGreaterThan(0);
    }
    expect(PET_MANIFEST.anims.joy.loop).toBe(false);
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/lib/pet/manifest.test.ts`
Expected: FAIL — `DRAWN_STAGES`/`sheetSrc`/`sheetEntry` no exportados.

- [ ] **Step 3: reescribir `manifest.ts`**

```ts
import type { PetClass, PetMood, PetStage } from "./classes";
import { PET_SHEETS, type PetAnimName, type SheetEntry } from "./sheets.gen";

// Fuente de verdad de qué sheet va dónde y qué animación toca (spec
// sprites-personaje §5). El layout de cada sheet lo genera fetch-character.mjs
// en sheets.gen.ts; manifest.test.ts comprueba que existe cada PNG.
export type DrawnStage = Exclude<PetStage, "acorn">;
export type PetDirection = "south" | "south-east" | "east" | "north-east" | "north" | "north-west" | "west" | "south-west";
export const DRAWN_STAGES = ["young", "adult", "veteran"] as const satisfies readonly DrawnStage[];

export const PET_MANIFEST = {
  acorn: { src: "/pet/acorn.png" },
  anims: {
    idle: { fps: 4, loop: true },
    sleepy: { fps: 3, loop: true },
    sad: { fps: 3, loop: true },
    joy: { fps: 10, loop: false },
  } satisfies Record<PetAnimName, { fps: number; loop: boolean }>,
  // El humor ya no es una capa de cara: es la animación que se reproduce.
  moodAnim: { happy: "idle", neutral: "idle", sleepy: "sleepy", sad: "sad" } satisfies Record<PetMood, PetAnimName>,
} as const;

export function sheetSrc(stage: DrawnStage, cls: PetClass): string {
  return `/pet/sheets/${stage}/${cls}.png`;
}

export function sheetEntry(stage: DrawnStage, cls: PetClass): SheetEntry {
  const e = (PET_SHEETS[stage] as Record<string, SheetEntry>)[cls];
  if (!e) throw new Error(`sheets.gen.ts sin entrada para ${stage}/${cls}: corre fetch-character.mjs`);
  return e;
}
```

- [ ] **Step 4: correr y ver que pasa**

Run: `npx vitest run src/lib/pet/manifest.test.ts`
Expected: PASS (4 tests). `npx tsc --noEmit -p .` fallará todavía por `pet-sprite.tsx` (usa `PET_MANIFEST.stages`): se arregla en Task 5.

- [ ] **Step 5: commit**

```bash
git add src/lib/pet/manifest.ts src/lib/pet/manifest.test.ts
git commit -m "feat(pet): manifiesto de sheets y animaciones (sustituye piezas y caras)"
```

---

### Task 5: `<PetSprite>` sobre sprite sheet

**Files:**
- Modify: `src/components/pet/pet-sprite.tsx` (reescribir entero)
- Modify: `src/components/pet/pet-sprite.module.css` (reescribir entero)
- Modify: `src/components/pet/pet-sprite.test.tsx` (reescribir entero)

**Interfaces:**
- Consumes: `PET_MANIFEST`, `sheetSrc`, `sheetEntry`, `PetDirection` de `@/lib/pet/manifest`.
- Produces: `PetSprite` con props `{ stage, petClass, mood, scale: 1|2|3, reaction?: "joy"|"evolve"|null, label, direction?: PetDirection }` y `export type PetReaction`. Atributos para CSS/tests: `data-mood`, `data-reaction`, `data-anim` (nombre de fila), `data-frames`, `data-col` (solo vista estática).

- [ ] **Step 1: escribir el test (falla)**

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sheetEntry } from "@/lib/pet/manifest";
import { PetSprite } from "./pet-sprite";

afterEach(cleanup);

describe("PetSprite", () => {
  it("bellota: una sola imagen y sin sheet", () => {
    const { container } = render(<PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={2} label="Bellota" />);
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute("src")).toBe("/pet/acorn.png");
    expect(container.firstElementChild!.getAttribute("aria-label")).toBe("Bellota");
  });

  it("adulta maga contenta: sheet de maga adulta, fila idle, caja = celda × escala", () => {
    const e = sheetEntry("adult", "wizard");
    const { container } = render(<PetSprite stage="adult" petClass="wizard" mood="happy" scale={2} label="Nuez" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.backgroundImage).toContain("/pet/sheets/adult/wizard.png");
    expect(root.style.width).toBe(`${e.cell * 2}px`);
    expect(root.style.height).toBe(`${e.cell * 2}px`);
    expect(root.getAttribute("data-anim")).toBe("idle");
    expect(root.getAttribute("data-frames")).toBe(String(e.anims.idle.frames));
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.anims.idle.row));
  });

  it("dormida usa la fila sleepy; triste la fila sad", () => {
    const a = render(<PetSprite stage="young" petClass="bard" mood="sleepy" scale={1} label="Lira" />);
    expect(a.container.firstElementChild!.getAttribute("data-anim")).toBe("sleepy");
    cleanup();
    const b = render(<PetSprite stage="veteran" petClass="ranger" mood="sad" scale={1} label="Arco" />);
    expect(b.container.firstElementChild!.getAttribute("data-anim")).toBe("sad");
  });

  it("la reacción de alegría manda sobre el humor", () => {
    const { container } = render(<PetSprite stage="adult" petClass="cleric" mood="sad" scale={1} reaction="joy" label="Fray" />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("data-anim")).toBe("joy");
    expect(root.getAttribute("data-reaction")).toBe("joy");
    expect(root.getAttribute("data-mood")).toBe("sad");
  });

  it("otra dirección: frame estático de la fila de rotaciones, sin animación", () => {
    const e = sheetEntry("adult", "fighter");
    const { container } = render(<PetSprite stage="adult" petClass="fighter" mood="happy" scale={1} direction="east" label="Espada" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-anim")).toBeNull();
    expect(root.getAttribute("data-col")).toBe(String(e.directions.indexOf("east")));
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.rotationsRow));
  });
});
```

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run src/components/pet/pet-sprite.test.tsx`
Expected: FAIL (el componente actual pinta `img` de piezas y no tiene `data-anim`).

- [ ] **Step 3: reescribir `pet-sprite.tsx`**

```tsx
import type { CSSProperties } from "react";
import type { PetClass, PetMood, PetStage } from "@/lib/pet/classes";
import { PET_MANIFEST, sheetEntry, sheetSrc, type PetDirection } from "@/lib/pet/manifest";
import styles from "./pet-sprite.module.css";

export type PetReaction = "joy" | "evolve" | null;

export interface PetSpriteProps {
  stage: PetStage;
  petClass: PetClass;
  mood: PetMood;
  /** 1 = una celda (52 px), 2 = página, 3 = eclosión. */
  scale: 1 | 2 | 3;
  reaction?: PetReaction;
  /** Solo la sur tiene animaciones en esta fase; otra dirección pinta el frame de rotación quieto. */
  direction?: PetDirection;
  /** Nombre accesible (el nombre de la mascota). */
  label: string;
}

// Pinta UNA celda del spritesheet de PixelLab (spec sprites-personaje §6). Sin
// "use client": no tiene estado; la animación es CSS (`background-position-x`
// con steps()) y la reacción llega por prop desde quien sí tiene estado.
export function PetSprite({ stage, petClass, mood, scale, reaction = null, direction = "south", label }: PetSpriteProps) {
  if (stage === "acorn") {
    const size = 40 * scale;
    return (
      <div className={styles.root} style={{ width: size, height: size }} role="img" aria-label={label} data-mood={mood} data-reaction={reaction ?? undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- pixel art: next/image reescalaría con filtro bilineal */}
        <img src={PET_MANIFEST.acorn.src} alt="" width={size} height={size} />
      </div>
    );
  }

  const entry = sheetEntry(stage, petClass);
  const px = entry.cell * scale;
  const animated = direction === "south";
  const anim = reaction === "joy" ? "joy" : PET_MANIFEST.moodAnim[mood];
  const row = animated ? entry.anims[anim] : { row: entry.rotationsRow, frames: 1 };
  const col = animated ? 0 : Math.max(0, entry.directions.indexOf(direction));
  const { fps, loop } = PET_MANIFEST.anims[anim];

  const style = {
    width: px,
    height: px,
    backgroundImage: `url(${sheetSrc(stage, petClass)})`,
    backgroundSize: `${entry.width * scale}px ${entry.height * scale}px`,
    "--pet-cell": `${px}px`,
    "--pet-row": row.row,
    "--pet-col": col,
    "--pet-frames": row.frames,
    "--pet-duration": `${row.frames / fps}s`,
    "--pet-loop": loop ? "infinite" : "1",
  } as CSSProperties;

  return (
    <div
      className={`${styles.root} ${styles.sheet}${animated ? ` ${styles.animated}` : ""}`}
      style={style}
      role="img"
      aria-label={label}
      data-mood={mood}
      data-reaction={reaction ?? undefined}
      data-anim={animated ? anim : undefined}
      data-frames={animated ? row.frames : undefined}
      data-col={animated ? undefined : col}
    />
  );
}
```

- [ ] **Step 4: reescribir `pet-sprite.module.css`**

```css
/* Sprite sheet de PixelLab (spec sprites-personaje §6). Una celda visible; la
   animación recorre la fila con steps(). Variables que pone el componente:
   --pet-cell (px), --pet-row, --pet-col, --pet-frames, --pet-duration, --pet-loop. */
.root {
  position: relative;
  display: inline-block;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.root > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
.sheet {
  background-repeat: no-repeat;
  background-position-x: calc(var(--pet-col) * var(--pet-cell) * -1);
  background-position-y: calc(var(--pet-row) * var(--pet-cell) * -1);
}
.animated {
  animation: strip var(--pet-duration) steps(var(--pet-frames)) var(--pet-loop);
}
@keyframes strip {
  from { background-position-x: 0; }
  to { background-position-x: calc(var(--pet-frames) * var(--pet-cell) * -1); }
}

/* reacción de evolución: destello + escala sobre la celda entera */
.root[data-reaction="evolve"] { animation: evolve 1.2s ease-out; }
@keyframes evolve { 0% { filter: brightness(1); transform: scale(1); } 40% { filter: brightness(2.2); transform: scale(1.15); } 100% { filter: brightness(1); transform: scale(1); } }

/* Movimiento reducido: frame 0 quieto; evolución = fundido corto. */
@media (prefers-reduced-motion: reduce) {
  .animated { animation: none; }
  .root[data-reaction="evolve"] { animation: fadeIn 0.6s ease-out; }
  @keyframes fadeIn { from { opacity: 0.4; } to { opacity: 1; } }
}
```

Nota: `steps(var(--pet-frames))` dentro del shorthand `animation` se resuelve en tiempo de cómputo; Chrome, Firefox y Safari lo aceptan. Si en el navegador la animación no arranca, sustituir por `animation-timing-function` inline en el componente: `animationTimingFunction: \`steps(${row.frames})\``.

- [ ] **Step 5: correr tests + typecheck + lint**

Run: `npx vitest run src/components/pet src/lib/pet && npx tsc --noEmit -p . && npx eslint src/components/pet src/lib/pet`
Expected: todos PASS, sin errores de tipos ni lint.

- [ ] **Step 6: mirar en el navegador**

Con `npm run dev` (un solo `next dev`, puerto 3000) y sesión iniciada: `/mascota` (3×) y la compañera (1×, esquina inferior derecha). Comprobar: se ve la clase correcta, la animación recorre frames sin «saltos» de celda, `joy` al subir de nivel dura ~0.9 s, `data-mood` en el DOM. Cambiar `mood` en DevTools (`data-mood` no cambia la fila: la fila la fija la prop) — cambiar de clase desde `/mascota` y ver otro sheet.

- [ ] **Step 7: commit**

```bash
git add src/components/pet/pet-sprite.tsx src/components/pet/pet-sprite.module.css src/components/pet/pet-sprite.test.tsx
git commit -m "feat(pet): PetSprite pinta spritesheets de personaje; humor y reacción como fila animada"
```

---

### Task 6: borrar el rig, sincronizar doc, issues

**Files:**
- Delete: `public/pet/young/`, `public/pet/adult/`, `public/pet/veteran/`, `public/pet/face/`, `public/pet/class/`, `scripts/pet-sprites.mjs`, `scripts/pet-pixellab/lib.mjs`, `scripts/pet-pixellab/compose.mjs`, `scripts/pet-pixellab/slice.mjs`, `scripts/pet-pixellab/extract-layer.mjs`, `scripts/pet-pixellab/rig.mjs`
- Modify: `docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`, `.claude/agents/pet-artist.md`, `AGENTS.md` (bloque `biblioshare-pixel-art`), `docs/requirements/decisiones.md` (append), `docs/requirements/backlog.md` (si lista el arte de la mascota)
- Issues: nueva (paseo), comentario en #1015, #1021

- [ ] **Step 1: borrar y comprobar que nada los referencia**

```bash
git rm -r -q public/pet/young public/pet/adult public/pet/veteran public/pet/face public/pet/class scripts/pet-sprites.mjs scripts/pet-pixellab/lib.mjs scripts/pet-pixellab/compose.mjs scripts/pet-pixellab/slice.mjs scripts/pet-pixellab/extract-layer.mjs scripts/pet-pixellab/rig.mjs
```
Run: `grep -rn "pet-sprites.mjs\|/pet/face\|/pet/class/\|classLayerSrc\|PET_MANIFEST.stages\|PET_MANIFEST.faces\|data-part" src scripts docs/architecture e2e --include=*.ts --include=*.tsx --include=*.mjs --include=*.json`
Expected: cero resultados en `src`, `scripts`, `e2e`. Si `docs/architecture/graph.json` cita `pet-sprites.mjs` o piezas, regenerarlo según `docs/architecture/README.md` (o editar el nodo a mano si la regeneración no está automatizada) — es DERIVADO.

- [ ] **Step 2: spec canónica PixelLab** — reescribir §1 «Decisión» (personaje, no capas), §3 «Pipeline» a: personaje base por etapa (v3 + `ref/`), `create_character_state` por clase, 4 `animate_character` sur, `fetch-character.mjs`; mover el híbrido de capas y el troceo a §4 «probado, descartado: el rig murió el 2026-09-03 (spec sprites-personaje)»; §5 brief se conserva (mismos prompts, ahora `edit_description`); añadir §5bis con los cuatro `action_description` de Task 3; actualizar fecha de cabecera.

- [ ] **Step 3: `.claude/agents/pet-artist.md`** — reglas duras nuevas: «personaje y estados, nunca capas»; «`animation_name` exacto idle|sleepy|sad|joy, dirección sur»; «tras generar: `fetch-character.mjs <stage> <cls>`, `npx vitest run src/lib/pet`»; borrar las reglas de `slice`/`extract-layer`/caras a mano.

- [ ] **Step 4: `AGENTS.md`** — en el bloque `biblioshare-pixel-art`, sustituir «No pidas piezas sueltas… ni superpongas caras…» por «El arte es un personaje PixelLab con estados por clase y sprite sheets (`fetch-character.mjs`); no vuelvas a capas ni a piezas: está probado y descartado (spec sprites-personaje §1)».

- [ ] **Step 5: `decisiones.md`** — entrada al final:

```markdown
## 2026-09-03 — Mascota: el rig por partes muere; sprites de personaje PixelLab

**Decisión.** `<PetSprite>` pinta sprite sheets de un personaje PixelLab (3 personajes base por
etapa, 18 estados de clase, 8 rotaciones y 4 animaciones sur cada uno) en vez de componer piezas
con `transform`. El humor es la animación que se reproduce, no una capa de cara. Spec:
`2026-09-03-mascota-sprites-personaje-design.md`.

**Por qué.** La fase 1 eligió rig porque la IA no daba coherencia entre frames y las capas hacían
barata cada animación. Con la suscripción a PixelLab, `create_character` v3 da 8 rotaciones
coherentes por 1-2 generaciones y `create_character_state` la clase en las 8 direcciones sin
capas. Y el producto quiere que la mascota pasee (issue #<nueva>) y pelee (#1015): un rig frontal
no rota.

**Consecuencia.** Se borran piezas, caras, capas de clase y sus scripts. La celda del sheet es la
unidad de dibujo (52 px para un personaje de 40): la compañera crece de 40 a 52 px a 1×. Añadir
una dirección o animación no exige regenerar la base: ids en `scripts/pet-pixellab/characters.json`.
```

- [ ] **Step 6: issues**

```bash
gh issue create --label "area:ui,tipo:feature,P3" --title "Mascota: la compañera pasea por la pantalla" --body-file <fichero>
```
Cuerpo: qué (la compañera camina por el borde inferior con idle/giro/walk en 4-8 direcciones), qué ya está (8 rotaciones por combinación en los sheets; `characters.json` con los ids para `animate_character walking`), qué falta (walk v3 custom porque la plantilla humanoide apenas mueve las patas — probado 2026-09-03; máquina de estados; `prefers-reduced-motion`; e2e), enlaces a #1015 y a la spec. Comentar en #1015 que las animaciones de combate se generan sobre los mismos personajes (`characters.json`). Comentar en #1021 que la PR de esta rama la cierra («Closes #1021» en el cuerpo de la PR).

- [ ] **Step 7: `backlog.md`** — si hay casilla del arte de la mascota, marcarla; si no, nada.

- [ ] **Step 8: tests completos y commit**

Run: `npx vitest run && npx tsc --noEmit -p . && npx eslint .`
Expected: PASS, sin errores.

```bash
git add -A docs AGENTS.md .claude/agents/pet-artist.md
git commit -m "chore+docs(pet): borrar el rig por partes y sincronizar spec, agente y decisiones"
```

---

### Task 7: verificación e2e y visual, PR

- [ ] **Step 1: build de producción + e2e de la mascota**

Run: `npm run build && npx playwright test e2e/mascota.spec.ts`
Expected: build OK; e2e PASS (usa `pet-companion` por testid; no toca piezas).

- [ ] **Step 2: hoja de contacto final** — `node scripts/pet-pixellab/sheet.mjs .superpowers/brainstorm/pixellab-2026-09-03/final_south.png <18 vistas sur>` y enviarla al usuario junto con una captura de `/mascota`.

- [ ] **Step 3: PR**

`gh pr create` contra `main`, título `feat(pet): sprites de personaje PixelLab en vez de rig por partes`, cuerpo: resumen, generaciones gastadas, hoja de contacto adjunta, `Closes #1021`, enlace a la spec, pie `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + URL de sesión.

---

## Self-review

- **Cobertura de la spec:** §1-2 (por qué/alcance) → doc en Task 6; §3 fuente de arte → Task 2-3; §4 assets y borrado → Task 1, 3, 6; §5 manifiesto + módulo generado → Task 1 (generador), Task 4; §6 componente (fila por humor/reacción, `direction`, reduced-motion, evolve, bellota) → Task 5; §7 tests → Task 4, 5, 7; §8 doc/issues → Task 6.
- **Placeholders:** ninguno; los briefs de clase y de animación están escritos; el cuerpo de la issue nueva se describe con su contenido.
- **Tipos:** `SheetEntry { cell, width, height, columns, directions, rotationsRow, anims }` y `PetAnimName` definidos en Task 1, usados igual en Task 4 (`sheetEntry`) y Task 5 (`entry.cell`, `entry.anims[anim]`, `entry.rotationsRow`, `entry.directions`). `PET_MANIFEST.anims[anim].fps/loop` y `moodAnim` definidos en Task 4, usados en Task 5. Atributos `data-anim/data-frames/data-col` y variable `--pet-row` coinciden entre componente y test.
