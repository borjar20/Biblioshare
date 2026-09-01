# Gestor de recursos — spec de diseño

[Canónico · verificado 2026-09-01]

**Contexto:** tercer acompañante de BiblioPlay (epic #931), tras Aleatorio y Reloj. Contadores
arbitrarios definidos por el usuario (monedas, madera, puntos…), por jugador y/o compartidos.
Sin partida ni slot: tarjeta estática del hub, `/partidas/recursos`, IDB, anónimo completo.
Decisiones de brainstorm (usuario): por jugador + banco compartido opcional; config nombre +
inicial + emoji; ajuste ±1 con mantener-pulsado y chips ±5/±10; sin historial visible (solo
deshacer). **Rama `feat/play-resources` apilada sobre `feat/play-clock`** (necesita
`useCompanionStore`); PR contra main tras mergear #997.

## 1. Motor (`src/lib/play/resources/`)

### Estado

```ts
export type ResourceDef = { name: string; emoji: string; initial: number; shared: boolean };
// owner: nombre de jugador, o null si el recurso es compartido (banco).
export type ResourceValue = { resource: string; owner: string | null; value: number };
export type ResourcesState = {
  players: string[];
  defs: ResourceDef[];
  values: ResourceValue[];
};
export function initialResourcesState(): ResourcesState; // todo vacío
```

Invariante de `values`: exactamente una entrada por def compartida (`owner: null`) y una por
(def no compartida × jugador). Los eventos que cambian `players` o `defs` RECONCILIAN `values`:
se conservan los valores de combinaciones que sobreviven, se crean a `initial` las nuevas, se
borran las que desaparecen.

### Eventos

| Evento | Payload | Efecto |
|---|---|---|
| `players_set` | `{ players: string[] }` | Reemplaza la lista (0..6, nombres únicos recortados; 0 = solo banco). Reconciliación de values por NOMBRE: quien permanece conserva sus valores. |
| `resource_added` | `{ name, emoji, initial, shared }` | Añade def (nombre único recortado no vacío; emoji string ≤ 8 unidades, puede ser vacío; initial entero −9999..9999; máx 8 defs) y crea sus values a initial. |
| `resource_removed` | `{ name }` | Quita def y sus values. Debe existir. |
| `adjusted` | `{ resource, owner, delta }` | Suma delta (entero ≠ 0, −9999..9999) al value de (resource, owner). El resultado se **CLAMPA** a −9999..9999 — nunca lanza por rango, solo por combinación inexistente (shared exige `owner: null`; no compartido exige un jugador de la lista). |
| `values_reset` | `{}` | Todos los values a su `initial`. Config intacta. Debe haber ≥1 def. |
| `cleared` | `{}` | Estado inicial (config incluida). Deshacible (evento en el log, no truncado). |

Validación estricta al estilo companions: payload inválido lanza; `replayResources` rechaza
eventos desconocidos; compactación con el mismo contrato (umbral 200 / cola 20).

### Sin selectores de dominio

La UI lee `state.values` directamente (lista pequeña). Único helper puro:
`valueOf(state, resource, owner): number | null` (para tests y tablero). Color por recurso:
`stableColor(name)` ya existente (stage-helpers del Aleatorio).

### Hook

`useResources(identity)` = `useCompanionStore` con clave `` `${identity}:resources` ``,
sin feed. `clear` expuesto (evento `cleared`), como el Aleatorio.

## 2. UI (`/partidas/recursos`)

Página server idéntica al patrón (connection + identidad + key). `ResourcesScreen`:

### Configuración (arriba, colapsable)

- Colapsada por defecto cuando ya hay ≥1 def Y (≥1 jugador o ≥1 def compartida — con mezcla y
  0 jugadores el banco es operable y el tablero se enseña); expandida
  si no. Botón chip «Configurar» la abre/cierra (aria-expanded).
- **Jugadores**: patrón reloj — chips de habituales (`usePlayers`), input + añadir (min-w-0),
  quitar con ×. 0..6. Cada cambio emite `players_set`.
- **Recursos**: fila de alta — input nombre (min-w-0), input emoji (ancho corto, opcional),
  input inicial (numérico, por defecto 0), checkbox «Compartido (banco)», botón añadir →
  `resource_added`. Lista de defs con emoji/nombre/inicial y × → `resource_removed`.

### Tablero

- Tarjeta «Banco» primero si hay defs compartidas; después una tarjeta por jugador (nombre +
  punto de color de asiento por posición).
- Fila por recurso dentro de cada tarjeta: barrita de color `stableColor(name)`, emoji +
  nombre, **valor** serif tabular 28px, botones grandes **−** y **+**.
- **Gesto**: toque = ±1. Mantener pulsado (≥400 ms) repite ±1 cada 120 ms EN LOCAL (el número
  mostrado corre) y al soltar emite **UN** `adjusted` con el delta acumulado — un gesto = un
  deshacer. Teclado (Enter/Espacio) = ±1. Componente reutilizable `HoldRepeatButton`.
- Al mantener pulsada la fila (o botón «±» pequeño): chips ±5 / ±10 / −5 / −10 → un `adjusted`
  cada uno. Diseño concreto: botón chip «±» al final de la fila que despliega los cuatro chips
  bajo la fila (toggle local).
- Deshacer: ghost global bajo el tablero (patrón feed del Aleatorio, sin lista). «Reiniciar
  valores» ghost con confirm 2 toques → `values_reset`. «Empezar de cero» ghost danger con
  confirm 2 toques → `cleared`.
- Vacío total (sin defs): hint centrado «Configura jugadores y recursos para empezar.»

### Hub

Tarjeta estática tras la del Reloj + marca `ResourcesTableMark`
(`src/components/play/marks/resources-table-mark.tsx`): pila de monedas y fichas apiladas
sobre fieltro — dos columnas de fichas en colores de asiento, moneda dorada (`--gold-graphic`)
encima, paleta de marcas. i18n `play.tools.resources.name` («Recursos») y namespace
`play.resources.*`.

## 3. Fuera de alcance (v1)

Plantillas de juego guardables. Historial visible. Renombrar recursos o jugadores (quitar y
crear). Transferencias jugador→jugador. Límites máximos por recurso configurables. Sync.

## 4. Testing

- **Unit reducer**: alta/baja de recursos reconcilia values; `players_set` conserva por nombre,
  crea a initial y borra; `adjusted` clampa en ambos extremos y lanza ante combinación
  inexistente o delta 0; `values_reset` restaura; `cleared` deshecho por undo restaura todo
  (vía log); duplicados/rangos lanzan; compactación round-trip.
- **e2e** (`e2e/partidas-recursos.spec.ts`): configurar 2 jugadores + «Madera» (inicial 5) +
  «Banco de oro» compartido; +1 a Madera de Ana y verlo; chips +5; recarga conserva; deshacer
  revierte el último ajuste; reiniciar valores vuelve a 5; tarjeta del hub navega.
- Manual: mantener pulsado acumula y emite uno; 6 jugadores × 8 recursos en móvil; oscuro.
