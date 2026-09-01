# Tracker de turnos — spec de diseño

[Canónico · verificado 2026-09-01]

**Contexto:** cuarto y último acompañante de la cola (epic #931), tras Aleatorio, Reloj y
Recursos. Orden de turno, rondas, fases y dirección para cualquier juego de mesa. Sin partida
ni slot: tarjeta del hub, `/partidas/turnos`, IDB, anónimo. **Regla rectora (feedback
repetido del usuario, ya en memoria): juguete sobre formulario — visual-first DESDE esta spec;
ningún input libre a la vista, solo escondidos tras un «+».** Decisiones de brainstorm:
turnos + rondas + fases; orden manual + barajar; dirección invertible + saltar; anillo de
fichas como escenario.

## 1. Motor (`src/lib/play/turns/`)

### Estado

```ts
export type TurnsState = {
  players: string[];          // orden de asiento (fijo tras configurar)
  eliminated: string[];       // subconjunto de players fuera de la rotación
  phases: string[];           // 0..6 nombres; [] = sin fases
  active: number | null;      // índice en players; null = sin configurar
  phase: number;              // índice en phases (0 si no hay)
  round: number;              // desde 1
  direction: 1 | -1;          // 1 = orden de alta («horario»)
};
export function initialTurnsState(): TurnsState;
```

### Eventos

| Evento | Payload | Efecto |
|---|---|---|
| `turns_configured` | `{ players: string[]; phases: string[] }` | Atómico (setup local + Empezar, como el reloj): players 2..8 únicos recortados, phases 0..6 únicas recortadas. active=0, phase=0, round=1, direction=1, eliminated=[]. |
| `turn_advanced` | `{}` | Pasa al siguiente VIVO según `direction` (fase a 0). La **ronda sube al envolver**: con dir 1, cuando el índice nuevo ≤ índice viejo entre vivos; con dir −1, simétrico. Inválido sin configurar o con <2 vivos. |
| `phase_advanced` | `{}` | `phase+1`. Inválido sin fases o ya en la última (la UI encadena: en la última, el centro emite `turn_advanced`). |
| `turn_skipped` | `{}` | El SIGUIENTE pierde su turno: equivale a dos avances (ronda incluida si alguno envuelve; dos envolturas consecutivas son imposibles con la regla posicional). Mismas precondiciones que `turn_advanced`. |
| `direction_toggled` | `{}` | Invierte `direction`. Inválido sin configurar. |
| `player_eliminated` | `{ name }` | Sale de la rotación (conserva asiento y color). Si era el activo, se avanza primero. Inválido si no existe, ya está eliminado, o dejaría <2 vivos. |
| `player_restored` | `{ name }` | Vuelve a la rotación en su asiento. Inválido si no estaba eliminado. |
| `turns_reset` | `{}` | A «sin configurar» (active null) CONSERVANDO players/phases para precargar el setup (patrón clock_reset). |
| `cleared` | `{}` | Estado inicial del todo. Deshacible vía log. |

Validación estricta, `replayTurns` rechaza eventos desconocidos, compactación 200/20.

### Selectores

```ts
export function aliveCount(state: TurnsState): number;
export function nextAlive(state: TurnsState, from: number, direction: 1 | -1): number; // siguiente índice vivo
```

(la lógica de avance del reducer usa `nextAlive`; exportarla permite testearla y que la UI
pinte «siguiente» si algún día hace falta).

### Hook

`useTurns(identity)` sobre `useCompanionStore`, clave `` `${identity}:turns` ``, sin feed,
con `clear`. Deshacer expuesto en UI (revertir un avance accidental es EL caso de uso).

## 2. UI (`/partidas/turnos`)

Página server patrón (#435/#680). `TurnsScreen`: setup o juego según `active`.

### Setup — cero inputs a la vista

- **Jugadores**: fichas de asiento (patrón reloj/recursos: habituales atenuados, «+» con el
  input escondido, tocar quita, borrador a salvo, aria-controls). El ORDEN es el de alta.
- **Barajar**: chip junto a las fichas — reordena la lista local (Fisher-Yates, `shuffle` de
  random/draws reutilizado) y las fichas se recolocan.
- **Fases (opcional)**: píldoras PRESET tocables — Mantenimiento · Robar · Acción · Construir
  · Combate · Final — que se ENCIENDEN en el orden en que se tocan (badge numérico 1,2,3…
  en la píldora encendida; tocar de nuevo la apaga y renumera). Píldora «+» esconde el único
  input de fase custom (Enter añade como encendida al final). Sin fases encendidas = juego
  sin fases.
- CTA primario «Empezar» → `turns_configured` con players y las fases encendidas en orden.

### Juego — `TurnRing`

- SVG (~260px): fichas de asiento distribuidas en círculo (posición angular fija por asiento,
  empezando arriba y repartidas uniformemente), nombre truncado bajo cada ficha. La ACTIVA
  escala ~1.3 con anillo `--accent` y las demás a tamaño base; eliminadas atenuadas
  (opacity .35) y sin anillo.
- **Flecha curva** de dirección (arco con punta junto al borde interior, se refleja al
  invertir).
- **El centro es el botón** («siguiente»): ronda en serif grande («R3») y, si hay fases, la
  fase actual debajo en mono pequeño. Tocar: `phase_advanced` si quedan fases; en la última
  (o sin fases), `turn_advanced`. `buzz()` al cambiar de JUGADOR (no de fase). aria-label
  dinámico («Siguiente fase» / «Siguiente jugador»).
- Píldoras de fases bajo el anillo (la actual encendida) — solo si hay fases.
- **Fichas en juego**: tocar una viva arma confirm inline bajo el anillo («¿Eliminar a
  {name}?» 2 toques); tocar una eliminada la restaura directo. Con 2 vivos, eliminar se
  deshabilita (el motor lo rechaza igual).
- Acciones: «Invertir» y «Saltar siguiente» (chips), «Deshacer» ghost, «Reiniciar» ghost con
  confirm (→ setup precargado).

### Hub

Tarjeta tras Recursos + marca `TurnsTableMark`: anillo de cuatro asientos en colores con uno
mayor (activo) y flecha de rotación en `--accent-ink`, sobre fieltro. i18n
`play.tools.turns.name` («Turnos») y namespace `play.turns.*`.

## 3. Fuera de alcance (v1)

Iniciativa numérica. Reordenar fino (mover una ficha; reordenar = barajar o rehacer). Tiempo
por turno (Reloj). Fases distintas por jugador. Historial visible.

## 4. Testing

- **Unit reducer**: avance con eliminados y ambas direcciones; ronda que envuelve (dir 1 y
  −1); skip desde el último asiento (envuelve una vez — con la regla posicional dos envolturas consecutivas son imposibles); eliminar al activo avanza; eliminar hasta <2 lanza;
  restaurar en asiento; fases encadenadas; reset conserva config; validaciones y
  compactación round-trip. `nextAlive` directo.
- **e2e** (`e2e/partidas-turnos.spec.ts`): configurar 3 jugadores + 2 fases preset; el centro
  avanza fase y luego jugador (activo cambia); invertir + avanzar va hacia atrás; eliminar
  con confirm y el anillo lo atenúa; ronda sube al envolver; recarga conserva; deshacer
  revierte el último avance; tarjeta del hub navega.
- Manual: anillo con 2 y con 8 fichas en móvil; oscuro; buzz solo en cambio de jugador.
