# Reloj: pasada visual — esfera viva, fichas y aro-selector — spec de diseño

[Canónico · verificado 2026-09-01]

**Contexto:** feedback del usuario revisando #997/#998: «muchos inputs y poco visual» — la misma
lección del Aleatorio. Primera mitad de la pasada (el reloj; recursos va en su propia spec
sobre su rama). Commits a `feat/play-clock`; PR #997 los absorbe. Motor INTACTO: solo cambia
la capa de presentación del setup y de la cuenta atrás; el juego de ajedrez no se toca.

## 1. Hook compartido `useHoldRepeat`

`src/components/play/ui/use-hold-repeat.ts` — generalización del gesto de mantener (extraído
del patrón de `HoldRepeatButton` de recursos, que MIGRARÁ a este hook en el ciclo de recursos;
avanza también la dirección de #996 de capas compartidas):

```ts
export function useHoldRepeat(opts: {
  step: number;                        // unidad por tick (p. ej. +1, o +30_000)
  onPreview: (accumulated: number) => void;
  onCommit: (total: number) => void;   // UN commit por gesto (tap => step; hold => acumulado)
  holdDelayMs?: number;                // 400
  repeatMs?: number;                   // 120
}): {
  handlers: {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
    onContextMenu: (e: React.MouseEvent) => void;   // preventDefault
    onClick: () => void;                            // tap/teclado => onCommit(step), con guard justHeld
  };
}
```

Misma máquina interna que el botón de recursos con sus arreglos de review: `stopTimers` +
`justHeld = false` al empezar, limpieza al desmontar, cancel en leave/cancel, guard del click
sintético. El consumidor esparce `{...handlers}` en su elemento y añade él `select-none` y
`[touch-action:manipulation]` a su className.

## 2. Setup de ajedrez: esfera + fichas

### `ClockFace` (`src/components/play/clock/clock-face.tsx`)

SVG presentacional (~140px, viewBox 100): esfera con borde `--play-rail`, 12 marcas horarias,
**arco sombreado** en `--accent` al 20% (`color-mix`) desde las 12 en sentido horario
proporcional a `minutes/60` (>60 min: arco completo + segunda vuelta insinuada con trazo),
y **aguja** en `--accent-ink` apuntando al final del arco. `aria-hidden`; debajo (fuera del
SVG) la lectura en serif: «{min} min · +{inc} s» (o «{min} min» con incremento 0).

### Controles

- **Tiempo**: chips presets 1/3/5/10/15/30 min (como hoy) + **stepper − +** que ajusta de
  1 en 1 min sobre 1..120. El stepper usa `useHoldRepeat` (step 1, mantener corre). MUERE el
  input custom de minutos.
- **Incremento**: chips +0/+5/+10/+30 s (como hoy). MUERE el input custom de segundos.
- **Jugadores como fichas** (`SeatToken`, componente pequeño local del setup): círculo 44px
  con `--play-seat-N` por posición e INICIALES (dos primeras letras del nombre, mayúsculas),
  `title`/aria = nombre completo. Tocar una ficha la QUITA (aria «Quitar a {name}»).
  Habituales: fichas atenuadas (opacity + borde discontinuo) con el nombre debajo en 10px;
  tocarlas los añade. Ficha «+» (borde discontinuo, símbolo +) que despliega el ÚNICO input
  superviviente (nombre + Enter añade); se oculta al añadir.
- **CTA**: «Empezar {min}+{inc}» (notación de ajedrez, p. ej. «Empezar 5+5»; con incremento
  0, «Empezar 5 min»). Mismo emit `chess_configured`.
- La guarda `blockedByCountdown` y su texto no cambian.

### i18n

Mueren: `clock.customMinutes`, `clock.customIncrement`. Entran: `clock.fewerMinutes`
(«Un minuto menos»), `clock.moreMinutes` («Un minuto más»), `clock.addPlayer`
(«Añadir jugador»), `clock.startExpr` («Empezar {expr}»). `clock.minutes`/`noIncrement`/
`plusSeconds`/`start` se conservan (start queda para la cuenta atrás).

## 3. Cuenta atrás: el aro es el selector

- **Parada** (sin correr y sin pausa): el aro entero (el `<svg>` envuelto en un `<button>`
  con aria «Añadir 30 segundos») es tocable — tap = **+30 s**, mantener repite (+30 s cada
  120 ms) EN LOCAL con el aro y el número corriendo, y al soltar emite **UN**
  `countdown_configured` con el total acumulado (clavado a 5 s..2 h). `useHoldRepeat`
  (step 30_000). Corriendo o en pausa el aro NO es tocable (button disabled, sin borde de
  foco engañoso).
- La duración parte de la vigente: tap sobre 1:00 configura 1:30. Los chips preset siguen
  fijando valores absolutos. MUERE el input de segundos custom.
- `blockedByChess` también deshabilita el aro.
- Sin cambios en CTA, buzz, sr-only ni reset.

### e2e (reescritura acotada de `partidas-reloj.spec.ts`)

- Test ajedrez: añadir jugadores pasa por la ficha «+» (tocar «Añadir jugador» → input →
  Enter); el resto igual (chips «1 min» y flujo intactos).
- Test cuenta atrás: sin input custom — preset «30 s», Empezar, y se afirma que CORRE (el
  número baja de «0:30») y que Pausar/Reanudar congelan; YA NO se espera al 0:00 (el cero
  exacto lo clavan los unit del motor). Nuevo paso: con la cuenta parada, un tap al aro sube
  la duración en 30 s.
- Test hub sin cambios.

## 4. Fuera de alcance

El juego de ajedrez (zonas). Arrastrar el aro como dial continuo. Restar tiempo tocando
(bajar = presets o reiniciar). Tocar motor o eventos. Migrar `HoldRepeatButton` de recursos
(ciclo siguiente). Sonido.

## 5. Testing

- Unit: `useHoldRepeat` no lleva unit propio (lógica de punteros; la cubren los e2e y la
  migración futura de recursos) — el motor no cambia, su suite debe pasar intacta.
- e2e: los 3 tests del reloj reescritos según §3; recursos 2/2 y aleatorio 5/5 sin regresión
  (recursos corre sobre su rama, aquí solo compila).
- Manual: esfera refleja presets y stepper; mantener sobre el aro acumula y emite uno;
  fichas en móvil con 6 jugadores; oscuro.
