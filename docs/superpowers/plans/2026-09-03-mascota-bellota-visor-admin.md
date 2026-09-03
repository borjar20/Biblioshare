# Mascota: bellota animada y visor admin — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La bellota pasa a ser un sprite sheet con dos animaciones (`idle`, `ready`) pintado por el mismo `PetSprite`, y `/admin/mascota` enseña todas las animaciones de la mascota con el componente real.

**Architecture:** Los frames de la bellota los genera PixelLab (`animate_image`) y los empaqueta `scripts/pet-pixellab/pack-strip.mjs` en un sheet con el mismo layout JSON que exporta PixelLab, de modo que `fetch-character.mjs --gen` añade la entrada `acorn` a `sheets.gen.ts`. `PetSprite` deja de tener rama `<img>`; una prop `hatchReady` elige la fila `ready` solo en la bellota. `/admin/mascota` es una página servidor con la guardia de `/admin` que monta un cliente `PetGallery` con controles globales y paso frame a frame vía Web Animations API.

**Tech Stack:** Next.js (app router), React client components, CSS Modules, Vitest + Testing Library (jsdom), Playwright, Node 22 ESM + `sharp`, MCP `pixellab`, `gh`.

Spec: `docs/superpowers/specs/2026-09-03-mascota-bellota-visor-admin-design.md`. Pipeline: `docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`.

## Global Constraints

- Lienzo de la bellota **40×40**, `no_background`; `animate_image` con `frame_count=8` (9 frames guardados incluyendo el de referencia). Animaciones de la bellota: exactamente `idle` y `ready`.
- Sheet de la bellota en `public/pet/sheets/acorn.png` + `acorn.json` con el **mismo formato de layout que PixelLab** (`spritesheet.cell_size`, `sheet_size`, `columns`, `pivot: "cell-center"`, `rows[]` con una fila `rotations` de una dirección `south` y filas `animation` con `direction: "south"`). `public/pet/acorn.png` se borra.
- Frames elegidos versionados en `scripts/pet-pixellab/ref/acorn/<anim>/<n>.png`.
- `sheets.gen.ts` sigue siendo **generado solo** por `fetch-character.mjs`; gana `PET_SHEETS.acorn: AcornSheetEntry`.
- `PetSprite`: API intacta + `hatchReady?: boolean` (solo bellota). `ready` se ve **solo** en `hatch-form` con nombre válido (1-24 tras `trim`) y clase elegida.
- Visor en `src/app/admin/mascota/page.tsx` con la guardia idéntica a `src/app/admin/page.tsx` (`getCurrentUser` → `redirect(loginHref("/admin/mascota"))`; `hasMinRole(role, "admin")` → `redirect("/")`). Textos en `messages/es.json` bajo `admin.pet.*` (único locale del repo).
- El visor **no** añade props a `PetSprite` para pausar/avanzar: usa `element.getAnimations()`.
- Cualquier PNG nuevo o movido en `public/` exige subir `CACHE_NAME` en `public/sw.js` (hoy `biblioshare-v6` → `biblioshare-v7`).
- Node 22 (`fnm use 22` si el shell arranca v20). Un solo servidor en el puerto 3000; matar lo que se arranque.
- Rama `feat/pet-acorn-gallery` (sobre `feat/pet-sprites-pixellab`). Commits en español con tipo, pie:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MAe5vgjS1WbkyRKC8pfRDf
  ```
  Nunca `git add -A` en la raíz (`.github/hooks/`, `.impeccable/` son untracked ajenos).

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `scripts/pet-pixellab/ref/acorn/{idle,ready}/0..8.png` (nuevo) | Frames elegidos de la bellota. |
| `scripts/pet-pixellab/pack-strip.mjs` (nuevo) | Empaqueta frames en un sheet + layout JSON formato PixelLab. |
| `scripts/pet-pixellab/fetch-character.mjs` (modificar) | `--gen` añade `PET_SHEETS.acorn` (`AcornSheetEntry`). |
| `src/lib/pet/sheets.gen.ts` (generado) | + `acorn`. |
| `src/lib/pet/manifest.ts` / `manifest.test.ts` (modificar) | `PET_MANIFEST.acorn.anims`, `acornSrc()`, `acornEntry()`, `AcornAnimName`. |
| `src/components/pet/pet-sprite.tsx` / `.module.css` / `.test.tsx` (modificar) | Bellota por sheet; `hatchReady`; `@keyframes stripReady`. |
| `src/components/pet/hatch-form.tsx` (modificar) + `hatch-form.test.tsx` (nuevo) | Nombre controlado → `hatchReady`. |
| `src/app/admin/mascota/page.tsx` (nuevo) | Guardia + `<PetGallery />`. |
| `src/components/admin/pet-gallery.tsx` (nuevo) + `pet-gallery.test.tsx` (nuevo) | Rejilla + controles + Web Animations API. |
| `src/app/admin/page.tsx` (modificar) | Enlace a `/admin/mascota`. |
| `messages/es.json` (modificar) | `admin.pet.*`, `admin.petLink`. |
| `public/sw.js` (modificar) | `CACHE_NAME` v7. |
| `e2e/admin-mascota.spec.ts` (nuevo) | Redirecciones + rejilla con admin. |
| Docs | spec canónica §3bis, `pet-artist.md`, `decisiones.md`, `graph.json`. |

---

### Task 1: arte — bellota rediseñada y sus dos animaciones

Agente con las herramientas `mcp__pixellab__*`. Sin tests: verificación visual.

**Files:**
- Create: `scripts/pet-pixellab/ref/acorn/idle/0.png … 8.png`, `scripts/pet-pixellab/ref/acorn/ready/0.png … 8.png`, `scripts/pet-pixellab/ref/acorn/base.png`

**Interfaces:**
- Produces: 9 PNG 40×40 RGBA por animación (frame 0 = base), mismo `base.png` como frame 0 de ambas.

- [ ] **Step 1: `get_balance` y anotar.**

- [ ] **Step 2: rediseño (2-3 candidatos, 1 gen cada).**

```
create_image_pixflux(description="cute pixel art acorn mascot egg, warm brown shell with a lighter cap, tiny green leaf on top, cream highlight, black outline, flat shading, warm palette", init_image_base64=<public/pet/acorn.png>, init_image_strength=150, width=40, height=40, no_background=true, outline="single color black outline", shading="basic shading", seed=11)
create_image_pixflux(… same …, init_image_strength=100, seed=12)
create_image_pixen(description="cute pixel art acorn mascot egg, warm brown shell with a lighter cap, tiny green leaf on top, cream highlight, black outline, flat shading, warm palette, game sprite", width=40, height=40, no_background=true, seed=11)
```
Descargar (`curl -sfL <download> -o …`) a `.superpowers/brainstorm/pixellab-2026-09-03/acorn/`, hoja de contacto con `node scripts/pet-pixellab/sheet.mjs … actual=public/pet/acorn.png c1=… c2=… c3=…`, ver con Read, elegir: legible a 40 px, paleta del resto (marrones/crema), silueta clara. Guardar el elegido como `scripts/pet-pixellab/ref/acorn/base.png`.

- [ ] **Step 3: animaciones (1 gen cada).**

```
animate_image(first_frame_base64=<base.png>, frame_count=8, no_background=true, seed=11,
  action="gentle idle loop: the acorn sways very slightly, its small leaf twitches once, soft breathing")
