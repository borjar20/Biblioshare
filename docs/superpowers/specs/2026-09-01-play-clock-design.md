# Reloj de partida (ajedrez + cuenta atrás) — spec de diseño

[Canónico · verificado 2026-09-01]

**Contexto:** segundo acompañante de BiblioPlay (epic #931), tras el Aleatorio. Sin partida ni
slot activo: entra por tarjeta estática del hub, vive en `/partidas/reloj`, persiste en IDB y
funciona anónimo. Decisiones de brainstorm (usuario): modos ajedrez + cuenta atrás; incremento
Fischer opcional; lista de jugadores propia con habituales de un toque; al agotarse, bandera +
vibración y el reloj sigue (sin sonido).

**Principio rector:** mismo event-sourcing que el resto de Play, con un matiz — los eventos
llevan timestamp (`at`, el `ts` de `makeEvent`) y los bancos de tiempo se DERIVAN por replay
puro. El tick de pantalla es solo UI. Cerrar la app a mitad de turno no pierde tiempo: al
reabrir se deriva de los timestamps.

## 1. Motor (`src/lib/play/clock/`)

### Estado

```ts
export type ClockPlayer = { name: string; bankMs: number; flagged: boolean };
export type ClockState = {
  mode: "chess" | "countdown" | null;   // null = sin configurar
  // — ajedrez —
  players: ClockPlayer[];               // bancos YA liquidados hasta lastEventAt
  active: number | null;                // índice del jugador al que corre el tiempo
  incrementMs: number;
  initialMs: number;
  // — cuenta atrás —
  durationMs: number;
  countdownLeftMs: number;              // liquidado hasta lastEventAt
  countdownRunning: boolean;
  // — común —
  paused: boolean;
  lastEventAt: number;                  // timestamp del último evento que corre tiempo
};
```

Semántica de liquidación: el reducer, al procesar CUALQUIER evento estando el tiempo corriendo
(ajedrez con `active` y sin pausa; countdown corriendo), descuenta `event.at - lastEventAt` del
banco que corresponda antes de aplicar el evento, y actualiza `lastEventAt`. Así el estado tras
replay es exacto al momento del último evento; lo que falta hasta «ahora» lo añade el selector.

### Eventos

| Evento | Payload | Efecto |
|---|---|---|
| `chess_configured` | `{ players: string[]; initialMs: number; incrementMs: number }` | Configura modo ajedrez: bancos = initialMs, active = 0, sin pausa, banderas fuera. Reconfigurar = reset. |
| `countdown_configured` | `{ durationMs: number }` | Configura cuenta atrás (parada, left = duration). |
| `turn_passed` | `{}` | Liquida al activo, le suma `incrementMs` (Fischer, también si quedó en negativo), pasa al siguiente índice (circular). Inválido sin modo chess o en pausa. |
| `clock_paused` | `{}` | Liquida y congela. Inválido si ya en pausa o sin nada corriendo. |
| `clock_resumed` | `{}` | Reanuda (lastEventAt = at). Inválido si no está en pausa. |
| `countdown_started` | `{}` | Arranca la cuenta atrás desde `countdownLeftMs` (si estaba a ≤0, primero la recarga a duration). Inválido sin modo countdown o ya corriendo. |
| `countdown_reset` | `{}` | Para y recarga left = duration. |
| `clock_reset` | `{}` | Vuelve a «sin configurar» (`mode: null`, bancos y banderas fuera) pero CONSERVA `players`, `initialMs`, `incrementMs` y `durationMs` en el estado — el setup los precarga. Deshacer lo revierte (log, no truncado). |

Validación estricta al estilo Aleatorio: nombres no vacíos/duplicados, 2..6 jugadores,
`initialMs` 10_000..7_200_000, `incrementMs` 0..60_000, `durationMs` 5_000..7_200_000, `at`
posterior o igual al `lastEventAt` vigente (un log con tiempos hacia atrás está corrupto y el
replay lanza — quien carga descarta, como el Aleatorio).

`flagged` se fija (y nunca se desfija salvo reconfigurar) cuando un banco liquidado cruza ≤0.
El banco SIGUE en negativo — decisión de brainstorm: agotarse no detiene la partida.

### Selectores

```ts
// Restante vivo del jugador i (o de la cuenta atrás con i omitido) a la hora `now`.
export function remainingAt(state: ClockState, now: number, player?: number): number;
// ¿Cruzó ya el cero a la hora `now`? (para bandera/buzz en UI sin esperar liquidación)
export function flaggedAt(state: ClockState, now: number, player?: number): boolean;
// mm:ss (o h:mm:ss ≥1h; con signo − en negativo) — formato compartido por toda la UI.
export function formatMs(ms: number): string;
```

### Persistencia y hook genérico

`use-companion` del Aleatorio se generaliza a
`src/lib/play/core/use-companion-store.ts`:

```ts
export function useCompanionStore<S, E extends PlayEvent>(opts: {
  storageKey: string;                       // clave del almacén `companion`
  replay: (base: S | null, log: PlayEvent[]) => S;
  reducer: (state: S, event: E) => S;
  makeClear?: () => E | null;               // evento de limpiar, si existe
  feed?: (log: PlayEvent[], max: number) => E[];
}): { state; feed; emit; undo; canUndo; clear?; loaded }
```

- Misma mecánica actual: replay validado al cargar, validación pre-commit, compactación
  (umbral 200 / cola 20), CAS con adopción, snapRef síncrono.
- El Aleatorio migra a este hook con `storageKey = identity` (clave vieja, sin migración de
  datos); el reloj usa `` `${identity}:clock` ``. `random/use-companion.ts` queda como
  envoltorio fino o desaparece si la migración sale limpia.
- El reloj no tiene feed ni «limpiar todo» (su historial no se lista): `feed`/`makeClear`
  opcionales cubren la diferencia.
- Compactación del reloj: sin cuidado extra — la liquidación vive en el estado re-basado.

## 2. UI (`/partidas/reloj`)

Página server igual a la del Aleatorio (`connection()` + identidad + `key={identity}`),
`PlayFrame`, pantalla client `ClockScreen` con pestañas-chip «Ajedrez» / «Cuenta atrás»
(mismo patrón visual que el Aleatorio). Deshacer NO se expone en esta UI (el historial del
reloj no es narrativa; reconfigurar y reset cubren los errores).

### Ajedrez — setup (sin `chess_configured` aún o tras reset)

- Jugadores: lista propia (2..6) con input + añadir, chips de habituales de un toque
  (`usePlayers(identity)`, mismo patrón que la sección Jugadores del Aleatorio), quitar con ×,
  color de asiento por posición (`--play-seat-N`).
- Tiempo inicial: chips preset 1 / 3 / 5 / 10 / 15 / 30 min + input custom (10 s..2 h).
- Incremento: chips +0 / +5 / +10 / +30 s + input custom (0..60 s).
- CTA primario «Empezar» (`buttonVariants("primary")`, único primario) → emite
  `chess_configured` y entra en juego.

### Ajedrez — juego

- Una **zona grande por jugador** (grid 1 col con 2, 2 cols con 3+): nombre, tiempo
  `formatMs(remainingAt(...))` en serif tabular gigante (~40px), barra/acento en su color de
  asiento. La zona ACTIVA destacada (fondo elevado + borde de color); tocarla emite
  `turn_passed`. Tocar una zona no activa no hace nada (v1 secuencial).
- Tick de UI: `requestAnimationFrame` o `setInterval(250ms)` re-render; en pausa o sin activo,
  sin tick.
- Bandera: cuando `flaggedAt` cruza a true, icono 🏳 estilizado en la zona + `buzz()` una vez
  (ref por jugador); el tiempo sigue en negativo con signo −.
- Controles bajo la rejilla: «Pausa»/«Reanudar» (secundario) y «Reiniciar» ghost con confirm
  en dos toques → `clock_reset` (vuelve al setup con la config anterior pre-cargada en el
  formulario).

### Cuenta atrás

- Setup y juego en una pantalla: chips preset 30 s / 1 / 2 / 5 / 10 min + custom (5 s..2 h);
  aro de progreso SVG (stroke-dashoffset proporcional a `remainingAt`) con el tiempo en el
  centro (serif tabular); CTA primario «Empezar» / «Pausar» / «Reanudar» según estado;
  «Reiniciar» ghost. Al llegar a 0: `buzz()`, aro completo en `--play-danger`, tiempo sigue
  a 0 fijo (la cuenta atrás NO va a negativo: se detiene sola liquidando a 0 —
  `countdownRunning` pasa a false en la LIQUIDACIÓN del selector visual y con el siguiente
  evento en el estado).
- Cambiar de preset con la cuenta parada re-emite `countdown_configured`.

### Hub

- Tarjeta estática tras la del Aleatorio en `tool-grid.tsx` (mismo motivo: acompañante sin
  partida) con marca nueva `ClockTableMark` (`src/components/play/marks/clock-table-mark.tsx`):
  reloj de ajedrez clásico — caja sobre fieltro, dos esferas, dos pulsadores, uno pulsado en
  color de asiento y agujas en `--accent-ink`. Paleta de marcas (rail/felt/surface + acentos).
- i18n: namespace nuevo `play.random`-hermano `play.clock.*` + `play.tools.clock.name`.

## 3. Fuera de alcance (v1)

- Sonido (decisión «sin sonido» del Aleatorio se mantiene). Cronómetro ascendente. Wake Lock
  (issue aparte al cerrar: la pantalla puede dormirse; los timestamps hacen que el cómputo
  sobreviva). Orden de turno arbitrario o saltos. Deshacer expuesto en UI. Presets con nombre.
  Compartir reloj entre dispositivos.

## 4. Testing

- **Unit** (`src/lib/play/clock/reducer.test.ts` + selectors): timestamps inyectados —
  liquidación exacta al pasar turno; Fischer suma al que mueve (también en negativo); pausa
  congela y reanudar no cobra el intervalo pausado; bandera cruza una vez y persiste;
  countdown liquida a 0 y no baja de ahí; validaciones (rangos, `at` hacia atrás lanza,
  turn_passed sin configurar lanza); compactación conserva bancos; `formatMs` (0:07, 12:34,
  1:02:03, −0:05).
- **Unit hook**: la migración del Aleatorio a `useCompanionStore` se cubre con los tests
  existentes del Aleatorio (deben pasar sin cambios de comportamiento).
- **e2e** (`e2e/partidas-reloj.spec.ts`): configurar 2 jugadores con 1 min, pasar turno y ver
  el activo cambiar; pausar congela el número; recargar conserva bancos y activo; cuenta atrás
  de 5 s llega a 0:00 y se detiene; la tarjeta del hub navega a `/partidas/reloj`.
- Manual: 3+ jugadores en móvil (zonas tocables con pulgar), negativo con bandera, tema oscuro.
