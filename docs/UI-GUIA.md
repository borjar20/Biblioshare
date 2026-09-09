# Guía de UI — principios y patrones

> **[Canónico · derivado de las fases 3-4 de la auditoría 2026-08 (2026-08-19);
> excepción de mascota verificada el 2026-09-09]**
>
> Los patrones que toda pantalla nueva debe cumplir y los que hay que corregir al
> tocar pantallas viejas. La piel (tokens, tipografía, capturas Paper) vive en
> `docs/REFERENCIA-VISUAL.md`; el contrato de paneles de datos en
> `docs/design/paneles-estadisticos.md`. Evidencia y hallazgos concretos:
> `docs/audit/AUDIT-2026-08.md` (F3-### desktop, F4-### mobile/a11y).

## Identidad (proteger)

**Excepción aprobada: `/mascota` (#1165, 2026-09-09).** Tiene marco de RPG de bosque,
tema verde fijo y navegación propia: Campamento, Personaje, Mochila, Diario y
Madriguera. El combate cede el espacio a arena/controles, pero conserva «← Biblioshare».
Ese acceso vuelve a la última ruta interna válida o a Inicio; no es un `back()`
ciego. El marco reutiliza el único `main` de AppShell. No duplicar componentes de
combate para móvil/escritorio ni desmontarlos al cambiar de sección. El resto de
la app mantiene la identidad descrita a continuación. Tokens: `DESIGN.md`, apartado
«Excepción de la mascota»; referencias: spec `2026-09-09-mascota-rpg-ui-design.md`.

En escritorio (desde 900 px), el juego ocupa todo el ancho con 26 px de margen
interior a cada lado, sin máximos de 1200/940/860 px. Campamento reserva una
columna acotada para misiones y da el resto al escenario; la altura de los
escenarios se adapta al viewport. Eclosión distribuye formulario y madriguera
en dos columnas. En móvil se conserva la composición compacta.

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
   o se le da entrada o se registra acta de por qué es contextual. **Aplicado
   (acción 8, 2026-08-21).** La regla de reparto de la IA: **si es TUYO cuelga de
   «Tú»** —el menú del avatar en `sm+`, la fila «Lo tuyo» del perfil en móvil,
   ambos desde `youItems` en `nav-items.ts`—; **si es del catálogo, cuelga de
   Buscar** (por eso Sagas va ahí y no en «Tú»). La configuración es una PÁGINA
   (`/ajustes`), no una hoja modal: una pantalla de ajustes se marca, se comparte
   y se vuelve a ella con el botón atrás. **Un camino por viewport, no dos:** la
   misma lista no se enseña dos veces en la misma pantalla. La barra principal
   sigue con sus cinco entradas a propósito — el agujero no era cuáles eran, sino
   que no colgaba nada de ellas. Ver `decisiones.md` (2026-08-21).
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
`role="alert"`, cero toasts. Y desde el 2026-08-25, dos más que también son de
armazón y por tanto valen para toda ruta nueva sin hacer nada: **`<main
id="contenido">` y skip-link los pone `AppShell`** — no los declares por página,
dos `<main>` anidados son otra violación de axe (#816).

**Contraste (regla, no deuda): `--foreground-faint` NO colorea texto.** Da
2,25:1 en claro y 2,16:1 en oscuro, y **no se arregla subiendo el valor**:
cualquier color que llegue a 4,5:1 sobre papel cae en L\* 42, que es donde ya
está `--muted-foreground` — "arreglarlo" es fundirlo con muted. Queda para
objetos decorativos (dots `aria-hidden`). Para texto secundario,
`--muted-foreground` (#6b6255 en claro desde #815, 5,11:1 sobre `--background`).
`contraste-tokens.test.ts` lo comprueba en los tres bloques de tema y falla si
vuelve a aparecer un `text-foreground-faint`.

Deuda conocida que SIGUE abierta (issues de la auditoría): `FiltersDropdown`
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
