# Mascota RPG UI — verificación local

> Evidencia de implementación · 2026-09-09 · issue #1165 · **publicado el 2026-09-09**
> (PR #1146 a `main`). La evidencia de abajo es la local previa a publicar.

Entorno: Node 22.23.1, build de producción de Next.js 16.3.0 y `next start`
en el puerto 3000. Pruebas por lotes con un worker contra Supabase de desarrollo.
No se cambia el esquema ni el motor de combate.

## Comprobaciones completadas

- Vitest: 69 ficheros, 491 tests aprobados de `src/components/pet`, `src/lib/pet`
  y navegación de pantalla completa. Incluyen retorno seguro, vistas, separación
  por usuario, pausa/recuperación, almacenamiento fallido y resultado confirmado
  mientras el panel o la pestaña estaban ocultos.
- Build de producción y TypeScript aprobados. Lint de los módulos afectados sin
  errores; un aviso heredado de variable `_equipment` sin uso en un test histórico.
- Equipo: dos e2e aprobados. Copias y comparación, equipar/desequipar, captura
  inmutable en combate, concurrencia y aislamiento entre cuentas.
- Entrenamiento: dos e2e aprobados sin reintentos. Salida a Biblioshare y vuelta
  al mismo intento, tick y snapshot; una sola fila. Autoridad, resolución
  concurrente, replay, ulti por teclado, cancelación y foco. Botón de habilidad
  con desplazamiento y cambio de altura de 0 px durante el combate a 320 px.
- Aventura: un e2e aprobado sin reintentos. Concesión por actividad, recuperación
  tras recargar con la misma intención, resolución, reintento o recompensa y
  aislamiento RLS. El contador pendiente se verifica contra la RPC autenticada.
- Eclosión y compañera: tres e2e aprobados. Crear nombre/clase, entrar en
  Personaje, compañera en el marco general, ocultar/mostrar y ausencia sin sesión.
- Diario: dos e2e aprobados. Tres misiones, once familias de logros y una sesión
  real que completa una misión y obtiene su celebración.
- Madriguera: dos e2e aprobados. Selección social antes y después de eclosionar,
  vistas móvil/escritorio y ampliación de 12 a 60 mascotas con total real de 65.

Resultado de los recorridos seleccionados: **12 e2e aprobados**, sin reintentos
automáticos. Los selectores del diseño anterior se actualizaron antes de sus
ejecuciones finales; no se rebajaron las comprobaciones de autoridad o geometría.
- Navegador: 18 combinaciones de pantalla/ancho (320, 390 y 1440 px), un solo
  landmark `main`, sin desbordamiento horizontal ni recursos de mascota fallidos.
  Campamento, Personaje, Mochila, Diario, Madriguera y entrenamiento inicial.
- Mismo fondo `rgb(7, 31, 25)` y texto `rgb(244, 240, 216)` en claro y oscuro.
  Retorno a `/coleccion?tipo=libros`, historial atrás/adelante y foco en el título.
- Apertura/cierre de nombre y clase, desglose de atributos con teclado, once
  familias de logros y selección de mascota en Madriguera.
- Revisión de código final: sin hallazgos pendientes en navegación, estado
  compartido, recuperación por intención y confirmación visible del resultado.

Capturas y reportes locales en `.superpowers/brainstorm/2026-09-09/qa-*`.
Los fondos elegidos y su procedencia están en `public/pet/scenes/`.
La captura final confirma el retrato completo y centrado, encabezados sans y
una sola misión en el resumen móvil; Diario mantiene la colección completa.

## Alcance de la evidencia

La revisión visual usa la cuenta persistente sin escribir datos. Los e2e de
combate usan cuentas desechables y limpieza por API. Los mensajes locales de
Vercel Speed Insights y de portadas externas no son fallos de los recursos de
mascota. Esta evidencia no afirma publicación ni aceptación jugable nueva del
balance R4b.

El servidor volvió a registrar `HANGING_PROMISE_REJECTION` de Auth durante
prerender, también fuera de `/mascota`. Seguimiento previo #1098 y #1126; no se
atribuye al rediseño ni se declara resuelta su causa.

## Corrección de ancho de escritorio — PR #1166

Se retiraron los máximos de ancho desde 900 px y se ajustaron las alturas de los
escenarios al viewport. Build de producción aprobada. Navegador real: 18
comprobaciones (seis pantallas a 1920×1080, 1440×900 y 390×844), sin desbordamiento
horizontal y con un único `main`. En escritorio cada vista ocupa el ancho de la
ventana menos 52 px; retorno alineado a 26 px. Captura visual revisada a 1920 px.
Evidencia local: `fullwidth-report.json` y `fullwidth-1920.png` en la carpeta de
capturas del 2026-09-09. Prueba de lectura sin modificar datos de la cuenta.

## Revisión estética sobre la PR #1166

Segunda pasada, con la interfaz ya construida: un solo sistema de tokens, escala
de píxel entera, arte nuevo de PixelLab y las correcciones de contraste. Mismo
entorno (Node 22.23.1, `next dev` en el 3000, Supabase de desarrollo).

### Comprobado

- Vitest: **491 tests en 69 ficheros**, todos en verde (`src/components/pet`,
  `src/lib/pet`, `src/components/nav`). TypeScript sin errores.
- Playwright, **23 recorridos aprobados** sin reintentos: entrenamiento (2),
  aventuras (1), equipo (2), madriguera (5), misiones (2), eclosión y compañera
  (3), madriguera de club (5), landmark `main` y skip-link (3).
- Navegador real a **320, 390 y 1440 px**, tema claro y oscuro. Las seis
  pantallas más combate en curso, combate en pausa y pantalla de resultado.
- **Sin desbordamiento horizontal** en ninguna vista a 320 px, incluidos combate
  y puzle de ulti (`scrollWidth` 320 = `clientWidth` 320).
- **El botón de habilidad no se mueve**: `deltaY` y `deltaHeight` a 0 px durante
  todo el combate (antes de esta pasada, 24 px).
- Claro y oscuro siguen dando el mismo bosque dentro del juego; un solo `main`.

### Tres regresiones que encontró la verificación, y su causa

Las tres las introdujo esta misma pasada y se corrigieron antes de cerrar:

1. **El botón de combate se movía 24 px.** El banner de aviso tenía `min-height`
   y su frase cambia cada pocos ticks: unas caben en una línea y otras en dos.
   Además el contador pasaba de «0.9 s» a «12.0 s» y, al ensancharse, le robaba
   sitio al texto. Arreglado con altura fija en el banner y ancho fijo en el
   contador.
2. **La arena se salía 7 px del panel en móvil.** `margin-inline: auto` en un
   item flex cambia el dimensionado de «estirar» a «según el contenido». Hacía
   falta `width: 100%` junto al margen automático.
3. **Los retratos de las barras de vida salían vacíos.** `PetSprite` se
   dimensiona por celda del sheet y no acepta un tamaño; a 40 px quedaba
   recortado fuera de su caja. Se cambió a `CombatSprite`, que sí lo acepta.

### Límites asumidos

- `frame-parchment.webp` está generado y sin cablear; `gathering.webp` mide
  576×432 y no 576×448; la franja inferior de `camp-portrait.webp` es plana.
  Los tres están abiertos en la issue #1167, con lo que costaría cerrarlos.
- El aviso `Date.now()` en prerender que sale en las capturas es la issue #895:
  es global (afecta también a `/` y `/coleccion`) y no lo introduce esta PR.
- Cuando se escribió esto no estaba desplegado. La evidencia es local y con la
  cuenta de pruebas, sin escribir datos: el entrenamiento es gratis y no concede
  recompensas. Se publicó después, el mismo 2026-09-09, en la PR #1146.

## El campamento sin scroll vertical — PR #1166

Tercera pasada, sobre la misma rama y el mismo entorno (Node 22.23.1, `next dev` en
el 3000, Supabase de desarrollo).

### Medido, antes y después

Desbordamiento vertical de la página en el campamento (`scrollHeight − clientHeight`):

| Ventana | Antes | Después | Escena |
|---|---|---|---|
| 320×844 | 391 px | **0** | 340 → 303 px |
| 390×844 | 371 px | **0** | 340 → 303 px |
| 1440×900 | 20 px | **0** | 460 → 440 px |
| 1920×1080 | 0 px | **0** | 560 → 620 px |

A 1920 la escena *crece*: al quitar el techo de 560 px del `clamp`, la fila elástica
se queda con el alto que sobra en lugar de dejarlo en blanco.

### Comprobado

- Vitest: **491 tests en 69 ficheros**, todos en verde. TypeScript sin errores.
- Playwright: **14 aprobados** de las seis suites de mascota (`mascota`,
  `misiones`, `madriguera`, `equipo`, `entrenamiento`, `aventuras`). El botón de
  habilidad sigue inmóvil en combate (`deltaY: 0, deltaHeight: 0`).
- Las cinco vistas a 320, 390, 1440 y 1920 px, en claro y oscuro: sin
  desbordamiento **horizontal** de página y un solo `main` en las veinte
  combinaciones. Campamento con `pageScrollY` 0 en las cuatro.
- Degradación en ventanas bajas (390×667, 1024×600): la página sigue sin
  scrollear; scrollea el contenedor de contenido y la escena se planta en su
  suelo de 240 px. No hay solapamiento entre la escena y el bloque de misiones.

### Límite asumido

`mascota-aventuras` salió *flaky* en la tanda (falló una vez en la aserción de «1
aventura pendiente» tras cobrar botín, aprobó al reintentar) y aprobó sola con
`--retries=0`. La aserción depende del recuento que devuelve el servidor tras
`router.refresh()`, no de la geometría que cambia esta pasada. Queda como sospecha
sin confirmar, no como regresión atribuida a este cambio.

## Unificación de vistas: cuatro destinos — PR #1166

Cuarta pasada. Mismo entorno. La Mochila entra en Personaje y Diario pasa a dos
columnas en escritorio.

### Espacio sin usar a 1440×900

Alto entre el final del contenido y la barra de destinos (alto útil: 767 px):

| Vista | Antes | Después |
|---|---|---|
| Mochila | 341 px (44 %) | — (ya no existe) |
| Diario | 297 px (39 %) | **25 px** |
| Personaje | 15 px | **0** (la página se llena y scrollea 100 px) |
| Campamento | 26 px | 26 px |

Personaje se quedó primero con 177 px de hueco al absorber el panel de equipo, que
con el inventario vacío mide poco. Se llenó con el catálogo del botín: los seis
objetos con su ranura y su efecto a potencia base ×1,0, en lugar de una sola línea
diciendo que no tienes nada. Es estado vacío y desaparece en cuanto hay botín.

Queda un desnivel entre columnas mientras el catálogo esté a la vista: la izquierda
(identidad + atributos, 554 px) acaba antes que la derecha (equipo, 837 px). Con
botín se invierte, porque el catálogo desaparece y el equipo baja a ~440 px. No se
rellena con nada inventado.

### Información que ya no se repite

- La escena del campamento y la placa de madera de identidad estaban enteras
  dentro de Personaje. Ahora la ficha lleva una tira con retrato de 61 px.
- El resumen de equipo de Personaje y el panel de Mochila decían lo mismo con las
  mismas palabras («Arma», «Amuleto», «Sin equipar») y se enlazaban entre sí.
- «Misiones de hoy» se leía dos veces en Diario, en la pestaña y en la cabecera.

### Comprobado

- Vitest: **492 tests en 69 ficheros**, en verde. Uno nuevo fija que `?view=bag`
  lleva a Personaje y que ya no hay botón «Mochila».
- TypeScript sin errores; ESLint sin errores en `src/components/pet` y
  `src/lib/pet` (siguen los cuatro avisos heredados de `_equipment`).
- Playwright: **15 aprobados sin reintentos** en las seis suites de mascota. Esta
  vez `mascota-aventuras` aprobó a la primera. El botón de habilidad sigue
  inmóvil (`deltaY: 0, deltaHeight: 0`).
- Navegador a 320, 390, 1440 y 1920 px, claro y oscuro, en las cuatro vistas: sin
  desbordamiento horizontal de página, un solo `main`, campamento sin scroll.
- e2e actualizados: `mascota-equipo` navega Personaje ↔ Diario y comprueba que un
  enlace viejo `?view=bag` sigue llegando al equipo; `mascota-misiones` comprueba
  que en escritorio no hay pestaña «Logros» y la galería ya está a la vista;
  `mascota-aventuras` pulsa «Ver equipo» en vez de «Ver mochila».

### Catálogo del botín en el estado vacío

- 505 unitarios en 73 ficheros en verde; TypeScript sin errores; ESLint limpio en
  `src/components/pet/loot`.
- Playwright: **5 aprobados sin reintentos** (`mascota-equipo`, `mascota-aventuras`,
  `mascota-misiones`). Las suites de equipo siembran copias, así que recorren la
  rama con inventario, no el catálogo.
- Revisado en navegador a 1440×900 y 390×844: seis tarjetas, tres por fila en
  escritorio y apiladas en móvil, iconos al 55 % de opacidad para que se lean como
  «existe y no es tuyo» y no como deshabilitado.

Límite asumido: el catálogo solo aparece con el inventario **vacío**. Con una sola
copia desaparece entero, así que no dice qué objetos te faltan cuando ya tienes
alguno. Cubrirlo es trabajo aparte: issue #1170.

## Publicación — PR #1146

`codex/mascota-r4b` fusionada en `main` el 2026-09-09 (`af92087e`), tras resolver
ocho conflictos con `main` (`fec41e87`).

- Sobre el árbol fusionado, antes de subir: TypeScript limpio, **3.531 tests en
  356 ficheros en verde**, `docs/architecture/sync.mjs --check` conforme y
  `scripts/ci-lint.mjs` con 0 errores sobre los 127 ficheros cambiados.
- CI de la PR: los cinco checks en verde, incluido `empty-database`, que es el que
  valida `schema-baseline.sql` y el manifiesto contra una base vacía — justo los
  dos ficheros derivados que se regeneraron en vez de resolverlos a mano.
- Despliegue de Vercel sobre el commit de fusión: correcto. Comprobación anónima
  en producción: `/`, `/mascota` y `/coleccion` responden 200.
- La migración R4b ya estaba aplicada en producción desde antes, así que el orden
  fue base de datos primero y código después.

### Lo que esta evidencia NO dice

No hay aceptación jugable de R4b: se publicó sin ella, a decisión del dueño. Y no
hay verificación en producción con una cuenta real más allá del 200 anónimo: las
cinco mascotas vivas no se han tocado.
