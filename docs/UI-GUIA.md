# Guía de UI — principios y patrones

> **[Canónico · derivado de las fases 3-4 de la auditoría 2026-08 (2026-08-19)]**
>
> Los patrones que toda pantalla nueva debe cumplir y los que hay que corregir al
> tocar pantallas viejas. La piel (tokens, tipografía, capturas Paper) vive en
> `docs/REFERENCIA-VISUAL.md`; el contrato de paneles de datos en
> `docs/design/paneles-estadisticos.md`. Evidencia y hallazgos concretos:
> `docs/audit/AUDIT-2026-08.md` (F3-### desktop, F4-### mobile/a11y).

## Identidad (proteger)

Serif display + paleta papel/teja + **la portada como material**. Los mejores
layouts de la casa son la plantilla a imitar: `/persona` (desktop 2-3 columnas),
`/estadisticas` (densidad + sub-nav), pestaña Episodios de serie, mapa de saga,
editor de catálogo inline (banner + barra sticky).

## Los 10 principios (fase 3)

1. **Desktop se diseña a dos columnas mínimo.** Página con contenido + contexto =
   main + sidebar; una sola columna centrada queda para formularios utilitarios
   (max-width ~720px). Ninguna página deja un tercio del viewport vacío
   sistemáticamente.
2. **Una plantilla de ficha, tres inserciones.** Libro/película/serie comparten
   orden de secciones, pestañas y rail; cada tipo solo inserta sus secciones
   propias (ediciones / dónde verla / episodios). Toda divergencia entre tipos es
   decisión registrada, nunca accidente.
3. **Un primario por vista, un color de primario en la app** (naranja).
   `Button` tiene cinco variantes y son TODAS las que hay: `primary` (naranja),
   `secondary` (outline), `ghost` (texto), `green` (lo social de Paper: unirse,
   aprobar, aceptar) y `danger` (rojo `--status-dropped`). El CTA de la ficha va
   en naranja SIEMPRE, aunque la obra sea una serie: el color de tipo
   (`MEDIA_ACCENT`) es del **contenido** —barras, chips, marcas del calendario—,
   nunca del rol de un botón. Ningún color nuevo sin entrada en `decisiones.md`.
   `danger` no es «lo mismo en rojo»: solo sale cuando el borrado ES el asunto
   de la pantalla (el botón que remata una hoja de confirmación). Sembrado por
   fila es justo el patrón que la regla 4 quita.
4. **Lo destructivo nunca vive inline.** Borrar/quitar van tras el «···»
   (`ActionMenu`, con `danger: true` en el item), y preguntan **solo si son
   irreversibles Y arrastran otros datos**: borrar un pase (se lleva nota,
   reseña y sesiones), quitar una obra de la biblioteca (se lleva TODOS sus
   pases), borrar una edición del catálogo común, borrar una nota, subir a
   alguien de rol. Lo que se rehace en diez segundos —una sesión suelta— va sin
   pregunta: confirmar todo enseña a decir que sí sin leer. Lo reversible
   (archivar, que tiene «Reactivar») se queda a la vista. Máximo una acción
   secundaria permanente por item de lista.
   *Excepción registrada:* «Quitar de mi biblioteca» sigue siendo un enlace
   visible al final del panel de Registro — no está sembrado por fila, es una
   acción única de un panel de gestión, y esconderla la haría inencontrable sin
   reducir el misclick. Lo que le faltaba era la pregunta, y ya la tiene.
5. **Dos patrones de navegación secundaria.** Tabs = misma entidad, distinto
   contenido; pills = filtros de una lista. Nada de tabs de un solo elemento ni
   pills que naveguen a rutas.
6. **La portada es EL componente.** Un solo `WorkCard` con variantes de tamaño y
   slots (estado, progreso, acciones on-hover); las acciones no tapan la portada
   en reposo.
7. **Todo vacío explica y ofrece.** `EmptyState` estándar en **dos tallas**:
   `page` (el vacío ES la pantalla) y `panel` (una lista dentro de una sección
   — clubes de «Descubrir», agenda del mes, sesiones de un pase). La talla
   `panel` existe porque sin ella nadie usaba el componente: 128px de aire y un
   titular serif de 20px no caben en una sección, así que cada sitio
   improvisaba su `<p>` gris. Anatomía igual en las dos: glifo, qué pasa, y una
   salida — si no hay salida que ofrecer, se omite, pero se ha pensado.
   Prohibido el string suelto y la card en blanco: una colección sin ítems
   pinta su abanico con tres huecos punteados, no 168px de blanco.
8. **Un nombre por concepto.** Glosario canónico en **`docs/UI-GLOSARIO.md`**;
   i18n y páginas usan el término del glosario y nada más.
9. **Toda feature cuelga de la navegación.** Ruta no alcanzable desde su área =
   o se le da entrada o se registra acta de por qué es contextual.
10. **Los números de la pantalla no se contradicen.** Estado y progreso mostrados
    juntos derivan del mismo dato (una fórmula por métrica).

## Reglas móviles y táctiles (fase 4)

1. **Hit-area mínima 44px** como regla de sistema: la utilidad `tap-44` de
   `globals.css`, que crece un pseudo-elemento centrado — el dibujo NO cambia y
   la caja de layout tampoco (frente a padding + margen negativo, que sí mueve
   el flujo cuando el control vive en un `flex` con `gap`). Solo bajo
   `(pointer: coarse)`: con ratón, 44px alrededor de un icono de 24 le roban
   clics al vecino. Puesta ya en el trigger de `ActionMenu` (dentro del
   componente, no en sus consumidores), el check de episodio visto, el cierre de
   `sheet-shell`, las flechas de reordenar del editor de secuencia y la píldora
   «Saltar». No sirve con `overflow-hidden` (recorta el pseudo-elemento) ni
   sobre un control ya posicionado en `absolute`/`fixed`: ahí, agrandar el
   dibujo o envolver. `RatingDots` va por su cuenta (regla 9).
2. **`min-w-0` / `minmax(0,1fr)` obligatorio** en celdas de grid/flex con
   contenido que debe encoger o scrollear (dos vistas rotas hoy por esto:
   F4-001/F4-002). Candidato a test e2e de `scrollWidth` por vista.
3. **Un solo chasis de sheet móvil** — el de `session-sheet`: bottom-sheet,
   `max-h` + scroll interno + footer sticky. Todo dialog con formulario lo usa.
4. **Capacidad, no ancho**: lo táctil se decide con `(hover:none)` /
   `(pointer:coarse)`, no con `sm:`/`lg:`. Nada de información/acción solo-hover
   sin equivalente táctil.
5. **Inputs a 16px en móvil** (regla global en `globals.css`); nunca
   `maximum-scale=1` (rompe el zoom de accesibilidad).
6. **Trío viewport completo**: `viewportFit: "cover"` (activa las safe-areas ya
   escritas) + `interactiveWidget: "resizes-content"` (composer sobre teclado) +
   inset-top en la topbar sticky. Van juntos.
7. **Affordance de scroll en tiras**: fade o media pestaña asomando en toda tira
   scrolleable de tabs/chips.
8. **Tablet = móvil ancho** es el estado actual (dos escalones: base → `lg:`);
   si se mantiene, registrar acta; si duele (ficha, Inicio), dar paso `md:`.
9. **Puntuar es un arrastre en táctil**, no una diana: `RatingDots` mantiene el
   dibujo de cinco dots y lee la nota de la posición del dedo sobre la fila,
   con la nota grande visible hasta que se levanta (patrón Letterboxd). Es la
   única salida cuando el target por mitad son 3,5px y ensanchar la fila a los
   220px que pedirían diez mitades de 44 sería otro dibujo. Con ratón no cambia
   nada (early-return por `pointerType`). `touch-action: pan-y`, nunca `none`:
   el eje vertical se lo queda el scroll de la página.

## Accesibilidad — base y deuda

Base sana a proteger: `<dialog>` nativo con `showModal()` (28 ficheros),
`:focus-visible` global, `alt`/labels sistemáticos, `aria-current` en las navs,
`role="status"` en cargas, selects y fechas nativos, errores inline con
`role="alert"`, cero toasts.

Deuda conocida (issues de la auditoría): contraste de `--muted-foreground`
(3,4:1) y `--foreground-faint` (2,6:1) — axe serious en TODAS las rutas
(F4-022); falta `<main>` + skip-link en el shell (F4-023); `FiltersDropdown`
fullscreen sin gestión de foco (F4-024); desglose de charts solo-hover
(F4-016); `prefers-reduced-motion` sin regla global para skeletons; fichas con
`<h1>` duplicado (dos árboles responsive).

## Reglas de formulario

Submit con Enter (todo formulario es `<form>`); `inputMode` correcto en campos
numéricos; `autocomplete` semántico (username en registro:
`autoComplete="username"` + `autoCapitalize="none"` + `spellCheck={false}`);
al fallar validación, foco + `aria-invalid` + scroll al campo culpable; botones
de submit deshabilitados/anunciando «enviando» durante la mutación.

## Cómo se aplica

- Pantalla nueva: cumple los principios de arriba desde el primer commit.
- Pantalla vieja: al tocarla, corrige lo que viole esta guía si el coste es
  bajo; si no, issue con etiquetas.
- El orden de ataque del rediseño (paquetes 1-5 con coste) está al final de la
  fase 3 del informe de auditoría.
