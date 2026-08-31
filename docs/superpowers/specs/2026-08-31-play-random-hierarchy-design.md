# Aleatorio: jerarquía de resultado, densidad y feed visual — spec de diseño

[Canónico · verificado 2026-08-31]

**Contexto:** sobre `feat/play-randomizer-visual` (PR #990). Feedback de diseño del usuario tras
la multi-tirada: el total debe mandar sobre la operación, la tarjeta central desperdicia altura,
los dados parecen campos de formulario, los controles son tres cosas sueltas sin CTA primario,
el terracota debe reservarse para la acción, y «Últimos resultados» parece un pie de página.
Direcciones dadas por el usuario, decisiones mías aprobadas: espejo del CTA en monedas y
«Limpiar todo» como ghost (no menú «···»).

## 1. Jerarquía del resultado de dados

`DiceStage` deja de recibir `resultText` y compone el resultado él mismo desde `roll`:

```
13                          ← font-serif (Fraunces) 40px, font-semibold, leading-none
5d6                         ← font-mono 11px uppercase tracking-widest, muted
2 + 1 + 3 + 3 + 4           ← 14px muted; solo con count > 1
```

- `data-testid="dice-result"` pasa al contenedor de las tres líneas (el e2e que busca «+» sigue
  encontrándolo en el desglose).
- Muere la clave `dice.result` («{rolls} = {total}») — todo se compone de números en el
  componente, sin i18n.
- El resultado de monedas no cambia de forma (una línea serif 24px con el recuento).

## 2. Densidad de la tarjeta

En `stage.module.css`: `.stage` min-height 260→**220**, padding 16→**12**; `.resultZone`
min-height 72→**64**. Nada más — los controles quedan pegados debajo.

## 3. Identidad de pieza (`DieShape`)

- Contorno: `stroke: var(--foreground-soft)` (más definido que `--border`), `stroke-width 2.5`.
  Las aristas internas de las facetas se quedan en `--border` (más suaves que el contorno).
- Número: `className="font-serif"` en el `<text>` (Fraunces, como pide el usuario). Sin puntos
  en el d6 — números en todas las familias, mismo lenguaje.
- Sombra mínima: en CSS, `.dieWrap { filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.12)); }`
  (válida en claro y oscuro; no es animación, no toca reduced-motion).

## 4. Controles en dos bloques + CTA primario

Sección de dados, de arriba a abajo:

1. **Fila de tipo**: chips d4–d20 + «d?» (+ input de caras si custom) — igual que hoy.
2. **Fila de cantidad**: etiqueta mono uppercase «Cantidad» (clave nueva compartida
   `play.random.quantity`) + stepper `− N +` existente. Ya no va `ml-auto` en la misma fila que
   los chips: bloque propio.
3. **CTA primario**: `buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")`
   (import de `@/components/ui/button`, patrón «Jugar ya») con etiqueta dinámica
   `dice.rollCta` = «Tirar {expr}» (expr = `{count}d{effectiveSides}`). Mismo `onRoll`.
4. Tocar el escenario sigue tirando (gesto secundario, aria-label `dice.tap` intacto).

**Monedas espejo**: fila «Cantidad − N +» (misma clave `quantity`) + CTA primario
`coin.flipCta` = ICU `"{count, plural, one {Lanzar la moneda} other {Lanzar # monedas}}"`.
El aria-label del escenario (`coin.flip`, «Lanzar moneda») no cambia.

## 5. Acento

El chip seleccionado se queda como está (fondo elevado + borde, sobrio). El terracota aparece
SOLO en el CTA primario de cada vista — regla «un primario por vista» de Biblioshare.

## 6. Feed visual («Últimos resultados»)

### Selector nuevo `feedRow` (en `selectors.ts`)

```ts
export type FeedText = string | { key: string; params?: Record<string, string | number> };
export type FeedRow = { label: FeedText; primary: FeedText; detail?: string };
export function feedRow(event: RandomEvent): FeedRow
```

`string` = literal ya resuelto (números, nombres); `{key}` = clave relativa a `play.random`
que la UI traduce. Mapeo:

| Evento | label | primary | detail |
|---|---|---|---|
| `dice_rolled` | `"{count}d{sides}"` (raw) | total (raw) | `results.join(" · ")` solo si count>1 |
| `coin_flipped` | `{key:"row.coin"}` | `{key:"coin.heads"/"coin.tails"}` | — |
| `coins_flipped` count 1 | como `coin_flipped` | como `coin_flipped` | — |
| `coins_flipped` count>1 | `{key:"row.coins",params:{count}}` | `{key:"coin.result",params:{heads,tails}}` | — |
| `first_picked` | `{key:"row.first"}` | picked (raw) | — |
| `order_drawn` | `{key:"row.order"}` | `order.join(", ")` (raw) | — |
| `teams_drawn` | `{key:"row.teams"}` | `teams.map(t=>t.join(", ")).join(" — ")` (raw) | — |
| `bag_drawn` | `{key:"row.bag"}` | name (raw) | — |

(`players_set`/`bag_set`/`cleared` nunca llegan al feed — RESULT_EVENT_TYPES ya los filtra.)

### `describeRandomEvent` y `play.random.log` mueren

`feedRow` sustituye a `describeRandomEvent` en su único consumidor real (el feed; el otro,
el `resultText` de dados, muere en §1). Se borra `describeRandomEvent`, sus tests se
convierten en tests de `feedRow`, y el namespace `play.random.log` entero sale de `es.json`.

### Maquetación de fila

```tsx
<li className="flex items-baseline gap-3">
  <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
  <span className="font-serif text-[16px] font-semibold">{primary}</span>
  {detail ? <span className="text-[12px] text-muted-foreground">{detail}</span> : null}
</li>
```

### Acciones

- **Deshacer**: botón pequeño ghost (sin borde, `text-[12px] text-muted-foreground underline`)
  alineado a la derecha de la PRIMERA fila del feed (la última tirada). Con feed vacío no se
  muestra (no hay nada que deshacer visible; `canUndo` con feed vacío pero log con config se
  cubre igual: si `canUndo` y feed vacío, el botón aparece junto al texto de vacío).
- **Limpiar todo**: ghost en la cabecera (texto atenuado sin borde), mismo confirm en dos
  toques (el estado `confirming` cambia el texto a `clearConfirm` en `--play-danger`).
- Los textos accesibles «Deshacer» / «Limpiar todo» / «¿Seguro? Borra todo» no cambian
  (el e2e los localiza por nombre).

## i18n

- Nuevas: `play.random.quantity` («Cantidad»), `dice.rollCta` («Tirar {expr}»),
  `coin.flipCta` (ICU de §4), `row.coin` («Moneda»), `row.coins` («{count} monedas»),
  `row.first` («Primero»), `row.order` («Orden»), `row.teams` («Equipos»), `row.bag` («Bolsa»).
- Mueren: `dice.result`, el namespace `play.random.log` entero.

## Fuera de alcance

- Menú «···» (se eligió ghost). Puntos en el d6. Tocar motor, ruleta o bolsa (más allá de que
  el feed las muestre con el formato nuevo). Cambios en el hint de reposo.

## Testing

- **Unit** (`reducer.test.ts`): los tests de `describeRandomEvent` se reescriben como tests de
  `feedRow` (dados con/ sin detail, monedas 1 y 3, primero/orden/equipos/bolsa).
- **e2e** (ajustes acotados): test 1 tira el 3d6 con el CTA «Tirar 3d6» y las monedas con
  «Lanzar 3 monedas» (el primer toque sigue siendo al escenario); las aserciones de
  `dice-result` («+») y `coin-result` (`/\d/`) y los conteos de `li` del feed no cambian.
- Manual: jerarquía 13 / 5d6 / desglose; CTA naranja único; feed con filas estructuradas.