animate_image(first_frame_base64=<base.png>, frame_count=8, no_background=true, seed=11,
  action="about to hatch: a thin crack glows and pulses on the shell, the acorn wobbles, light seeps out")
```
`get_image(job_id)` → 9 frames; descargar `…/download?index=0..8` a `ref/acorn/<anim>/<n>.png`. Tira con `sheet.mjs` por animación; criterio: la bellota no cambia de forma/paleta entre frames; `idle` apenas se mueve; `ready` muestra grieta/brillo claro. Re-roll (otra `seed`) máximo 2 veces por animación. Confirmar `file ref/acorn/*/*.png` = 40 x 40 RGBA.

- [ ] **Step 4: `get_balance`, anotar gasto. Commit**

```bash
git add scripts/pet-pixellab/ref/acorn
git commit -m "feat(pet): bellota rediseñada con PixelLab y frames de idle y ready"
```

---

### Task 2: `pack-strip.mjs`, entrada `acorn` en el generador, manifiesto

**Files:**
- Create: `scripts/pet-pixellab/pack-strip.mjs`
- Modify: `scripts/pet-pixellab/fetch-character.mjs` (función `generate` y tipos emitidos)
- Create (generado): `public/pet/sheets/acorn.png`, `public/pet/sheets/acorn.json`; regenerar `src/lib/pet/sheets.gen.ts`
- Delete: `public/pet/acorn.png`
- Modify: `public/sw.js` (`CACHE_NAME`), `src/lib/pet/manifest.ts`, `src/lib/pet/manifest.test.ts`

**Interfaces:**
- Produces en `sheets.gen.ts`:
  ```ts
  export type AcornAnimName = "idle" | "ready";
  export type AcornSheetEntry = { cell: number; width: number; height: number; columns: number; anims: Record<AcornAnimName, SheetRow> };
  export const PET_SHEETS = { young: …, adult: …, veteran: …, acorn: AcornSheetEntry } as const satisfies Record<"young"|"adult"|"veteran", Record<string, SheetEntry>> & { acorn: AcornSheetEntry };
  ```
- Produces en `manifest.ts`:
  ```ts
  export const PET_MANIFEST = { acorn: { anims: { idle: { fps: 4, loop: true }, ready: { fps: 6, loop: true } } }, anims: {…}, moodAnim: {…} } as const;
  export function acornSrc(): string;            // "/pet/sheets/acorn.png"
  export function acornEntry(): AcornSheetEntry; // PET_SHEETS.acorn
  ```

- [ ] **Step 1: test del manifiesto (falla)** — sustituir el `it("existe la bellota")` por:

```ts
  it("la bellota tiene sheet y las animaciones idle y ready", () => {
    expect(exists(acornSrc())).toBe(true);
    expect(acornSrc()).toBe("/pet/sheets/acorn.png");
    const e = acornEntry();
    expect(e.cell).toBeGreaterThanOrEqual(40);
    expect(e.anims.idle.frames).toBeGreaterThan(0);
    expect(e.anims.ready.frames).toBeGreaterThan(0);
    expect(PET_MANIFEST.acorn.anims.idle.fps).toBeGreaterThan(0);
    expect(PET_MANIFEST.acorn.anims.ready.fps).toBeGreaterThan(0);
  });
```
y añadir `acornEntry, acornSrc` al import. Run: `npx vitest run src/lib/pet/manifest.test.ts` → FAIL (`acornSrc` no exportado).

- [ ] **Step 2: `pack-strip.mjs`**

```js
// Empaqueta frames sueltos (p. ej. los de animate_image) en un sheet con el MISMO layout JSON que
// exporta PixelLab, para que fetch-character.mjs --gen los trate como cualquier otro sheet.
//   node scripts/pet-pixellab/pack-strip.mjs <out-basename> <cell> <anim>=<dir> [<anim>=<dir> ...]
// Ej.: node scripts/pet-pixellab/pack-strip.mjs public/pet/sheets/acorn 40 idle=scripts/pet-pixellab/ref/acorn/idle ready=scripts/pet-pixellab/ref/acorn/ready
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
```

- [ ] **Step 3: generador — entrada `acorn`** en `fetch-character.mjs`: añadir tras `entryFrom`:

```js
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
```
En `generate()`, tras el bucle de etapas: `const acornJson = join(SHEETS, "acorn.json"); if (existsSync(acornJson)) out.acorn = acornEntryFrom(JSON.parse(readFileSync(acornJson, "utf8")));`. En la plantilla `ts`, añadir tras `SheetEntry`:
```ts
export type AcornAnimName = "idle" | "ready";
export type AcornSheetEntry = { cell: number; width: number; height: number; columns: number; anims: Record<AcornAnimName, SheetRow> };
```
y cambiar el `satisfies` a `Record<"young" | "adult" | "veteran", Record<string, SheetEntry>> & { acorn: AcornSheetEntry }`. Actualizar el comentario de cabecera (`public/pet/sheets/<stage>/<class>.png y acorn.png`).

- [ ] **Step 4: empaquetar y generar**

Run: `node scripts/pet-pixellab/pack-strip.mjs public/pet/sheets/acorn 40 idle=scripts/pet-pixellab/ref/acorn/idle ready=scripts/pet-pixellab/ref/acorn/ready`
Expected: `ok public/pet/sheets/acorn.png 360x120 3 filas`.
Run: `node scripts/pet-pixellab/fetch-character.mjs --gen` → `ok src/lib/pet/sheets.gen.ts 18 combinaciones` y `acorn` presente en el fichero. `git rm public/pet/acorn.png`. En `public/sw.js`: `const CACHE_NAME = "biblioshare-v7";` con un comentario de una línea (la bellota cambia de ruta).

- [ ] **Step 5: `manifest.ts`**

```ts
import { PET_SHEETS, type AcornAnimName, type AcornSheetEntry, type PetAnimName, type SheetEntry } from "./sheets.gen";
…
export const PET_MANIFEST = {
  // La bellota es un sheet más (empaquetado por pack-strip.mjs): `idle` siempre, `ready` solo en
  // la eclosión con el formulario completo (spec bellota-visor §2).
  acorn: { anims: { idle: { fps: 4, loop: true }, ready: { fps: 6, loop: true } } satisfies Record<AcornAnimName, { fps: number; loop: boolean }> },
  anims: { … igual … },
  moodAnim: { … igual … },
} as const;

export function acornSrc(): string {
  return "/pet/sheets/acorn.png";
}

export function acornEntry(): AcornSheetEntry {
  const e = PET_SHEETS.acorn;
  if (!e) throw new Error("sheets.gen.ts sin entrada acorn: corre pack-strip.mjs y fetch-character.mjs --gen");
  return e;
}
```
(`PET_MANIFEST.acorn.src` desaparece.)

- [ ] **Step 6: correr**

Run: `npx vitest run src/lib/pet/manifest.test.ts` → PASS. `npx tsc --noEmit -p .` fallará SOLO en `src/components/pet/pet-sprite.tsx` (`PET_MANIFEST.acorn.src`): lo arregla Task 3.

- [ ] **Step 7: commit**

```bash
git add scripts/pet-pixellab/pack-strip.mjs scripts/pet-pixellab/fetch-character.mjs public/pet/sheets/acorn.png public/pet/sheets/acorn.json src/lib/pet/sheets.gen.ts src/lib/pet/manifest.ts src/lib/pet/manifest.test.ts public/sw.js
git rm -q public/pet/acorn.png
git commit -m "feat(pet): la bellota es un sheet (pack-strip.mjs) con idle y ready; entrada acorn en sheets.gen.ts"
```

---

### Task 3: `PetSprite` pinta la bellota por sheet; `hatchReady` en la eclosión

**Files:**
- Modify: `src/components/pet/pet-sprite.tsx`, `src/components/pet/pet-sprite.module.css`, `src/components/pet/pet-sprite.test.tsx`, `src/components/pet/hatch-form.tsx`
- Create: `src/components/pet/hatch-form.test.tsx`

**Interfaces:**
- Consumes: `acornSrc`, `acornEntry`, `PET_MANIFEST.acorn.anims` (Task 2).
- Produces: `PetSpriteProps.hatchReady?: boolean`; en bellota `data-anim` = `"idle" | "ready"`, keyframes `styles.stripIdle` / `styles.stripReady`; sin `<img>`.

- [ ] **Step 1: tests (fallan)** — en `pet-sprite.test.tsx` sustituir el test de la bellota por:

```tsx
  it("bellota: sheet de la bellota, fila idle, sin img", () => {
    const e = acornEntry();
    const { container } = render(<PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={2} label="Bellota" />);
    const root = container.firstElementChild as HTMLElement;
    expect(container.querySelectorAll("img").length).toBe(0);
    expect(root.style.backgroundImage).toContain("/pet/sheets/acorn.png");
    expect(root.style.width).toBe(`${e.cell * 2}px`);
    expect(root.getAttribute("data-anim")).toBe("idle");
    expect(root.getAttribute("aria-label")).toBe("Bellota");
    expect(root.style.animationName).toContain("stripIdle");
  });

  it("bellota lista para eclosionar: fila ready", () => {
    const e = acornEntry();
    const { container } = render(<PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={3} hatchReady label="Bellota" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("data-anim")).toBe("ready");
    expect(root.style.getPropertyValue("--pet-row")).toBe(String(e.anims.ready.row));
    expect(root.style.animationName).toContain("stripReady");
    expect(root.style.animationDuration).toBe(`${e.anims.ready.frames / 6}s`);
  });

  it("hatchReady se ignora fuera de la bellota", () => {
    const { container } = render(<PetSprite stage="adult" petClass="bard" mood="happy" scale={1} hatchReady label="Lira" />);
    expect(container.firstElementChild!.getAttribute("data-anim")).toBe("idle");
  });
```
Import `acornEntry` de `@/lib/pet/manifest`. Run: `npx vitest run src/components/pet/pet-sprite.test.tsx` → FAIL.

- [ ] **Step 2: CSS** — en `pet-sprite.module.css` añadir un quinto `@keyframes stripReady` (mismo cuerpo) y ampliar el comentario («… y ready para la bellota»). Borrar la regla `.root > img` (ya no hay `img`).

- [ ] **Step 3: componente** — sustituir la rama `acorn` y `ACORN_PX`:

```tsx
import { acornEntry, acornSrc, PET_MANIFEST, sheetEntry, sheetSrc, type PetDirection } from "@/lib/pet/manifest";
import type { AcornAnimName, PetAnimName } from "@/lib/pet/sheets.gen";
…
const STRIP_BY_ANIM: Record<PetAnimName | AcornAnimName, "stripIdle" | "stripSleepy" | "stripSad" | "stripJoy" | "stripReady"> = {
  idle: "stripIdle", sleepy: "stripSleepy", sad: "stripSad", joy: "stripJoy", ready: "stripReady",
};
…
  /** Solo la bellota: `true` = fila «a punto de eclosionar» (la pone hatch-form con nombre + clase). */
  hatchReady?: boolean;
