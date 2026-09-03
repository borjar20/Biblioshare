# Mascota 64 px «héroe» — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el arte de la mascota de 40 px por una familia nueva a 64 px (3 bases, 18 estados de clase con atuendo completo, 72 animaciones sur, bellota) sin cambiar la API de `<PetSprite>`, y dejar la doc canónica y el agente `pet-artist` diciendo la verdad.

**Architecture:** Los sprites los genera PixelLab (MCP `pixellab`) como personajes: `create_character` v3 a 64 px por etapa, `create_character_state` por clase, `animate_character` por animación. `scripts/pet-pixellab/fetch-character.mjs` descarga cada sheet a `public/pet/sheets/<stage>/<class>.{png,json}` y regenera `src/lib/pet/sheets.gen.ts`; el componente lee `entry.cell`, así que el tamaño de celda nuevo (88-96 px) no toca código de render. Lo que sí cambia en código: escalas de los llamadores, el umbral del test del manifiesto, `CACHE_NAME` del service worker.

**Tech Stack:** Next.js 16 / React, Vitest, Playwright, Node 22 + `sharp` (scripts), PixelLab MCP (suscripción Tier 2; saldo 4 215 gens el 2026-09-03).

Spec: `docs/superpowers/specs/2026-09-03-mascota-64px-heroe-design.md` (secciones citadas como «spec §N»).

## Global Constraints

