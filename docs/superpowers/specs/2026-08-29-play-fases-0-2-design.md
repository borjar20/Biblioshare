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
| Ráfagas de taps | **Coalescing en ráfaga pendiente**: taps consecutivos en ≤1,5 s se funden ANTES de entrar al log; el log ya committeado es inmutable (§3) |
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

**Fuente de verdad histórica = `committed[]`. Estado vivo = `committed` +
`pending`.** La ráfaga `pending` (§3) todavía NO forma parte del log canónico: es
la antesala. No hay un `setup` aparte: el primer evento committeado es SIEMPRE
`game_started` y lleva `{toolId, setup}` como payload. El estado se deriva:
`reduce(committed, pending)`. Nunca se muta un snapshot de estado. El store
memoiza incrementalmente (aplica solo el evento entrante; re-reduce completo tras
undo o rehidratación). Esto habilita: undo fiable, reconstrucción, estadísticas,
sync futura con idempotencia y resolución de conflictos (Fase 9).

**`toolId` explícito** (`"commander"`, `"score"`…): vive en
`game_started.payload.toolId` y SOLO ahí — el snapshot no lo repite; se deriva en
la rehidratación (que ya es un replay, §4). Es lo que permite a `/partida/activa`
y al reducer despachar a la herramienta correcta sin adivinar.

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

El core es neutro — no conoce conceptos de MTG. Unión discriminada: los tipos
imposibles (guest con `userId`, user sin él) no compilan, en vez de vivir en un
comentario.

