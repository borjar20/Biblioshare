---
target: Ficha de obra (/libro/[id])
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-27T12-57-17Z
slug: src-app-libro-id-page-tsx
---
# Critique · Ficha de obra (`/libro/[id]`)

Method: dual-agent (A: revisión de diseño · B: detector + navegador). Medidas con Chromium de Playwright contra `localhost:3000` a 1440×900, 1180×800 y 390×844, claro y oscuro, con `@devtest` (rol colaborador). Dos obras: una en biblioteca con pase abierto y otra fuera de la biblioteca. Cero escrituras.

## Design Health Score

| # | Heurística | Score | Hallazgo clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Skeleton que espeja la rejilla real y `aria-busy` en el badge optimista; pierde un punto porque el raíl pinta «Vista» encima de una barra al 3 % |
| 2 | Sistema / mundo real | 2 | «Seguir» para añadir a la biblioteca, «Diario» para lo que el glosario llama Pases, «Completado» y «Leído» para el mismo estado |
| 3 | Control y libertad | 2 | La única acción irreversible pregunta con `window.confirm()` sin nombrar la obra |
| 4 | Consistencia | 2 | El mismo hueco del raíl pinta píldora de 36 px o caja de 48; «Nuevo pase» sale teja/teal/violeta según el tipo |
| 5 | Prevención de errores | 3 | `?cerrar` validado en servidor contra el pase activo; «Nuevo pase» no aparece sobre un Pendiente |
| 6 | Reconocer > recordar | 2 | «Mi registro» no existe hasta que sigues la obra: no puedes ver lo que ganarías |
| 7 | Flexibilidad | 2 | Deep links `?tab=` y tabulación limpia; registrar en móvil cuesta pestaña + scroll + enlace de 12 px + otra página |
| 8 | Estético y minimalista | 3 | Paper bien ejecutado; lo baja Mi registro en móvil: tarjeta dentro de tarjeta y 11 afordancias del mismo peso |
| 9 | Errores: recuperar | 3 | Errores inline con `role="alert"` y mensajes concretos; `not-found.tsx` propio |
| 10 | Ayuda y documentación | 1 | Pase, Sesión, Edición, Diario, «1.ª lectura» colisionan aquí y ninguno se explica |
| **Total** | | **23/40** | Acceptable |

## Veredicto de especificidad

Escrita para este producto, y se nota justo donde importa — pero solo en PC. El raíl de escritorio es el pase hecho objeto: portada de 384 px pegada al scroll y, debajo, estado + barra de progreso con `pág. 137/272` + CTA + «Tu nota» en dots. Ningún tracker vecino copia eso sin rehacer su modelo de datos.

Pero esa especificidad es una propiedad del breakpoint `lg:`, no de la vista. A 390 px la ficha se convierte en una ficha de catálogo genérica con pestañas.

## Plantilla única: ¿se cumple?

Se cumple en la capa que el usuario ve primero (pestañas, raíl, sitio y color del CTA) y se rompe justo debajo.

| Aspecto | libro | película | serie | ¿Diverge? |
|---|---|---|---|---|
| Color del CTA | `#b0542f` | `#b0542f` | `#b0542f` | ✓ Tinta Única se cumple |
| Qué hace el CTA | va a `/sesion/{passId}` | `?tab=log`, solo cambia de pestaña | `?tab=episodes` | **sí, y es grave** |
| Orden de «Información» | Sinopsis → Ediciones | Reparto a ancho completo → Sinopsis | Sinopsis → Reparto | **sí, accidente** |
| Mecanismo de 2 columnas | grid (`page.tsx:530`) | `display:contents`+`order` (`:453`) | prop `sidebar=` (`:531`) | **tres implementaciones** |
| Umbral de `SagaStrip` | `>= 1` | `>= 1` | `>= 2` | **sí, deriva fósil** |
| Navegación secundaria | ninguna | ninguna | 2 niveles más | **sí** |
| Móvil: ¿primario con pase abierto? | no | no | no | consistente en el fallo |

Lo más caro no es el orden distinto: es que las mismas dos columnas estén construidas de tres maneras. Un cambio en la ficha son tres cambios, y cada uno se olvida por su lado.

**Escaneo determinista:** exit 2. Libro **53**, película **53** (idénticos, tronco común), serie **71** — los 18 de más vienen del bloque de episodios, que ningún otro tipo usa. 18 de 32 ficheros limpios.

