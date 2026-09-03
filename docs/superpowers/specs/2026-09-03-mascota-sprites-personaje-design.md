# Mascota: de rig por partes a sprites de personaje PixelLab

> **[Histórico · congelado 2026-09-03]** Spec de diseño del cambio de motor de arte de la mascota:
> el rig por partes con CSS `transform` (fase 1, `2026-09-02-mascota-rpg-design.md` §5) se
> sustituye por **sprite sheets de un personaje PixelLab** (8 direcciones + animaciones por
> frames). Explica el *porqué*; el estado de hoy manda en el código. Cómo se genera cada asset
> vive en la spec canónica `2026-09-03-mascota-arte-pixellab-design.md`.

## 1. Por qué se cambia

La fase 1 eligió rig por partes porque la IA de entonces no mantenía coherencia entre frames y
cada animación con frames multiplicaba el coste por clases × capas × frames. Con la suscripción a
PixelLab (Tier 2, 5 000 generaciones/mes, decidida el 2026-09-03) esa premisa cae:

- `create_character` v3 con la ardilla plana como referencia devuelve **8 rotaciones coherentes**
  por 1-2 generaciones (probado: `.superpowers/brainstorm/pixellab-2026-09-03/sheet_rot.png`).
- `create_character_state` produce la **variante de clase en las 8 direcciones** por ~30
  generaciones, sin capas (probado con el mago: `sheet_wiz_rot.png`).
- `animate_character` da animaciones por plantilla (1 gen) o custom v3 (1 gen a 40 px).

