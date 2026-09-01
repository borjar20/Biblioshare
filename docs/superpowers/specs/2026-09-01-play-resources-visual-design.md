# Recursos: pasada visual — ficha viva, picker y fichas de asiento — spec de diseño

[Canónico · verificado 2026-09-01]

**Contexto:** segunda mitad de la pasada «muchos inputs y poco visual» (la primera fue el
reloj). Rama `feat/play-resources` (PR #998 la absorbe), que ya trae mergeado el
`useHoldRepeat` compartido. Motor INTACTO; solo cambia la configuración — el tablero se queda
(ya es manipulación directa y salió bien parado).

## 1. `HoldRepeatButton` migra a `useHoldRepeat`

`src/components/play/resources/hold-repeat-button.tsx` se reescribe como envoltorio fino:
misma firma pública (`{ direction, label, onPreview, onCommit }`) pero la máquina de gesto
viene del hook compartido (`useHoldRepeat({ step: direction, onPreview, onCommit })` +
esparcir `handlers`). Se borran los refs/timers locales duplicados. Cero cambio de
comportamiento — los e2e de recursos deben pasar intactos. (Avanza la dirección de #996.)

## 2. Config de recursos: ficha viva

`ResourcesConfig` se reescribe:

### Jugadores como fichas

Mismo lenguaje que el setup del reloj: fichas circulares de color de asiento con iniciales
(tocar quita, aria «Quitar a {name}»), habituales atenuadas que se encienden, ficha «+» con
`aria-controls` que despliega el input de nombre (Enter añade y cierra; tocar un habitual no
borra el borrador — lección de la review del reloj). Cada cambio emite `players_set`, como hoy.

### Alta de recurso: la ficha se construye a la vista

- **Preview viva**: círculo grande (~72px) con fondo `stableColor(nombre)` (o `--surface-3`
  con borde discontinuo si el nombre está vacío), el emoji elegido centrado (o la inicial del
  nombre si no hay emoji) y el valor inicial en un badge. Se actualiza al teclear/tocar.
- **Nombre**: único input de texto (min-w-0).
- **Emoji picker**: rejilla de 10 emojis frecuentes tocables
  (🪙 🌲 💎 ❤️ ⚡ 🧱 🐑 🌾 🪨 ⭐) con `aria-pressed` (tocar el elegido lo destoca → sin
  emoji). MUERE el input de texto de emoji.
- **Inicial**: stepper − N + con `useHoldRepeat` (paso 1, rango −9999..9999, mantener corre).
  MUERE el input numérico.
- **Dueño**: toggle segmentado de dos botones «Jugadores» / «Banco» (`aria-pressed`), en vez
  del checkbox.
- CTA de alta: botón «Crear ficha» (secundario, chip como hoy — el primario sigue sin existir
  en esta vista). Deshabilitado con nombre vacío/duplicado o tope de 8.
- La lista de defs existente pasa de chips de texto a **mini-fichas** (mismo círculo pequeño
  con emoji/inicial + nombre + × para quitar).

### i18n

Mueren: `resources.emojiLabel`, `resources.initialLabel` (el stepper usa claves nuevas).
Entran: `resources.emojiPicker` («Icono»), `resources.emojiOption` («Icono {emoji}»),
`resources.noEmoji` («Sin icono»), `resources.fewerInitial` («Uno menos de inicio»),
`resources.moreInitial` («Uno más de inicio»), `resources.ownerPlayers` («Jugadores»),
`resources.ownerBank` («Banco»), `resources.create` («Crear ficha»), `resources.addPlayer`
(«Añadir jugador»). `sharedLabel` muere con el checkbox. `add`/`nameLabel`/`namePlaceholder`
se conservan (input de nombre de jugador).

## 3. Sin cambios

Tablero (filas, ±, chips rápidos), acciones de pie, motor, hub, marca.

## 4. e2e (ajustes acotados de `partidas-recursos.spec.ts`)

- Añadir jugadores: flujo de ficha «+» (como el e2e del reloj).
- Alta de recurso: nombre «Madera», emoji 🌲 del picker, inicial a 5 con el stepper (5 toques
  al «+» o aserción tras tocar), toggle en «Jugadores»; «Oro» con toggle «Banco».
- El resto del flujo (ajustes, chips, recarga, deshacer, reiniciar, hub) igual, con los
  testids intactos.

## 5. Testing

- Unit: motor intacto (suite igual). Sin unit nuevo de UI.
- e2e: 2/2 recursos + 3/3 reloj + 5/5 aleatorio sin regresión.
- Manual: preview viva construyéndose; picker en móvil; oscuro.