…
export function PetSprite({ stage, petClass, mood, scale, reaction = null, direction = "south", hatchReady = false, label }: PetSpriteProps) {
  // La bellota es un sheet como los demás pero con su propio conjunto de filas (idle/ready) y sin
  // rotaciones; no tiene humor ni reacción ni dirección (spec bellota-visor §2).
  const isAcorn = stage === "acorn";
  const entry = isAcorn ? acornEntry() : sheetEntry(stage, petClass);
  const px = entry.cell * scale;
  const animated = isAcorn || direction === "south";
  const anim: PetAnimName | AcornAnimName = isAcorn ? (hatchReady ? "ready" : "idle") : reaction === "joy" ? "joy" : PET_MANIFEST.moodAnim[mood];
  const row = animated ? (isAcorn ? acornEntry().anims[anim as AcornAnimName] : sheetEntry(stage, petClass).anims[anim as PetAnimName]) : { row: sheetEntry(stage, petClass).rotationsRow, frames: 1 };
  const col = animated || isAcorn ? 0 : Math.max(0, sheetEntry(stage, petClass).directions.indexOf(direction));
  const src = isAcorn ? acornSrc() : sheetSrc(stage, petClass);
  const { fps, loop } = isAcorn ? PET_MANIFEST.acorn.anims[anim as AcornAnimName] : PET_MANIFEST.anims[anim as PetAnimName];
```
El resto del cuerpo queda igual salvo: `backgroundImage: \`url(${src})\``, y en la bellota `reaction === "evolve"` no aplica (usar `const evolve = !isAcorn && reaction === "evolve"` en la rama de longhands). `data-mood`/`data-reaction` se siguen emitiendo (el e2e y el CSS los usan).

- [ ] **Step 4: correr** `npx vitest run src/components/pet/pet-sprite.test.tsx` → PASS (8 tests). `npx tsc --noEmit -p .` limpio.

- [ ] **Step 5: `hatch-form.test.tsx` (falla)**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/lib/pet/actions", () => ({ hatchPet: vi.fn() }));

import { HatchForm } from "./hatch-form";

afterEach(cleanup);
const sprite = () => screen.getByRole("img", { name: "stages.acorn" });

describe("HatchForm", () => {
  it("bellota en idle sin nombre aunque haya clase sugerida", () => {
    render(<HatchForm suggested="wizard" />);
    expect(sprite().getAttribute("data-anim")).toBe("idle");
  });

  it("bellota lista con nombre válido y clase", () => {
    render(<HatchForm suggested="wizard" />);
    fireEvent.change(screen.getByPlaceholderText("hatch.namePlaceholder"), { target: { value: "  Nuez " } });
    expect(sprite().getAttribute("data-anim")).toBe("ready");
  });

  it("sin clase elegida no está lista", () => {
    render(<HatchForm suggested={null} />);
    fireEvent.change(screen.getByPlaceholderText("hatch.namePlaceholder"), { target: { value: "Nuez" } });
    expect(sprite().getAttribute("data-anim")).toBe("idle");
  });
});
```
Run: `npx vitest run src/components/pet/hatch-form.test.tsx` → FAIL (siempre `idle`). Si `ClassPicker` o `useActionState` necesitan otro mock para renderizar en jsdom, mockear `./class-picker` con un botón que llame a `onChange` y anotarlo en el informe.

- [ ] **Step 6: `hatch-form.tsx`** — nombre controlado y `hatchReady`:

```tsx
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const hatchReady = trimmed.length >= 1 && trimmed.length <= NAME_MAX && cls !== null;
  …
        <PetSprite stage="acorn" petClass={cls ?? "wizard"} mood="neutral" scale={3} hatchReady={hatchReady} label={t("stages.acorn")} />
  …
        <input name="name" required maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("hatch.namePlaceholder")} className="…igual…" />
