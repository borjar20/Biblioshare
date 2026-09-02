# BiblioPlay visual-first: seis pantallas que dejan de ser formulario

> **[Histórico · congelado 2026-09-01]** Spec de diseño de la tanda posterior a la critique visual de la
> épica #931 (`.impeccable/critique/2026-09-01T19-45-23Z__src-app-partidas-page-tsx.md`). Explica el
> *porqué* de cada decisión; el estado de hoy manda en el código.

## Criterio

**Juguete sobre formulario.** Toda pantalla de BiblioPlay se opera con controles visuales (fichas, steppers
con mantener, chips, segmentados, diales). Un `<input>` de texto solo existe detrás de un «+» o de una ficha
tocada, y hay como mucho uno visible por pantalla. Ningún `type="number"`, ningún `<select>`, ningún
`checkbox` nativo. Objetivos táctiles de 44 px.

La critique contó los inputs visibles por pantalla: Puntuación config **2**, Bolsa **3**, hoja de ronda
**N (2-8)**, MTG config en revancha **14**. Esta tanda los deja en **0** salvo el único input tras «+».

Decisiones del usuario (2026-09-01): todo lo P0+P1 en una rama; la ficha de asiento **abre panel** al
tocarla (quitar vive dentro); hoja de ronda con **stepper + chips**; iconos de recurso como **SVG propios**.
Fuera de alcance: los contadores 2-8/2-6 de los hubs (son fichas grandes, no inputs; queda como P2 en issue),
el tablero de Recursos, la deuda de `text-[Npx]`.

## 1. Ficha unificada: `SeatRow` + panel

**Problema.** La misma ficha de color hacía dos cosas opuestas: en `ui/seat-picker.tsx` tocarla **quitaba**
al jugador (sin deshacer); en `score/score-setup-form.tsx` la **abría** para editar. Y la fila de fichas
estaba copiada a mano en puntuación.

**Diseño.** Nuevo `src/components/play/ui/seat-row.tsx`: la fila de fichas sin lógica de datos.

```ts
type SeatRowSeat = { id: string; caption: string; content: ReactNode; selected: boolean };
function SeatRow(props: {
  seats: SeatRowSeat[];
  onSeatTap(id: string): void;          // seleccionar/abrir panel
  regulars?: PlayerRecord[];             // fichas fantasma (RegularTokens)
  regularsQuery?: string;
  onSeatRegular?(r: PlayerRecord): void;
  canAdd: boolean;                       // «+» visible
  adding?: boolean;                      // aria-expanded del «+»
  onAdd(): void;
  addControls: string;                   // aria-controls del «+»
  align?: "start" | "center";
});
```

Tres consumidores:

- **`SeatPicker`** (Aleatorio, Reloj, Recursos, Turnos): tocar una ficha la selecciona (halo) y abre debajo
  un panel `id={idPrefix}-seat` con el nombre y un botón «Quitar de la mesa». No se renombra (los
  acompañantes identifican al jugador por nombre y renombrar rompería sus valores). El «+» sigue abriendo el
  único input.
- **`score-setup-form.tsx`**: sustituye su fila manual por `SeatRow`; su panel (nombre, habitual/Yo, «Quitar
  asiento») no cambia.
- **`setup-form.tsx`** (MTG): ver §3.

`SeatToken` gana `size?: "md" | "sm"` (44 px / 32 px) para las mini-fichas de «quién empieza» (§3).

**Copy** (`play.seats`): `remove` pasa a ser «Quitar a {name} de la mesa» (botón del panel); `edit` sigue
siendo el `aria-label` de la ficha.

## 2. Hoja de ronda sin inputs

**Problema.** `score/round-sheet.tsx` era N `<input>` apilados; con 6-8 jugadores el teclado del sistema
tapaba «Apuntar». Es el gesto más repetido de Puntuación.

**Diseño.** Estado `values: number[]` (no strings) y `active: number` (asiento activo, por defecto 0).

- Arriba, chips `+5 · +10 · +20 · −5 · −10` que aplican al asiento activo.
- Una fila por jugador: `SeatToken` (tocar = activar, halo `selected`) · número serif 24 px tabular · dos
  `HoldRepeatButton` (−1/+1 con mantener). Tocar cualquier control de la fila la activa.
- «Apuntar» pegado abajo (`sticky bottom-0` dentro de la hoja).
- Edición precarga `state.rounds[round]`.

Helper puro `src/lib/play/score/round-draft.ts`:

```ts
export function applyDelta(values: number[], seat: number, delta: number): number[]; // trunc, sin clamp
```

