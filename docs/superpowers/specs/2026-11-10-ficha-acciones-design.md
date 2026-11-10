# Botones y acciones de la ficha — diseño

[Histórico · congelado 2026-11-10]

**Estado:** aprobado por Borja (brainstorming 2026-11-10).
**Antecedente:** `docs/superpowers/specs/2026-11-09-ficha-cartel-design.md` (PR 1617), que cambió la
estética de la ficha sin tocar cómo se actúa en ella. Recoge los hallazgos 1 y 2 de la issue #1164.

## Problema

- **El primer registro no se entiende.** Una obra que no está en la biblioteca solo ofrece «Seguir»,
  que en realidad la añade como pendiente (`useFollow` → `addExistingItemToLibrary`) y salta a la
  pestaña Mi registro. Para decir «ya la he leído» hay que seguir, ir a esa pestaña y cambiar el
  estado. «Seguir» se usa además para personas y sagas.
- **La tarjeta del pase no es un mando.** `PassCard` muestra estado, progreso, un botón y la nota,
  pero el estado y la nota solo enlazan a Mi registro, donde vive `StatusSegments`.
- **En películas el botón no hace nada por sí mismo:** «Registrar visionado» enlaza a `?tab=log`,
  igual que el `StickyPassCta`.

## Decisiones

1. **Tres intenciones** sustituyen a «Seguir» en la ficha.
2. **La tarjeta es el mando de la obra:** estado, acción principal y nota se cambian en ella.
3. **Mi registro queda para el historial.** El selector de estado sale de esa pestaña.
4. **No cambian** las server actions, el esquema ni las hojas de sesión y cierre.
5. **PR aparte**, después de mergear la 1617: toca los mismos ficheros.

## Obra que no está en la biblioteca

| Tipo | Principal | Secundarios |
|---|---|---|
| Libro | Quiero leerlo | Lo estoy leyendo · Ya lo leí |
| Serie | Quiero verla | La estoy viendo · Ya la vi |
| Película | Quiero verla | Ya la vi |

- Cada botón deja la obra en su estado con un toque: pendiente, en curso o terminada.
- «Ya lo leí» y «Ya la vi» abren la hoja de cierre (`ClosePassSheet`) para fecha, nota y reseña.
  «Ahora no» la deja terminada sin nota, como hoy.
- Ningún botón cambia de pestaña.
- Sin sesión iniciada, los tres llevan a `/login` y vuelven a la ficha (`loginHref`), sin escribir
  nada.
- La palabra «Seguir» desaparece de la ficha de obra. El menú ⋯ ya dice «Quitar de mi biblioteca» y
  no cambia.

## Obra que ya está en la biblioteca

### Estado

Un selector en la tarjeta, con las mismas opciones que `StatusSegments`: Pendiente, En curso,
Terminada y Abandonada; en películas, sin «En curso» (salvo un pase heredado que lo tenga). En móvil
ocupa el ancho de la tarjeta. Cambiarlo hace lo mismo que hoy `handleStatusChange` en `LogPanel`:

- terminar o abandonar abre la hoja de cierre;
- retomar un abandonado pregunta «continuar o de cero» (`ResumePassSheet`);
- el estado se muestra de forma optimista y se revierte si la acción no escribe.

### Acción principal

| Estado | Libro | Serie | Película |
|---|---|---|---|
| Pendiente | Empezar a leer | Marcar episodio | Marcar vista |
| En curso | Registrar sesión | Marcar episodio | Marcar vista |
| Terminada | Volver a leer | Volver a verla | Registrar otro visionado |
| Abandonada | Retomar | Retomar | Retomar |

- **Empezar a leer:** pasa a en curso y abre la hoja de sesión (`/sesion/[passId]`).
- **Registrar sesión** y **Marcar episodio:** como hoy (hoja de sesión; en series, pestaña Episodios).
- **Marcar vista:** termina el pase y abre la hoja de cierre, sin pasar por otra pestaña.
- **Volver a leer / verla / Registrar otro visionado:** el «Nuevo pase» actual (`handleNewPass`),
  que en películas crea el visionado ya cerrado y abre la hoja de cierre.