```ts
// core/types.ts
type Participant =
  | { id: string; kind: "user"; name: string; userId: string }
  | { id: string; kind: "regular" | "guest"; name: string };

// commander/types.ts — la herramienta especializa
type CommanderParticipant = Participant & {
  deckName?: string;      // texto libre (sin catálogo MTG)
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
| `game_started` | `{toolId, setup}` | Estado inicial; 40 vidas por defecto. Primer evento obligatorio del log |
| `life_changed` | `{target, delta}` | Vidas ± delta |
| `commander_damage` | `{source, target, delta}` | Vidas −delta **y** daño de comandante source→target +delta. Un solo evento semántico: nunca se exige al usuario tocar dos contadores |
| `poison_changed` | `{target, delta}` | Veneno ± delta |
| `turn_passed` | `{}` | Activo → siguiente asiento no eliminado (ver semántica de turnos abajo) |
| `monarch_changed` | `{holder: id \| null}` | Reasigna monarca |
| `initiative_changed` | `{holder: id \| null}` | Reasigna iniciativa |
| `player_eliminated` | `{target, reason?}` | Marca eliminado + turno actual; el jugador sigue visible |
| `player_restored` | `{target}` | Revierte la eliminación |
| `game_finished` | `{winner?, reason?}` | Cierra la partida; duración derivada de los `at`. El ranking NO viaja en el evento: es 100% derivado (selector, ver abajo) |

```ts
type EliminationReason = "life" | "poison" | "commander_damage" | "card" | "concede";
type FinishReason = "last_standing" | "card" | "time" | "abandoned";
```

- **Semántica de turnos (precisa)**: los asientos son el orden de `setup.participants`
  (orden de mesa). `turn_passed` mueve el activo al **siguiente asiento no
  eliminado** en ese orden. El **número de turno mostrado es el de ronda**: empieza
  en 1 y se incrementa cada vez que el avance cruza la POSICIÓN DE ASIENTO del
  jugador inicial (aunque ese jugador ya esté eliminado — el límite de ronda es el
  asiento, no la persona). `player_eliminated` NUNCA cambia el jugador activo (en
  Magic puedes morir en tu propio turno y el turno termina con normalidad): si el
  activo es eliminado, el siguiente `turn_passed` salta desde su asiento.
  Turnos opcionales: si nunca hay `turn_passed`, el contador funciona igual y la UI
  de turno muestra un vacío discreto. Registrar turnos habilita estadísticas.
- **Ranking 100% derivado, con empates**: selector `finalRanking(state)` — nada de
  ranking en payloads. Ganador = 1º; vivos no ganadores comparten la siguiente
  posición (empate explícito); eliminados en orden inverso de eliminación.
  Numeración de competición estándar (1, 2, 2, 4). **Solo cuenta la eliminación
  vigente**: `player_restored` borra la posición de eliminación del jugador y una
  eliminación posterior establece una nueva (Ana eliminada → restaurada → Carlos
  eliminado → Ana eliminada: Ana cae por su segunda eliminación, la primera no
  existe para el ranking). El resumen y las estadísticas futuras consumen este
  selector, nunca un dato almacenado.
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

**El log committeado es inmutable: solo append, nunca se reescribe ni se borra un
evento ya committeado** (salvo undo, que es pop del final — ver abajo). Esto es lo
que garantiza idempotencia y replay en la sync de Fase 5: un evento con su `id` no
cambia de significado después de existir.

El coalescing por tanto NO toca el log: vive en una **ráfaga pendiente** delante
de él. Estado del log: `{ committed: PlayEvent[], pending?: PlayEvent }`.

- Un tap crea/actualiza `pending`: si tiene mismo `type` y mismo target (y mismo
  source en `commander_damage`) y `0 ≤ nuevoAt − últimoAt ≤ 1500 ms`, se suman
  los deltas y se refresca `at`. Delta neto 0 descarta la ráfaga. **Un `at` que
  retrocede (reloj corregido) sella la ráfaga en vez de mantenerla abierta.**
- La ráfaga **se sella** (pasa a `committed`, ya intocable) cuando: vence la
  ventana de 1,5 s, llega una acción de otro tipo/target, se pide undo, se
  finaliza la partida, la app pasa a segundo plano (`visibilitychange` → hidden /
  `pagehide`), o se rehidrata un snapshot.
- **Frontera puro/impuro del reloj**: `log.ts` es puro y no tiene timers — expone
  `appendTap(log, event)` y `flushPending(log)` y decide solo comparando los `at`
  que recibe. El **store** es quien programa/cancela/reprograma el `setTimeout`
  de 1,5 s y quien escucha `visibilitychange`/`pagehide`, llamando al puro.
- El estado derivado aplica `committed` + `pending`: la UI responde al instante,
  el sellado es invisible para el usuario.
- Resultado idéntico al buscado: 5 taps de −1 = un `life_changed −5` en el log,
  historial legible, undo con sentido («↶ Carlos perdió 5 vidas»).

**Undo multi-paso, sin redo**: si hay `pending`, el primer undo la descarta; si no,
pop del último evento committeado + re-reduce. Repetible hasta vaciar el log.
`game_started` no es deshacible. El pop del final es la única resta permitida sobre
`committed` y solo existe en el dispositivo local antes de cualquier sync (en Fase
5+ un undo ya sincronizado tendrá que modelarse como evento de compensación — se
decide entonces). `describeEvent` (selector) da la etiqueta legible; la traducción
vive en la UI (namespace `play`).

## 4. Store y persistencia local (Fase 1)

`core/store.ts`, anatomía calcada de `src/lib/sessions/timer.ts` (el patrón
local-first ya probado del repo):

- Estado en memoria `{ committed[], pending? }` + derivado memoizado.
- **Snapshot a localStorage tras cada cambio (tap, sellado, undo)** — también con
  ráfaga abierta, para no perder los taps de la ventana de 1,5 s si la app muere.
  Clave **aislada por identidad**: `biblioshare:play:<uid|anon>:active` (uid de Supabase con sesión;
  `anon` sin ella). Sin aislamiento, la partida del usuario A aparecería en la
  cuenta B del mismo dispositivo — misma clase de fuga que el arreglo #680 del SW.
  Cambiar de identidad no destruye la partida de la otra: cada clave vive su vida.
  Adopción de una partida `anon` al iniciar sesión: no en Fase 1, issue futura.
  Se serializa el log (committed + pending sin sellar), no el estado derivado.
- **Validación al leer, de forma Y semántica**: `isActiveGameSnapshot` comprueba la
  forma; después la rehidratación ES un replay — primer evento `game_started`,
  cada `at` un timestamp finito razonable, y el reducer acepta cada evento
  (participantes conocidos, partida no cerrada a mitad de log…). **NO se exige
  `at` monotónico**: el reloj del sistema puede corregirse o retroceder con la
  partida abierta; el orden verdadero es la posición en el log, no el timestamp.
  Si el replay falla, el snapshot se descarta con aviso: nunca se monta una
  partida a medio validar. `try/catch` en lectura y
  escritura: modo privado o cuota llena degradan a memoria pura, nunca rompen la
  partida en curso.
- Bus de suscripción propio + `useSyncExternalStore` (hook `useActiveGame`), con
  caché de identidad referencial y `getServerSnapshot` constante — mismas trampas
  ya resueltas en `src/lib/sessions/use-timer-state.ts`. Prohibido
  `useState`+`useEffect` para leer localStorage (lint `set-state-in-effect`).
- **Versión de esquema en el snapshot** (`v: 1`): si no cuadra al rehidratar, se
  descarta con aviso. Es un seguro de Fase 1; la migración seria llega en Fase 3.

### Una partida activa (restricción v1)

Una clave `…:active` única **por identidad** lo impone físicamente. «Nueva partida»
con una activa → sheet «Tienes una partida en curso»: Continuar / Finalizar /
Descartar. Por identidad y dispositivo (suficiente hasta Fase 5).

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

- **Dos registros, separados por pureza**:
  - `src/lib/play/tools.ts` — **registro de dominio**, puro: `toolId`, módulos de
    motor (reducer, rules, initialState), clave de i18n, ruta de setup. Sin React.
  - `src/components/play/tool-views.tsx` — **registro de UI**: `toolId` → tablero,
    formulario de setup, resumen, icono. Es el único que importa componentes.
  El motor nunca conoce React; la UI resuelve por `toolId` (el mismo que viaja en
  `game_started` y el snapshot, §2).
- **Hub principal** (`/partidas`): rejilla de herramientas + banner «partida en
  curso», pintado desde los registros. Añadir «Puntuación por rondas» (Fase 4) =
  una entrada en cada registro + su módulo; cero cambios en el hub. Materializa la
  Fase 10 de la epic desde el día 1.
- **Hub por herramienta** (`/partidas/commander`): plantilla compartida
  `PlayToolHub` con secciones por capacidad — CTA «Nueva partida» siempre;
  historial y estadísticas **solo se renderizan cuando la capacidad existe**
  (fases 5–7). En Fase 1 NO se enseñan secciones vacías prometiendo lo que aún no
  se puede hacer: la plantilla tiene los huecos, la UI no los pinta. Commander no
  es especial: es la primera instancia de la plantilla.
- **Instrumento único**: `/partida/activa` resuelve el tablero por el `toolId` del
  snapshot activo contra el registro de UI.

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
- **Finalización**: resumen en la misma ruta — ganador, ranking derivado
  (`finalRanking`, con empates), duración, turnos. Fase 1: solo «Descartar».
- **Accesibilidad en fullscreen**: la rotación de paneles es SOLO visual (CSS
  `transform` no altera el orden del DOM — orden lógico = orden de asientos);
  todos los botones con etiqueta (`aria-label` en −/+, chips y undo, no solo el
  símbolo); región `aria-live="polite"` única para anunciar el último evento
  (`describeEvent`) y el cambio de turno; micro-interacciones y celebraciones tras
  `prefers-reduced-motion`; sin topbar ni bottom nav la salida y el menú deben ser
  visibles y alcanzables por teclado (foco no atrapado fuera de los `<dialog>`);
  contraste de los tokens nuevos cubierto por `contraste-tokens.test.ts`.

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
  `commander_damage` toca dos contadores; turnos: salto de eliminados, límite de
  ronda por asiento aunque el inicial esté eliminado, eliminación no cambia el
  activo), `log.test.ts` (ráfaga pendiente: fusión ≤1,5 s, delta neto 0 descarta,
  no fusión entre targets/tipos, sellado por ventana/acción distinta/undo/finish/
  rehidratación; **inmutabilidad: ningún evento committeado cambia jamás**; undo
  multi-paso con y sin pending; `game_started` no deshacible), `rules.test.ts`
  (umbrales exactos 0/10/21), `selectors.test.ts` (`describeEvent`;
  `finalRanking`: empates de vivos no ganadores, numeración 1-2-2-4, orden inverso
  de eliminación, y el caso restauración — Ana eliminada → restaurada → Carlos
  eliminado → Ana eliminada: solo cuenta la eliminación vigente). En `log.test.ts`
  además: un `at` que retrocede sella la ráfaga, no la mantiene abierta.
- **Reconstrucción (gate Fase 2)**: secuencias de eventos generadas → aplicación
  incremental === re-reduce completo desde `game_started`.
- **Store**: partes puras con localStorage falso; la validación rechaza sin lanzar
  snapshots corruptos, de versión vieja o **semánticamente inválidos** (replay que
  falla); aislamiento por identidad: la clave de `anon` no se lee con sesión y
  viceversa.
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
idempotencia de sync; la posición en el log → ordering (los `at` son informativos,
no se garantizan monotónicos); **log committeado inmutable
(el coalescing ocurre antes de committear, §3) → replay seguro en servidor**; el
undo-como-pop solo existe pre-sync — tras sincronizar se modelará como evento de
compensación (decisión de Fase 5/9); `Participant.kind`/`userId` → vinculación de
jugadores habituales (Fase 6, siempre manual); partidas privadas por defecto, RLS
por ownership; pendiente: adopción de partida `anon` al iniciar sesión (issue).
Nombres tentativos de la issue (`play_games`, `play_participants`, `play_events`,
`play_players`) NO son definitivos. Regla #437 aplicará: nada de datos de partida
en `use cache` compartido.

## 11. Fuera de alcance (fases 0–2)

Catálogo de juegos / BGG, catálogo de cartas MTG, deckbuilding, multiplayer /
realtime, feed social, rankings, torneos, varias partidas activas, guardar en
servidor, historial y estadísticas, jugadores habituales y su vinculación,
commander tax / casts / Partner / múltiples comandantes / contadores
personalizados (Fase 8, tras uso real), IndexedDB (Fase 3), redo.
