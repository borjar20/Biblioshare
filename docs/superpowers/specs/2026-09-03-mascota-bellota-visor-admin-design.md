# Mascota: bellota animada y visor de animaciones para admin

> **[Histórico · congelado 2026-09-03]** Spec de dos piezas pequeñas sobre el motor de sprites de
> personaje (`2026-09-03-mascota-sprites-personaje-design.md`): la bellota deja de ser un PNG
> estático y gana dos animaciones, y `/admin/mascota` enseña todas las animaciones con el
> componente real. Explica el *porqué*; el estado de hoy manda en el código. Cómo se genera cada
> asset vive en la spec canónica `2026-09-03-mascota-arte-pixellab-design.md`.

## 1. Por qué

- La bellota es el primer sprite que ve todo el mundo (pantalla de eclosión a 3×, compañera y
  `/mascota` hasta la primera actividad) y es el único que quedó procedural y quieto tras el cambio
  a personaje. Un rediseño con PixelLab y una animación leve la ponen al nivel del resto.
- No hay forma de ver las 18 × 4 animaciones sin cambiar de clase en la app o abrir hojas de
  contacto locales. Un visor con el `PetSprite` **de producción** sirve para curar re-rolls
  (#1055, #1056, #1060) y habría cazado el bug del keyframe compartido (revisión final de #1063)
  antes de la PR.

## 2. Bellota

**Arte.** Rediseño con `create_image_pixflux` img2img sobre `public/pet/acorn.png` (fuerza 150,
40×40, `no_background`) o `create_image_pixen` desde texto; se elige a ojo con hoja de contacto.
Dos animaciones con `animate_image` sobre el frame elegido (1 gen cada una, 8 frames, `no_background`):

| Fila | `action` | Cuándo |
|---|---|---|
| `idle` | `gentle idle loop: the acorn sways very slightly, its small leaf twitches once, soft breathing` | siempre (compañera, `/mascota`, eclosión por defecto) |
| `ready` | `about to hatch: a thin crack glows and pulses on the shell, the acorn wobbles, light seeps out` | eclosión con el formulario completo |

**Cuándo se ve `ready` (decisión).** Solo en `hatch-form`: la bellota pasa a `ready` cuando el
nombre es válido (1-24 caracteres tras `trim`) **y** hay clase elegida, como feedback antes de
pulsar «Eclosionar». Se descartó por hover/press (móvil sin hover; el press compite con el enlace de
la compañera) y por tic temporal (ruido sin significado). La etapa `acorn` es derivada
(`derive.ts`: sin actividad desde la eclosión) y no existe un estado «bellota con actividad» en
datos: por eso `ready` no toca BD ni snapshot.

**Assets.** `animate_image` devuelve frames sueltos, no un sheet. Script nuevo
`scripts/pet-pixellab/pack-strip.mjs <out-basename> <cell> idle=<dir> ready=<dir>` empaqueta los
frames en un sheet con **el mismo formato de layout que exporta PixelLab** (`spritesheet.cell_size`,
`columns`, `rows[]`: fila 0 `rotations` con una sola dirección `south` = frame 0 de `idle`, y una
fila `animation` por nombre, `direction: "south"`), y escribe `public/pet/sheets/acorn.png` +
`acorn.json`. Los frames elegidos se versionan en `scripts/pet-pixellab/ref/acorn/<anim>/<n>.png`
para poder reempaquetar sin regenerar. `public/pet/acorn.png` se borra.

**Manifiesto.** `fetch-character.mjs --gen` aprende la entrada `acorn`: en `sheets.gen.ts`,
`PET_SHEETS.acorn: AcornSheetEntry = { cell, width, height, columns, anims: { idle, ready } }` (sin
`directions`/`rotationsRow`; el tipo es distinto porque el conjunto de animaciones lo es). `manifest.ts`:
`PET_MANIFEST.acorn = { anims: { idle: { fps: 4, loop: true }, ready: { fps: 6, loop: true } } }`,
`acornSrc()` → `/pet/sheets/acorn.png`, `acornEntry()`. `manifest.test.ts` exige el PNG y las dos
animaciones con `frames > 0`.

**Componente.** `PetSprite` pierde la rama `<img>`: la bellota se pinta con el mismo mecanismo
(celda × escala, fila, `steps(frames)`, keyframe por fila: `stripIdle` para idle, nuevo
`stripReady`). Prop nueva opcional `hatchReady?: boolean` (solo afecta a `stage === "acorn"`; en
otras etapas se ignora). `reaction`/`mood`/`direction` se ignoran en la bellota, como hoy.
`hatch-form` pasa a controlar el input de nombre (`useState`) para calcular `hatchReady`.
`ACORN_PX` desaparece: la celda la fija el sheet.

## 3. Visor `/admin/mascota`

- **Ruta** `src/app/admin/mascota/page.tsx`, servidor, con la misma guardia que `/admin`:
  sin sesión → `redirect(loginHref("/admin/mascota"))`; sin rol `admin` → `redirect("/")`. Enlace
  desde la página `/admin` («Animaciones de la mascota»). Hereda `RouteMessages ns=["admin"]` del
  layout; los textos van en `messages/*.json` bajo `admin.pet.*`.
- **Cliente** `src/components/admin/pet-gallery.tsx` (`"use client"`): rejilla de 3 etapas × 6
  clases (etiqueta `<stage> · <class>`) más la bellota, cada celda con el `PetSprite` real.
  Controles globales en una barra pegajosa:
  - escala `1 | 2 | 3`;
  - animación: `idle | sleepy | sad | joy` (se traduce a `mood`/`reaction`: idle→`happy`,
    sleepy→`sleepy`, sad→`sad`, joy→`reaction="joy"`); la bellota muestra `idle`, o `ready` si
    hay un interruptor «bellota lista» activo;
  - dirección: las 8 (solo `south` anima; el resto muestra la rotación estática);
  - `evolve`: botón que pone `reaction="evolve"` durante 1 200 ms en todas las celdas;
  - play/pausa y ⏮ ⏭: vía Web Animations API sobre los sprites del contenedor
    (`el.getAnimations()`; `pause()`/`play()`; `currentTime` ± duración/frames). Sin tocar la API
    de `PetSprite`. Con `prefers-reduced-motion` no hay animaciones y los botones se deshabilitan.
- Sin datos de PixelLab (ids, frames por fila): descartado en el brainstorming (opción C); si hace
  falta, issue.

## 4. Tests

- Unit: `manifest.test.ts` (bellota); `pet-sprite.test.tsx` (bellota idle → `data-anim="idle"` y
  keyframe `stripIdle`; `hatchReady` → `ready`/`stripReady`; `hatchReady` ignorado en adulta);
  `hatch-form.test.tsx` nuevo (nombre vacío o sin clase → bellota idle; nombre + clase → ready);
  `pet-gallery.test.tsx` (19 sprites; cambiar escala cambia el ancho; interruptor bellota lista).
- E2E `e2e/admin-mascota.spec.ts`: anónimo → redirige a login con `next=/admin/mascota`; el
  usuario de prueba, si no es admin, → `/`. Si el usuario de prueba de dev tiene rol `admin` (se
  comprueba en la fase de plan), además: 19 `[role="img"][data-mood]` y cambiar la escala a 3
  triplica el ancho.
- Visual: `/admin/mascota` a 1× y 3× en la PR; comprobación en Chromium de que la bellota anima
  (`animationName` termina en `stripIdle`/`stripReady`).

## 5. Doc y seguimiento

- Spec canónica PixelLab: §3bis «Bellota» (`animate_image` + `pack-strip.mjs`) y la regla de
  `CACHE_NAME` aplica (el PNG `acorn.png` cambia de ruta: subir `CACHE_NAME` en `public/sw.js`).
- `pet-artist.md`: la bellota se anima con `animate_image`, no con un personaje.
- `decisiones.md`: entrada «bellota como sheet; `ready` solo en eclosión; visor admin con el
  componente real».
- `docs/architecture/graph.json`: nodo de admin con la ruta nueva.
- Rama sobre `feat/pet-sprites-pixellab` (PR #1063): la PR nueva apunta a esa rama hasta que se
  mergee, y después a `main`.