- Todo sprite se genera con el MCP `pixellab` vía agente `pet-artist` (`.claude/agents/pet-artist.md`); candidatos y hojas de contacto en `.superpowers/brainstorm/2026-09-03-hero64/` (no versionado); a `public/pet/sheets/` solo lo que pasó `fetch-character.mjs`.
- `create_character`: `mode="v3"`, `view="low top-down"`, `size=64`, `body_type="humanoid"`, **sin** `reference_image`. Briefs literales de la spec §5. **Ninguna negación** en un brief («no backpack» produce mochila): se describe lo que se quiere.
- `create_character_state`: `edit_description` literal de la spec §5; se acepta solo si prenda y objeto se ven en las 8 rotaciones y la cara es la de la base. Si el objeto grande queda cortado, reintentar con `override_width=80, override_height=80` antes de reescribir.
- Animaciones (**enmienda 2026-09-03, tras Task 2**): `animation_name` exactamente `idle | sleepy | sad | joy`, **`directions=["south-west"]`** (la mascota se muestra y anima a 3/4 mirando a la izquierda del espectador, `PET_FACING`). **Las cuatro en `mode="v3"`, `frame_count=8`**: la plantilla `breathing-idle` pierde el objeto (casco, escudo, arma) en todas las clases (#1056), así que `idle` también es v3 con `action_description="breathing idle: subtle breathing, slight bob of the head, holding the prop still"`. `sleepy`/`sad`/`joy` con las `action_description` de la canónica §5bis (copiadas en Task 2). Ninguna animación se acepta si un frame pierde prenda u objeto: `delete_animation` y relanzar.
- Node: el shell trae v20 (rompe vitest); usar `fnm use 22` o `fnm exec --using=22 …` antes de `node`/`npx`.
- Cada tarea anota gens gastadas (`get_balance` antes/después) en su resumen. Cortar y avisar si el saldo baja de 1 000 (reserva de #1057).
- Ningún cambio se da por hecho sin `npx vitest run src/lib/pet src/components/pet` en verde.
- Commits en la rama `feat/mascota-64px-heroe` (ya existe, con la spec).

---

### Task 1: Bases a 64 (3 etapas) + `sheet.mjs` con celda parametrizada

**Files:**
- Modify: `scripts/pet-pixellab/sheet.mjs` (celda fija `C = 40` → argumento)
- Modify: `scripts/pet-pixellab/characters.json` (reescritura: bases nuevas, clases vacías)
- Create (no versionado): `.superpowers/brainstorm/2026-09-03-hero64/bases_rot.png`, `bases_south.png`

**Interfaces:**
- Produces: `characters.json` con `{ young|adult|veteran: { base: <uuid>, classes: {} } }`. Tasks 2-4 leen `base` de aquí. `sheet.mjs <out.png> [--cell N] etiqueta=fichero …` (por defecto 64).

- [ ] **Step 1: Parametrizar la celda de `sheet.mjs`**

Sustituir las líneas 5-7 de `scripts/pet-pixellab/sheet.mjs` por:

```js
const args = process.argv.slice(2);
const ci = args.indexOf("--cell");
const C = ci >= 0 ? Number(args.splice(ci, 2)[1]) : 64;
const [out, ...items] = args;
if (!out || items.length === 0) { console.error("uso: sheet.mjs <out.png> [--cell N] etiqueta=fichero.png ..."); process.exit(1); }
const S = 6, PAD = 8, LABEL = 18;
```

y actualizar el comentario de cabecera: `//   node scripts/pet-pixellab/sheet.mjs <out.png> [--cell N] etiqueta=fichero.png ...   (celda por defecto 64)`.

- [ ] **Step 2: Comprobar que sigue funcionando**

Run: `fnm exec --using=22 node scripts/pet-pixellab/sheet.mjs .superpowers/brainstorm/2026-09-03-hero64/smoke.png --cell 40 a=scripts/pet-pixellab/ref/adult.png`
Expected: `ok .superpowers/brainstorm/2026-09-03-hero64/smoke.png 256x274` (crea la carpeta antes con `mkdir -p`).

- [ ] **Step 3: Generar las 3 bases (agente `pet-artist`)**

`get_balance` antes. Tres `create_character` en paralelo, `mode="v3"`, `view="low top-down"`, `size=64`, `body_type="humanoid"`, `name` = `hero64-young` / `hero64-adult` / `hero64-veteran`, `description` literal de la spec §5:

- Cría: `young red squirrel kit mascot, oversized head about half of total height, small body, standing upright on two feet, body angled three-quarter view like a classic RPG sprite, head and eyes looking to the viewer's left, not straight at the camera, short fluffy tail, cream belly, round cheeks, pixel art, black outline, flat shading, warm palette, game character`
- Adulta: `cute red squirrel mascot, standing upright on two feet in a confident hero pose, head about forty percent of total height, visible arms and legs, bare fur with a cream belly, big fluffy tail behind the body, small tuft of fur on the chin, pixel art, black outline, flat shading, warm palette, game character`
- Veterana: `old veteran red squirrel mascot, standing upright on two feet in a confident hero pose, head about forty percent of total height, long white beard, grey streaks in the fur and tail, small scar over one eyebrow, big fluffy tail with a white tip, cream belly, pixel art, black outline, flat shading, warm palette, game character`

Esperar con `get_character` (2-5 min). Descargar las 8 rotaciones de cada una (URLs de `get_character`) a `.superpowers/brainstorm/2026-09-03-hero64/base_<stage>/<dir>.png`.

Criterio de aceptación por base: misma ardilla en las 8 direcciones, **sin prenda, mochila ni objeto**, y las tres etapas distinguibles lado a lado (cría cabezona a 3/4, adulta con mechón, veterana con barba blanca y punta de cola blanca). Si una falla: `delete_character` y repetir con otra redacción (v3 sin `seed` útil), máximo 2 intentos por etapa; si sigue fallando, parar y reportar.

- [ ] **Step 4: Hojas de contacto**

```sh
cd .superpowers/brainstorm/2026-09-03-hero64
fnm exec --using=22 node ../../../scripts/pet-pixellab/sheet.mjs bases_south.png cria=base_young/south.png adulta=base_adult/south.png veterana=base_veteran/south.png
for s in young adult veteran; do fnm exec --using=22 node ../../../scripts/pet-pixellab/sheet.mjs rot_$s.png S=base_$s/south.png SE=base_$s/south-east.png E=base_$s/east.png NE=base_$s/north-east.png N=base_$s/north.png NW=base_$s/north-west.png W=base_$s/west.png SW=base_$s/south-west.png; done
```

- [ ] **Step 5: Reescribir `characters.json`**

Contenido completo (ids reales de Step 3):

```json
{
  "young": { "base": "<uuid hero64-young>", "classes": {} },
  "adult": { "base": "<uuid hero64-adult>", "classes": {} },
  "veteran": { "base": "<uuid hero64-veteran>", "classes": {} }
}
```

Los ids de 40 px quedan en el historial de git (commit `53106f40` y anteriores); los personajes de PixelLab no se borran.

- [ ] **Step 6: Commit**

```sh
git add scripts/pet-pixellab/sheet.mjs scripts/pet-pixellab/characters.json
git commit -m "feat(pet): bases de la mascota a 64 px (héroe) y sheet.mjs con celda parametrizada"
```

**Puerta:** el hilo principal enseña `bases_south.png` y las tres `rot_*.png` al usuario y espera su OK antes de Task 2 (spec §7: los estados cuestan 20-40 gens cada uno).

---

### Task 2b (enmienda): dirección animada configurable — `PET_FACING = "south-west"`

**Files:**
- Modify: `src/lib/pet/manifest.ts` (exportar `PET_FACING`)
- Modify: `scripts/pet-pixellab/fetch-character.mjs` (`entryFrom` busca las filas de animación con `direction === "south-west"`)
- Modify: `src/components/pet/pet-sprite.tsx` (`direction` por defecto y rama animada = `PET_FACING`)
- Modify: `src/components/pet/pet-sprite.test.tsx`, `src/lib/pet/manifest.test.ts`
- Modify: `src/components/admin/pet-gallery.tsx` solo si fija `"south"` como valor inicial del selector de dirección (pasar a `PET_FACING`)

**Interfaces:**
- Produces: `export const PET_FACING = "south-west" as const satisfies PetDirection;` en `manifest.ts`. `fetch-character.mjs` exige las 4 animaciones en `south-west` (mensaje `falta animación <name> (south-west) en <stage>/<cls>`); la bellota sigue en `south` (`acornEntryFrom` no cambia). `<PetSprite direction?>` por defecto `PET_FACING`; anima solo cuando `direction === PET_FACING`; otra dirección pinta el frame de rotación quieto.

- [ ] **Step 1: Tests en rojo.** En `pet-sprite.test.tsx`: renderizar `<PetSprite stage="adult" petClass="wizard" mood="happy" scale={2} label="Nuez" />` sin `direction` y comprobar `root.style.getPropertyValue("--pet-row")` igual a `String(sheetEntry("adult","wizard").anims.idle.row)` y que tiene `animationName`; con `direction="south"` comprobar `--pet-row` = `rotationsRow` y `--pet-col` = `"0"` y sin `animationName`; con `direction="south-west"` explícito, igual que sin prop. En `manifest.test.ts`: `expect(PET_FACING).toBe("south-west")` y que `DIRECTIONS`/`sheetEntry(...).directions` contiene `PET_FACING`.
- [ ] **Step 2: Implementar** las tres modificaciones. En `fetch-character.mjs`: `const FACING = "south-west";` junto a `ANIMS`, y en `entryFrom` `x.direction === FACING` con el mensaje de error usando `FACING`. En `pet-sprite.tsx`: `direction = PET_FACING` en la desestructuración y `const animated = isAcorn || direction === PET_FACING;`; actualizar el comentario de la prop («Solo `PET_FACING` tiene animaciones…»).
- [ ] **Step 3:** `fnm exec --using=22 npx vitest run src/lib/pet src/components/pet` verde; `fnm exec --using=22 npx tsc --noEmit` limpio. **No** ejecutar `fetch-character.mjs` en esta tarea (los sheets aún tienen filas `south`; `sheets.gen.ts` no se toca).
- [ ] **Step 4: Commit** `feat(pet): dirección animada configurable (PET_FACING = south-west)`.

### Task 2c (enmienda): cría — regenerar las 24 animaciones en south-west con idle v3

Sobre los 6 `character_id` de `characters.json.young.classes`: `delete_animation` de los 4 grupos `south` de cada clase; 4 `animate_character` v3 `frame_count=8` `directions=["south-west"]` por clase (`idle` con la `action_description` de la enmienda de Global Constraints; `sleepy`/`sad`/`joy` con las de Task 2 Step 3); aceptar solo si todos los frames conservan prenda y objeto (revisar tira de frames por animación); anotar los grupos nuevos en `characters.json`; `fetch-character.mjs young <cls>` ×6 (ahora exige `south-west`); vitest verde; hoja `young_anim_rows.png` (frame 0 y 4 de cada animación por clase); commit `feat(pet): cría — animaciones en south-west, idle v3 que conserva el objeto`. Coste ~24 gens.

Tasks 3 y 4 heredan la enmienda: animaciones en `south-west`, las cuatro v3, y `fetch-character.mjs` ya exige esa dirección.

---

### Task 2: Cría — 6 estados de clase + 24 animaciones + sheets

**Files:**
- Modify: `scripts/pet-pixellab/characters.json` (`young.classes.<cls>`)
- Replace: `public/pet/sheets/young/<cls>.png`, `public/pet/sheets/young/<cls>.json` (×6)
- Regenerate: `src/lib/pet/sheets.gen.ts` (vía `fetch-character.mjs`, nunca a mano)

**Interfaces:**
- Consumes: `characters.json.young.base`.
- Produces: `characters.json.young.classes.<cls> = { character_id, anims: { idle, sleepy, sad, joy } }` (mismo esquema que hoy, `anims` = `animation_group_id`). Sheets de la cría con celda 88-96.

- [ ] **Step 1: Seis `create_character_state` en paralelo sobre `young.base`** (agente `pet-artist`; `get_balance` antes)

`state_name` = clase. `edit_description` literal (spec §5):

| cls | edit_description |
|---|---|
| wizard | `wearing a long blue wizard robe with gold trim covering the body and a blue pointed wizard hat with gold stars, holding a tall thin wooden staff taller than the squirrel with a glowing purple crystal on top, staff held upright beside the body, crystal clearly visible above the head` |
| barbarian | `wearing a brown fur-lined leather harness with a wide belt and fur boots, grey iron horned helmet, holding a big two-handed iron axe upright beside the body, axe head clearly visible above the shoulder` |
| fighter | `wearing full steel plate armor covering the torso and shoulders, steel helmet with a red plume, holding a short sword raised upright in one paw with the blade clearly visible beside the head and a round wooden shield in the other` |
| cleric | `wearing a long white robe with a gold cross on the chest and a gold-trimmed hood, holding a tall wooden mace with a glowing gold holy symbol on top upright beside the body, symbol clearly visible above the head` |
| bard | `wearing a green tunic with a brown vest and a green feathered cap, holding a big wooden lute across the chest with both paws, lute clearly visible in front of the belly` |
| ranger | `wearing a green hooded cloak over a brown leather tunic, quiver of arrows on the back, holding a tall wooden longbow upright beside the body, bow clearly visible taller than the head` |

Esperar (`get_character`, 1-5 min cada uno). Descargar las 8 rotaciones a `.superpowers/brainstorm/2026-09-03-hero64/young_<cls>/<dir>.png` y montar `rot_young_<cls>.png` (como en Task 1 Step 4).

Aceptación por estado: prenda **y** objeto visibles en las 8 direcciones, cara de la base. Si el objeto queda cortado por el borde: repetir con `override_width=80, override_height=80`. Si falta o lo tapa el brazo: `delete_character` y reescribir solo la cláusula de posición (p. ej. «held up high above the head»). Máximo 2 re-rolls por clase; si no sale, anotar y seguir (issue al final, como #1055).

- [ ] **Step 2: Anotar ids en `characters.json`**

Por clase aceptada: `young.classes.<cls> = { "character_id": "<uuid>", "anims": {} }`.

- [ ] **Step 3: 24 animaciones (`animate_character`, `directions=["south"]`)**

Por cada uno de los 6 `character_id`, cuatro llamadas (pueden ir en paralelo por personaje):

- `animation_name="idle"`, `template_animation_id="breathing-idle"`.
- `animation_name="sleepy"`, `mode="v3"`, `frame_count=8`, `action_description="dozing off: eyes closed, head nodding slowly, slow breathing, tail drooping"`.
- `animation_name="sad"`, `mode="v3"`, `frame_count=8`, `action_description="sad and droopy: ears down, head lowered, tail hanging low, slow sigh"`.
- `animation_name="joy"`, `mode="v3"`, `frame_count=8`, `action_description="happy celebration: hops up with both paws raised, tail flicks up, lands back in the same spot"`.

Esperar a que `get_character` liste las 4 con estado completado. Anotar cada `animation_group_id` en `young.classes.<cls>.anims.<name>`. Si una animación deforma la cara o pierde el atuendo, `delete_animation` y relanzar con la misma redacción (no hay `seed`; suele salir distinto).

- [ ] **Step 4: Descargar sheets y regenerar `sheets.gen.ts`**

```sh
for c in barbarian fighter wizard cleric bard ranger; do fnm exec --using=22 node scripts/pet-pixellab/fetch-character.mjs young $c; done
```

Expected por clase: `ok public/pet/sheets/young/<cls>.{png,json}` y `ok src/lib/pet/sheets.gen.ts 18 combinaciones`. El script reintenta con 423 mientras haya jobs; falla a propósito si falta una animación sur.

- [ ] **Step 5: Tests**

Run: `fnm exec --using=22 npx vitest run src/lib/pet src/components/pet`
Expected: todo en verde (los sheets de adult/veteran siguen siendo los de 40 y pasan `cell >= 40`).

Comprobar a mano que `sheets.gen.ts` tiene `cell` entre 64 y 96 en las 6 entradas de `young`:
`grep -A1 '"young"' -m1 src/lib/pet/sheets.gen.ts` y `grep -c '"cell": 52\|"cell": 56' src/lib/pet/sheets.gen.ts` → debe quedar 12 (las de adult y veteran).

- [ ] **Step 6: Hoja de contacto sur de la cría y commit**

```sh
cd .superpowers/brainstorm/2026-09-03-hero64 && fnm exec --using=22 node ../../../scripts/pet-pixellab/sheet.mjs young_south.png barb=young_barbarian/south.png figh=young_fighter/south.png wiza=young_wizard/south.png cler=young_cleric/south.png bard=young_bard/south.png rang=young_ranger/south.png
```

```sh
git add scripts/pet-pixellab/characters.json public/pet/sheets/young src/lib/pet/sheets.gen.ts
git commit -m "feat(pet): cría a 64 px — 6 estados de clase con atuendo completo y 4 animaciones sur"
```

**Puerta:** enseñar `young_south.png` y las `rot_young_*.png` al usuario; un re-roll ahora cuesta ~20 + 4 gens.

---

### Task 3: Adulta — 6 estados + 24 animaciones + sheets

Idéntica a Task 2 con `stage = adult`: mismos `edit_description`, mismas animaciones, `fetch-character.mjs adult <cls>`, mismos tests, hoja `adult_south.png`, commit `feat(pet): adulta a 64 px — 6 estados de clase con atuendo completo y 4 animaciones sur`. Tras este task `grep -c '"cell": 52\|"cell": 56' src/lib/pet/sheets.gen.ts` debe dar 6. Misma puerta.

---

### Task 4: Veterana — 6 estados + 24 animaciones + sheets

Idéntica a Task 2 con `stage = veteran`. Detalle propio: la barba blanca debe seguir visible con capucha/casco (clérigo, explorador, bárbaro, guerrero); si el casco la borra, re-roll añadiendo «long white beard showing below the helmet» a la cláusula. Tras este task el `grep -c` anterior debe dar 0. Commit `feat(pet): veterana a 64 px — 6 estados de clase con atuendo completo y 4 animaciones sur`. Misma puerta.

---

### Task 5: Bellota a 64 px

**Files:**
- Modify: `.claude/agents/pet-artist.md` (línea `tools:` — añadir `mcp__pixellab__animate_image`; el agente no la tiene y la bellota la necesita)
- Replace: `scripts/pet-pixellab/ref/acorn/base.png`, `ref/acorn/idle/*.png`, `ref/acorn/ready/*.png`
- Replace: `public/pet/sheets/acorn.png`, `public/pet/sheets/acorn.json`
- Regenerate: `src/lib/pet/sheets.gen.ts`

**Interfaces:**
- Produces: entrada `acorn` de `sheets.gen.ts` con `cell = 64`, filas `idle` y `ready` en sur.

- [ ] **Step 1: Añadir `animate_image` a las herramientas del agente**

En `.claude/agents/pet-artist.md`, en la lista `tools:`, insertar `mcp__pixellab__animate_image,` justo después de `mcp__pixellab__create_image_pro,`. (Si el MCP dice que la herramienta no está en la lista cacheada del cliente, reconectar el servidor `pixellab` y reintentar — trampa vista el 2026-09-03.)

- [ ] **Step 2: Frame base (agente `pet-artist`)**

`create_image_pixen(description="cute acorn with a brown cap and a small green leaf, pixel art, black outline, flat shading, warm palette, game item", width=64, height=64, no_background=true, view="low top-down")`. Comparar con `scripts/pet-pixellab/ref/acorn/base.png` (la de 40) para que sea la misma bellota en espíritu (cap marrón, cuerpo ocre, hoja). Guardar el elegido como `scripts/pet-pixellab/ref/acorn/base.png` (sobrescribe).

- [ ] **Step 3: Dos animaciones con `animate_image`**

- `idle`: `animate_image(first_frame_base64=<base.png>, action="gentle idle loop: subtle bob up and down, leaf sways slightly", frame_count=8, no_background=true)`.
- `ready`: `animate_image(first_frame_base64=<base.png>, action="about to hatch: shakes side to side, small cracks flash on the shell, wobbles faster", frame_count=8, no_background=true)`.

`get_image` devuelve 9 frames (0 = base). Guardar en `scripts/pet-pixellab/ref/acorn/idle/0..8.png` y `ref/acorn/ready/0..8.png` (borrar antes los frames viejos de 40).

- [ ] **Step 4: Empaquetar y regenerar**

```sh
fnm exec --using=22 node scripts/pet-pixellab/pack-strip.mjs public/pet/sheets/acorn 64 idle=scripts/pet-pixellab/ref/acorn/idle ready=scripts/pet-pixellab/ref/acorn/ready
fnm exec --using=22 node scripts/pet-pixellab/fetch-character.mjs --gen
```

Expected: `ok public/pet/sheets/acorn.png 576x192 3 filas` y `ok src/lib/pet/sheets.gen.ts 18 combinaciones`. Si `animate_image` devolviera frames mayores de 64, `pack-strip` lo dice (`no cabe en una celda de 64`): usar como celda el tamaño real del frame.

- [ ] **Step 5: Tests y commit**

Run: `fnm exec --using=22 npx vitest run src/lib/pet src/components/pet` → verde.

```sh
git add .claude/agents/pet-artist.md scripts/pet-pixellab/ref/acorn public/pet/sheets/acorn.png public/pet/sheets/acorn.json src/lib/pet/sheets.gen.ts
git commit -m "feat(pet): bellota a 64 px (pixen + animate_image), pet-artist puede animar imágenes"
```

---

### Task 6: Escalas, umbral del test, `CACHE_NAME`, limpieza de `ref/`

**Files:**
- Modify: `src/lib/pet/manifest.test.ts:18,36`
- Modify: `src/components/pet/pet-detail.tsx:77`
- Modify: `src/components/pet/class-picker.tsx:42`
- Modify: `src/components/pet/hatch-form.tsx:25`
- Modify: `src/components/pet/pet-sprite.tsx:27` (comentario de la prop `scale`)
- Modify: `public/sw.js:31`
- Delete: `scripts/pet-pixellab/ref/young.png`, `ref/adult.png`, `ref/veteran.png`

- [ ] **Step 1: Subir el umbral del test (rojo primero)**

En `src/lib/pet/manifest.test.ts` cambiar las dos líneas `expect(e.cell).toBeGreaterThanOrEqual(40);` por `expect(e.cell).toBeGreaterThanOrEqual(64);`.

Run: `git stash -- public/pet/sheets src/lib/pet/sheets.gen.ts && fnm exec --using=22 npx vitest run src/lib/pet/manifest.test.ts; git stash pop`
Expected: con los sheets de 40 el test **falla** (`expected 52 to be greater than or equal to 64`); tras el `pop`, vuelve a pasar. (Si no quieres el stash: basta con confirmar que `grep -c '"cell": 52\|"cell": 56' src/lib/pet/sheets.gen.ts` da 0 y correr el test una vez.)

- [ ] **Step 2: Escalas de los llamadores**

- `src/components/pet/pet-detail.tsx` línea 77: `scale={3}` → `scale={2}`.
- `src/components/pet/class-picker.tsx` línea 42: `scale={2}` → `scale={1}`.
- `src/components/pet/hatch-form.tsx` línea 25: `scale={3}` → `scale={2}`.
- `src/components/pet/pet-companion.tsx` línea 53: se queda en `scale={1}` (≈ 90 px, spec §6).
- `src/components/pet/pet-sprite.tsx` línea 27, comentario de `scale`: `/** 1 = una celda (88–96 px según la entrada; esquina y picker), 2 = ficha y eclosión, 3 = solo /admin/mascota. */`

- [ ] **Step 3: `CACHE_NAME`**

`public/sw.js` línea 31: `const CACHE_NAME = "biblioshare-v7";` → `"biblioshare-v8"`. Motivo (canónica §3.5): las rutas de los PNG no cambian y el SW los sirve cache-first.

- [ ] **Step 3b: Quitar el fallback transitorio de `fetch-character.mjs`**

En `entryFrom`, dejar solo la búsqueda por `FACING` (borrar el bloque `if (!r) { … "south" … console.warn }` marcado TRANSITORIO). `fnm exec --using=22 node scripts/pet-pixellab/fetch-character.mjs --gen` debe terminar sin ningún `aviso:` y `sheets.gen.ts` no cambiar (`git diff --quiet src/lib/pet/sheets.gen.ts`).

- [ ] **Step 4: Borrar referencias de 40**

```sh
git rm scripts/pet-pixellab/ref/young.png scripts/pet-pixellab/ref/adult.png scripts/pet-pixellab/ref/veteran.png
```

`ref/acorn/` se queda (son los frames fuente de `pack-strip`).

- [ ] **Step 5: Tests unitarios, typecheck, e2e**

```sh
fnm exec --using=22 npx vitest run src/lib/pet src/components/pet
fnm exec --using=22 npx tsc --noEmit
fnm exec --using=22 npx playwright test e2e/mascota.spec.ts e2e/admin-mascota.spec.ts
```

Expected: verde. Los e2e van por `data-testid`, no por píxeles; si `admin-mascota.spec.ts` comprueba un tamaño concreto de celda, ajustarlo a `entry.cell` leído del módulo generado, no a un literal.

- [ ] **Step 6: Commit**

```sh
git add src/lib/pet/manifest.test.ts src/components/pet public/sw.js
git commit -m "feat(pet): escalas para celda de 64 px, umbral del manifiesto a 64, CACHE_NAME v8, fuera refs de 40"
```

---

### Task 7: Doc canónica, agente, decisiones, issues

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-mascota-arte-pixellab-design.md`
- Modify: `.claude/agents/pet-artist.md`
- Modify: `docs/requirements/decisiones.md` (append al final)
- Modify: `docs/superpowers/specs/2026-09-03-mascota-sprites-personaje-design.md` (una línea en la cabecera)

- [ ] **Step 1: Canónica — cabecera y §1**

Cabecera: `[Canónico · verificado 2026-09-03]` se mantiene con la fecha del día del cambio; añadir al párrafo: «Desde el 2026-09-03 el arte es la familia de **64 px** (spec `2026-09-03-mascota-64px-heroe-design.md`, el porqué); la de 40 px es histórica.» En §1, «un personaje PixelLab por etapa» → «un personaje PixelLab **de 64 px** por etapa».

- [ ] **Step 2: Canónica — §3 pipeline**

Primera línea: `Lienzo 40×40, …` → `Lienzo 64×64 (\`size=64\`), \`no_background: true\` en las herramientas de imagen, vista \`low top-down\`.`
Paso 1 (ardilla plana de referencia): sustituir por «**No hay imagen de referencia.** Las bases se generan from scratch: `create_character` v3 con `reference_image` ignora `size` (devuelve el tamaño de la referencia), así que no sirve para subir de resolución. La reproducibilidad es `characters.json`: todo estado y animación deriva del `character_id`.»
Paso 2: `create_character(mode="v3", view="low top-down", size=64, description=<brief §5>)`; quitar `reference_image_base64`. Añadir: «Aceptación: misma ardilla en 8 direcciones, sin prendas ni objetos, etapas distinguibles lado a lado.»
Paso 3: añadir «Atuendo completo (prenda que cubre el cuerpo + objeto grande) con posición explícita del objeto. Si el objeto queda cortado, `override_width/height=80`.»
Paso 4: añadir «A 64 px: 1 gen por animación y dirección. Los frames salen a 88-96 px (v3 rellena el lienzo); el sheet exportado usa esa celda.»

- [ ] **Step 3: Canónica — §3bis bellota, §4 descartado, §5, §5bis, §6, §7, nueva §8**

- §3bis: `create_image_pixen` a 64×64 desde texto (brief de Task 5), `animate_image` idle/ready 8 frames, `pack-strip … 64 …`.
- §4 añadir al final tres viñetas: «`create_character` v3 con `reference_image` + `size`: ignora `size`»; «`animate_character` v3 “a cuatro patas” sobre personaje humanoide: sale bípeda, el esqueleto gana»; «pose cuadrúpeda por `create_image_pixflux` img2img (devuelve la bípeda) o `edit_image` (grupa alta, y animar desde ese frame vuelve a erguirla)». Las tres con enlace a #1068.
- §5: sustituir la tabla entera por las dos tablas de la spec 64px §5 (bases y clases) y el párrafo «Ninguna negación…».
- §5bis: sin cambios de texto; añadir «(a 64 px, 1 gen cada una)».
- §6 trampas, añadir: «Negar en un brief no funciona (“no backpack” dio mochila): describe lo que quieres.» · «“adventurer” en un brief base mete mochila y cinturón.» · «`animate_image` puede no aparecer en la lista de herramientas del cliente aunque exista (lista cacheada): reconectar el MCP.» · «`create_character_state` cobra por tramo de lienzo resuelto al generar: puede cobrar más de lo reservado; deja 40 gens de margen.»
- §7 estado: nueva viñeta 2026-09-03 con gens reales gastadas en Tasks 1-5 (sumar los resúmenes) y «arte de 40 px retirado; #1055 y #1056 revisadas».
- Nueva **§8 Ruta cuadrúpeda (para #1057)**: copiar la spec 64px §3 último párrafo y §6 «Ruta cuadrúpeda» (estado `quad` por `create_character_state` sobre el estado de clase bípedo, sheet `<stage>/<class>.quad.png`, `characters.json.<stage>.classes.<cls>.quad`, ~20 gens por estado + 1 por animación y dirección).

- [ ] **Step 4: `pet-artist.md`**

- Línea 35: quitar `reference_image_base64 from scripts/pet-pixellab/ref/<stage>.png`; poner `(\`create_character\`, v3, \`size=64\`, from scratch — no reference image: with a reference PixelLab ignores \`size\`)`.
- Línea 38: `**Canvas 40×40, …**` → `**Canvas 64×64 (\`size=64\`), \`low top-down\` view. Describe, never negate** (“no backpack” yields a backpack; “adventurer” adds one unasked). Class states are a full outfit plus a large prop with an explicit position (“held upright beside the body, clearly visible above the head”); if the prop gets clipped use \`override_width/height=80\`.`
- Añadir una regla nueva bajo «Hard rules»: `- **Quadruped movement is a second state, not an animation.** \`animate_character\` cannot put a humanoid character on all fours; for #1057 create a \`create_character_state("down on all four paws…")\` of the biped class state and animate that (canonical spec §8).`
- Summary format: añadir «and the real generations charged per \`create_character_state\` (the tier is resolved at generation time)».

- [ ] **Step 5: `decisiones.md` (append al final)**

```markdown
## 2026-09-03 — Mascota: de 40 px chibi a 64 px «héroe»; bípeda y cuadrúpeda son dos estados

**Decisión.** El arte de la mascota pasa a 64 px con identidad nueva: proporción héroe (cabeza
~40 %), etapas distinguibles por edad (cría a 3/4 cabezona, adulta con mechón, veterana con barba
blanca), clases con atuendo completo + objeto grande. Bellota también a 64. Spec:
`2026-09-03-mascota-64px-heroe-design.md`; comparativa 40/64/80/128 en #1068.

**Por qué.** A 40 px ojos, báculo y cristal no se leen. 64 es el mayor salto por píxel que sigue
cabiendo en la esquina a escala entera. Subir de resolución obliga a rediseñar: `create_character`
con referencia ignora `size`, y from scratch sale otra ardilla — se aprovechó para quitarle lo
genérico.

**Consecuencia.** Celda 88-96 px: compañera en esquina ≈ 90 px (antes 55); ficha y eclosión a 2×,
picker a 1×. `CACHE_NAME` v8. `ref/<stage>.png` desaparece (reproducibilidad = `characters.json`).
Para el paseo (#1057) la mascota corre a cuatro patas: no se consigue animando al personaje
humanoide, sí con un `create_character_state` «all four paws» sobre el estado de clase — cada
etapa × clase tendrá dos estados PixelLab (`biped`, `quad`).
```

- [ ] **Step 6: Cabecera de la spec de sprites de personaje**

En `docs/superpowers/specs/2026-09-03-mascota-sprites-personaje-design.md`, añadir a la cita de cabecera: «El arte de 40 px descrito aquí se sustituyó el 2026-09-03 por la familia de 64 px (`2026-09-03-mascota-64px-heroe-design.md`); el motor (sheets + `<PetSprite>`) sigue vigente.»

- [ ] **Step 7: Issues**

```sh
gh issue comment 1057 --body-file - <<'EOF'
Ruta para el paseo a cuatro patas, probada el 2026-09-03 (#1068, spec 64px §3): `animate_character` no baja al personaje humanoide (sale bípeda); lo que funciona es `create_character_state("down on all four paws…")` sobre el estado de clase bípedo y animar ese estado (`walk`/`run`, 1 gen por dirección). Modelo: dos estados PixelLab por etapa × clase (`biped`, `quad`), sheet aparte `<stage>/<class>.quad.png`, id en `characters.json.<stage>.classes.<cls>.quad`. Reserva: ~360 gens (18 estados) + 144 (walk × 8 direcciones × 18). Doc canónica §8.
EOF
gh issue close 1068 --comment "Resuelto: la mascota pasa a 64 px (spec docs/superpowers/specs/2026-09-03-mascota-64px-heroe-design.md, PR de la rama feat/mascota-64px-heroe)."
gh issue view 1055; gh issue view 1056
```

#1055 (clérigo sin objeto visible) y #1056 (idle por plantilla restiliza): revisar contra los sheets nuevos; cerrar con «obsoleta por el rehecho a 64 px — no reproducido» si ya no aplica, o dejar abierta con nota si persiste. Cualquier estado que no pasó aceptación en Tasks 2-4 → issue nueva `area:ui,tipo:bug,P2` con la hoja de rotaciones.

- [ ] **Step 8: Commit**

```sh
git add docs .claude/agents/pet-artist.md
git commit -m "docs(pet): canónica, pet-artist y decisiones al arte de 64 px; ruta cuadrúpeda para #1057"
```

---

### Task 8: Verificación visual y PR

**Files:**
- Create (no versionado): `.superpowers/brainstorm/2026-09-03-hero64/all_south.png`

- [ ] **Step 1: Hoja de contacto de las 18 combinaciones**

```sh
cd .superpowers/brainstorm/2026-09-03-hero64
fnm exec --using=22 node ../../../scripts/pet-pixellab/sheet.mjs all_south.png $(for s in young adult veteran; do for c in barbarian fighter wizard cleric bard ranger; do echo "$s-$c=${s}_$c/south.png"; done; done)
```

- [ ] **Step 2: Mirar la app (agente `qa-verifier`)**

Con `next dev` en el puerto 3000 (uno solo; ver AGENTS.md «Higiene del entorno»): `/admin/mascota` a 1×, 2× y 3× — las 18 combinaciones y la bellota animan, humor y `joy` cambian de fila, `prefers-reduced-motion` congela; `/mascota` (ficha a 2×) y la compañera en la esquina (~90 px, no tapa la barra inferior en móvil 390 px de ancho); eclosión con la bellota a 2× y `ready` al rellenar nombre + clase. Capturas a la carpeta de brainstorm.

- [ ] **Step 3: Chequeo de deriva y PR**

`/drift-check` (o `docs/DRIFT-CHECK.md`) — no hay cambio de esquema, pero la doc canónica cambió de fecha.

```sh
git push -u origin feat/mascota-64px-heroe
gh pr create --title "feat(pet): mascota a 64 px con proporción héroe, etapas por edad y atuendo completo" --body-file - <<'EOF'
Rehecho del arte de la mascota a 64 px (spec `docs/superpowers/specs/2026-09-03-mascota-64px-heroe-design.md`, comparativa en #1068).

- 3 bases + 18 estados de clase (atuendo completo) + 72 animaciones sur + bellota, generados con PixelLab (<gens reales> gens).
- `<PetSprite>` sin cambios (lee `entry.cell`); escalas: ficha y eclosión 2×, picker 1×, esquina 1× (~90 px).
- `CACHE_NAME` v8 (mismas rutas de PNG, contenido nuevo).
- Doc canónica, `pet-artist`, `decisiones.md`; ruta cuadrúpeda para #1057.

Hoja de contacto de las 18: (adjuntar `all_south.png`).

Cierra #1068.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Adjuntar `all_south.png` y dos capturas de `/admin/mascota` como comentario de la PR.