Y la dirección del producto lo pide: la mascota tiene que **pasear por la pantalla** (issue nueva,
fase posterior) y tener **animaciones de combate** (fase 4, #1015). Un rig frontal de cuatro
piezas no rota ni pelea; un personaje con 8 direcciones y esqueleto sí.

Se descartaron: (A) hornear sprites por clase × etapa con `animate_image` sobre el plano — sin
direcciones ni esqueleto, y la identidad baila entre frames a 40 px; (B) base animada + ropa
estática encima — el sombrero flota rígido sobre una cabeza que se mueve.

## 2. Alcance de esta fase

**Solo motor y arte.** Misma API de `<PetSprite>`, mismas animaciones que hoy (idle por humor,
alegría como reacción, evolución). La compañera sigue quieta en su esquina. Se guardan desde ya
las 8 rotaciones de cada combinación aunque solo se use la sur: pasear y combate son fases
aparte con su spec y no requieren volver a generar la base.

## 3. Fuente de arte

| Cosa | Cuántas | Cómo |
|---|---|---|
| Personaje base por etapa | 3 (cría, adulta, veterana) | `create_character` v3, `reference_image` = ardilla plana IA de esa etapa (`scripts/pet-pixellab/ref/<stage>.png`), 40×40, `low top-down` |
| Estado de clase | 6 × 3 = 18 | `create_character_state` sobre el personaje de la etapa, brief de clase de la spec canónica §5 |
| Animaciones por estado | 4 × 18 = 72, solo sur | `idle` (plantilla `breathing-idle`), `sleepy`, `sad`, `joy` (v3 custom) |
| Bellota | 1 | sprite único, `pixflux` |

El humor deja de ser una capa de cara y pasa a ser **la animación que se reproduce**: `happy` y
`neutral` → `idle`; `sleepy` → `sleepy`; `sad` → `sad`. `joy` es la reacción; `evolve` sigue
siendo destello CSS + cambio de sheet (no hay frames de evolución).

Coste estimado: 3 + 18 × ~30 + 72 ≈ **650 generaciones** más re-rolls. Cabe en un mes.

Los IDs de personaje y de estado se guardan en `scripts/pet-pixellab/characters.json` (etapa →
clase → `character_id`, `animation_group_id` por animación) para añadir direcciones o animaciones
sin regenerar la base.

## 4. Assets en el repo

```
public/pet/acorn.png
public/pet/sheets/<stage>/<class>.png     # spritesheet que exporta PixelLab
public/pet/sheets/<stage>/<class>.json    # layout: cell_size, columns, rows[]
scripts/pet-pixellab/ref/<stage>.png      # ardilla plana de referencia (reproducibilidad)
scripts/pet-pixellab/characters.json      # ids de PixelLab
```

Se usa el spritesheet tal y como lo exporta PixelLab (`/mcp/characters/<id>/spritesheet`):
celdas uniformes con **pivote centrado** (52×52 para un personaje de 40 px: las animaciones
desbordan el lienzo), fila 0 = rotaciones en orden S, SE, E, NE, N, NW, W, SW, una fila por
animación y dirección. No se recorta a 40: la celda es la unidad de dibujo y el `scale` del
componente multiplica la celda (1× = 52 px; la compañera crece de 40 a 52 px, aceptable).

`scripts/pet-pixellab/fetch-character.mjs <stage> <class> <character_id>` descarga el zip, deja
PNG + JSON en su sitio y actualiza `characters.json`.

Se borran: `public/pet/{young,adult,veteran,face,class}/`, `scripts/pet-sprites.mjs` y los
scripts del rig (`compose`, `slice`, `extract-layer`, `rig`). Se queda `sheet.mjs` (hojas de
contacto) y `pet-badges.mjs` (las insignias no cambian en esta fase).

## 5. Manifiesto

`src/lib/pet/manifest.ts` pasa a describir sheets y animaciones, no piezas:

```ts
export const PET_MANIFEST = {
  acorn: { src: "/pet/acorn.png" },
  sheet: (stage: DrawnStage, cls: PetClass) => ({
    png: `/pet/sheets/${stage}/${cls}.png`,
    json: `/pet/sheets/${stage}/${cls}.json`,
  }),
  anims: {
    idle:   { row: "idle",   fps: 4, loop: true },
    sleepy: { row: "sleepy", fps: 3, loop: true },
    sad:    { row: "sad",    fps: 3, loop: true },
    joy:    { row: "joy",    fps: 10, loop: false },
  },
  moodAnim: { happy: "idle", neutral: "idle", sleepy: "sleepy", sad: "sad" },
} as const;
```

El layout no se lee en runtime: `fetch-character.mjs` genera además el módulo
`src/lib/pet/sheets.gen.ts` con `{cellSize, sheetSize, columns, rows}` por etapa × clase a partir
de los JSON. Cero I/O en el servidor, tipado, y el test del manifiesto no depende de leer JSON.
Los JSON se conservan en `public/pet/sheets/` solo como origen regenerable.

`manifest.test.ts`: existe PNG de cada etapa × clase, el módulo generado tiene entrada para cada
una, y cada entrada tiene la fila de rotaciones y las cuatro animaciones en dirección sur.

## 6. Componente

`<PetSprite stage petClass mood scale reaction label direction? />`, misma firma más `direction`
opcional (por defecto `south`). Sin `"use client"`, sin estado: CSS puro.

- Un `div` con `background-image: url(sheet.png)`, `background-size` = tamaño del sheet × scale,
  `width/height` = celda × scale, `image-rendering: pixelated`.
- La fila viene de `moodAnim[mood]`, o de `joy` si `reaction === "joy"`. La animación es
  `@keyframes` sobre `background-position-x` con `steps(frames)`; duración = frames / fps; `joy`
  se reproduce una vez y vuelve a idle al terminar (`animation-fill-mode` + la prop ya lo maneja el
  padre con temporizador, como hoy).
- `evolve`: la animación de destello actual sobre el `div` completo.
- `prefers-reduced-motion`: `animation: none`, se queda en el frame 0 de la fila del humor.
- `data-mood`, `data-reaction`, `role="img"`, `aria-label` como hoy.
- Bellota: `<img>` único, como hoy.

Ningún otro componente cambia: `pet-companion.tsx`, `pet-detail.tsx`, `class-picker.tsx`,
`hatch-form.tsx` siguen pasando las mismas props.

## 7. Tests

- Unit `manifest.test.ts` (§5) y `pet-sprite.test.tsx`: fila y número de frames por humor y
  reacción; bellota sin sheet; `direction` cambia la columna de la fila 0; data-attributes.
- E2E `e2e/mascota.spec.ts`: sin cambios (usa `pet-companion` por testid).
- Visual: hoja de contacto de las 18 combinaciones (`sheet.mjs`) en la PR y `/mascota` a 1× y 3×.

## 8. Doc y seguimiento

- Esta spec (congelada). `2026-09-03-mascota-arte-pixellab-design.md` (canónica) se reescribe al
  pipeline de personaje; el híbrido de capas queda en su §4 como «probado, descartado».
- `.claude/agents/pet-artist.md` apunta al pipeline nuevo.
- `decisiones.md`: entrada «rig → personaje PixelLab».
- Issues: paseo por la pantalla (nueva, `tipo:feature`, `P3`, `area:ui`), enlazada con #1015
  (combate) y #1021 (arte, se cierra con esta fase).
