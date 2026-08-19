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
3. **Un primario por vista, un color de primario en la app** (naranja);
   secundarios outline, terciarios texto. Ningún color nuevo de botón sin entrada
   en `decisiones.md`.
4. **Lo destructivo nunca vive inline.** Borrar/quitar/archivar van tras menú
   «···» con confirmación si es irreversible. Máximo una acción secundaria
   permanente por item de lista.
5. **Dos patrones de navegación secundaria.** Tabs = misma entidad, distinto
   contenido; pills = filtros de una lista. Nada de tabs de un solo elemento ni
   pills que naveguen a rutas.
6. **La portada es EL componente.** Un solo `WorkCard` con variantes de tamaño y
   slots (estado, progreso, acciones on-hover); las acciones no tapan la portada
   en reposo.
7. **Todo vacío explica y ofrece.** `EmptyState` estándar (qué pasa + qué puedes
   hacer, con CTA). Prohibido el string suelto y la card en blanco.
8. **Un nombre por concepto.** Glosario canónico (Biblioteca, Cuaderno, Pase,
   Saga, Universo, Lista…); i18n y páginas usan el término del glosario.
9. **Toda feature cuelga de la navegación.** Ruta no alcanzable desde su área =
   o se le da entrada o se registra acta de por qué es contextual.
10. **Los números de la pantalla no se contradicen.** Estado y progreso mostrados
    juntos derivan del mismo dato (una fórmula por métrica).

## Reglas móviles y táctiles (fase 4)

1. **Hit-area mínima 40-44px** como regla de sistema: padding + margen negativo
   en los componentes base (Button/IconButton, triggers de ActionMenu, cierres de
   sheet, checks, RatingDots) — el dibujo no cambia.
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