Sin clamp: el reducer de puntuación ya admite negativos y no tiene tope; el helper solo garantiza entero.

**E2e.** `partidas-puntuacion.spec.ts` deja de usar `getByLabel("Puntos de …").fill()`. Nuevo helper
`scoreRound(page, scores)` que, por asiento, toca la ficha «Puntuar a {name}» y compone el valor con chips y
±1. Se mantienen los `aria-label` existentes (`roundSheet.scoreOf` para el número, `role="status"` no hace
falta).

**Copy** (`play.roundSheet`): `activate: "Puntuar a {name}"`, `plus: "Sumar uno a {name}"`,
`minus: "Restar uno a {name}"`, `quick: "Sumar {n} a {name}"` (n con signo).

## 3. Configuración de MTG con fichas

**Problema.** `setup-form.tsx` mostraba 3-4 campos por asiento dentro de un `<details>` que abría
desplegado en revancha y reconfigurar (14 controles con 4 jugadores), un `<select>` para quién empieza y
`type="number"` para vidas.

**Diseño.** Misma estructura que `score-setup-form.tsx`:

- **Mesa**: `SeatRow` con una ficha por asiento (número si no tiene nombre, iniciales si lo tiene), fichas
  fantasma de habituales, «+» si `players.length < config.maxPlayers`. En Duelo (`min === max === 2`) no hay
  «+» ni «Quitar». Tocar ficha abre el panel del asiento: nombre (input, autofocus, `key` por id),
  `RegularPicker` (con `suggestOnEmpty={false}`), mazo (input), comandantes (input × 1-2, «+ comandante» /
  «−»), fondo (swatches de 44 px, `aria-pressed`), «Quitar asiento» (deshabilitado en el mínimo).
- **Vidas**: chips `20 · 30 · 40` (`aria-pressed`) + stepper con mantener (`useHoldRepeat`, paso 1, clamp
  1..999). El chip se enciende cuando el valor coincide.
- **Quién empieza**: fila de `SeatToken size="sm"`, la elegida con `selected`; `aria-pressed`.
- «Empezar» y su pie se quedan donde están (arriba, antes de la mesa). Desaparecen los dos `<details>`, el
  contador 2-6 y `setup.advanced`/`advancedSummary`/`table`.

`src/lib/play/ui/setup-draft.ts` gana:

```ts
export function addPlayer(draft: SetupDraft): SetupDraft;            // no-op en maxPlayers del modo
export function removePlayer(draft: SetupDraft, index: number): SetupDraft; // no-op en minPlayers; recoloca startingSeat
```

`removePlayer`: si `startingSeat === index` pasa a 0; si `startingSeat > index` se decrementa. Ids nuevos
con el mismo criterio de `nextSeatId` de puntuación (primer `p{n}` libre). `?jugadores=`, revancha y
reconfigurar se conservan (`newDraft`/`draftFromSetup` no cambian).

**E2e.** `partidas-mtg.spec.ts` y `partidas-habituales.spec.ts`: abrir el panel con la ficha
(`seats.edit`) antes de rellenar «Nombre»; quién empieza por `aria-label` «Empieza {name}».

## 4. Recursos: presets como fichas, glifos propios

**Problema.** La configuración arrancaba en un input vacío; los iconos eran emoji del sistema (contra
`DESIGN.md`), y `🪙`/`🪨` son Emoji 13: cuadrados vacíos en Windows 10 y Android < 11.

**Diseño.**

- `src/components/play/resources/resource-icons.tsx`: `RESOURCE_ICON_IDS = ["gold","wood","stone","wheat",
  "sheep","brick","gem","heart","bolt","star"]` y `ResourceGlyph({ icon, className })` que pinta el SVG del
  id conocido y, para cualquier otro string (eventos viejos con emoji), el texto tal cual. Glifos de 24 px
  en `currentColor`, estilo de las marcas del hub (`marks/*.tsx`).
- `RESOURCE_PRESETS`: los diez ids con nombre i18n (`play.resources.presets.gold` = «Oro», …).
- **Fila de presets** como fichas fantasma (dashed, 44 px, glifo + nombre): un toque emite
  `resource_added { name, emoji: id, initial: 0, shared: false }`. Un preset ya creado (mismo nombre) no se
  ofrece.
- **Fichas creadas**: tocar abre panel `id="resources-def"` con: stepper de inicial (mantener), segmentado
  Jugadores/Banco, «Quitar recurso». Los cambios emiten el nuevo evento
  `resource_updated { name, initial, shared }`.
