# Biblioshare

PWA para llevar el registro de tus hobbies de consumo cultural — **libros, películas y
series** — en un solo sitio. Un Goodreads + Letterboxd + tracker de series unificado, con
estética centrada en portadas, perfiles públicos, clubes de lectura y sagas.

Next.js 16 (App Router) + React 19 + Supabase + Tailwind, desplegado en Vercel, con wrapper
Android vía Capacitor.

## Arranque

Node **22.23.1** (está en `.nvmrc`; el shell suele arrancar en otra versión, así que
`fnm use` antes de nada).

```bash
npm install
cp .env.example .env.local   # y rellenar (ver «Entornos»)
npm run dev                  # http://localhost:3000
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `start` | Build de producción y arranque |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unidad) — **requiere Node 22** |
| `npm run test:e2e` | Playwright (e2e) — necesita un servidor levantado; reutiliza el que haya |

## Documentación

Cada documento tiene **un solo trabajo** y una **cabecera de frescura** que dice si puedes
fiarte de él. La regla general: **donde un doc canónico contradiga a otro, mira la tabla de
gobernanza de abajo para saber cuál manda.**

| Doc | Manda para | Tipo |
|---|---|---|
| [**Arquitectura**](docs/ARQUITECTURA.md) | Rutas, capas, flujo de datos, mapa de módulos | Canónico · vs código |
| [**Modelo de datos**](docs/requirements/data-model.md) | Esquema: tablas, RLS, enums, migraciones | Canónico · vs prod |
| [**Trampas conocidas**](docs/TRAMPAS.md) | Lo que ya ha costado horas. **Léelo antes de depurar algo raro** | Canónico |
| [**Proyecto**](docs/PROYECTO.md) | Qué existe hoy (mapa de features por dominio) | Canónico |
| [**Seguridad**](docs/SEGURIDAD.md) | Modelo de permisos: RLS, roles, grants, excepciones | Canónico |
| [**Guía de UI**](docs/UI-GUIA.md) | Patrones de UI y principios de diseño (derivados de la auditoría 2026-08) | Canónico |
| [**Glosario de UI**](docs/UI-GLOSARIO.md) | Cómo se llama cada concepto de cara al usuario. Se consulta ANTES de escribir copy | Canónico |
| [**Sistema de diseño**](DESIGN.md) | Los tokens: color, tipografía, forma, elevación, layout y los primitivos, con el porqué de cada uno. Formato [DESIGN.md](https://github.com/google-labs-code/design.md), legible por agentes | Canónico · vs `globals.css` |
| [Visión y alcance](docs/requirements/vision.md) | Qué es el producto y su MVP | Canónico · estable |
| [Backlog](docs/requirements/backlog.md) | Qué está hecho y qué queda | Estado vivo |
| [Decisiones](docs/requirements/decisiones.md) | Decisiones vigentes (consolidado 2026-08-19; historial completo en `docs/superpowers/decisiones-historicas-2026-08.md`) | Consolidado |
| [Reactividad](docs/reactividad.md) | Cómo se refleja el estado en la UI | Convención |
| [Testing](docs/TESTING.md) | Cómo se verifica | Convención |
| [CI de regresiones](docs/testing/ci.md) | Checks en PR/push, recorridos críticos y límites de cobertura | Convención |
| [Auditoría 2026-08](docs/audit/AUDIT-2026-08.md) | Auditoría integral 2026-08 (hallazgos y roadmap) | Estado vivo |
| [Fidelidad Paper](docs/redesign/README.md) | Iniciativa de rediseño 2026-07 (cerrada) | Histórico · congelado |
| [Referencia visual para prototipos](docs/REFERENCIA-VISUAL.md) | **Las capturas** de cada zona y el flujo para prototipar contra ellas. Los tokens NO: para eso manda [`DESIGN.md`](DESIGN.md) | Canónico · vs código/capturas |
| [Baseline de rendimiento](docs/perf-baseline.md) | Baseline de rendimiento (congelado a propósito) | Baseline congelado |
| [Push Android](docs/push-notifications-android.md) | Arquitectura push Web/FCM | Canónico |
| [CI de release Android](docs/ci-firebase-app-distribution.md) | CI de release Android (firma y distribución) | Canónico |
| [Widgets Android](docs/widgets-android.md) | Widgets Glance | Canónico |
| [Mapa de arquitectura](docs/architecture/README.md) | Localizar dónde vive una feature: flujos end-to-end con ficheros (`graph.json`) y diagrama interactivo (`map.html`) | Derivado del código |
| [Paneles estadísticos](docs/design/paneles-estadisticos.md) | El contrato de cualquier panel de datos: resumen, indicadores, gráfico decorativo y tabla exacta desde una sola fuente | Canónico · vs código |
| [RPG de mascota: visión y hoja de ruta](docs/design/2026-09-06-mascota-rpg-evolucion-por-fases.md) | Parte I, visión congelada del RPG (combate automático con intervenciones de un toque y ulti con minijuego, clases, equipo, campaña por géneros, cosméticos); Parte II, hoja de ruta viva por hitos R1–R10 con contrato solo en R1–R4. Sustituye el alcance de la spec de combate del 2026-09-04 | Diseño de producto · Parte II viva · R3 aceptado; R4a integrada; R4b en diseño (#1123) |

`docs/superpowers/plans/` y `specs/` son **registro histórico**: uno por feature, fechado y
congelado. Explican *por qué* algo es como es, no *cómo* está hoy. Si contradicen a los docs de
la tabla, mandan estos.

**Los tres docs de diseño no compiten: se reparten la pantalla.** `DESIGN.md` manda sobre los
**tokens** (qué color, qué tamaño, qué radio, qué sombra, y el porqué medido de cada uno);
`docs/UI-GUIA.md` manda sobre los **patrones** (cuántas columnas, dónde vive lo destructivo, qué
es tab y qué es pill); `docs/REFERENCIA-VISUAL.md` guarda las **capturas** y el flujo de
prototipado. Un valor de color o de tipografía se cambia en `globals.css` y se refleja en
`DESIGN.md`; una regla de composición se discute en `UI-GUIA.md`. `PRODUCT.md`, en la raíz, es la
verdad de **producto** (usuarios, plataforma, restricciones, accesibilidad) y no contiene nada
visual.

### Gobernanza documental (cómo NO desincronizarse)

Cuatro reglas, para que la doc no vuelva a divergir del proyecto:

1. **Una fuente de verdad: el repo (git).** El Proyecto de Claude *refleja* el subconjunto
   canónico (arquitectura, modelo de datos, visión, backlog), no lo origina.
2. **Un trabajo por documento.** La verdad *actual* (arriba) va en docs pequeños y verificables;
   la *historia* va en `specs/`/`plans/` y en `decisiones.md` (append-only, nunca se reescribe →
   no puede desincronizarse).
3. **Contrato de frescura en cada doc.** Canónico → `[Canónico · verificado contra {prod|código}
   el AAAA-MM-DD]`. Histórico → `[Histórico · congelado el AAAA-MM-DD]`.
4. **El esquema se verifica contra prod**, no se mantiene a ciegas. Cuando dudes, corre el
   [chequeo de deriva](docs/DRIFT-CHECK.md).

## Entornos (Supabase)

Dos proyectos remotos separados y un entorno local desechable para pruebas:

- **Producción** — lo usa el deploy de Vercel (variables configuradas allí).
- **Dev** — lo usa el desarrollo local; `.env.local` apunta aquí. Todo lo que hagas con
  `npm run dev` (búsquedas que cachean catálogo, usuarios de prueba, imports) escribe **solo**
  en dev.

- **Local desechable** — Docker + Supabase CLI 2.116.0 + Node 22. El esquema completo se
  reconstruye desde cero sin acceder a los proyectos remotos. Receta y limpieza en
  [Pruebas con Supabase local](docs/testing/supabase-local.md).

El desarrollo habitual sigue apuntando a dev remoto; sus latencias condicionan los timeouts
(ver [Trampas](docs/TRAMPAS.md)). El entorno desechable usa variables de proceso locales y no
necesita sobrescribir `.env.local`.

**Regla de migraciones:** primero en dev, se verifica, y después en producción. Añadir cada
SQL a `supabase/bootstrap/manifest.json` en orden de dependencias y ejecutar `npm run db:baseline`.
El generador rechaza migraciones omitidas o duplicadas. `schema-baseline.sql` es una entrada
generada para **psql**, con inclusiones relativas, no un bloque pegable en el SQL editor.
Solo sirve para una base Supabase vacía; nunca para actualizar un proyecto existente.

## Android (Capacitor)

El wrapper carga `server.url` apuntando a la URL de producción, así que las sesiones nativas
se mezclan con las de web en las métricas. El escáner de ISBN (ML Kit) **solo existe en
nativo** — en el navegador ese control no se pinta.
