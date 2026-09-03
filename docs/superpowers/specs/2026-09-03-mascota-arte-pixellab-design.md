# Mascota: arte pixel con PixelLab (herramienta por defecto y pipeline)

> **[Canónico · verificado 2026-09-03]** Cómo se genera el arte de la mascota (y de BiblioPlay)
> con PixelLab. Pipeline de **personaje** (sprite sheets PixelLab: base + estado de clase +
> animaciones), no de rig por partes — el rig murió el 2026-09-03, ver §4 y la spec
> `2026-09-03-mascota-sprites-personaje-design.md` (el porqué del cambio, congelada). Si el
> pipeline cambia, se cambia aquí y se actualiza la fecha.

## 1. Decisión

**PixelLab (MCP `pixellab`) es la herramienta por defecto para todo sprite del proyecto.**
Suscripción Tier 2 «Pixel Artisan» (5 000 generaciones/mes, se renuevan el día 3). El agente
`.claude/agents/pet-artist.md` la usa; los scripts de apoyo viven en `scripts/pet-pixellab/`.

El arte de la mascota es **un personaje PixelLab por etapa** (cría, adulta, veterana), con un
**estado de clase** por cada una de las 6 clases y **4 animaciones** (`idle`, `sleepy`, `sad`,
`joy`) en dirección sur. `<PetSprite>` pinta el spritesheet que exporta PixelLab
(`public/pet/sheets/<stage>/<class>.{png,json}`); no compone piezas con `transform` ni superpone
capas. `scripts/pet-pixellab/fetch-character.mjs` descarga cada sheet y regenera
`src/lib/pet/sheets.gen.ts`.

Se descartó dibujar a mano (no hay ilustrador), un modelo genérico de texto-a-imagen (sin control
de lienzo ni de transparencia) y **el rig por partes con capas IA** (probado, funcionaba, pero un
personaje frontal de 4 piezas no rota ni puede animarse por frames — ver §4).

## 2. Coste por herramienta (lo que importa al decidir)

| Herramienta | Coste | Para qué la usamos |
|---|---|---|
| `create_character` (v3) | 1-2 gens | Personaje base por etapa, a partir de la ardilla plana de referencia |
| `create_character_state` | 20-40 gens | Estado de clase (prenda + objeto) sobre el personaje base de la etapa |
| `animate_character` (plantilla, p. ej. `breathing-idle`) | 1 gen | `idle` |
| `animate_character` (v3 custom, `action_description`) | 1 gen | `sleepy`, `sad`, `joy` |
| `create_image_pixflux` (img2img) | 1 gen | Ardilla plana de referencia por etapa (`ref/<stage>.png`), bellota |
| `reduce_colors`, `correct_pixelart` | 0,1 gen | Limpieza puntual |

Con 5 000 gens/mes cabe el arte completo varias veces; aun así, cada tanda apunta lo gastado
(`get_balance`).

## 3. Pipeline por etapa

Lienzo 40×40, `no_background: true`, vista `low top-down`.

1. **Ardilla plana de referencia.** `create_image_pixflux` desde el procedural aplanado (histórico:
   `compose.mjs`, borrado — ver §4), fuerza 150. Se guarda en
   `scripts/pet-pixellab/ref/<stage>.png` (ya existe para las 3 etapas).
2. **Personaje base por etapa (×3).** `create_character(mode="v3", view="low top-down",
   reference_image_base64=<ref/<stage>.png>, description=<brief §5>)`. 1-2 generaciones da 8
   rotaciones coherentes (S, SE, E, NE, N, NW, W, SW). Verificar con `get_character` + hoja de
   contacto (`sheet.mjs`) de las 8 direcciones: misma ardilla, etapa distinguible (cabezona /
   canas). Si no, `delete_character` y repetir — la redacción del `description` pesa más que la
   `seed`.
3. **Estado de clase (×18 = 3 etapas × 6 clases).** `create_character_state(character_id=<base de
   la etapa>, edit_description=<brief §5>)`. 20-40 generaciones; también aquí la redacción manda:
   el objeto del guerrero (espada) solo apareció al pedir «raised upright… blade clearly visible
   beside the head» — descripciones más vagas la dejaban fuera de cuadro o tapada por el brazo.
   Verificar prenda/objeto visibles en las 8 direcciones antes de anotar el `character_id`.