- **«+»** abre el constructor de recurso libre: input de nombre (único input visible), fila de glifos
  (`aria-pressed`), «Crear ficha». Inicial y dueño se ajustan después desde el panel.

Reducer (`src/lib/play/resources/reducer.ts`), caso `resource_updated`: recurso inexistente lanza; `initial`
fuera de rango lanza; cambia solo la definición y **reconcilia** `values` (cambiar `shared` crea/quita
entradas a `initial`; los valores existentes se conservan; «Reiniciar valores» aplica el nuevo inicial).
`events.ts`: `ResourceUpdatedEvent` y entrada en `RESOURCES_EVENT_TYPE_MAP`. El campo `emoji` conserva su
nombre y su validación (`length <= 8`, todos los ids caben).

**Copy** (`play.resources`): `presets.*`, `preset: "Crear {name}"`, `editResource: "Editar {name}"`,
`removeResource` se mantiene, `customResource: "Recurso a medida"`, `iconPicker: "Icono"`,
`iconOption: "Icono {name}"`. Se borran `emojiPicker`/`emojiOption`.

**E2e.** `partidas-recursos.spec.ts`: Madera y Oro por preset (un toque cada uno); el flujo de nombre libre
por «+».

## 5. Configuración de Puntuación

**Problema.** Segundo input visible («¿A qué jugáis?»), sin forma de elegir rondas frente a puntos
(`targetKind` solo venía del preset), N como `type="number"` aquí y en el hub.

**Diseño.**

- **Límite**: segmentado de tres `Libre · Rondas · Puntos` (`aria-pressed`). `Libre` = `targetActive:false`;
  las otras fijan `targetKind` y `targetActive:true`. Debajo, cuando está activo, `TargetStepper`.
- `src/components/play/score/target-stepper.tsx`: número serif 34 px + dos botones con mantener; paso 1
  para rondas, 5 para puntos; clamp 1..9999. Props `{ kind, value, onChange }`. Lo usan la config y el hub
  (`score-preset-chooser.tsx` sustituye su `<input type="number">`).
- **«¿A qué jugáis?»**: chips de `gameNameChoices` (`aria-pressed` si coincide con `draft.gameName`) + píldora
  «+» que despliega el único input (autofocus, Enter o blur fija). Si `draft.gameName` no está entre los
  chips (revancha), se muestra como chip encendido. Sin `<label>`/`<fieldset>`: rótulo mono como el resto.
- Se quitan los `<legend>` de 9 px; cada bloque lleva el rótulo mono de 10 px de los acompañantes.

**Copy** (`play.scoreSetup`): `free: "Libre"`, `rounds: "Rondas"`, `points: "Puntos"`, `fewer: "Bajar
límite"`, `more: "Subir límite"`, `addGame: "Otro juego"`. `targetRounds`/`targetPoints` se quedan para el
resumen.

**E2e.** `partidas-puntuacion.spec.ts`: «Valor del límite» ya no es input; el test que ponía 20 pulsa
`Puntos` y sube con el stepper (o usa `?n=` del hub, que se mantiene).

## 6. Bolsa del Aleatorio

**Problema.** Dos inputs y el único checkbox nativo de la subapp (`random/bag-section.tsx`).

**Diseño.** Píldora «+» (`aria-expanded`, `aria-controls="bag-add"`) que despliega: input de nombre
(único visible) · stepper de cantidad con mantener (1..99, paso 1) · «Añadir». Enter añade. Reposición como
segmentado `Sin reposición · Con reposición` (`role="group"`, `aria-pressed`). «×» de cada tipo a 44 px
(`h-11 w-11`).

**Copy** (`play.random.bag`): `addType: "Añadir tipo"`, `fewer: "Menos fichas"`, `more: "Más fichas"`,
`noReplacement: "Sin reposición"`, `replacement: "Con reposición"`; se borra `withReplacement`.

## Transversal

- **Tests unitarios**: `round-draft.test.ts` (applyDelta), `setup-draft.test.ts` (addPlayer/removePlayer y
  recolocación de startingSeat), `reducer.test.ts` de recursos (`resource_updated`: def, reconcile,
  errores), `target-stepper` clamp si se extrae a helper.
- **E2e**: las cinco specs citadas + `partidas-habituales.spec.ts`. Viewport móvil por defecto del proyecto.
- **Doc**: dos actas en `docs/requirements/decisiones.md` (ficha unificada «tocar abre panel»; evento
  `resource_updated` y glifos propios), casilla en `backlog.md` si la épica #931 lista esta tanda, issue P2
  para los contadores de los hubs.
- **Rama** `feat/play-visual-first`, PR única con las capturas antes/después de las seis pantallas.
