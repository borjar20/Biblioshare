# Dados con silueta propia por tipo — spec de diseño

[Canónico · verificado 2026-08-31]

**Contexto:** sobre `feat/play-randomizer-visual` (PR #990). El escenario de dados usa hoy un
cubo 3D CSS universal: un d20 aterriza con forma de d6. Feedback del usuario: cada tipo de dado
debe tener su silueta reconocible de mesa. Decisión de técnica (elegida en brainstorm):
**silueta SVG 2D para todos los tipos, el cubo 3D desaparece**.

## Qué se construye

### `DieShape` — componente SVG puro

`src/components/play/random/stage/die-shape.tsx`

```ts
export function DieShape({ sides, value, size }: {
  sides: number;        // caras del dado — decide la silueta
  value: string;        // texto centrado ("?", "17"…)
  size: number;         // lado del viewBox en px (96 escenario, 30 mini)
}): JSX.Element
```

- SVG `viewBox="0 0 100 100"`, `width={size}` `height={size}`, `aria-hidden="true"` (el botón
  contenedor ya lleva el aria-label).
- Relleno `var(--surface-3)`, trazo `var(--border)` `stroke-width 3`, número centrado
  (`<text>` con `text-anchor="middle"` / `dominant-baseline="central"`), `font-weight 600`,
  `font-variant-numeric: tabular-nums`, color `var(--foreground)`. Tamaño de fuente escala con
  `size` (34 px de texto a size 96 ≈ `fontSize={size * 0.35}`; con 3+ dígitos baja a `size * 0.26`
  para que "100" quepa en el triángulo).
- Silueta por familia, decidida por helper puro (abajo):

| Familia | Silueta (polígono en viewBox 100×100) |
|---|---|
| `d4` | triángulo equilátero apuntando arriba |
| `d6` | cuadrado redondeado (rect rx=14) |
| `d8` | rombo (cuadrado a 45°) |
| `d10` | cometa (deltoide vertical: puntas arriba/abajo, hombros anchos) |
| `d12` | pentágono regular apuntando arriba |
| `d20` | hexágono regular apuntando arriba |
| `fallback` | círculo |

### `dieShapeFor(sides)` — helper puro

En `stage-helpers.ts`:

```ts
export type DieShapeKind = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "round";
export function dieShapeFor(sides: number): DieShapeKind
```

Mapeo: `4→d4`, `6→d6`, `8→d8`, `10→d10`, `100→d10` (percentil clásico), `12→d12`, `20→d20`,
cualquier otro (2, 3, 7, 30, 1000…) → `round`.

### `DiceStage` — reescritura sin cubo

- Nueva prop `idleSides: number`: silueta que se muestra en reposo con «?». La sección la pasa
  como la config que tiraría el tap (`customValid ? parsedSides : 6`).
- Forma mostrada: `roll ? roll.sides : idleSides` — tras tirar con un chip d20, el escenario
  queda mostrando el hexágono con el resultado.
- Animación de tirada: clase `dieSpin` en el wrapper del `DieShape` (key = `roll.id` para
  remontar), keyframes `dieroll` **900 ms** `cubic-bezier(0.2, 0.7, 0.2, 1)`: rotación 2D
  ~720°→0° con rebote de escala (0.8→1.08→1). Durante el giro el número no es legible (velocidad
  + `opacity` del texto controlada por la misma animación no hace falta: la rotación basta).
- Puerta de aterrizaje idéntica a la actual: `landedId` + `onAnimationEnd`
  (`e.target === e.currentTarget`) + `buzz()`; reduced motion la salta
  (`landed = roll !== null && (reduced || landedId === roll.id)`).
- Mini-dados NdX>1: cada `miniDie` pasa a ser un `DieShape` `size={30}` con la silueta de
  `roll.sides`, conservando el pop escalonado de 80 ms y el borde/fondo actuales (los aporta el
  propio SVG, la clase `.miniDie` queda solo con layout+animación).
- `data-testid="dice-result"`, zona `aria-live` y `resultText` no cambian.

### Limpieza (código que muere)

- `stage-helpers.ts`: `stableFace`, `faceRotation`, `fillerFaces` (solo los usaba el cubo).
  `hashString`, `stableColor`, `wheelSectors`, `wheelTargetAngle`, `buzz` se quedan.
- `stage-helpers.test.ts`: mueren sus describes de `faceRotation`, `stableFace` y `fillerFaces`;
  entra el de `dieShapeFor`.
- `dice-stage.tsx`: muere `FACE_TRANSFORMS` y toda la escena 3D.
- `stage.module.css`: mueren `.cubeScene`, `.cubeSpin`, `.tumble` + keyframes `tumble`, `.cube`,
  `.face`; entra `.dieSpin` + keyframes `dieroll`; `.dieSpin` se añade al bloque reduced-motion.
- Issue **#989** (cobertura de `faceRotation`) queda obsoleta: se cierra al mergear anotando que
  el código desapareció — no que se arregló.

## Fuera de alcance

- 3D real por poliedro (descartado en brainstorm: frágil, mucho código).
- Pips/puntos en el d6, texturas, sombras proyectadas.
- Cambios en motor, moneda, ruleta, bolsa, feed o i18n (no hay copy nuevo).

## Testing

- **Unit** (`stage-helpers.test.ts`): `dieShapeFor` — los 6 mapeos exactos, `100→d10`, y
  fallback `round` para 2, 7 y 1000.
- **e2e**: los 5 specs actuales de `partidas-aleatorio.spec.ts` deben pasar sin cambios
  (`dice-result` y tiempos se conservan; reduced-motion sigue cubierto).
- Verificación manual en `next dev`: chip d20 → hexágono girando → aterriza con el número;
  inputs 2d8 → dos rombos mini + total.