4. **4 animaciones sur por estado (×72 base, +re-rolls).** `animate_character(character_id=<id>,
   directions=["south"], animation_name="idle|sleepy|sad|joy")`:
   - `idle`: `template_animation_id="breathing-idle"` (1 gen).
   - `sleepy`, `sad`, `joy`: `mode="v3"`, `frame_count=8`, `action_description` (§5bis, 1 gen
     cada una). El sheet exportado guarda 9 frames por animación (8 + el frame de referencia).

   `animate_character` **no tiene parámetro `seed`**: un re-roll no es reproducible, solo se puede
   repetir con otra redacción y comparar. PixelLab ordena las filas de animación del sheet por
   fecha de creación, así que regenerar una animación **cambia el `row`** de esa entrada en
   `sheets.gen.ts` al volver a exportar — esperado, no un bug.
5. **Descargar y generar.** `node scripts/pet-pixellab/fetch-character.mjs <stage> <cls>` por cada
   combinación (o tras cualquier re-roll): descarga el zip, deja PNG + JSON en
   `public/pet/sheets/<stage>/<cls>.*` y regenera `src/lib/pet/sheets.gen.ts` a partir de **todos**
   los JSON presentes. Falla a propósito (`falta animación <name> (south) en <stage>/<cls>`) si
   falta una de las 4.

   **Regenerar cualquier sheet exige subir `CACHE_NAME` en `public/sw.js`.** El PNG se llama
   igual tras un re-roll y el service worker lo sirve cache-primero (`ASSET_EXT`); sin el bump,
   un cliente que ya tenía el PNG viejo en caché sigue sirviéndolo mientras `sheets.gen.ts` (que
   sí va hasheado en el JS) ya espera las filas nuevas — la mascota anima mal hasta que ese
   cliente purgue el caché a mano.
6. **Comprobar.** `npx vitest run src/lib/pet` (existe PNG y entrada generada por combinación, cada
   una con las 4 animaciones en sur) y mirar `/mascota` a 1× y 3×.

## 3bis. Bellota: dos animaciones, no un personaje

La bellota **no** es un personaje PixelLab: es un frame único rediseñado con `create_image_pixflux`
(img2img, fuerza 150) o `create_image_pixen` desde texto, y **dos animaciones** con `animate_image`
(no `animate_character`) sobre ese frame, 8 frames cada una (9 guardados: 8 generados + el frame de
referencia), `no_background`: `idle` (`gentle idle loop`, siempre) y `ready` (`about to hatch`, solo
cuando `hatch-form` tiene nombre válido y clase elegida — ver
`2026-09-03-mascota-bellota-visor-admin-design.md` §2).

`animate_image` devuelve frames sueltos, no un sheet: `scripts/pet-pixellab/pack-strip.mjs
<out-basename> <cell> idle=<dir> ready=<dir>` los empaqueta con el mismo formato de layout que
exporta PixelLab (`spritesheet.cell_size`, `columns`, `rows[]`) en `public/pet/sheets/acorn.png` +
`acorn.json`; `public/pet/acorn.png` (el PNG estático viejo) se borra. `node
scripts/pet-pixellab/fetch-character.mjs --gen` regenera `src/lib/pet/sheets.gen.ts` a partir de
los JSON presentes, incluida la entrada `acorn` (tipo `AcornSheetEntry`, sin `directions`).

**La regla de `CACHE_NAME` de §3 paso 5 también aplica aquí**: `acorn.png` cambia de ruta
(`public/pet/acorn.png` → `public/pet/sheets/acorn.png`) y de contenido en cualquier re-roll;
sin subir `CACHE_NAME` en `public/sw.js` un cliente que ya tenía el PNG en caché sigue sirviendo
la versión vieja contra las filas nuevas de `sheets.gen.ts`.

## 4. Probado, descartado

