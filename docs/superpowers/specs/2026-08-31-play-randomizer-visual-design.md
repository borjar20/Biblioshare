# Aleatorio visual — escenarios animados sobre el motor existente

**Fecha:** 2026-08-31 · **Estado:** aprobado (brainstorm en sesión)
**Base:** rama `feat/play-randomizer` (PR #987). Spec funcional previa:
`2026-08-31-play-randomizer-design.md`.

## Objetivo

El Aleatorio funciona pero se siente como un formulario: botones que imprimen un
resultado. Es la zona de juegos — puede permitirse ser juguete. Este rediseño
convierte cada sección en un «escenario» con un objeto protagonista animado que
se toca para jugar: dado que rueda, moneda que gira, ruleta de jugadores, bolsa
que se sacude. **El motor no se toca**: la animación es teatro hacia un
resultado ya emitido.

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Técnica | CSS/SVG 3D puro. Sin canvas, sin librerías de animación. |
| Presentación | Escenario grande por sección; el resultado aparece en el escenario. |
| Gesto | Tocar el objeto (el objeto ES el botón). Sin agitar el móvil. |
| Alcance | Las cuatro secciones (dados, moneda, jugadores, bolsa). |
| Extras | Vibración sutil al aterrizar. Sin sonido. |
| Arquitectura | Opción A: capa de presentación nueva; reducer/eventos/hook/persistencia intactos. |

## Principio rector: teatro determinista

El flujo de datos NO cambia. Tap → se resuelve el azar → `emit` (validación +
persistencia, como hoy) → el escenario recibe el resultado ya decidido y anima
*hacia* él: el dado rueda y aterriza mostrando la cara emitida, la ruleta
decelera y para en el nombre emitido. Consecuencias asumidas:

- **Crash-safe**: la tirada está en el log desde el primer instante; cerrar la
  app a mitad de animación no pierde nada.
- **El feed se actualiza al instante** mientras el escenario aún anima (~1 s).
  Está abajo, fuera del foco visual: asumido, no se retrasa nada en el motor.
- El azar visual de relleno (caras laterales del cubo, temblor de la bolsa) sí
  puede usar `Math.random()` — vive en componentes, jamás en el reducer.

## Escenario común

- Zona centrada de **~260 px de alto** bajo los chips de pestaña, con «tapete»:
  fondo `radial-gradient` muy sutil sobre tokens Paper (`surface` /
  `surface-muted`), borde `border` redondeado. Nada de colores nuevos fuera de
  la paleta de Play.
- El objeto protagonista es un elemento con `role="button"`, **conservando los
  aria-label actuales** («Tirar», «Lanzar moneda», «Sacar ficha»…) para que los
  e2e y lectores de pantalla sigan funcionando. Focus visible, activable con
  teclado (Enter/Espacio).
- Resultado en grande EN el escenario, con rebote de entrada
  (`scale 0.6 → 1.06 → 1`, ~250 ms). `aria-live="polite"` en el contenedor del
  resultado.
- **Vibración**: `navigator.vibrate?.(30)` al aterrizar el objeto (helper
  compartido `buzz()`; silencioso donde no hay soporte).
- **`prefers-reduced-motion: reduce`**: sin animación — el objeto no se mueve y
  el resultado aparece directo. Se comprueba con `useReducedMotion` (hook nuevo
  compartido, media query) y las keyframes también se anulan en CSS.
- **Doble tap durante la animación**: permitido y barato — cada tap emite y la
  animación se reinicia hacia el último resultado (sin estados «pending» ni
  bloqueos).
- Configuración (inputs NdX, gestión de jugadores, edición de bolsa) queda
  debajo del escenario con el estilo discreto actual.
- Feed + deshacer + limpiar: abajo, sin cambios.

## Secciones

### Dados — cubo 3D

- Cubo CSS 3D (`transform-style: preserve-3d`, 6 caras de ~96 px). Tap: rueda
  ~900 ms (keyframes de volteretas con `cubic-bezier` de deceleración) y
  aterriza con la **cara frontal mostrando el número emitido**.
- Las caras muestran **números dinámicos**, no pips: el mismo cubo sirve para
  d4–d1000. Al tirar, las cinco caras no frontales se rellenan con números al
  azar del rango (relleno visual).
- **NdX con N>1**: el cubo protagonista anima una vez; al aterrizar, los
  resultados individuales aparecen como mini-dados en fila (revelado escalonado
  ~80 ms/dado, máx. 20) y el **total en grande** debajo. Con N=1, solo el cubo.
- Configuración: chips rápidos d4–d20 + inputs NdX actuales, bajo el escenario.
  Los chips rápidos también disparan la animación.

### Moneda — flip 3D

- Disco 3D: dos caras SVG + canto (cilindro fingido con `translateZ`). Cara:
  sol; cruz: aspa con laurel — misma familia visual que la marca
  `random-table-mark`.
- Tap: 4–5 revoluciones `rotateX` (~1100 ms) con deceleración, cae del lado
  emitido. Resultado textual («Cara»/«Cruz») en grande al aterrizar.

### Jugadores — ruleta y revelados

- **Primer jugador**: ruleta SVG de sectores (uno por jugador, colores estables
  por nombre), flecha fija arriba. Tap en la ruleta: gira ~2200 ms
  (`cubic-bezier(0.12, 0.8, 0.2, 1)`, 4 vueltas + ángulo objetivo) y para con
  el sector del elegido bajo la flecha. Nombre en grande al parar.
- **Orden de juego**: los nombres se revelan en cascada, uno a uno numerados
  (stagger ~120 ms), cada uno con deslizamiento + fade.
- **Equipos**: tarjetas por jugador que se voltean (flip Y escalonado) y quedan
  agrupadas por equipo, cada equipo con su color.
- La ruleta es el escenario; orden y equipos animan su resultado en la misma
  zona (la ruleta se atenúa mientras). Botones «Orden» y «Equipos» + gestión de
  lista (chips habituales, texto libre, quitar) quedan debajo, como hoy.
- Con <2 jugadores la ruleta aparece vacía con el hint actual.

### Bolsa — bolsa de tela

- Bolsa SVG (tela con cordel). Tap: se sacude ~500 ms (rotaciones alternadas
  pequeñas) y la ficha sale de la boca hacia arriba con rebote (~400 ms):
  círculo con el nombre del tipo y **color estable por nombre** (mismo helper
  que la ruleta).
- **Restantes como fichas apiladas**: cada tipo se pinta como pila de
  circulitos (hasta 8; más allá, pila + «×N») en vez del texto «×3». La pila
  encoge al sacar.
- Edición (añadir tipo, quitar, con/sin reemplazo) y «Reiniciar bolsa»: sin
  cambios funcionales, mismos controles bajo el escenario.

## Arquitectura

Nuevo directorio `src/components/play/random/stage/` — componentes
**puramente presentacionales** (reciben el resultado y coreografían; cero
acceso a hook/IDB):

| Fichero | Responsabilidad |
|---|---|
| `dice-stage.tsx` | Cubo 3D + mini-dados + total |
| `coin-stage.tsx` | Disco flip 3D |
| `players-wheel.tsx` | Ruleta SVG de sectores |
| `order-reveal.tsx` | Cascada numerada |
| `teams-reveal.tsx` | Tarjetas flip por equipo |
| `bag-stage.tsx` | Bolsa + ficha + pilas |
| `stage.css` | Keyframes y clases 3D compartidas (importado una vez) |
| `stage-helpers.ts` | Helpers puros testables (abajo) |
| `use-reduced-motion.ts` | Hook media query `prefers-reduced-motion` |

Helpers puros en `stage-helpers.ts` (unit-testeables, sin DOM):

```ts
// Rotación destino para que la cara `face` (0..5) quede frontal.
export function faceRotation(face: number): { x: number; y: number };
// Sectores de la ruleta: ángulos y color por jugador.
export function wheelSectors(players: string[]): { name: string; start: number; end: number; color: string }[];
// Ángulo final de giro para parar `picked` bajo la flecha (turns vueltas enteras).
export function wheelTargetAngle(players: string[], picked: string, turns: number): number;
// Color estable por nombre (hash simple sobre paleta fija de 8 tonos Play).
export function stableColor(name: string): string;
// Relleno visual: números al azar 1..sides para las caras no frontales.
export function fillerFaces(sides: number, count: number, rng?: () => number): number[];
// Vibración sutil; no-op sin soporte.
export function buzz(): void;
```

Las secciones actuales (`dice-section`, `coin-section`, `players-section`,
`bag-section`) **conservan toda la lógica** (emit, validación de inputs,
edición `alive()`, chips) y solo cambian su render para montar el escenario.
`random-screen`, hook, reducer, eventos, selectors, db: **intocados**.

## Fuera de alcance

- Sonido, agitar el móvil (DeviceMotion), física canvas.
- Cambios de motor: eventos nuevos, retraso del feed, estados «pending».
- Presets por juego (queda para el ecosistema de herramientas, EPIC #931).

## Testing

- **Unit** (`stage-helpers.test.ts`): `faceRotation` cubre las 6 caras;
  `wheelSectors` suma 360° y asigna colores estables; `wheelTargetAngle` deja
  `picked` bajo la flecha para varios tamaños; `stableColor` determinista y
  distinto para nombres distintos (dentro de la paleta); `fillerFaces` respeta
  rango con RNG inyectado.
- **E2e**: los 4 specs existentes deben seguir verdes. Ajustes esperados y
  únicos permitidos: el disparador pasa de `<button>` texto a objeto con
  `role="button"` y el mismo accessible name; `dice-result`, `coin-result`,
  `players-result`, `bag-result` se conservan como testids. Las esperas usan
  los testids (aparecen al aterrizar), no timeouts fijos.
- **Reduced motion**: e2e opcional con `page.emulateMedia({ reducedMotion:
  "reduce" })` comprobando resultado inmediato — barato, se incluye.
- Build de producción (`next build`) y `tsc` limpios, como siempre.
