# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

> Decisión del usuario (2026-08-27). **Hoy no se cumple todavía:** el wrapper Capacitor
> (`capacitor.config.ts`) carga la web desplegada vía `server.url`, así que Android muestra
> exactamente la misma piel web. `adaptive` es el compromiso hacia delante: las superficies
> genuinamente nativas (widgets Glance, escáner de código de barras, cronómetro de sesión,
> push) siguen el lenguaje de Android, y cualquier trabajo que empuje más UI a nativo se
> diseña en Material, no portando la piel web. Implica mantener dos sistemas visuales; si eso
> deja de quererse, se cambia aquí y se registra en `docs/requirements/decisiones.md`.

## Users

Producto público en crecimiento: cualquiera se registra sin conocer al autor ni el vocabulario
de la casa. El usuario primario es una persona que ya lleva la cuenta de lo que lee y ve —hoy
repartido entre Goodreads, Letterboxd y una hoja de cálculo— y quiere un solo sitio con
progreso real, no solo «leído/no leído».

Situaciones de uso reales que el diseño debe soportar:

- **Registrar en caliente**, a menudo en móvil y con una mano: cerrar una sesión de lectura,
  marcar un episodio, puntuar recién terminada la película.
- **Curar en frío**, normalmente en desktop: ordenar sagas, importar CSV, editar fichas del
  catálogo, revisar estadísticas.
- **Social por convocatoria**: club de lectura con calendario, hitos y comentarios; feed de a
  quién sigues.

Audiencias secundarias con necesidades propias: **colaboradores** (curan el catálogo común:
alta manual, edición de ficha, secuencia de sagas) y **admin** (gestiona roles y la cola de
reportes). Y el **visitante sin cuenta**, que ve perfiles públicos por defecto: es la primera
pantalla real del producto para la mayoría.

Consecuencia de ser público: la app **no puede dar por sabido su propio vocabulario**. Pase,
hito, itinerario, colocación, tándem son conceptos de la casa; cada uno necesita mostrarse
antes de exigirse. Densidad alta sigue siendo válida donde el usuario ya está dentro.

## Product Purpose

PWA para llevar el registro del consumo cultural —libros, películas y series— en un solo sitio:
un Goodreads + Letterboxd + tracker de series unificado, con catálogo compartido entre todos
los usuarios y biblioteca/progreso privados por usuario.

Éxito = la persona registra lo que consume **sin fricción y sin saltar de app**, y vuelve
porque lo acumulado (pases, notas, estadísticas, sagas, club) vale más cuanto más se llena.

## Positioning

Tres cosas que un tracker vecino no puede copiar sin rehacer su modelo de datos:

1. **El pase como unidad, no la obra.** Toda la relación usuario↔obra (estado, fechas, nota,
   reseña, posición) vive en `passes`; una relectura o un revisionado es otro pase, no un
   campo sobrescrito. Eso hace que el historial sea real y que las estadísticas no mientan.
2. **Los tres hobbies en la misma columna vertebral.** Metadata por tipo
   (`books`/`movies`/`series`) y todo lo del usuario polimórfico por `(item_type, item_id)`:
   colecciones, notas, clubes y sagas mezclan tipos sin casos especiales. Añadir un hobby es
   una tabla más, no otra app.
3. **Sagas y universos con orden narrativo curado**, no una lista alfabética: jerarquía,
   itinerarios, ventanas de colocación, tándems y un mapa derivado. Es la parte que la
   competencia resuelve con un campo de texto.

## Operating Context

- Catálogo **compartido y escrito por el servidor**: el alta manda solo el id externo a una RPC
  `SECURITY DEFINER`; la hidratación fill-only rellena los campos canónicos desde Open Library
  (libros, incl. ISBN por escáner en Android) y TMDB (cine/series). El INSERT directo está
  revocado.
- **Privacidad por RLS**: lo que cada uno ve depende de `auth.uid()`. Perfiles públicos por
  defecto (modelo Instagram) con opción privada y solicitudes; bloqueos bidireccionales y cola
  de reportes.
- Entrada de datos que ya existe y hay que respetar: importación CSV de Goodreads y Letterboxd
  con triaje de ambiguos, export CSV propio.
- Móvil como escenario principal de captura; desktop como escenario de curación y análisis.
- Español como único idioma publicado, con `next-intl` cableado desde el inicio
  (`messages/es.json`).

## Capabilities and Constraints

Mapa de features vigente: `docs/PROYECTO.md`. Resumen de dominios construidos: catálogo (fichas
libro/película/serie, ediciones, personas y créditos, géneros, edición inline para
colaboradores), biblioteca personal (pases, sesiones, episodios, colecciones, cuaderno de notas
y citas, estadísticas y retos, importar/exportar), sagas y universos (jerarquía, itinerarios,
mapa React Flow), social (perfiles, follows, posts, reacciones, comentarios con hilos y notas de
voz, moderación, notificaciones in-app + push), PWA instalable con caché de solo lectura y
wrapper Android (widgets Glance, escáner, cronómetro nativo).

