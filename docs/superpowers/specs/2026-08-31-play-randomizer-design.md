# BiblioPlay — Randomizer / bolsa virtual

> Spec de diseño (brainstorming 2026-08-31). Primera de las cinco herramientas nuevas del
> ecosistema Play (quedan en cola: chess clock, turnos/iniciativa, puntuación por
> categorías, recursos configurables — cada una con su ciclo propio). Herramienta de
> acompañamiento: resuelve azar durante una partida sin ser una partida.

## 1. Alcance

**Dentro (las 6 funciones, v1):**

- **Dados**: botones d4/d6/d8/d10/d12/d20 + tirada libre NdX (cantidad y caras
  numéricas libres: 3d6, 2d100, 1d3…). Resultado individual por dado + suma.
- **Moneda**: cara o cruz.
- **Primer jugador**: lista de jugadores → uno al azar.
- **Orden aleatorio**: lista de jugadores → permutación completa.
- **Equipos aleatorios**: lista de jugadores + nº de equipos → reparto.
- **Bolsa virtual**: tipos de elemento con cantidades (Rojo ×5, Azul ×3…), extracción
  con o sin reemplazo; sin reemplazo descuenta; ver restantes; reiniciar; editar.

**Fuera (decisiones, no huecos):**

- Guardado en historial / Supabase: las tiradas no son partidas — no hay ganador ni
  resumen con valor estadístico. Solo estado activo local.
- Dados con caras de texto: la bolsa cubre ese caso; si duele, issue.
- Entrada en `ToolId`/`playTools`: NO — ver arquitectura. El randomizer se usa DURANTE
  otra partida y el slot activo es único por identidad (`readActive(identity)`,
  `db.ts:148`); entrar al registro pisaría la partida en curso.
- Animaciones de dados/moneda: v1 muestra resultado directo; pulido visual aparte.

### Decisiones cerradas en el brainstorming

| Decisión | Elección |
|---|---|
| Orden de las 5 herramientas | Randomizer primero (más ligera, autocontenida) |
| Alcance v1 | Las 6 funciones |
| Persistencia | Estado activo en IDB + log de eventos; SIN historial ni Supabase |
| Presentación | Una herramienta, secciones internas; sin pantalla de setup |
| Jugadores | Chips de habituales (con sesión) + texto libre; anónimo solo texto |
| Dados personalizados | NdX libre, caras numéricas siempre |
| Arquitectura | Opción A: compañera fuera del slot de partida, store IDB propio |

## 2. Arquitectura

Módulo `src/lib/play/random/` con el mismo estilo de motor que mtg/score — eventos +
reducer puro + replay determinista — pero SIN entrar en el registro de herramientas:

- **El azar se resuelve al despachar y el RESULTADO viaja en el payload.** El reducer
  jamás llama a `Math.random()`: replay determinista, undo = pop del log, como todo.
- **Persistencia propia**: store IDB nuevo `companion` (DB `biblioshare-play` v4; la
  migración v3→v4 solo crea el store). Un registro por identidad, mismo patrón CAS
  anti doble-pestaña que `active` (campo `rev`, `writeCompanion` rechaza si la rev
  leída no coincide).
- **Sin `participants`, sin `summarize`, sin `SavedGameSummary`**: no toca `tools.ts`
  ni `core/types.ts` (ToolId queda como está).
- Los helpers de azar (`rollDice`, `flipCoin`, `pickFirst`, `drawOrder`, `drawTeams`,
  `drawFromBag`) reciben el RNG inyectado (`rng: () => number`, default
  `Math.random`) — puros y testeables.

## 3. Dominio (`src/lib/play/random/`)

### Estado

```ts
type RandomState = {
  players: string[];                 // lista compartida: primero/orden/equipos
  bag: {
    items: { name: string; count: number }[];  // count = restantes
    initial: { name: string; count: number }[]; // para reiniciar
    withReplacement: boolean;
  };
};
```

El feed de resultados NO vive en el estado: se deriva del log de eventos (últimos ~20).

### Eventos (payload lleva el resultado)

- `dice_rolled { count, sides, results: number[] }`
- `coin_flipped { result: "heads" | "tails" }`
- `first_picked { players: string[], picked: string }`
- `order_drawn { players: string[], order: string[] }`
- `teams_drawn { players: string[], teams: string[][] }`
- `players_set { players: string[] }`
- `bag_set { items: {name,count}[], withReplacement: boolean }` — configurar, editar y
  reiniciar son el mismo evento (la UI manda la foto completa; `initial` se actualiza).
- `bag_drawn { name: string }` — sin reemplazo descuenta 1 del tipo; el reducer RECHAZA
  (throw) si el tipo no existe o está a 0; con reemplazo no descuenta.
