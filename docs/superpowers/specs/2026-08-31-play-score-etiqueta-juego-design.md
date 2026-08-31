# BiblioPlay — Etiqueta de juego en puntuación por rondas

> Spec de diseño (brainstorming 2026-08-31, post fase 6). La herramienta genérica de
> puntuación no sabe A QUÉ se juega: todas sus partidas guardadas son «Puntuación por
> rondas» y las estadísticas futuras no podrían separar UNO de dominó. Esta pieza añade
> una etiqueta opcional de juego que viaja en el log y llega al summary.

## 1. Alcance

**Dentro:**

- `ScoreSetup.gameName?: string` — nombre libre del juego, opcional.
- Campo «¿A qué jugáis?» en el setup de puntuación, con chips de juegos anteriores
  (derivados del historial local, sin entidad nueva).
- Evento score nuevo `game_labeled { gameName }` para añadir/cambiar/quitar la etiqueta
  desde el resumen de una partida (también terminada).
- El tablero muestra el juego como subtítulo si existe; el historial lo muestra en fila
  y detalle; `summarize` lo copia a `summary.tool.gameName`.

**Fuera (decisiones, no huecos):**

- Etiqueta en mtg: no — su juego ES Magic; el modo ya diferencia.
- Entidad «juego» gestionada (tabla, sync, renombrar globalmente): sobreingeniería para
  una etiqueta; si las stats lo piden algún día, se migra desde el texto.
- Normalización dura (catálogo, dedupe de mayúsculas): solo `trim()` al emitir; las
  stats futuras agruparán case-insensitive (decisión anotada aquí, sin código hoy).
- Re-etiquetar partidas YA guardadas desde el historial: fuera del corte (el detalle es
  solo lectura); si duele, issue.

### Decisiones cerradas en el brainstorming

| Decisión | Elección |
|---|---|
| Momento | Setup (opcional) + editable en el resumen antes de guardar |
| Formato | Texto libre + chips de juegos anteriores del historial local |
| Mecanismo | `gameName` en el setup + evento `game_labeled` (el log manda; summary derivado) |

## 2. Dominio (score)

- `ScoreSetup.gameName?: string`. `initialScoreState` lo conserva; el reducer no lo usa
  para jugar.
- Evento nuevo `game_labeled`:
  - payload `{ gameName: string }`; `gameName` ya viene con `trim()` de la UI; cadena
    vacía = QUITAR la etiqueta (el reducer deja `gameName: undefined`).
  - el reducer lo acepta con `status: "active"` **y** `"finished"` — excepción
    explícita y comentada: etiquetar no es jugar, y el caso principal es el resumen.
  - `describeEvent`: clave `labeled` con param `gameName` (y `unlabeled` si se quita) —
    para la consola de deshacer.
  - undo funciona gratis (pop del log, como todo).
- `summarize` (score): `tool.gameName: string | null` (null si no hay).
- `SCORE_EVENT_TYPES` gana el tipo (el registro lo enruta como los demás).

## 3. UI

### Setup de puntuación (`score-setup-form.tsx`)

- Campo de texto opcional «¿A qué jugáis?» (placeholder «UNO, dominó, chinchón…»),
  colocado con la dirección/target (configuración de la partida, no de los asientos).
- Debajo, chips de juegos anteriores: derivación PURA
  `gameNameSuggestions(saved: SavedGameRecord[], query: string): string[]` — filtra
  summaries score con `tool.gameName`, únicos case-insensitive (conserva la grafía más
  reciente), más recientes primero, filtrados por la query como los de habituales,
  máx 6. La lista local llega de `listSaved(identity)` (una lectura al montar; sin
  suscripción — los guardados no cambian mientras configuras). Anon con historial
  local también los ve (la etiqueta no exige cuenta, a diferencia de los habituales).
- Un toque en chip rellena el campo. El draft lleva `gameName: string`;
  `toScoreSetup` emite `trimmed(gameName)`.
- Revancha/reconfigurar: prefill automático (el setup vivo ya lleva `gameName`).

### Resumen (`score-summary.tsx`)

- Si hay etiqueta: se muestra («UNO») con acción de editar; si no, botón discreto
  «Añadir juego». Editar = input inline + confirmar → `store.dispatch(game_labeled)`
  con el texto trim; vacío la quita. Sin modal nuevo: mismo patrón inline que el
  renombrar de «Tus jugadores».
- Guardar sella lo que haya en ese momento (el summary se deriva del estado tras el
  último evento, como siempre).

### Tablero y historial

- Tablero score: `gameName` como subtítulo del header si existe.
- Historial (`saved-games.tsx`): en la fila, el juego sustituye/acompaña al nombre de
  herramienta cuando existe (`UNO · Puntuación por rondas` o solo `UNO` — decidir en
  plan por espacio); en el detalle, línea propia.

## 4. Compatibilidad

- Partidas viejas sin `gameName`: todo opcional, nada que migrar (ni IDB ni SQL — el
  dato viaja dentro de `events`/`summary` jsonb existentes).
- `game_labeled` es un tipo nuevo dentro del log: los registros viejos no lo tienen y
  el replay de logs nuevos en clientes viejos no existe como caso (el SW actualiza el
  bundle con el deploy).

## 5. Testing

- **Unit**: reducer — `game_labeled` en activo, en finished, replay con él, vacío quita
  la etiqueta, undo la revierte; `summarize` con y sin gameName;
  `gameNameSuggestions` — únicos case-insensitive con grafía más reciente, orden,
  filtro por query, máx 6; `describeEvent` de labeled/unlabeled.
- **E2e** (anon): setup con «UNO» → tablero muestra «UNO» → finalizar → resumen lo
  muestra → guardar → fila del historial lo enseña; segunda partida → el chip «UNO»
  aparece en el setup y rellena con un toque; editar la etiqueta desde el resumen.

## 6. Definición de hecho

- Backlog (línea en la sección BiblioPlay) + entrada en `decisiones.md` (etiqueta como
  evento en el log, no edición del summary; agrupación case-insensitive diferida a las
  stats).
- Sin migraciones. Sin cambios de esquema.
- Issue solo si el plan descarta algo (p. ej. re-etiquetar guardadas).