**Superposición:** 87 (Información) / 32 (Comunidad) / 105 (Mi registro) / 54 (sin pase). Lo real: texto funcional a 9 px (×19, chips de edición) y 9,5 px (×20), `skipped-heading` en Mi registro (`h1` → `h3`), dos `<h1>` con el mismo texto en el DOM y el bloque de metadatos duplicado (dos `aside` con las mismas `label-section` y los mismos chips de género).

**Medida objetiva del hallazgo principal:** a 390×844 con pase abierto, elementos con `background-color` == `--accent`: 1 (Información) / 1 (Comunidad) / 2 (Mi registro). **De caja visible: 0 / 0 / 0** — uno es el raíl `hidden lg:block`, otro está dentro de un `<dialog>` cerrado. Fuera de la biblioteca sí se renderiza 1 de 2 (116×36).

## Lo que funciona

1. **La Regla de la Tinta Única se cumple donde el brief pedía comprobarla.** El CTA es `rgb(176,84,47)` en libro, película y serie, y sube a `#d98a5c` en oscuro. El comentario de `item-rail-actions.tsx:117-123` documenta la regresión corregida («Marcar episodio» era el único botón morado de la app) y la corrección aguanta. Regla viva, no doc muerto.
2. **Teclado y oscuro resueltos.** Orden de tabulación correcto (skip-link → topbar → raíl → pestañas → cuerpo), anillo de 2 px en las 22 paradas medidas, cero overflow horizontal a 390/1180/1440.
3. **`ItemShellSkeleton` espeja la rejilla real**, no un rectángulo genérico: misma `grid-cols-[300px_1fr]`, mismas alturas de portada (174 móvil, 384 raíl). Por eso el hero llega por streaming sin que la página salte.

## Incidencias prioritarias

**[P1] En móvil, una obra que estás consumiendo no tiene acción primaria.** Cero elementos con fondo de acento visibles en las tres pestañas. El raíl es `hidden lg:block`; «Registrar sesión» queda como enlace de 12 px en `--muted-foreground`, duplicado idéntico a 48 px de distancia. Mientras, «Quitar de mi biblioteca» se pinta en rojo y centrado: la acción que borra pesa más que la que llena. *Fix:* sacar el CTA del raíl a un slot que exista en las dos pantallas (`item-shell.tsx:66-81`, `hero-status-or-follow.tsx:35-37`), o botón fijo abajo respetando `env(safe-area-inset-bottom)`.

**[P1] Ningún vacío de la ficha usa `EmptyState`.** `grep -rl EmptyState src/components/detail/` → cero. Cinco `<p>` grises: `community-panel.tsx:183` y `:153`, `session-list.tsx`, `pass-diary.tsx:65`, `info-panel.tsx:54`. Y el copy manda a otro sitio: «Sé el primero desde tu biblioteca» se lo dice a alguien que tiene, dos dedos más arriba, la píldora «En tu biblioteca · Leyendo». *Fix:* `EmptyState size="panel"` en los cinco, con una salida que sea un control (los `RatingDots` del pase ahí mismo), y reescribir `detail.noRatings`/`detail.noReviews`.

**[P1] Las pestañas no existen para un lector de pantalla.** `item-detail-tabs.tsx:99-117` pinta cuatro `<button>` pelados: `role=null`, `aria-selected=null`, y el subrayado que marca la activa es `aria-hidden`. *Fix:* `role="tablist"/"tab"` + `aria-selected` + `aria-controls`, o como mínimo `aria-current="page"`.

**[P2] «Seguir» / «Añadiendo…» / «Quitar de mi biblioteca»: tres palabras para un concepto que el glosario llama Biblioteca.** Y «Seguir» ya significa otra cosa en la app (seguir a una persona). Al lado, `library.status.completed` = «Completado» y `detail.statusSegments.completed.book` = «Leído», dos nombres para el mismo estado a 200 px uno del otro.

**[P2] La plantilla se rompe por debajo de la línea de flotación.** Tres mecanismos para las mismas dos columnas, tres órdenes de sección, umbral de `SagaStrip` divergente. Y «Nuevo pase» (`log-panel.tsx:378`) se pinta con `MEDIA_ACCENT[itemType]`: `#a15a34` en libro, `#3f6b6e` en película, `#7a5676` en serie — la Regla de la Tinta Única al revés. *Fix:* lo segundo es una línea (`variant="secondary"`); lo primero pide levantar el cuerpo de «Información» a un componente con slots ordenados.

