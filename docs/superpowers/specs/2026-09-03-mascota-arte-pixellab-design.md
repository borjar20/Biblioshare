# Mascota: arte pixel con PixelLab (herramienta por defecto y pipeline)

> **[Canónico · verificado 2026-09-04]** Cómo se genera el arte de la mascota (y de BiblioPlay)
> con PixelLab. Pipeline de **personaje** (sprite sheets PixelLab: base + estado de clase +
> animaciones), no de rig por partes — el rig murió el 2026-09-03, ver §4 y la spec
> `2026-09-03-mascota-sprites-personaje-design.md` (el porqué del cambio, congelada). Desde el
> 2026-09-03 el arte es la familia de **64 px** (spec `2026-09-03-mascota-64px-heroe-design.md`,
> el porqué); la de 40 px es histórica. Si el pipeline cambia, se cambia aquí y se actualiza la
> fecha.

## 1. Decisión

**PixelLab (MCP `pixellab`) es la herramienta por defecto para todo sprite del proyecto.**
Suscripción Tier 2 «Pixel Artisan» (5 000 generaciones/mes, se renuevan el día 3). El agente
`.claude/agents/pet-artist.md` la usa; los scripts de apoyo viven en `scripts/pet-pixellab/`.

El arte de la mascota es **un personaje PixelLab de 64 px por etapa** (cría, adulta, veterana),
con un **estado de clase** por cada una de las 6 clases y **4 animaciones** (`idle`, `sleepy`,
`sad`, `joy`) en la dirección `south-west` (`PET_FACING` de `src/lib/pet/manifest.ts`: la mascota
se muestra y anima a 3/4 mirando a la izquierda del espectador). `<PetSprite>` pinta el
spritesheet que exporta PixelLab (`public/pet/sheets/<stage>/<class>.{png,json}`); no compone
piezas con `transform` ni superpone capas. `scripts/pet-pixellab/fetch-character.mjs` descarga
cada sheet y regenera `src/lib/pet/sheets.gen.ts`.

Se descartó dibujar a mano (no hay ilustrador), un modelo genérico de texto-a-imagen (sin control
de lienzo ni de transparencia) y **el rig por partes con capas IA** (probado, funcionaba, pero un
personaje frontal de 4 piezas no rota ni puede animarse por frames — ver §4).

## 2. Coste por herramienta (lo que importa al decidir)

| Herramienta | Coste | Para qué la usamos |
|---|---|---|
| `create_character` (v3) | 1-2 gens | Personaje base por etapa, **from scratch** a `size=64` (sin referencia) |
| `create_character_state` | 20-40 gens | Estado de clase (atuendo completo + objeto grande) sobre la base de la etapa |
| `animate_character` (v3 custom, `action_description`) | 1 gen | Las 4 animaciones: `idle`, `sleepy`, `sad`, `joy` |
| `create_image_pixen` (texto) | 1 gen | Frame único de la bellota (64×64) |
| `animate_image` | 1 gen | Las 2 animaciones de la bellota (`idle`, `ready`) |
| `reduce_colors`, `correct_pixelart` | 0,1 gen | Limpieza puntual |

`create_character_state` **cobra por tramo de lienzo resuelto al generar**, no por lo que
reservó: puede cobrar más de lo anunciado, así que deja ~40 gens de margen en cualquier tanda.
Con 5 000 gens/mes cabe el arte completo varias veces; aun así, cada tanda apunta lo gastado
(`get_balance`).

## 3. Pipeline por etapa

Lienzo 64×64 (`size=64`), `no_background: true` en las herramientas de imagen, vista
`low top-down`.

1. **No hay imagen de referencia.** Las bases se generan from scratch: `create_character` v3 con
   `reference_image` ignora `size` (devuelve el tamaño de la referencia), así que no sirve para
   subir de resolución. La reproducibilidad es `characters.json`: todo estado y animación deriva
   del `character_id`.
2. **Personaje base por etapa (×3).** `create_character(mode="v3", view="low top-down", size=64,
   description=<brief §5>)`. 1-2 generaciones da 8 rotaciones coherentes (S, SE, E, NE, N, NW, W,
   SW). Verificar con `get_character` + hoja de contacto (`sheet.mjs`) de las 8 direcciones.
   **Aceptación: misma ardilla en 8 direcciones, sin prendas ni objetos, etapas distinguibles
   lado a lado.** Si no, `delete_character` y repetir — la redacción del `description` pesa más
   que la `seed`.