- **Retomar:** la transición abandonada → en curso, con su pregunta.

El `StickyPassCta` de escritorio usa esta misma acción y texto.

### Nota

Los puntos de la tarjeta son interactivos (`RatingDots` con `onChange` → `ratePass`), con la nota
optimista. Sin pase que puntuar (obra pendiente), los puntos no aparecen.

### Progreso

La barra y sus textos no cambian.

## Mi registro

Conserva el diario de pases, las sesiones, el progreso con su edición, el cuaderno y las notas al
margen. Pierde el selector de estado y el enlace rojo «Quitar de mi biblioteca», que ya está en el
menú ⋯. «Nuevo pase» se queda en el diario, además de la acción de la tarjeta.

## Cómo se construye

- **`usePassActions`** (hook nuevo): reúne lo que hoy está repartido entre `LogPanel` y `useFollow`:
  añadir con una intención, cambiar de estado, nuevo pase, retomar y puntuar. Decide qué hoja se
  abre.
- **`PassActionsProvider`**: monta una sola vez, junto a la tarjeta, las hojas `ClosePassSheet`,
  `NewPassSheet` y `ResumePassSheet`. Hoy viven en `LogPanel`, que solo existe con su pestaña activa:
  por eso la tarjeta no puede abrirlas.
- **Cierre automático tras una sesión (`?cerrar=<passId>`):** lo atiende el proveedor, con la misma
  validación en servidor. Deja de depender de `&tab=log`.
- **`PassCard`** se divide en dos vistas: intenciones (sin pase) y mando (con pase).
- **`LogPanel`** usa el hook para «Nuevo pase» y pierde su copia de la lógica y de las hojas.
- **Añadir con intención:** «Quiero…» usa `addExistingItemToLibrary`; las otras dos añaden y
  encadenan `updateStatus` con el estado elegido.
- **`ItemStatusContext`** sigue siendo la fuente del estado optimista.
- **Textos** en `messages/es.json`, por tipo; `docs/UI-GLOSARIO.md` recoge el cambio de «Seguir».

## Errores

- Si una acción falla, el estado optimista se revierte y la tarjeta muestra el error con
  `role="alert"` (hallazgo 5 de #1164).
- Los botones se deshabilitan mientras hay una escritura en vuelo, para evitar dobles envíos
  (`aria-busy`, como hoy).
- Si la segunda escritura de «Ya lo leí» falla, la obra queda como pendiente y se avisa.

## Accesibilidad

- El selector de estado es un grupo con nombre («Tu estado»), manejable con teclado.
- Los tres botones de intención tienen texto completo, no solo iconos.
- La nota conserva la accesibilidad de `RatingDots`.

## Pruebas

**Vitest:** la tabla de acción principal por estado y tipo; `usePassActions` (cada intención, cada
transición, reversión al fallar, doble envío); las dos vistas de `PassCard`; `LogPanel` sin selector.

**Playwright contra build de producción:**

- Cada intención desde una obra nueva, en libro, serie y película, y comprobación en BD.
- Cambiar de estado y puntuar desde la tarjeta sin cambiar de pestaña.
- «Marcar vista» abre la hoja de cierre en la pestaña en la que se esté.
- Terminar un libro desde la sesión abre el cierre aunque la pestaña activa sea Información.
- Anónimo: los botones llevan a login y vuelven.
- Los specs que usan «Seguir» o el selector en Mi registro (`pase-hub`, `registrar-sesion-v2`,
  `cierre-ritual`, `ficha-cartel`, `happy-path`) se adaptan sin perder lo que comprueban.

## Fuera de alcance

- Barra de acción fija en móvil.
- Los hallazgos 3, 4 y 6 de #1164 (temporadas, chasis móvil de la valoración, #737).
- La estética del cartel (PR 1617) y las hojas de sesión y cierre.
- Cambios en server actions o esquema.
