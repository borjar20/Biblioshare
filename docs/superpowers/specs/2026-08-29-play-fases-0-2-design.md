# Play (Partidas) — Spec fases 0–2: motor de eventos + prototipo Commander

> [Histórico · congelado 2026-08-29] Spec de diseño validada en sesión de brainstorming
> sobre la issue #931 (EPIC BiblioPlay). Cubre las fases 0–2 del roadmap de la epic.
> El estado vivo del dominio se rastrea en issues y en los docs canónicos.

## 1. Contexto y alcance

Biblioshare añade una nueva pata: **herramientas de apoyo durante partidas de mesa**
(issue #931). No es un nuevo tipo de catálogo; es un dominio nuevo e independiente,
nombre interno `play`, nombre visible «Partidas». Primera herramienta especializada:
**Magic: The Gathering — Commander** (prueba de estrés del diseño). Segunda (Fase 4):
puntuación por rondas, para validar que el motor es genérico.

Esta spec cubre **solo las fases 0–2**: modelo conceptual, motor de eventos puro y
prototipo Commander funcional local-first (sin backend). El schema Supabase llega en
Fase 5 y aquí solo se anotan sus necesidades (§10).

### Decisiones cerradas en el brainstorming

| Decisión | Elección |
|---|---|
| Fase 1 «solo memoria» | No: **snapshot localStorage desde el día 1** (seguro contra refresh; la persistencia seria llega en Fase 3 con IndexedDB) |
| Layout 4 jugadores | **Rotado estilo mesa**: móvil en el centro, fila superior a 180°, cada jugador toca su esquina |
| Undo | **Multi-paso, sin redo** (pop del último evento, repetible; rehacer = repetir la acción a mano) |
| Auth | **Anónimo desde Fase 1**: `/partidas*` accesible sin sesión (partida por dispositivo) |
| Ráfagas de taps | **Coalescing en el log**: taps consecutivos sobre el mismo contador en ≤1,5 s se funden en un evento |
| Arquitectura | **Motor puro desde el día 1** (opción B): `src/lib/play/` se escribe antes que la UI; la Fase 2 de la issue pasa de «extraer» a «endurecer» |
| Victoria/derrota por carta | Soportadas: «Declarar ganador» directo y eliminación con `reason` (§4) |
| Identidad visual | Fundamento Paper + **identidad propia de subapp** (§7) — matiza el «sin estética gaming» de la issue, decidido a propósito |
| Estructura de navegación | **Hub principal de herramientas + hub por herramienta** (§6) — el hub nace genérico aunque Fase 1 tenga una sola tarjeta |

### Excepción arquitectónica: `inv-passes-hub`

La regla nº 1 del proyecto («cualquier estado del usuario se deriva de `passes`»)
**no aplica a `play`**: es un dominio local-first sin backend en fases 0–3, y cuando
tenga backend (Fase 5) su fuente de verdad serán sus propias tablas, no `passes`.
Es una excepción explícita y se registra en `docs/requirements/decisiones.md`
**antes de escribir código** para que ningún agente futuro la lea como bug.

## 2. Arquitectura del dominio

```
src/lib/play/
  core/
    types.ts       — Game, Participant, PlayEvent, GameStatus, ActiveGameSnapshot
    events.ts      — constructores de evento + type guards
    reducer.ts     — (estado, evento) => estado, puro
    log.ts         — append con coalescing, undo
    selectors.ts   — vistas derivadas (describeEvent, ranking, lossConditions…)
    store.ts       — store cliente (memoria + snapshot localStorage + bus)
  commander/
    types.ts / events.ts / reducer.ts / rules.ts
  tools.ts         — registro de herramientas (§6)
```

**Todo salvo `store.ts` es puro**: sin React, sin navegador, sin Supabase. Testeable
en Vitest node. Modelo a imitar: `src/lib/passes/transitions.ts` (máquina pura +
test hermano) y `src/lib/sessions/timer.ts` (separación puro/IO).

**Fuente de verdad = `{ setup, events[] }`.** El estado actual SIEMPRE se deriva:
`reduce(initialState(setup), events)`. Nunca se muta un snapshot de estado. El store
memoiza incrementalmente (aplica solo el evento entrante; re-reduce completo tras
undo o rehidratación). Esto habilita: undo fiable, reconstrucción, estadísticas,
sync futura con idempotencia y resolución de conflictos (Fase 9).

### Sobre de evento

```ts
type PlayEvent<T extends string = string, P = unknown> = {
  id: string;      // crypto.randomUUID()
  type: T;
  at: number;      // epoch ms
  payload: P;
};
```

### Participante

```ts
type Participant = {
  id: string;
  kind: "user" | "regular" | "guest";
  name: string;
  userId?: string;      // solo kind=user; regular/guest sin id externo en fases 0-2
  deckName?: string;    // opcional, texto libre (sin catálogo MTG)
  commanderName?: string;
};
```

`kind` no afecta al motor ni a la UI de partida (requisito de la issue: el origen
del jugador no domina la interfaz); existe para persistencia y estadísticas futuras.
**Fase 1 solo ofrece «Yo» (si hay sesión) e invitados**; usuario Biblioshare y
jugador habitual necesitan backend (fases 5–6), pero el modelo ya los soporta.
La vinculación jugador habitual → usuario será siempre manual, nunca por nombre.

## 3. Eventos Commander y reducer

| Evento | Payload | Efecto en el reducer |
|---|---|---|
| `game_started` | setup completo | Estado inicial; 40 vidas por defecto |
| `life_changed` | `{target, delta}` | Vidas ± delta |
| `commander_damage` | `{source, target, delta}` | Vidas −delta **y** daño de comandante source→target +delta. Un solo evento semántico: nunca se exige al usuario tocar dos contadores |
| `poison_changed` | `{target, delta}` | Veneno ± delta |
| `turn_passed` | `{}` | Activo → siguiente jugador vivo; incrementa nº de turno al cerrar la ronda |
| `monarch_changed` | `{holder: id \| null}` | Reasigna monarca |
| `initiative_changed` | `{holder: id \| null}` | Reasigna iniciativa |
| `player_eliminated` | `{target, reason?}` | Marca eliminado + turno actual; el jugador sigue visible |
| `player_restored` | `{target}` | Revierte la eliminación |
| `game_finished` | `{winner?, ranking?, reason?}` | Cierra la partida; duración derivada de los `at` |

```ts
type EliminationReason = "life" | "poison" | "commander_damage" | "card" | "concede";
type FinishReason = "last_standing" | "card" | "time" | "abandoned";
```

- **Turnos opcionales**: si nunca hay `turn_passed`, el contador funciona igual y la
  UI de turno muestra un vacío discreto. Registrar turnos habilita estadísticas.
- **Condiciones de derrota** (`commander/rules.ts`): selector
  `lossConditions(state, playerId)` → subconjunto de `["life","poison","commander_damage"]`
  (≤0 vidas / ≥10 veneno / ≥21 del mismo comandante). **Solo señaliza**: la UI
  muestra la banda y el botón «Marcar eliminado»; nunca elimina automáticamente
  (Magic tiene demasiadas excepciones). Si se elimina con condición activa, la UI
  pre-rellena `reason`.
- **Victoria por carta** (Thassa's Oracle, Approach…): acción directa «Declarar
  ganador» sobre cualquier jugador vivo → `game_finished` sin exigir que el resto
  esté eliminado. Ranking: eliminados por orden de eliminación; vivos no ganadores
  empatan por encima. Cuando queda un solo vivo, la UI **sugiere** finalizar con él
  como ganador (sugerencia, no automatismo).
- **Derrota por carta** (Door to Nothingness) o concesión: `player_eliminated` es
  siempre manual y no exige condición detectada; `reason` «card»/«concede».

### Log: coalescing y undo (`core/log.ts`)

- **Coalescing**: `append(log, event)` puro. Si el evento nuevo tiene mismo `type`
  y mismo target (y mismo source en `commander_damage`) que el último del log, y
  `at − último.at ≤ 1500 ms`, se funden: se suman los deltas y se refresca `at`.
  Delta neto 0 elimina el evento. Resultado: 5 taps de −1 = un `life_changed −5`,
  historial legible, undo con sentido («↶ Carlos perdió 5 vidas»).
- **Undo multi-paso, sin redo**: pop del último evento + re-reduce. Repetible hasta
  vaciar el log. `game_started` no es deshacible. `describeEvent` (selector) da la
  etiqueta legible; la traducción vive en la UI (namespace `play`).

## 4. Store y persistencia local (Fase 1)

`core/store.ts`, anatomía calcada de `src/lib/sessions/timer.ts` (el patrón
local-first ya probado del repo):

- Estado en memoria `{ setup, events[] }` + derivado memoizado.
- **Snapshot a localStorage tras cada append/undo**, clave `biblioshare:play:active`.
  Se serializa el log, no el estado derivado.
- Validador de forma al leer (`isActiveGameSnapshot`) + `try/catch` en lectura y
  escritura: modo privado o cuota llena degradan a memoria pura, nunca rompen la
  partida en curso.
- Bus de suscripción propio + `useSyncExternalStore` (hook `useActiveGame`), con
  caché de identidad referencial y `getServerSnapshot` constante — mismas trampas
  ya resueltas en `src/lib/sessions/use-timer-state.ts`. Prohibido
  `useState`+`useEffect` para leer localStorage (lint `set-state-in-effect`).
- **Versión de esquema en el snapshot** (`v: 1`): si no cuadra al rehidratar, se
  descarta con aviso. Es un seguro de Fase 1; la migración seria llega en Fase 3.

### Una partida activa (restricción v1)

La clave única `biblioshare:play:active` lo impone físicamente. «Nueva partida» con
una activa → sheet «Tienes una partida en curso»: Continuar / Finalizar / Descartar.
Por dispositivo; con sesión es de facto por usuario en ese dispositivo (suficiente
hasta Fase 5).

### Ciclo de vida

```
setup → active → finished → (descartar | guardar [Fase 5])
```

- Rehidratación al montar cualquier ruta `/partidas*`: snapshot válido → banner /
  acceso directo a «partida en curso».
- Una partida `finished` sin descartar sobrevive en el snapshot (el resumen puede
  reabrirse). «Descartar» borra la clave. «Guardar» no existe hasta Fase 5 (no se
  muestra deshabilitado: no aparece).
- Duración derivada del `at` del primer y último evento; sin cronómetro aparte.

### Límites asumidos (issues `tipo:deuda` al cerrar Fase 1)

- localStorage ≈ 5 MB compartidos; un log de partida son pocos KB — sin riesgo real,
  pero IndexedDB (Fase 3) es el destino.
- Sin sincronización entre pestañas (no se escucha el evento `storage` cross-tab).

## 5. Rutas

```
src/app/partidas/
  layout.tsx                    — <RouteMessages ns={["play"]}>
  page.tsx                      — hub principal
  commander/page.tsx            — hub Commander
  commander/nueva/page.tsx      — configuración
src/app/partida/
  layout.tsx
  activa/page.tsx               — pantalla instrumento (compartida entre herramientas)
```

- Convención repo: rutas en español, plural índice / singular ficha. `/partida/[id]`
  queda libre para el historial (Fase 7).
- Pages = shells de servidor mínimos; todo lo vivo es isla cliente sobre el store.
- **Anónimo**: ajustar `src/proxy.ts` para que `/partidas*` y `/partida/activa` no
  exijan sesión.
- i18n: namespace nuevo `play` en `messages/es.json`, declarado en los `layout.tsx`
  de sección (los providers de next-intl REEMPLAZAN, no mergean — issue #444).
  Componentes cliente usan `useTranslations("play")` (invariante `inv-t-no-cruza`).

## 6. Estructura hub + herramientas

- **Hub principal** (`/partidas`): rejilla de herramientas + banner «partida en
  curso». Se pinta desde el **registro** `src/lib/play/tools.ts`: cada herramienta
  declara id, nombre, icono, ruta de setup y sus módulos de motor. Añadir
  «Puntuación por rondas» (Fase 4) = registrar + su módulo; cero cambios en el hub.
  Materializa la Fase 10 de la epic desde el día 1.
- **Hub por herramienta** (`/partidas/commander`): plantilla compartida
  `PlayToolHub` — CTA «Nueva partida», sección historial, sección estadísticas.
  En Fase 1 historial/estadísticas son `EmptyState` («todavía no hay partidas
  guardadas»); la estructura existe desde el día 1, el contenido llega en fases 5–7.
  Commander no es especial: es la primera instancia de la plantilla.
- **Instrumento único**: `/partida/activa` renderiza el tablero que la herramienta
  activa declara en el registro.

### Navegación

- Entrada «Partidas» en `youItems()` (`src/components/nav/nav-items.ts`) — regla
  del repo: lo tuyo cuelga de «Tú». **La barra de 5 no se toca** (decisión previa).
- Anónimo llega por URL / PWA; sin entrada en `anonNavItems` de momento.
- Icono: `PlayIcon` ya existe en `src/components/ui/icons.tsx`.
- Cobertura obligada en `e2e/ia-navegacion.spec.ts` (navegando por clics).

## 7. UI Commander

### Proceso de diseño (nuevo, antes de implementar)

- **Fase 1a — Diseño visual iterativo**: canvas de diseño (skill `design`) con
  artboards de las 5 pantallas clave — hub principal, hub Commander, configuración,
  tablero 4 jugadores (claro Y oscuro, con overlays de daño de comandante y undo
  visibles), resumen final. Se itera con Borja hasta cerrar dirección.
- **Fase 1b — Implementación** del diseño cerrado, con skill `impeccable` como
  auditoría (jerarquía, táctil, accesibilidad, vacíos, claro/oscuro) antes de dar
  por pasado el gate de Fase 1.

### Identidad visual

Fundamento Paper (tokens, tipografía, claro/oscuro) **pero subapp con identidad
propia**: debe expresar «estás jugando» por sí misma y priorizar lo interactivo y
visual. Concreción:

- Familia de acento propia para Play: tokens nuevos en `globals.css` + tabla
  literal estilo `src/lib/catalog/media-accent.ts` (invariante `inv-tailwind-literal`:
  clases enteras, nunca interpoladas).
- Más movimiento y micro-interacciones que el resto de la app: feedback táctil en
  cada tap de vida, transición de turno, celebración al ganar (existe
  `CelebrationProvider`).
- Números y controles a escala de instrumento; cabecera/marco distintivos en
  `/partidas`.

### Configuración (`/partidas/commander/nueva`)

Jugadores 2–6 (defecto **4**), relleno instantáneo «Jugador 1..N» — empezar sin
rellenar nada es un camino de primera. Edición opcional por jugador: nombre, mazo,
comandante (texto libre). «Personalizar partida» plegado: vidas iniciales, quién
empieza. Botón Empezar → `game_started`.

### Pantalla instrumento (`/partida/activa`)

- `h-dvh` a sangre, **sin topbar ni bottom nav** (mismo mecanismo que `/post/*` en
  `bottom-nav.tsx`). Precedentes: mapa de saga (`src/app/saga/[id]/mapa/page.tsx`)
  y `session-modal.tsx` (leer sus comentarios: bugs de `<dialog>` + Cache
  Components ya documentados — un dialog abierto no se desmonta en navegación soft,
  ciérralo por `pathname`).
- **Grid rotado estilo mesa**: 4 jugadores = 2×2 con fila superior `rotate-180`;
  2 = cara a cara; 3 = 2 arriba + 1 abajo; 5–6 = 2×3.
- **Panel de jugador**: vidas dominando (número gigante). Mitades izquierda/derecha
  del panel = zonas táctiles −1/+1 (**botones reales grandes**; el `tap-44`
  pseudo-elemento no funciona sobre `absolute`). Cabecera pequeña: nombre +
  comandante. Chips: `☠ N` veneno, `Cmd` daño de comandante, corona (monarca) /
  iniciativa. Eliminado = overlay atenuado, panel visible.
- **Tap en el número de vidas** → overlay dentro del panel (hereda la rotación: el
  jugador de arriba lo ve derecho): −10/−5/+5/+10, fijar valor exacto, daño de
  comandante.
- **Daño de comandante**: chip `Cmd` → overlay en panel con rivales y +1/+5 por
  fila → un único `commander_damage` (coalescido). Flujo `Borja → Carlos → +5` en
  3 toques. Nunca dos contadores a mano.
- **Consola central** (franja entre filas, legible por todos): `↶` undo con
  etiqueta del último evento; `Turno 6 · Ana →` (pasar turno = 1 toque); botón menú
  → sheet global (`sheet-shell.tsx`, sin rotar): monarca, iniciativa, marcar
  eliminado, declarar ganador, finalizar, descartar.
- **Wake lock**: Screen Wake Lock API mientras hay partida activa. Best-effort
  (`try/catch`), re-adquirir en `visibilitychange`.
- **Finalización**: resumen en la misma ruta — ganador, ranking, duración, turnos.
  Fase 1: solo «Descartar».

Presupuesto de interacción (gate de la issue): acciones frecuentes 1 toque
(±1 vida, pasar turno, undo); moderadas ≤2–3 (cambio grande, daño de comandante,
veneno); configuración avanzada fuera del camino.

### Componentes

`src/components/play/`: `game-board`, `player-panel`, `life-counter`,
`damage-overlay`, `center-console`, `setup-form`, `game-summary`. Lógica testable
extraída a `.ts` hermanos en `src/lib/play/` (convención repo: la lógica nunca
vive en el componente).

### Copy

Términos nuevos (partida, jugador, monarca, iniciativa, veneno, comandante, mazo…)
se registran en `docs/UI-GLOSARIO.md` **antes** de escribir `messages/es.json`.

## 8. Tests

- **Vitest (node), junto al código**: `reducer.test.ts` (cada evento;
  `commander_damage` toca dos contadores), `log.test.ts` (coalescing: fusión
  ≤1,5 s, delta neto 0 borra, no fusión entre targets; undo multi-paso;
  `game_started` no deshacible), `rules.test.ts` (umbrales exactos 0/10/21),
  `selectors.test.ts` (`describeEvent`, ranking con vivos no ganadores).
- **Reconstrucción (gate Fase 2)**: secuencias de eventos generadas → aplicación
  incremental === re-reduce completo desde `game_started`.
- **Store**: partes puras con localStorage falso; el validador rechaza snapshots
  corruptos o de versión vieja sin lanzar.
- **e2e** `e2e/partidas-commander.spec.ts`: crear → jugar (vidas, cmd damage,
  veneno, turnos, eliminar) → undo → finalizar → descartar. Sin backend: la
  limpieza es borrar localStorage — sin maquinaria REST.
- **qa-verifier** tras la UI; gate de Fase 1 se valida además con partida real.

## 9. Plan de entregas

| # | Entrega | Gate |
|---|---|---|
| 0 | Spec + `decisiones.md` + glosario + backlog + etiqueta `area:play` | Spec aprobada |
| 1a | Canvas de diseño (5 pantallas, claro/oscuro) iterado | Dirección visual cerrada |
| PR-1 | Motor puro `src/lib/play/` (core + commander) + tests | Reconstrucción verde |
| PR-2 | Store + snapshot localStorage + `useActiveGame` | Rehidrata tras cierre |
| PR-3 | Rutas, hubs, registro de herramientas, setup, nav, i18n, proxy anónimo | Navegable e2e |
| PR-4 | Tablero + overlays + undo + wake lock + resumen + e2e + impeccable | **Fase 1: partida 4J cómoda en móvil, acciones habituales en 1–2 toques** |

### Cierre documental (definición de «hecho»)

- `decisiones.md` (append, antes de codificar): excepción a `inv-passes-hub`;
  identidad visual de subapp; anónimo desde Fase 1.
- `graph.json`: nodos `r-play` / `c-play` / `m-play` + flujo; `node docs/architecture/sync.mjs`.
- `UI-GLOSARIO.md`: términos de Play.
- Etiqueta `area:play` en GitHub (`gh label create`).
- Issues `tipo:deuda` por los límites del §4.
- Backlog: BiblioPlay como feature en curso.

## 10. Necesidades futuras de persistencia (NO diseñar ahora)

Solo garantías que el modelo ya da para la Fase 5: eventos con `id` (UUID) →
idempotencia de sync; `at` + orden del log → ordering; log inmutable → replay en
servidor; `Participant.kind`/`userId` → vinculación de jugadores habituales
(Fase 6, siempre manual); partidas privadas por defecto, RLS por ownership.
Nombres tentativos de la issue (`play_games`, `play_participants`, `play_events`,
`play_players`) NO son definitivos. Regla #437 aplicará: nada de datos de partida
en `use cache` compartido.

## 11. Fuera de alcance (fases 0–2)

Catálogo de juegos / BGG, catálogo de cartas MTG, deckbuilding, multiplayer /
realtime, feed social, rankings, torneos, varias partidas activas, guardar en
servidor, historial y estadísticas, jugadores habituales y su vinculación,
commander tax / casts / Partner / múltiples comandantes / contadores
personalizados (Fase 8, tras uso real), IndexedDB (Fase 3), redo.