## Banderas por persona

**Casey (móvil, una mano):** abre la ficha del libro que está leyendo y no hay ni un botón de acción en pantalla; tiene que deducir que «Mi registro» es la pestaña correcta. El gesto que buscaba es un enlace de 12 px a ~730 px de scroll, duplicado. El único elemento con color de acción es rojo y dice «Quitar de mi biblioteca». Cuando llega, el hero ya se fue con el scroll: actúa sobre un panel que no dice de qué obra es.

**Sam (lector de pantalla):** las cuatro pestañas se anuncian como botones sueltos. «Quitar de mi biblioteca» —que borra todos los pases, notas y reseñas— confirma con un `window.confirm()` que no nombra la obra: «Quitarla de tu biblioteca…». Fuera de contexto no hay antecedente para «la».

**Jordan (primera vez):** lee «PASE ACTIVO · 1.ª lectura» sin que nada diga qué es un pase. La sinopsis sale en inglés y con los asteriscos de markdown crudos (`info-panel.tsx:47-51` parte por `\n\n` y pinta `<p>` planos). Los géneros de un libro sin curar salen tal cual de OpenLibrary: ocho, en inglés, uno con una coma dentro.

**Marta (de Goodreads y Letterboxd):** lo que la haría cambiarse —el pase, el historial real— solo se le enseña **después** de añadir la obra: «Mi registro» no existe hasta que sigue. Evalúa la app sin ver nunca su ventaja competitiva.

## Observaciones menores

- Seis glifos de texto haciendo de iconos con el set de línea al lado: `⋯` (`hero-menu.tsx:64`), `▤` (`log-panel.tsx:480`), `+` (`item-rail-actions.tsx:129`), `✎` (`catalog-editor.tsx:447`), `✓` (`edition-strip`, `episode-grid.tsx:180`, `episode-list.tsx:85`).
- `detail.ratings` tiene un caso `=0 {sin valoraciones}` inalcanzable: el bloque está tras `avgRating !== null`, así que una obra sin puntuar deja la cabecera muda donde podría invitar.
- Dos `<h1>` con el mismo texto (hero móvil + cabecera PC). El oculto va con `display:none`, así que no llega a los lectores: el coste es de mantenimiento, y ya se paga — los géneros salen junto al título en móvil y solo en la tarjeta lateral en PC.
- El bloque de metadatos aparece dos veces en el DOM (dos `aside` con las mismas `label-section` y chips de género duplicados).
- La serie apila tres niveles de navegación a 390 px: pestañas → Lista/Rejilla → Mis notas/Comunidad. Los dos últimos no son «filtro de una lista», que es lo único que el principio 5 admite para pills.
- En oscuro el raíl pierde el borde: columna y fondo tienen la misma luminosidad. Un escalón de superficie lo arreglaría sin sombra (Regla del Tono Primero).
- El raíl de una serie pinta «Vista» encima de una barra al 3 % («1 / 40 vistos»).

## Preguntas que abre

1. Si el pase es la unidad y el móvil es donde se captura, ¿por qué el panel de control del pase es lo único que solo existe en escritorio?
2. «Mi registro» solo aparece cuando ya seguiste la obra. ¿Cómo sería la ficha si esa pestaña estuviera siempre, enseñando en vacío la historia que tendrías?
3. ¿«Seguir» o «Añadir a mi biblioteca»? Si no cabe en 116 px, ¿qué cuesta más: ensanchar una píldora, o que el usuario aprenda una palabra que la app abandona en cuanto la pulsa?
4. El CTA de película dice «Registrar visionado» y solo cambia de pestaña. ¿Es un CTA o una pestaña disfrazada de botón?
5. Volver a un libro terminado devuelve tres frases sobre lo que no hiciste. ¿Qué vería alguien que acaba de terminar Piranesi si esa pantalla estuviera diseñada para el final del recorrido?
6. Si la serie necesita tres niveles de navegación y el libro uno, ¿siguen siendo la misma plantilla? Y si no, ¿no toca registrarlo en `decisiones.md`?