- `cleared {}` — borra todo (jugadores, bolsa y, al ser log nuevo, el feed).

Deshacer: pop del último evento y replay (mismo mecanismo que el resto de Play).
`cleared` NO trunca el log físicamente — es un evento más, así deshacer lo revierte.

### Validaciones (en el reducer, no solo en la UI)

- `dice_rolled`: `count` 1–20, `sides` 2–1000, `results.length === count`, cada
  resultado en 1..sides.
- `first_picked`/`order_drawn`/`teams_drawn`: mínimo 2 jugadores; `picked`/`order`/
  `teams` deben ser permutación/partición exacta de `players` del payload.
- `bag_drawn`: el nombre debe existir con restantes > 0 (o `withReplacement`).

## 4. UI

### Ruta y hub

- Página `/partidas/aleatorio` (`src/app/partidas/aleatorio/page.tsx`). Sin setup:
  entras y usas. Anónimo funciona entero (los chips de habituales simplemente no salen).
- Tarjeta «Aleatorio» en el hub de Partidas, junto a mtg/puntuación, navegación
  directa (sin `setupRoute` del registro — dato local del hub).

### Pantalla (`src/components/play/random/`)

- Secciones como pestañas-chip (patrón visual Play): **Dados · Moneda · Jugadores ·
  Bolsa**.
- **Dados**: fila de botones d4–d20 (un toque = 1dX), y control NdX (cantidad +
  caras, inputs numéricos con select-on-focus y placeholder visual, como los del
  score). Resultado grande: `4 + 2 + 6 = 12`.
- **Moneda**: botón único, resultado grande cara/cruz.
- **Jugadores**: lista editable de nombres (texto libre) + chips de habituales con
  sesión (reutiliza `usePlayers` + patrón de chips existente; un toque añade). Tres
  acciones: «Primer jugador», «Orden aleatorio», «Equipos» (selector de nº de
  equipos: mínimo 2, máximo n−1; reparto round-robin sobre una permutación
  aleatoria, así los tamaños difieren como mucho en 1).
- **Bolsa**: editor de tipos (nombre + cantidad, añadir/quitar), toggle «con
  reemplazo», botón «Sacar ficha» con resultado grande, contador de restantes por
  tipo y total, botón «Reiniciar bolsa» (restaura `initial`).
- **Feed**: bajo la sección activa, últimos resultados (derivados del log, máx 20)
  con `describeEvent` propio → i18n; botón deshacer (revierte el último evento, sea
  de la sección que sea); botón «Limpiar todo» con confirmación (despacha `cleared`).

### i18n

Namespace `play.random.*` en `messages/es.json` (secciones, botones, resultados,
feed, confirmación de limpiar).

## 5. Persistencia (`core/db.ts`)

- `DB_VERSION` 3 → 4; store `companion` (keyPath `identity`).
- `CompanionRecord = { identity, v: 1, rev, updatedAt, log: PlayEvent[] }` — el estado
  se reconstruye por replay al cargar (log manda, como `active`).
- API: `readCompanion(identity)`, `writeCompanion(record)` (CAS por `rev`),
  `deleteCompanion(identity)`. Defensivas como el resto de `db.ts`.
- Store de React (`random/store.ts` o hook): carga, replay, dispatch con validación,
  persistencia tras cada evento aceptado, mismo espíritu que `core/store.ts` pero sin
  las ramas de guardado/finalizado. Log acotado: al superar ~200 eventos, compacta
  (re-basa el estado y trunca) — el feed solo enseña 20 y deshacer más allá de eso no
  tiene caso de uso; la compactación evita un registro IDB que crece sin límite.

## 6. Testing

- **Unit** (Vitest): helpers de azar con RNG inyectado (rangos, permutación completa,
  partición de equipos estable, extracción respeta pesos restantes); reducer — cada
  evento, descuento de bolsa, rechazo de bolsa vacía/tipo inexistente, `bag_set`
  reinicia, `cleared`, replay determinista de un log mixto, validaciones de payload;
  compactación conserva estado.
- **E2e** (Playwright, anon): tirar 3d6 y ver resultado y feed; moneda; añadir
  jugadores y sacar primero/orden/equipos; bolsa sin reemplazo se agota y rechaza;
  reiniciar bolsa; deshacer última tirada; recargar y el estado sigue; con partida
  de puntuación activa, abrir el randomizer NO la pisa (vuelves y sigue).

## 7. Definición de hecho

- Backlog (línea en la sección BiblioPlay) + entrada en `decisiones.md` (randomizer
  como compañera fuera del slot activo; azar en payload; store `companion`).
- Sin migraciones SQL, sin cambios de esquema Supabase.
- Issues para lo descartado que merezca registro (caras de texto si surge, animaciones).