```

- [ ] **Step 7: correr todo lo tocado** `npx vitest run src/components/pet src/lib/pet && npx tsc --noEmit -p . && npx eslint src/components/pet src/lib/pet` → PASS/limpio. `npx vitest run` una vez (totales).

- [ ] **Step 8: commit**

```bash
git add src/components/pet/pet-sprite.tsx src/components/pet/pet-sprite.module.css src/components/pet/pet-sprite.test.tsx src/components/pet/hatch-form.tsx src/components/pet/hatch-form.test.tsx
git commit -m "feat(pet): la bellota anima por sheet; hatchReady enseña la grieta con nombre y clase"
```

---

### Task 4: visor `/admin/mascota`

**Files:**
- Create: `src/app/admin/mascota/page.tsx`, `src/components/admin/pet-gallery.tsx`, `src/components/admin/pet-gallery.test.tsx`
- Modify: `src/app/admin/page.tsx` (enlace), `messages/es.json` (`admin.petLink`, `admin.pet.*`)

**Interfaces:**
- Consumes: `PetSprite` (Task 3), `PET_CLASSES`, `DRAWN_STAGES`, `REACTION_MS`, `PetDirection`.
- Produces: `PetGallery` sin props; `data-testid="pet-gallery"` en el contenedor, `data-testid="pet-gallery-scale"` (select), `pet-gallery-anim` (select), `pet-gallery-direction` (select), `pet-gallery-ready` (checkbox), `pet-gallery-evolve` (button), `pet-gallery-play` (button), `pet-gallery-prev`/`pet-gallery-next` (buttons).

- [ ] **Step 1: test (falla)**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acornEntry, sheetEntry } from "@/lib/pet/manifest";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

import { PetGallery } from "./pet-gallery";

afterEach(cleanup);
const sprites = () => screen.getAllByRole("img");

describe("PetGallery", () => {
  it("pinta las 18 combinaciones más la bellota", () => {
    render(<PetGallery />);
    expect(sprites().length).toBe(19);
  });

  it("la escala cambia el ancho de todos los sprites", () => {
    render(<PetGallery />);
    fireEvent.change(screen.getByTestId("pet-gallery-scale"), { target: { value: "3" } });
    const w = sheetEntry("adult", "wizard").cell * 3;
    expect(sprites().some((el) => (el as HTMLElement).style.width === `${w}px`)).toBe(true);
    expect((sprites().at(-1) as HTMLElement).style.width).toBe(`${acornEntry().cell * 3}px`);
  });

  it("animación sleepy y bellota lista", () => {
    render(<PetGallery />);
    fireEvent.change(screen.getByTestId("pet-gallery-anim"), { target: { value: "sleepy" } });
    expect(sprites()[0].getAttribute("data-anim")).toBe("sleepy");
    fireEvent.click(screen.getByTestId("pet-gallery-ready"));
    expect(sprites().at(-1)!.getAttribute("data-anim")).toBe("ready");
  });

  it("joy manda como reacción; dirección east deja el frame estático", () => {
    render(<PetGallery />);
    fireEvent.change(screen.getByTestId("pet-gallery-anim"), { target: { value: "joy" } });
    expect(sprites()[0].getAttribute("data-reaction")).toBe("joy");
    fireEvent.change(screen.getByTestId("pet-gallery-direction"), { target: { value: "east" } });
    expect(sprites()[0].getAttribute("data-anim")).toBeNull();
    expect(sprites()[0].getAttribute("data-col")).toBe("2");
  });
});
```
Run: `npx vitest run src/components/admin/pet-gallery.test.tsx` → FAIL (módulo no existe).

