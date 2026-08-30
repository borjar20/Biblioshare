# Play — Spec fase 4: puntuación por rondas

> [Histórico · congelado] Spec de diseño validada en brainstorming el 2026-08-30
> sobre la issue #931 (EPIC BiblioPlay), fase 4 del roadmap. Segunda herramienta
> sobre el motor común. Antecedentes: spec fases 0–2
> (`2026-08-29-play-fases-0-2-design.md`) y spec fase 3
> (`2026-08-30-play-fase-3-persistencia-design.md`).

## 1. Objetivo y gate

Construir la herramienta genérica de **puntuación por rondas** reutilizando el
motor entero: core, participantes, event log, persistencia IndexedDB, undo,
espejo, guardar y lifecycle.

**Gate de la fase (epic #931):** Commander y puntuación comparten
infraestructura pero conservan lógica/UI específicas. **Prueba dura: esta fase
no toca `src/lib/play/core/` ni el store.** Si un cambio la necesita, el motor
no era un motor y eso es un hallazgo, no un atajo.

### Decisiones cerradas en el brainstorming

| Tema | Decisión |
|---|---|
| Fin de partida | Manual siempre disponible + límites opcionales (rondas fijas o meta de puntos). El reducer NUNCA fuerza el fin: la UI lo ofrece |
| Entrada | **Ronda entera de golpe**: una hoja con un campo por jugador, UN evento por ronda |
| Ganador | `direction: "highest" \| "lowest"` en el setup, elegible en la configuración |
| Presets | Pantalla intermedia (espejo del chooser de mtg) con configs rápidas: Libre, A N rondas, A X puntos. Prefijan el setup por query; todo sigue ajustable en la configuración |
| Valores | Enteros, negativos permitidos. Sin decimales |

## 2. Dominio (`src/lib/play/score/`)

Espejo estructural de `mtg/`: `events.ts`, `reducer.ts`, `selectors.ts`,
`rules.ts` si hace falta. Puro, sin React ni navegador.

### Setup

```ts
type ScoreSetup = {
  participants: Participant[];        // 2..8, mismo modelo que mtg
  direction: "highest" | "lowest";    // quién gana con el total
  target?: { kind: "rounds" | "points"; value: number }; // límite opcional
};
```

### Eventos

| Evento | Payload | Notas |
|---|---|---|
| `game_started` | `{ toolId: "score"; setup: ScoreSetup }` | como en mtg |
| `round_scored` | `{ scores: number[] }` | por asiento, longitud = jugadores; enteros (negativos OK). UNA ronda = UN evento |
| `round_edited` | `{ round: number; scores: number[] }` | índice 0-based de ronda existente |
| `game_finished` | `{ reason: "manual" }` | el ganador NO viaja en el evento: se deriva de los totales al replayar |

Rechazos del reducer (`PlayEventError`, mismo contrato que mtg): `scores` con
longitud distinta del número de jugadores, valores no enteros/no finitos,
`round` fuera de rango en `round_edited`, cualquier evento tras
`game_finished`, `game_started` duplicado.

### Estado

```ts
type ScoreState = ToolGameState<"score"> & {
  setup: ScoreSetup;
  rounds: number[][];   // rounds[i][seat]
  startedAt: number;
  finishedAt: number | null;
};
```

Totales y clasificación NO viven en el estado: son selectores.

### Selectores (`selectors.ts`)

- `totals(state): number[]` — suma por asiento.
- `scoreRanking(state): { seat: number; total: number; position: number }[]` —
  ordenado por `direction`; **empate comparte posición** (mismo criterio que
  `finalRanking` de mtg).
- `limitReached(state): boolean` — con `target` de rondas: `rounds.length >=
  value`; con `target` de puntos: algún total alcanza (≥) `value`. Sin
  `target`: siempre `false`. Es INFORMATIVO: la UI lo usa para ofrecer
  finalizar, el reducer lo ignora (editar tras el límite sigue siendo legal).
- `describeEvent(event, state): EventDescription` — etiquetas para la consola
  de deshacer y el log («Ronda 3 apuntada», «Ronda 2 corregida»...).

### Semántica de «A X puntos» con las dos direcciones

Alcanzar X vuelve la partida **finalizable**, no terminada. El ganador sale de
`direction`: con `highest`, el que llega gana (UNO a 500); con `lowest`,
llegar a X te condena y gana el que menos tiene (golf, dominó). No hay lógica
condicional extra: `limitReached` dispara el aviso y `scoreRanking` ya ordena
bien en ambos casos.

## 3. Registro

- `ToolId` pasa a `"mtg" | "score"` (`core/types.ts` — cambio de TIPO, no de
  lógica: la unión estaba prevista y no cuenta como tocar el core).
- `PlayGameState` pasa a `MtgState | ScoreState` (`tools.ts`).
- Entrada `score` en `playTools` (init/reduce/describe/i18nKey/setupRoute) y en
  el registro de UI `toolViews` (Board/Summary).
- Guardas de tipo por `toolId` donde el estrechamiento lo pida (los componentes
  mtg ya hacen `state as MtgState`; con la unión real, revisar que compile el
  proyecto entero es parte de la fase).

## 4. UI (`src/components/play/score/`)

Sin rotaciones, familias ni layout module: esta herramienta la sostiene UNA
persona. Pantalla de pie (portrait) simple.

### Tablero (`score-board.tsx`)

- La tabla de la epic: filas = jugadores (con su color de asiento), columnas =
  R1..Rn + TOTAL. Scroll horizontal DENTRO de su contenedor
  (`overflow-x: auto`), nunca la página. `tabular-nums`.
- Botón primario «Añadir ronda» → hoja de ronda.
- Tocar la cabecera de una columna de ronda → la misma hoja en modo edición.
- Consola/cabecera compartida: deshacer con etiqueta del último evento, menú
  de partida (chasis `PlaySheet`, `SheetGroup`/`SheetRow` reutilizados).
- Con `limitReached`: banda no bloqueante «Límite alcanzado — finalizar?» con
  acceso directo a finalizar. Se puede seguir apuntando rondas.
- Wake lock reutilizado (`use-wake-lock`).

### Hoja de ronda (`round-sheet.tsx`)

- Un campo numérico por jugador (`inputMode="numeric"`, negativos permitidos),
  precargado con 0 en alta y con los valores existentes en edición.
- Confirmar despacha `round_scored` o `round_edited` y cierra. Campos vacíos
  cuentan como 0.

### Hoja de partida (`score-game-sheet.tsx`)

Grupos como en mtg: (deshacer) · (mantener pantalla, salir sin descartar) ·
caja aparte con (finalizar, descartar). Sin «pasar turno»: no hay turnos.

### Resumen (`score-summary.tsx`)

Clasificación de `scoreRanking` con totales, ganador en titular («Gana X» /
empate declarado), duración y número de rondas. Botones: revancha (primero) ·
Guardar partida · Descartar — mismo contrato que mtg (revancha no borra nada;
guardar usa `store.save()`).

## 5. Rutas y navegación

- `/partidas/puntuacion` — hub de la herramienta con **presets rápidos**
  (espejo de `MtgModeChooser`): tarjetas «Libre», «A N rondas», «A X puntos»
  + «Jugar ya» + cómo funciona. Elegir preset navega a
  `/partidas/puntuacion/nueva?preset=libre|rondas|puntos` — solo PREFIJA;
  N y X se introducen en la configuración (no se duplica entrada numérica en
  dos pantallas).
- `/partidas/puntuacion/nueva` — configuración: jugadores (2..8, nombres),
  mayor/menor gana, límite opcional según preset (editable y desactivable).
- Tarjeta nueva «Puntuación» en el grid del hub `/partidas` (`tool-grid`).
- `/partida/activa` no cambia: resuelve por `toolViews[game.state.toolId]`.
- Mesa recordada: reutilizar `table-memory` SI su modelo lo permite sin
  cambiarlo (está tipado a mtg → si no encaja gratis, issue y fuera de fase).

## 6. i18n

Namespace `play`, bloque `tools.score.*` (nombre, presets, cómo funciona) +
`scoreBoard.*`, `roundSheet.*`, `scoreSummary.*`. Solo `es.json`.

## 7. Tests

- **Unitarios** (`score/*.test.ts`): reducer (rechazos listados en §2, replay
  reconstruye rondas y estado), selectores (totales, ranking con empates en
  ambas direcciones, `limitReached` en los tres modos), describeEvent.
- **Registro**: el discriminante de la unión estrecha bien (test de tipos vía
  uso real); `playTools.score.describe` con evento desconocido devuelve
  `UNKNOWN_EVENT_DESCRIPTION`.
- **e2e** (`partidas-puntuacion.spec.ts`): partida completa — crear desde
  preset, 3 rondas, editar una, deshacer, finalizar, guardar; y reload a mitad
  (la persistencia es del motor, pero el e2e prueba que la herramienta nueva
  viaja entera por ella).
- Los tests existentes de mtg y del core siguen verdes SIN cambios de lógica
  (solo los toques de tipos del §3 si el estrechamiento lo exige).

## 8. Plan de entregas

| PR | Contenido | Verificación |
|---|---|---|
| PR-A | Dominio `score/` + registro + tipos unión | unitarios score + suite entera verde + build |
| PR-B | UI completa (hub presets, setup, tablero, hojas, resumen) + i18n + e2e | e2e nuevo + e2e mtg sin regresión + build |

Cierre documental: entrada en `decisiones.md` (semántica de target y presets
como prefill), backlog fase 4 marcada, issues por lo que quede.

## 9. Fuera de alcance

Historial/lista de guardadas (fase 7), sync (fase 5), presets personalizados
(fase 8 pide no anticipar), decimales, rondas con jugadores ausentes,
puntuación por equipos, editar nombres con partida empezada (mismo límite que
mtg, #943 aplica igual).