Restricciones técnicas duras:

- **Next.js 16 App Router con Cache Components.** `use cache` solo para datos idénticos para
  todo el mundo; cachear una consulta filtrada por RLS es fuga de datos entre cuentas (regla
  #437 de `AGENTS.md`). No es opcional ni negociable en trabajo de rendimiento.
- **El estado vivo del usuario vive en `passes`**, nunca en `library_entries` (congelada).
- Supabase (Postgres/RLS/Storage/Auth) en dos proyectos: dev primero, prod después. Añadir una
  columna exige revisar los grants por columna (`docs/DRIFT-CHECK.md` superficie 6).
- Desplegado en Vercel; el wrapper Android apunta a esa URL de producción.

Vocabulario de producto: `docs/UI-GLOSARIO.md` manda sobre cualquier copy nuevo. Un concepto
que no esté ahí se añade ahí primero.

Decisiones abiertas registradas, no inventadas: si tablet merece su propio escalón (`md:`) o
sigue siendo «móvil ancho»; cuánta UI acaba siendo realmente nativa en Android.

## Brand Commitments

- **Nombre**: Biblioshare. App Android `app.biblioshare.mobile`.
- **Identidad visual vigente y vinculante** (`docs/UI-GUIA.md` §Identidad, detalle en
  `docs/REFERENCIA-VISUAL.md`): serif display, paleta papel/teja, **la portada como material**.
  Un solo color de primario en toda la app; el color por tipo de obra es del contenido, nunca
  del rol de un botón.
- **Los 10 principios de UI** de `docs/UI-GUIA.md` son el contrato de cualquier pantalla nueva,
  no una sugerencia — incluidas «lo destructivo nunca vive inline» y «todo vacío explica y
  ofrece».
- **Voz**: español, tuteo, término del glosario y ninguno más.
- **Marca gráfica: existe, y no es vinculante.** El logo (`AppLogoIcon`, en
  `src/components/ui/icons.tsx`) son tres lomos de distinta altura en los colores de tipo de
  medio; el wordmark parte «Biblio» + «share» en acento. Vive como SVG inline, no como asset en
  `public/` (ahí solo quedan los SVG del scaffold de Next). Decisión del usuario (2026-08-27):
  vigente como estado actual, **abierto a rehacerse** — no bloquea un logo mejor.

## Evidence on Hand

- Producto en producción con usuarios reales (varias cuentas; una caché mal puesta ya se ha
  notado en prod). Despliegue: `https://biblioshare-nine.vercel.app`.
- Auditoría integral propia con hallazgos numerados y deuda abierta:
  `docs/audit/AUDIT-2026-08.md` (F3-### desktop, F4-### mobile/a11y).
- Baseline de rendimiento congelado a propósito: `docs/perf-baseline.md`.
- Capturas y sistema visual actual: `docs/REFERENCIA-VISUAL.md`; capturas en `shots/`.
- Mapa de arquitectura legible por máquina: `docs/architecture/graph.json`.
- **No hay**: testimonios, prensa, métricas de uso publicadas, precios, plan de negocio ni
  clientes. Nada de eso puede aparecer en un diseño futuro como si existiera.

## Product Principles

1. **Registrar cuesta segundos o no se registra.** La captura en móvil manda sobre la elegancia
   de la pantalla que la contiene.
2. **El catálogo es de todos; la biblioteca es tuya.** Toda pantalla deja claro cuál de las dos
   cosas está tocando el usuario, porque editar la ficha oficial afecta a desconocidos.
3. **Lo acumulado se ve.** Pases, notas, sesiones y sagas existen para volverse historia
   visible: los vacíos prometen esa historia, no la disimulan.
4. **Un nombre por concepto, y explicado la primera vez.** El vocabulario de la casa es un
   activo mientras se enseñe; sin enseñarlo es un muro para un público que no te conoce.
5. **La portada es el material.** La densidad visual del producto sale de las obras, no de
   adornos añadidos.

## Accessibility & Inclusion

**WCAG 2.1 AA es el suelo** de todo trabajo nuevo (decisión del usuario, 2026-08-27): contraste
4.5:1 en texto, foco visible, operable por teclado, labels y `alt` sistemáticos.

Base sana existente que hay que proteger: `<dialog>` nativo con `showModal()`, `:focus-visible`
global, `aria-current` en navegación, `role="status"` en cargas, `role="alert"` en errores
inline, `<main id="contenido">` y skip-link puestos por `AppShell` (no se declaran por página),
cero toasts. Regla con test: `--foreground-faint` **no colorea texto** (2,25:1); el texto
secundario usa `--muted-foreground`.

Deuda AA abierta y conocida, a cerrar, no a heredar en silencio: `FiltersDropdown` fullscreen
sin gestión de foco (F4-024) y el resto de F4-022..026 del informe de auditoría.
