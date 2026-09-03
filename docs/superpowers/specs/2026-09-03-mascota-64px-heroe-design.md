# Mascota: de 40 px chibi a 64 px «héroe» (rediseño de identidad)

> **[Histórico · congelado 2026-09-03]** Spec de diseño del salto de resolución y de identidad de
> la mascota: el personaje de 40 px (spec `2026-09-03-mascota-sprites-personaje-design.md`) se
> sustituye por una familia nueva a **64 px** con proporción héroe, etapas por edad visible y
> estados de clase con atuendo completo. Explica el *porqué* y lo que se probó; el estado de hoy
> manda en el código. Cómo se genera cada asset vive en la spec canónica
> `2026-09-03-mascota-arte-pixellab-design.md`, que esta spec reescribe.

## 1. Por qué se cambia

A 40 px ciertos detalles y expresiones quedan raros: los ojos son dos puntos, el báculo del mago
una diagonal de 1 px y el cristal una mancha de 3 px. Se comparó la adulta base y el mago a 40,
64, 80 y 128 (`.superpowers/brainstorm/2026-09-03-hires/`, issue #1068):

| Tamaño | Qué gana | Contra |
|---|---|---|
| 64 | Ojos con iris y brillo, boca, dedos, franja de la cola, cristal legible (~5 px). Outline 1 px limpio. Sigue leyendo como sprite. | Celda exportada ~90 px: la compañera crece en la esquina. |
| 80 | Mechones en la cola, sombreado a 3 tonos. | Muy cerca de 64 en lectura; compañera ≈ 105 px. |
| 128 | Casi ilustración; 8 rotaciones perfectas. | Solo cabe a 1× en la ficha; esquina imposible sin escala fraccional (borrosa). |

**Se elige 64.** Es el mayor salto por píxel y el único que sigue cabiendo en la esquina a
escala entera.

**Subir de resolución es rediseñar, no refinar.** `create_character` v3 con `reference_image`
**ignora `size`**: devolvió 40×40 byte a byte igual a la adulta actual. Y from scratch a cualquier
tamaño sale otra ardilla (naranja, ojos grandes brillantes) frente a la de 40 (marrón rojizo, ojos
punto). Se acepta el cambio de identidad y se aprovecha para quitarle lo genérico a la base,
con una referencia externa de mago-ardilla como inspiración (no copia): proporción héroe en vez
de peluche, etapas distinguibles de un vistazo por edad, y clases con atuendo completo en vez de
sombrero + objeto.

Coste del arte de 40 que se tira: ~620 generaciones (spec canónica §7). El saldo (4 215 gens el
2026-09-03, se renueva el 3 de octubre) cubre el rehecho completo con margen (§7).

## 2. Dirección de arte (decidida con candidatos, no con prosa)

Candidatos y hojas de contacto en `.superpowers/brainstorm/2026-09-03-hires/` (no versionado):
`hero_stages.png`, `hero_wizard.png`, `hero_young_gaze.png`, `hero_rot_*.png`, `quad_compare.png`.

- **Proporción héroe, con límite real.** Pose erguida y confiada, brazos y patas visibles.
  Pidiendo «head about one third of total height» el modelo entrega ~40-45 %: v3 no baja de ahí y
  a 64 px un tercio real dejaría la cara en ~20 px. El objetivo escrito es **cabeza ~40 %**.
- **Etapas por edad.** Cría cabezona (~50 %) con rubor y **cuerpo y cabeza girados a 3/4** como
  las otras dos (de frente rompía la coherencia); adulta con mechón de barbilla; veterana con
  barba larga blanca, punta de la cola blanca, canas y cicatriz en la ceja. Las tres se
  distinguen de un vistazo (`hero_stages.png`).
- **Clases con atuendo completo.** Prenda que cubre el cuerpo + objeto grande (báculo más alto que
  la ardilla, espada en alto). Probado con el mago: túnica azul con ribete dorado, cristal por
  encima de la cabeza, cara conserva la identidad de la base, 8 rotaciones limpias.
- **Expresión y paleta:** las de los candidatos (ojos con brillo, paleta cálida). Se descartó
  oscurecer la paleta y endurecer la mirada.

Trampas de redacción descubiertas (van también a la canónica §6):

- **Negar no funciona; describir sí.** «no backpack» dio mochila. «adventurer» en el brief base
  metió mochila verde y cinturón sin pedirlos. El brief base describe solo lo que se quiere.
- La pose 3/4 de la cría salió con «body angled three-quarter view like a classic RPG sprite,
  head and eyes looking to the viewer's left, not straight at the camera» (`young-c`); una
  redacción más suave («head turned slightly to the side») apenas giró.

## 3. Cuadrúpeda al moverse, bípeda en acciones

Nota de producto para el paseo (#1057) y el combate (#1015): la mascota corre a cuatro patas y
actúa a dos. Probado sobre la adulta héroe (`quad_compare.png`, `quad_run_adult.png`):

- `animate_character` v3 con «drops down onto all four paws and runs» **no** la baja: el esqueleto
  humanoide gana y la carrera sale bípeda. `body_type="quadruped"` es otro personaje (plantillas
  gato/perro), no un estado: bípeda y cuadrúpeda no conviven en un `character_id`.
- `create_image_pixflux` img2img (fuerza 160) devuelve la bípeda intacta. `edit_image` da una pose
  a cuatro patas plausible pero con la grupa alta, y animar desde ese frame
  (`custom_start_frame_url`) vuelve a erguirla en pocos frames.
- **Lo que funciona: `create_character_state(edit_description="down on all four paws like a real
  squirrel, body horizontal, tail raised in an S curve…")` sobre el estado de clase bípedo.** Es
  lo que recomienda `agent_help` de PixelLab. Cuerpo horizontal, cuatro patas, 8 rotaciones
  coherentes; el mago conserva túnica, sombrero y báculo a la espalda. `animate_character` sobre
  ese estado da un galope real con identidad en los 9 frames. ~20 gens por estado quad + 1 gen
  por animación y dirección.

**Modelo resultante:** cada etapa × clase tiene **dos estados** PixelLab derivados de la misma
base: `biped` (idle/sleepy/sad/joy, ataques) y `quad` (walk/run). Esta spec deja el pipeline
escrito; generar los 18 estados quad y las animaciones de paseo es trabajo de #1057 (reserva
~360 + 144 gens), no de esta fase.

## 4. Alcance de esta fase

- 3 bases nuevas a 64 (cría, adulta, veterana) + 18 estados de clase bípedos con atuendo
  completo + 4 animaciones sur por estado (`idle`, `sleepy`, `sad`, `joy`) + bellota a 64.
- Se sustituyen en el mismo sitio los 18 sheets y la bellota de 40. Los personajes de 40 en
  PixelLab no se borran (no cuestan), pero `characters.json` pasa a los ids nuevos.
- `scripts/pet-pixellab/ref/` se borra: las bases se generan from scratch y la reproducibilidad
  es `characters.json` (todo estado y animación deriva del `character_id`).
- Sin cambios funcionales: misma API de `<PetSprite>`, mismos humores y reacciones, la compañera
  sigue quieta en su esquina.

## 5. Briefs (sustituyen a la canónica §5)

Prefijo común: `red squirrel mascot, cream belly, big fluffy tail, pixel art, black outline,
flat shading, warm palette, game character`. Ninguna negación; se describe la pose y lo que lleva.

| Pieza | `description` de `create_character` (v3, `size=64`, `low top-down`, from scratch) |
|---|---|
| Cría | `young red squirrel kit mascot, oversized head about half of total height, small body, standing upright on two feet, body angled three-quarter view like a classic RPG sprite, head and eyes looking to the viewer's left, not straight at the camera, short fluffy tail, cream belly, round cheeks, pixel art, black outline, flat shading, warm palette, game character` |
| Adulta | `cute red squirrel mascot, standing upright on two feet in a confident hero pose, head about forty percent of total height, visible arms and legs, bare fur with a cream belly, big fluffy tail behind the body, small tuft of fur on the chin, pixel art, black outline, flat shading, warm palette, game character` |
| Veterana | `old veteran red squirrel mascot, standing upright on two feet in a confident hero pose, head about forty percent of total height, long white beard, grey streaks in the fur and tail, small scar over one eyebrow, big fluffy tail with a white tip, cream belly, pixel art, black outline, flat shading, warm palette, game character` |

Se acepta la base cuando la hoja de 8 rotaciones muestra la misma ardilla, sin prendas ni
objetos, y las tres etapas se distinguen de un vistazo lado a lado. Si no, `delete_character` y
otra redacción (v3 no tiene `seed` útil: la redacción es lo que se ajusta).

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

Se acepta un estado cuando prenda y objeto se ven en las 8 direcciones y la cara sigue siendo la
de la base. El objeto grande tiende a taparse con el brazo o quedar fuera de cuadro: la posición
(«upright beside the body», «clearly visible above the head») no es decorativa, es lo que lo saca.

Animaciones: sin cambios respecto a la canónica §3.4 y §5bis (`idle` plantilla `breathing-idle`;
`sleepy`, `sad`, `joy` v3 custom, 8 frames, sur). A 64 cuestan 1 gen por animación y dirección.

Bellota: frame único a 64 (`create_image_pixen` desde texto, o `pixflux` con `no_background`),
`animate_image` `idle` y `ready` como la canónica §3bis, empaquetada con `pack-strip.mjs`.
Motivo: que la densidad de píxel de la bellota a 2× case con la ardilla a 2× en la eclosión.

## 6. Pipeline y código

- **`create_character`**: `size=64`, sin `reference_image`. Todo lo demás igual.
- **Celda exportada**: v3 rellena el lienzo alrededor del personaje: rotaciones a 64×64, frames de
  animación a **88-96 px**. El sheet exportado usa la celda mayor. `fetch-character.mjs` y
  `<PetSprite>` ya leen `spritesheet.cell_size` / `entry.cell`, así que **no cambian**.
- **`characters.json`**: mismo esquema, ids nuevos. Se añade por clase la clave opcional
  `quad: { character_id, anims }` para #1057 (vacía en esta fase).
- **Ruta cuadrúpeda** (documentada aquí y en la canónica, ejecutada en #1057):
  `create_character_state(character_id=<estado bípedo>, edit_description="the same character
  down on all four paws like a real squirrel, side view, body horizontal, tail raised in an S
  curve behind, <atuendo de la clase> kept on, <objeto> strapped on its back")` → sheet aparte
  `public/pet/sheets/<stage>/<class>.quad.png` → `animate_character` `walk`/`run` por dirección.
- **Escalas en pantalla** (celda pasa de 52-56 a ~90 px; `scale` sigue siendo `1 | 2 | 3`):

  | Sitio | Hoy | Nuevo | En pantalla |
  |---|---|---|---|
  | `pet-companion.tsx` (esquina) | 1× | 1× | ~90 px (hoy 55). Único crecimiento; escala fraccional descartada por borrosa. |
  | `pet-detail.tsx` (ficha) | 3× | 2× | ~180 px, como hoy |
  | `class-picker.tsx` | 2× | 1× | ~90 px, como hoy |
  | `hatch-form.tsx` (bellota) | 3× | 2× | ~180 px, como hoy |
  | `pet-gallery.tsx` (`/admin/mascota`) | selector | selector | sin cambios |

- **`manifest.test.ts`**: `cell >= 40` pasa a `cell >= 64`.
- **`CACHE_NAME` en `public/sw.js`**: bump obligatorio (rutas de PNG idénticas, contenido nuevo;
  canónica §3.5).

## 7. Coste y orden de ejecución

| Paso | Gens | Puerta |
|---|---|---|
| 3 bases (v3, 64) | ~6 | Hoja de 8 rotaciones × 3 etapas aprobada a ojo antes de seguir |
| 18 estados bípedos | 360-720 | Hoja de contacto sur × 18 + rotaciones; re-roll por estado si falta prenda/objeto |
| 72 animaciones sur | ~72 (+ re-rolls) | `fetch-character.mjs` × 18, `npx vitest run src/lib/pet`, `/admin/mascota` |
| Bellota | ~4 | `pack-strip.mjs`, `fetch-character.mjs --gen` |
| **Total** | **~450-800** | Saldo 4 215; reserva #1057 ~500 |

Después: escalas (§6), `manifest.test.ts`, `CACHE_NAME`, borrar `ref/`, hoja de contacto de las 18
en la PR, e2e sin cambios (`e2e/mascota.spec.ts`, `e2e/admin-mascota.spec.ts` van por testid).

## 8. Doc y seguimiento

- Esta spec (congelada).
- `2026-09-03-mascota-arte-pixellab-design.md` (canónica): §3 (`size=64`, sin referencia, celda
  88-96), §5 y §5bis (briefs de arriba), §3bis (bellota a 64), §4 («probado, descartado»:
  referencia + `size`, `animate_character` cuadrúpeda, `pixflux`/`edit_image` para la pose), §6
  (negaciones, «adventurer», celda de animación), §7 (estado y coste), nueva sección «ruta
  cuadrúpeda».
- `.claude/agents/pet-artist.md`: 64 px, from scratch, atuendo completo, describir-no-negar,
  ruta quad.
- `docs/requirements/decisiones.md`: entrada «40 chibi → 64 héroe; bípeda/cuadrúpeda como dos
  estados».
- Issues: #1068 se cierra con esta fase; #1057 recibe la ruta quad de §3 y la reserva de gens;
  #1055 y #1056 se revisan (los estados se regeneran enteros, pueden quedar obsoletos).