**El rig por partes murió el 2026-09-03** (spec `2026-09-03-mascota-sprites-personaje-design.md`):
un personaje frontal de 4 piezas compuestas con `transform` no rota ni admite animación por
frames, y el producto quiere que la mascota pasee (#1057) y pelee (#1015). Se borraron
`public/pet/{young,adult,veteran,face,class}/`, `scripts/pet-sprites.mjs` y los scripts del rig
(`compose.mjs`, `slice.mjs`, `extract-layer.mjs`, `rig.mjs`). No revivir sin releer esa spec.

Lo que se probó dentro de ese pipeline, para no repetirlo si algún día se retoma un híbrido de
capas:

- **Piezas aisladas desde el procedural** («only the head of a squirrel»): a fuerza 220 devuelve
  el procedural intacto; a 120 la cabeza pasa pero la cola sale sucia. Sin contexto se pierde.
- **Instrucciones de añadir cosas a fuerza ≥ 250** («now wearing a hat», «eyes closed»): las
  ignora y devuelve la misma ardilla. Por debajo de 150 añade pero mueve todo.
- **Capas de clase por composición + `pixflux` a fuerza 200 + extracción por máscara**
  (`extract-layer.mjs`, alpha del procedural dilatado + tolerancia de color 60): funcionaba, pero
  no daba rotación ni frames — quedó reemplazado por `create_character_state`.
- **Caras pintadas o `inpaint_image` sobre la cabeza IA**: quedó reemplazado por las animaciones
  (§3.4) — el humor ya no es una capa de cara, es la animación que se reproduce.

## 5. Brief por pieza (prompts base)

Prefijo común: `cute chibi red squirrel mascot, big fluffy tail, cream belly, pixel art, black
outline, flat shading, warm palette`. Se usan como `description` de `create_character` (base) o
`edit_description` de `create_character_state` (clase).

| Pieza | Añadir al prefijo |
|---|---|
| Cría | `baby … with oversized head and tiny body, small fluffy tail, standing on two feet, game character` |
| Adulta | prefijo tal cual, `standing on two feet, game character`, sin ropa ni objetos |
| Veterana | `old veteran …, tail with grey white streaks of age, small scar over one eyebrow, standing on two feet, game character` |
| Mago (`wizard`) | `wearing a blue pointed wizard hat with gold stars and holding a thin wooden staff with a glowing purple crystal` |
| Bárbaro (`barbarian`) | `wearing a grey iron horned helmet and holding a small iron mace in the left paw` |
| Guerrero (`fighter`) | `wearing a steel helmet with a red plume and holding a short sword raised upright, blade clearly visible beside the head` |
| Clérigo (`cleric`) | `wearing a white tabard with a gold cross over the torso and holding a small wooden holy symbol in the left paw` |
| Bardo (`bard`) | `wearing a green feathered cap and holding a small lute` |
| Explorador (`ranger`) | `wearing a green hood and holding a short bow in the left paw` |

Bellota (`acorn.png`): `pixflux` desde el procedural a fuerza 150, mismo lienzo 40×40.

## 5bis. `action_description` de las animaciones (v3 custom, sur, `frame_count=8`)

| Animación | `action_description` |
|---|---|
| `sleepy` | `dozing off: eyes closed, head nodding slowly, slow breathing, tail drooping` |
| `sad` | `sad and droopy: ears down, head lowered, tail hanging low, slow sigh` |
| `joy` | `happy celebration: hops up with both paws raised, tail flicks up, lands back in the same spot` |

(`idle` no lleva `action_description`: usa la plantilla `breathing-idle`.)

## 6. Trampas

- ESM no lee `NODE_PATH`; los scripts viven dentro del repo para importar `sharp`/`tar` sin
  trucos.
- El endpoint de descarga del sheet (`/mcp/characters/<id>/spritesheet`) devuelve 423 mientras
  haya jobs en curso para ese personaje: `fetch-character.mjs` reintenta cada 15 s.
- Sin `no_background: true` PixelLab mete fondo opaco (aplica a `create_image_pixflux`, no a
  `create_character`/`create_character_state`, que ya recortan alpha).
- La celda del sheet exportado **no es fija**: 52 o 56 px según cuánto desborde la animación al
  personaje de 40 px. El componente lee `entry.cell` del JSON generado, nunca asume un tamaño.
- `animate_character` no acepta `seed`: para repetir un resultado hay que ajustar el
  `action_description`, no relanzar igual.
- Los candidatos y hojas de contacto van a `.superpowers/brainstorm/<fecha>/` (ignorado por git);
  a `public/pet/sheets/` solo va lo que ya pasó `fetch-character.mjs`.

## 7. Estado

- 2026-09-03: pipeline de personaje completo — 3 personajes base, 18 estados de clase, 74
  animaciones (72 + 2 re-rolls) generados y descargados. Coste de esta fase: **~620
  generaciones**. Suscripción Tier 2 contratada el 2026-09-03 (issue #1021, cerrada por esta
  rama).
- Pendiente conocido tras esta fase: #1055 (clérigo adulto/veterano sin objeto visible en sur),
  #1056 (idle por plantilla restiliza a la ardilla; probar `animate_character` v3 por clase).
- Fase de arte anterior (rig por partes, prueba con el trial): histórico, ver §4 y
  `2026-09-03-mascota-sprites-personaje-design.md`.