3. **Estado de clase (×18 = 3 etapas × 6 clases).** `create_character_state(character_id=<base de
   la etapa>, edit_description=<brief §5>, override_width=80, override_height=80)`. 20-40
   generaciones; también aquí la redacción manda. **Atuendo completo** (prenda que cubre el
   cuerpo + objeto grande) **con posición explícita del objeto**: el objeto del guerrero (espada)
   solo apareció al pedir «raised upright… blade clearly visible beside the head»; descripciones
   más vagas lo dejaban fuera de cuadro o tapado por el brazo.
   **`override_width=80, override_height=80` desde el primer intento, no como remedio.** A 64 el
   objeto alto (báculo, arco, maza con símbolo) toca la fila 0 y sale cortado en plano; la etapa
   adulta se llevó ~60 gens en re-rolls antes de fijar esta regla (#1070 documenta el caso que
   quedó dentro). Verificar prenda **y** objeto visibles en las 8 direcciones —empezando por
   `south-west`, que es la que se ve en la app— antes de anotar el `character_id`.
4. **4 animaciones `south-west` por estado (×72 base, +re-rolls).**
   `animate_character(character_id=<id>, directions=["south-west"], mode="v3", frame_count=8,
   animation_name="idle|sleepy|sad|joy", action_description=<§5bis>)`. **Las cuatro son v3
   custom**: la plantilla `breathing-idle` pierde el objeto en mano y los cuernos del bárbaro en
   todas las clases (#1056), así que `idle` también lleva `action_description` (§5bis). El sheet
   exportado guarda 9 frames por animación (8 + el frame de referencia). A 64 px cuesta **1 gen
   por animación y dirección**; los frames salen a **92-104 px** (v3 rellena el lienzo alrededor
   del personaje) y el sheet exportado usa esa celda.

   `animate_character` **no tiene parámetro `seed`**: un re-roll no es reproducible, solo se puede
   repetir con otra redacción y comparar. PixelLab ordena las filas de animación del sheet por
   fecha de creación, así que regenerar una animación **cambia el `row`** de esa entrada en
   `sheets.gen.ts` al volver a exportar — esperado, no un bug.
5. **Descargar y generar.** `node scripts/pet-pixellab/fetch-character.mjs <stage> <cls>` por cada
   combinación (o tras cualquier re-roll): descarga el zip, deja PNG + JSON en
   `public/pet/sheets/<stage>/<cls>.*` y regenera `src/lib/pet/sheets.gen.ts` a partir de **todos**
   los JSON presentes. Falla a propósito (`falta animación <name> (south-west) en <stage>/<cls>`)
   si falta una de las 4.

   **Regenerar cualquier sheet exige subir `CACHE_NAME` en `public/sw.js`.** El PNG se llama
   igual tras un re-roll y el service worker lo sirve cache-primero (`ASSET_EXT`); sin el bump,
   un cliente que ya tenía el PNG viejo en caché sigue sirviéndolo mientras `sheets.gen.ts` (que
   sí va hasheado en el JS) ya espera las filas nuevas — la mascota anima mal hasta que ese
   cliente purgue el caché a mano.
6. **Comprobar.** `npx vitest run src/lib/pet` (existe PNG y entrada generada por combinación, cada
   una con las 4 animaciones en `south-west`) y mirar `/mascota` a 1× y 2×.

## 3bis. Bellota: dos animaciones, no un personaje

La bellota **no** es un personaje PixelLab: es un frame único de 64×64 generado con
`create_image_pixen` desde texto (`no_background`, vista `low top-down`) y **dos animaciones** con
`animate_image` (no `animate_character`) sobre ese frame, 8 frames cada una (9 guardados: 8
generados + el frame de referencia), `no_background`: `idle` (`gentle idle loop`, siempre) y
`ready` (`about to hatch`, solo cuando `hatch-form` tiene nombre válido y clase elegida — ver
`2026-09-03-mascota-bellota-visor-admin-design.md` §2). La bellota se queda en `south`: no tiene
rotaciones y `acornEntryFrom` no aplica `PET_FACING`.

Brief del frame: `plain acorn with no face, brown cap, ochre body, small green leaf, pixel art,
black outline, flat shading, warm palette, game item` a 64×64. **«cute acorn» le pone cara en
todas las semillas** — hay que pedir explícitamente que no la tenga.

`animate_image` devuelve frames sueltos, no un sheet: `scripts/pet-pixellab/pack-strip.mjs
<out-basename> 64 idle=<dir> ready=<dir>` los empaqueta con el mismo formato de layout que
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

Del salto a 64 px (#1068), tres callejones sin salida:

- **`create_character` v3 con `reference_image` + `size`: ignora `size`.** Con la ardilla plana de
  40 como referencia devuelve 40×40 byte a byte, pidas el tamaño que pidas. Subir de resolución
  obliga a generar from scratch, y from scratch sale otra ardilla — no hay refinado, hay rediseño.
- **`animate_character` v3 «a cuatro patas» sobre un personaje humanoide: sale bípeda.** El
  esqueleto del personaje gana sobre el `action_description`; `body_type="quadruped"` es otro
  personaje (plantillas gato/perro), no un estado. La ruta buena es §8.
- **Pose cuadrúpeda por imagen.** `create_image_pixflux` img2img (fuerza 160) devuelve la bípeda
  intacta; `edit_image` da una pose a cuatro patas plausible pero con la grupa alta, y animar
  desde ese frame (`custom_start_frame_url`) la vuelve a erguir en pocos frames.

## 5. Brief por pieza (prompts base)

Prefijo común: `red squirrel mascot, cream belly, big fluffy tail, pixel art, black outline,
flat shading, warm palette, game character`.

| Pieza | `description` de `create_character` (v3, `size=64`, `low top-down`, from scratch) |
|---|---|
| Cría | `young red squirrel kit mascot, oversized head about half of total height, small body, standing upright on two feet, body angled three-quarter view like a classic RPG sprite, head and eyes looking to the viewer's left, not straight at the camera, short fluffy tail, cream belly, round cheeks, pixel art, black outline, flat shading, warm palette, game character` |
| Adulta | `cute red squirrel mascot, standing upright on two feet in a confident hero pose, head about forty percent of total height, visible arms and legs, bare fur with a cream belly, big fluffy tail behind the body, small tuft of fur on the chin, pixel art, black outline, flat shading, warm palette, game character` |
| Veterana | `old veteran red squirrel mascot, standing upright on two feet in a confident hero pose, head about forty percent of total height, long white beard, grey streaks in the fur and tail, small scar over one eyebrow, big fluffy tail with a white tip, cream belly, pixel art, black outline, flat shading, warm palette, game character` |

Estados de clase (`create_character_state`, `edit_description`, sobre la base de la etapa).
Atuendo completo + objeto grande, con posición explícita del objeto:

| Clase | `edit_description` |
|---|---|
| Mago (`wizard`) | `wearing a long blue wizard robe with gold trim covering the body and a blue pointed wizard hat with gold stars, holding a tall thin wooden staff taller than the squirrel with a glowing purple crystal on top, staff held upright beside the body, crystal clearly visible above the head` |
| Bárbaro (`barbarian`) | `wearing a brown fur-lined leather harness with a wide belt and fur boots, grey iron horned helmet, holding a big two-handed iron axe upright beside the body, axe head clearly visible above the shoulder` |
| Guerrero (`fighter`) | `wearing full steel plate armor covering the torso and shoulders, steel helmet with a red plume, holding a short sword raised upright in one paw with the blade clearly visible beside the head and a round wooden shield in the other` |
| Clérigo (`cleric`) | `wearing a long white robe with a gold cross on the chest and a gold-trimmed hood, holding a tall wooden mace with a glowing gold holy symbol on top upright beside the body, symbol clearly visible above the head` |
| Bardo (`bard`) | `wearing a green tunic with a brown vest and a green feathered cap, holding a big wooden lute across the chest with both paws, lute clearly visible in front of the belly` |
| Explorador (`ranger`) | `wearing a green hooded cloak over a brown leather tunic, quiver of arrows on the back, holding a tall wooden longbow upright beside the body, bow clearly visible taller than the head` |

**Ninguna negación en ningún brief; se describe la pose y lo que lleva.** Se acepta un estado
cuando prenda y objeto se ven en las 8 direcciones —y en `south-west` la primera, que es la que
mira el usuario— y la cara sigue siendo la de la base. El objeto grande tiende a taparse con el
brazo o quedar fuera de cuadro: la posición («upright beside the body», «clearly visible above
the head») no es decorativa, es lo que lo saca.

Bellota (`public/pet/sheets/acorn.png`): brief y pipeline en §3bis, mismo lienzo de 64.

## 5bis. `action_description` de las animaciones (v3 custom, `south-west`, `frame_count=8`)

| Animación | `action_description` |
|---|---|
| `idle` | `breathing idle: subtle breathing, slight bob of the head, holding the prop still` |
| `sleepy` | `dozing off: eyes closed, head nodding slowly, slow breathing, tail drooping` |
| `sad` | `sad and droopy: ears down, head lowered, tail hanging low, slow sigh` |
| `joy` | `happy celebration: hops up with both paws raised, tail flicks up, lands back in the same spot` |

(A 64 px, 1 gen cada una. `idle` dejó de usar la plantilla `breathing-idle` el 2026-09-03: la
plantilla pierde el objeto en mano y los cuernos del bárbaro — #1056.)

## 6. Trampas

- ESM no lee `NODE_PATH`; los scripts viven dentro del repo para importar `sharp`/`tar` sin
  trucos.
- El endpoint de descarga del sheet (`/mcp/characters/<id>/spritesheet`) devuelve 423 mientras
  haya jobs en curso para ese personaje: `fetch-character.mjs` reintenta cada 15 s.
- Sin `no_background: true` PixelLab mete fondo opaco (aplica a `create_image_pixen` /
  `create_image_pixflux` / `animate_image`, no a `create_character`/`create_character_state`, que
  ya recortan alpha).
- **Negar en un brief no funciona** («no backpack» dio mochila): describe lo que quieres.
- **«adventurer» en un brief base mete mochila y cinturón** sin pedirlos.
- La celda del sheet exportado **no es fija**: 92-104 px según cuánto desborde la animación al
  personaje de 64 px. El componente lee `entry.cell` del JSON generado, nunca asume un tamaño.
- `animate_character` no acepta `seed`: para repetir un resultado hay que ajustar el
  `action_description`, no relanzar igual.
- **`animate_image` puede no aparecer en la lista de herramientas del cliente aunque exista y esté
  en el `tools:` del agente**: la lista de MCP va cacheada por sesión. Reconectar el MCP (sesión
  nueva) o lanzarla desde la sesión principal.
- **`create_character_state` cobra por tramo de lienzo resuelto al generar**: puede cobrar más de
  lo reservado; deja 40 gens de margen.
- Los candidatos y hojas de contacto van a `.superpowers/brainstorm/<fecha>/` (ignorado por git);
  a `public/pet/sheets/` solo va lo que ya pasó `fetch-character.mjs`.

## 7. Estado

- 2026-09-04: **arte rehecho a 64 px** (rama `feat/mascota-64px-heroe`, spec
  `2026-09-03-mascota-64px-heroe-design.md`) — 3 bases nuevas, 18 estados de clase con atuendo
  completo, 72 animaciones en `south-west` (las 4 en v3) y bellota a 64. El arte de 40 px queda
  retirado; `scripts/pet-pixellab/ref/<stage>.png` desaparece. Generaciones de la rama:

  | Tanda | Gens |
  |---|---|
  | 3 bases (elegidas de la exploración de #1068) | 8 |
  | Cría: 6 estados + animaciones | 186 |
  | Cría: rehecho de animaciones a `south-west` + `idle` v3 | 25 |
  | Cría clérigo: estado nuevo con la maza visible (#1069) | 28 |
  | Adulta: 6 estados + animaciones | 272 |
  | Veterana: 6 estados + animaciones | 170 |
  | Bellota (`create_image_pixen` + `animate_image`) | 7 |
  | **Total de la rama** | **≈ 700** |

  Aparte, ~126 gens de exploración previa 64/80/128 en #1068. Saldo tras la rama: **3 499** el
  2026-09-04 (se renueva el 2026-10-03).
- Pendiente conocido: #1070 (el cristal de la maga adulta queda cortado 1-2 px arriba — estado
  reutilizado de la exploración, generado antes de la regla de `override_width/height=80`) y
  #1071 (el explorador adulto sale con la capucha bajada; cría y veterana la llevan puesta).
  #1055 y #1056 quedan cerradas por este rehecho
  (clérigo con maza visible; `idle` ya no usa plantilla). #1069 cerrada en la rama.
- Fase de arte anterior a 64 px (pipeline de personaje a 40 px, ~620 generaciones): histórico, ver
  §4 y `2026-09-03-mascota-sprites-personaje-design.md`.
- Fase de arte anterior a esa (rig por partes, prueba con el trial): histórico, ver §4.

## 8. Ruta cuadrúpeda (para #1057)

Nota de producto: la mascota **corre a cuatro patas y actúa a dos**. La ruta está probada
(2026-09-03, #1068, spec 64px §3) pero no ejecutada: es trabajo de #1057.

`animate_character` no baja al personaje humanoide y la pose por imagen no aguanta la animación
(§4). Lo que funciona es un **segundo estado**, no una animación:

```
create_character_state(character_id=<estado de clase bípedo>, edit_description="the same
  character down on all four paws like a real squirrel, side view, body horizontal, tail raised
  in an S curve behind, <atuendo de la clase> kept on, <objeto> strapped on its back")
```

Cuerpo horizontal, cuatro patas, 8 rotaciones coherentes; el mago conserva túnica, sombrero y
báculo a la espalda. `animate_character` sobre ese estado da un galope real con identidad en los 9
frames.

**Modelo resultante:** cada etapa × clase tiene **dos estados** PixelLab derivados de la misma
base — `biped` (idle/sleepy/sad/joy, ataques) y `quad` (walk/run). El sheet del quad va aparte, en
`public/pet/sheets/<stage>/<class>.quad.png`, y su id en
`characters.json.<stage>.classes.<cls>.quad` (clave que aún no existe: se añade al ejecutar #1057).

**Coste:** ~20 gens por estado quad (≈ 360 por las 18 combinaciones) + 1 gen por animación y
dirección (144 para `walk` en 8 direcciones × 18).