- [ ] **Step 2: `pet-gallery.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PET_CLASSES, type PetMood } from "@/lib/pet/classes";
import { DRAWN_STAGES, REACTION_MS, type PetDirection } from "@/lib/pet/manifest";
import { PetSprite, type PetReaction } from "@/components/pet/pet-sprite";

type GalleryAnim = "idle" | "sleepy" | "sad" | "joy";
const ANIMS: GalleryAnim[] = ["idle", "sleepy", "sad", "joy"];
const DIRECTIONS: PetDirection[] = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];
// idle→happy, sleepy→sleepy, sad→sad; joy no es humor, es reacción.
const MOOD_BY_ANIM: Record<Exclude<GalleryAnim, "joy">, PetMood> = { idle: "happy", sleepy: "sleepy", sad: "sad" };

// Visor de admin (spec bellota-visor §3): todas las combinaciones con el PetSprite de producción.
// Pausa y paso frame a frame con la Web Animations API sobre los elementos del contenedor: no
// añade props al componente, así lo que se ve aquí es exactamente lo que ve el usuario.
export function PetGallery() {
  const t = useTranslations("admin");
  const [scale, setScale] = useState<1 | 2 | 3>(2);
  const [anim, setAnim] = useState<GalleryAnim>("idle");
  const [direction, setDirection] = useState<PetDirection>("south");
  const [ready, setReady] = useState(false);
  const [evolve, setEvolve] = useState(false);
  const [paused, setPaused] = useState(false);
  const grid = useRef<HTMLDivElement>(null);

  const animations = () => (grid.current ? [...grid.current.querySelectorAll('[role="img"]')].flatMap((el) => el.getAnimations()) : []);

  useEffect(() => {
    for (const a of animations()) paused ? a.pause() : a.play();
  });

  const step = (dir: 1 | -1) => {
    setPaused(true);
    for (const a of animations()) {
      const el = (a.effect as KeyframeEffect | null)?.target as HTMLElement | null;
      const frames = Number(el?.getAttribute("data-frames") ?? 1);
      const duration = Number((a.effect?.getTiming().duration as number) ?? 0);
      if (!frames || !duration) continue;
      const frameMs = duration / frames;
      const now = Number(a.currentTime ?? 0);
      a.pause();
      a.currentTime = (((now + dir * frameMs) % duration) + duration) % duration;
    }
  };

  const triggerEvolve = () => {
    setEvolve(true);
    window.setTimeout(() => setEvolve(false), REACTION_MS.evolve);
  };

  const reaction: PetReaction = evolve ? "evolve" : anim === "joy" ? "joy" : null;
  const mood: PetMood = anim === "joy" ? "happy" : MOOD_BY_ANIM[anim];

  return (
    <div className="flex flex-col gap-4" data-testid="pet-gallery">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3 text-sm shadow-card">
        <label className="flex items-center gap-1">{t("pet.scale")}
          <select data-testid="pet-gallery-scale" value={scale} onChange={(e) => setScale(Number(e.target.value) as 1 | 2 | 3)} className="rounded-md border border-border bg-surface px-2 py-1">
            <option value={1}>1×</option><option value={2}>2×</option><option value={3}>3×</option>
          </select>
        </label>
        <label className="flex items-center gap-1">{t("pet.anim")}
          <select data-testid="pet-gallery-anim" value={anim} onChange={(e) => setAnim(e.target.value as GalleryAnim)} className="rounded-md border border-border bg-surface px-2 py-1">
            {ANIMS.map((a) => <option key={a} value={a}>{t(`pet.anims.${a}`)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">{t("pet.direction")}
          <select data-testid="pet-gallery-direction" value={direction} onChange={(e) => setDirection(e.target.value as PetDirection)} className="rounded-md border border-border bg-surface px-2 py-1">
            {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" data-testid="pet-gallery-ready" checked={ready} onChange={(e) => setReady(e.target.checked)} /> {t("pet.acornReady")}
        </label>
        <button type="button" data-testid="pet-gallery-evolve" onClick={triggerEvolve} className="rounded-md border border-border px-2 py-1">{t("pet.evolve")}</button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" data-testid="pet-gallery-prev" onClick={() => step(-1)} aria-label={t("pet.prevFrame")} className="rounded-md border border-border px-2 py-1">⏮</button>
          <button type="button" data-testid="pet-gallery-play" onClick={() => setPaused((p) => !p)} className="rounded-md border border-border px-2 py-1">{paused ? t("pet.play") : t("pet.pause")}</button>
          <button type="button" data-testid="pet-gallery-next" onClick={() => step(1)} aria-label={t("pet.nextFrame")} className="rounded-md border border-border px-2 py-1">⏭</button>
        </span>
      </div>

      <div ref={grid} className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        {DRAWN_STAGES.map((stage) => PET_CLASSES.map((cls) => (
          <figure key={`${stage}-${cls}`} className="flex flex-col items-center gap-1 rounded-card border border-border bg-surface p-2">
            <PetSprite stage={stage} petClass={cls} mood={mood} scale={scale} reaction={reaction} direction={direction} label={`${stage} ${cls}`} />
            <figcaption className="text-[11px] text-muted-foreground">{stage} · {cls}</figcaption>
          </figure>
        )))}
        <figure className="flex flex-col items-center gap-1 rounded-card border border-border bg-surface p-2">
          <PetSprite stage="acorn" petClass="wizard" mood="neutral" scale={scale} hatchReady={ready} label="acorn" />
          <figcaption className="text-[11px] text-muted-foreground">acorn · {ready ? "ready" : "idle"}</figcaption>
        </figure>
      </div>
    </div>
  );
}
```
jsdom no implementa `getAnimations`: en `animations()` usar `typeof (el as Element).getAnimations === "function" ? el.getAnimations() : []`.

