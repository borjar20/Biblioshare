# Aleatorio: multi-tirada, falso 3D y reposo — spec de diseño

[Canónico · verificado 2026-08-31]

**Contexto:** sobre `feat/play-randomizer-visual` (PR #990). Feedback tras las siluetas planas:
d8/d10 no se leen como dados, las tiradas NdX solo enseñan un dado protagonista, hay demasiados
controles bajo el escenario de dados, y los escenarios descuadran verticalmente en reposo porque
la zona de resultado reserva hueco vacío. Decisiones de brainstorm (todas elegidas por el
usuario): facetas internas, N dados girando a la vez, evento nuevo `coins_flipped` en el motor,
chips que seleccionan + stepper.

## 1. Motor: evento `coins_flipped` (único cambio de motor)

- `CoinsFlippedEvent = PlayEvent<"coins_flipped", { count: number; results: ("heads" | "tails")[] }>`.
- Constante `COIN_MAX_COUNT = 5` en `draws.ts` + helper puro
  `flipCoins(count: number, rng: Rng = Math.random): ("heads" | "tails")[]` (valida count
  1..COIN_MAX_COUNT, lanza RangeError fuera de rango).
- Reducer: valida `count` entero 1..5, `results.length === count`, cada valor `heads|tails`;
  no cambia estado (evento de resultado). Entra en `RANDOM_EVENT_TYPE_MAP` y en
  `RESULT_EVENT_TYPES` (feed).
- **`coin_flipped` viejo NO se toca ni se retira**: logs persistidos en IDB deben re-jugar.
  La UI deja de emitirlo.
- `describeRandomEvent`: `coins_flipped` con count 1 devuelve `coinHeads`/`coinTails` (misma
  copia que siempre); con count > 1 devuelve clave nueva `coins` con params `{ heads, tails }`
  (recuentos). Copia ICU plural: `"{heads, plural, one {# cara} other {# caras}}, {tails, plural, one {# cruz} other {# cruces}}"`.

## 2. Falso 3D en `DieShape`

Aristas internas + facetas laterales en tono `var(--surface-muted)` (token existente); trazo
interno `var(--border)` `stroke-width 2`. El número vive en la cara frontal (TEXT_Y se ajusta
por familia). Por familia:

| Familia | Tratamiento |
|---|---|
| d4 | sin aristas (silueta ya inequívoca); sin cambio |
| d6 | sin aristas; sin cambio |
| d8 | diagonal horizontal entre los vértices laterales; triángulo inferior sombreado (cara frontal = triángulo superior, número sube) |
| d10 | líneas de los hombros a un punto bajo interior: cara frontal = cometa central, laterales inferiores sombreados (número sube al centro de la cara frontal) |
| d12 | pentágono interior (cara frontal) + aristas de cada vértice exterior a su interior; anillo sin sombrear (las 5 caras laterales se insinúan solo con aristas) |
| d20 | triángulo central conectando vértices alternos (cara frontal) + aristas a los vértices restantes; número dentro del triángulo |
| round | sin cambio |

Coordenadas exactas se fijan en el plan; restricción: todo dentro del viewBox 100×100, número
legible a size 48 (tamaño mínimo del multi-dado) con 2 dígitos.

## 3. Dados múltiples en el escenario

- `DiceStage` muestra **N siluetas girando a la vez** (stagger `i * 60 ms`), cada una aterriza
  enseñando su propio resultado. Tamaño por N visible: 1→96, 2→80, 3-4→64, 5-8→48 px.
- Tope visible **8**: tiradas con más resultados (logs viejos de hasta 20, el stepper nuevo no
  pasa de 8) muestran 8 dados y el texto de resultado (`{rolls} = {total}`) manda.
- Muere la fila de mini-dados (`.miniRow`/`.miniDie`).
- Reposo: el escenario enseña **N siluetas con «?»** según el stepper (prop `idleCount` junto a
  `idleSides`) — la config se ve antes de tirar.
- Resultados, texto y `buzz()` aparecen cuando aterriza el ÚLTIMO dado (una sola revelación,
  no por dado).

### Puerta de aterrizaje generalizada: `useLandingGate`

Hook nuevo `src/components/play/random/stage/use-landing-gate.ts`:

```ts
export function useLandingGate(id: string | null, total: number): {
  landed: boolean;                       // reduced || (id vigente && total animationend contados)
  onOneEnd: (e: React.AnimationEvent) => void;  // guard e.target === e.currentTarget; buzz() al completar
}
```

- Cuenta `animationend` de los `total` elementos; al llegar al total marca aterrizado y vibra
  UNA vez. Cambiar `id` resetea el contador. `reduced` (useReducedMotion interno) lo salta.
- Lo consumen `DiceStage` y `CoinStage`. La ruleta y la bolsa no cambian (transitionend y
  delay propio respectivamente).

## 4. Controles de dados: una fila

- Chips d4 d6 d8 d10 d12 d20 **seleccionan** el tipo (estado visual `aria-pressed`, no tiran).
- Chip extra «d?»: al seleccionarlo aparece un input numérico pequeño de caras (2..1000);
  inválido → se tira d6 (mismo fallback de siempre).
- Stepper `− N +` de cantidad, rango **1..8**.
- Tirar = tocar el escenario (aria-label `dice.tap` existente). Mueren los inputs «Cuántos»/
  «Caras» y el botón «Tirar».
- Claves i18n que mueren: `dice.countLabel`, `dice.sidesLabel`, `dice.roll`. Nuevas:
  `dice.fewer` («Un dado menos»), `dice.more` («Un dado más»), `dice.customSides`
  («Caras personalizadas»).

## 5. Monedas múltiples

- `CoinSection` gana stepper `− N +` (1..5, claves `coin.fewer` «Una moneda menos» /
  `coin.more` «Una moneda más») bajo el escenario.
- `CoinStage` muestra N monedas girando (mismo patrón y stagger que dados; tamaño 1→110,
  2→88, 3-5→64 px), cada una cae de su lado según `results[i]`; revelación única al aterrizar
  la última vía `useLandingGate`.
- Texto de resultado: count 1 → `Cara`/`Cruz` (claves existentes); count > 1 → clave nueva
  `coin.result` con el ICU plural de §1. `data-testid="coin-result"` se conserva.
- Acepta tanto `coins_flipped` (nuevo) como `coin_flipped` viejo del feed persistido
  (lo normaliza a `results: [result]`).

## 6. Texto de reposo (arregla el centrado)

Cada escenario, cuando su zona de resultado está vacía (sin resultado aún), muestra un hint
atenuado (`text-muted-foreground`, tamaño 14) que ocupa el hueco reservado:

| Sección | Clave | Copia |
|---|---|---|
| Dados | `dice.hint` | «Toca el dado para tirar» |
| Moneda | `coin.hint` | «Toca la moneda para lanzar» |
| Ruleta | `players.wheelHint` | «Toca la ruleta para sortear» |
| Bolsa | `bag.drawHint` | «Toca la bolsa para sacar ficha» |

En dados/moneda el hint desaparece al aterrizar; en ruleta/bolsa, cuando hay resultado que
enseñar. Con resultado persistido (recarga) no se muestra.

## Fuera de alcance

- 3D real por poliedro. Sonido. Presets de tiradas (2d6+3…). Cambiar ruleta o bolsa más allá
  del hint. Tocar `coin_flipped` persistido. Elevar `DICE_MAX_COUNT`/`DICE_MAX_SIDES`.

## Testing

- **Unit motor** (`reducer.test.ts`): `coins_flipped` válido pasa; count/results descuadrados o
  valor fuera de `heads|tails` lanzan; entra en el feed (`resultFeed`).
- **Unit draws** (`draws.test.ts` o donde vivan): `flipCoins` respeta count y solo produce
  `heads|tails` con RNG inyectado; lanza fuera de 1..5.
- **Unit selectors**: `describeRandomEvent` de `coins_flipped` → `coinHeads`/`coinTails` con
  count 1, `coins` con recuentos con count 3.
- **e2e** (`partidas-aleatorio.spec.ts`, reescritura acotada):
  - Test 1: chip d6 ya no tira — nuevo flujo: chip d6 + tocar «Tirar el dado»; tirada 3d6 vía
    stepper (+ + → 3) + toque; moneda con stepper a 3 → `coin-result` con formato de recuentos.
  - Tests 4 y 5: sustituir el click en chip `d6` por toque en «Tirar el dado» (el chip ya no
    emite).
  - Hint de reposo: al cargar, «Toca el dado para tirar» visible; tras tirar, desaparece.
- Verificación manual: 3d6 → tres cubos girando; d10 con facetas se lee como dado; 3 monedas.