- [ ] **Step 3: página** `src/app/admin/mascota/page.tsx`

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { PageHeader } from "@/components/ui/page-header";
import { PetGallery } from "@/components/admin/pet-gallery";

// Misma guardia que /admin (page.tsx de al lado); misma excepción de Cache Components.
export const instant = false;

export const metadata: Metadata = { title: "Animaciones de la mascota — Biblioshare" };

export default async function AdminPetPage() {
  const t = await getTranslations("admin");
  const user = await getCurrentUser();
  if (!user) redirect(loginHref("/admin/mascota"));
  if (!hasMinRole(await getCurrentUserRole(), "admin")) redirect("/");
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-1">
        <PageHeader title={t("pet.title")} />
        <p className="text-sm text-muted-foreground">{t("pet.description")}</p>
      </div>
      <PetGallery />
    </div>
  );
}
```
En `src/app/admin/page.tsx`, bajo la descripción: `<Link href="/admin/mascota" className="text-sm underline underline-offset-2">{t("petLink")}</Link>`.

- [ ] **Step 4: i18n** en `messages/es.json` dentro de `"admin"`:

```json
    "petLink": "Animaciones de la mascota",
    "pet": {
      "title": "Animaciones de la mascota",
      "description": "Las 18 combinaciones etapa × clase y la bellota, con el componente real. Pausa y avanza frame a frame para revisar re-rolls.",
      "scale": "Escala",
      "anim": "Animación",
      "anims": { "idle": "Idle", "sleepy": "Dormida", "sad": "Triste", "joy": "Alegría" },
      "direction": "Dirección",
      "acornReady": "Bellota lista",
      "evolve": "Evolución",
      "play": "Reproducir",
      "pause": "Pausar",
      "prevFrame": "Frame anterior",
      "nextFrame": "Frame siguiente"
    }
```

- [ ] **Step 5: correr** `npx vitest run src/components/admin src/components/pet && npx tsc --noEmit -p . && npx eslint src/components/admin src/app/admin` → PASS/limpio.

- [ ] **Step 6: commit**

```bash
git add src/app/admin/mascota/page.tsx src/app/admin/page.tsx src/components/admin/pet-gallery.tsx src/components/admin/pet-gallery.test.tsx messages/es.json
git commit -m "feat(admin): /admin/mascota enseña todas las animaciones de la mascota con el PetSprite real"
```

---

### Task 5: e2e, comprobación visual, doc, PR

**Files:**
- Create: `e2e/admin-mascota.spec.ts`
- Modify: `docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md` (§3bis), `.claude/agents/pet-artist.md`, `docs/requirements/decisiones.md` (append), `docs/architecture/graph.json` (ruta admin)

- [ ] **Step 1: e2e** (el usuario de prueba de dev, `devtest`, es `admin` — verificado el 2026-09-03):

```ts
import { expect, test } from "@playwright/test";

// Visor de animaciones de la mascota (spec bellota-visor §3): guardia de admin y rejilla.
const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;

test("anónimo: /admin/mascota redirige al login con next", async ({ page }) => {
  await page.goto("/admin/mascota");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fmascota/);
});

test("admin: 19 sprites y la escala triplica el ancho", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
  await page.goto("/admin/mascota");
  const sprites = page.getByTestId("pet-gallery").getByRole("img");
  await expect(sprites).toHaveCount(19);
  const before = await sprites.first().evaluate((el) => parseFloat(getComputedStyle(el).width));
  await page.getByTestId("pet-gallery-scale").selectOption("3");
  const after = await sprites.first().evaluate((el) => parseFloat(getComputedStyle(el).width));
  expect(after).toBeCloseTo(before * 1.5, 0); // 2× → 3×
  await page.getByTestId("pet-gallery-ready").check();
  await expect(sprites.last()).toHaveAttribute("data-anim", "ready");
});
```
Si el `next=` del login se codifica distinto, ajustar la regex al valor real (mirar `loginHref`).

- [ ] **Step 2: build + e2e + visual** — `npm run build`; `npm run start` en segundo plano; esperar `curl -sf http://localhost:3000/login`; `npx playwright test e2e/admin-mascota.spec.ts e2e/mascota.spec.ts` → PASS; script Playwright de captura de `/admin/mascota` a 1× y 3× y de la eclosión con la bellota `ready` (login como en `visual-check.mjs` del scratchpad, borrar `pet_state` de `devtest` vía REST para ver la eclosión y restaurarla igual que hace `e2e/mascota.spec.ts`); leer `getComputedStyle(bellota).animationName` (contiene `stripIdle` / `stripReady`). Matar el servidor; puerto 3000 libre.

- [ ] **Step 3: doc** — spec canónica: nuevo §3bis «Bellota»: `pixflux`/`pixen` para el rediseño, `animate_image` (8 frames, `no_background`) para `idle`/`ready`, `pack-strip.mjs` → `public/pet/sheets/acorn.*`, `fetch-character.mjs --gen`, subir `CACHE_NAME`. `pet-artist.md`: regla «la bellota no es un personaje: `animate_image` + `pack-strip.mjs`». `decisiones.md`, entrada al final:

```markdown
## 2026-09-03 — Mascota: la bellota es un sheet con idle y ready; visor de animaciones en /admin/mascota

**Decisión.** La bellota deja de ser un PNG estático: PixelLab (`animate_image`) genera `idle` y
`ready`, `pack-strip.mjs` las empaqueta con el layout de PixelLab y `PetSprite` la pinta como a
las demás etapas (prop `hatchReady`, solo en la eclosión con nombre y clase). `/admin/mascota`
enseña las 18 combinaciones y la bellota con el componente real, con pausa y paso frame a frame por
Web Animations API. Spec: `2026-09-03-mascota-bellota-visor-admin-design.md`.

**Por qué.** La bellota es lo primero que ve todo el mundo y era lo único quieto; `ready` como
feedback del formulario no exige estado nuevo (la etapa `acorn` es derivada y no existe «bellota
con actividad»). El visor usa el componente de producción a propósito: un bug del keyframe como el
de #1063 se habría visto aquí antes de la PR.

**Consecuencia.** `public/pet/acorn.png` desaparece (`CACHE_NAME` v7). Un re-roll de la bellota
es `animate_image` + `pack-strip` + `--gen`, no `animate_character`.
```
`graph.json`: añadir la ruta `/admin/mascota` al nodo de admin (o al de la mascota) con una frase.

- [ ] **Step 4: verificación completa y commit**

Run: `npx vitest run && npx tsc --noEmit -p . && npx eslint src/components/admin src/components/pet src/app/admin` → PASS.
```bash
git add e2e/admin-mascota.spec.ts docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md .claude/agents/pet-artist.md docs/requirements/decisiones.md docs/architecture/graph.json
git commit -m "test+docs(pet): e2e de /admin/mascota; bellota en la spec canónica, agente y decisiones"
```

- [ ] **Step 5: PR** contra `feat/pet-sprites-pixellab` (hasta que #1063 se mergee; después se cambia la base a `main` con `gh pr edit --base main`): título `feat(pet): bellota animada y visor de animaciones en /admin/mascota`, cuerpo con qué cambia, verificación, gens gastadas, capturas en la sesión, enlaces a spec y plan, pie `🤖 Generated with [Claude Code](https://claude.com/claude-code)` + URL de sesión.

---

## Self-review

- **Cobertura de la spec:** §2 arte → Task 1; §2 assets/manifiesto/componente/hatch-form → Task 2-3; §3 visor → Task 4; §4 tests → Tasks 2-5; §5 doc/`CACHE_NAME`/PR → Tasks 2 y 5.
- **Placeholders:** ninguno.
- **Tipos:** `AcornAnimName`, `AcornSheetEntry`, `PET_SHEETS.acorn` (Task 2) usados igual en `manifest.ts` (`acornEntry`) y en `pet-sprite.tsx` (Task 3); `hatchReady` definido en Task 3 y usado en Task 4; testids de `PetGallery` coinciden entre componente, unit y e2e; `REACTION_MS.evolve` existe en `manifest.ts` (rama base).
