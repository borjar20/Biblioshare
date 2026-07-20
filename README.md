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

| Doc | Para qué |
|---|---|
| [**Arquitectura**](docs/ARQUITECTURA.md) | Cómo encaja todo: rutas, capas, flujo de datos, mapa de módulos |
| [**Modelo de datos**](docs/requirements/data-model.md) | **Canónico** para el esquema. Verificado contra prod |
| [**Trampas conocidas**](docs/TRAMPAS.md) | Lo que ya ha costado horas. **Léelo antes de depurar algo raro** |
| [Requisitos y alcance](docs/REQUIREMENTS.md) | Visión, requisitos y backlog por secciones |
| [Testing](docs/TESTING.md) | Cómo se verifica |
| [Fidelidad Paper](docs/redesign/README.md) | Iniciativa de rediseño, plan por pestaña |

`docs/superpowers/plans/` y `specs/` son **registro histórico**: uno por feature, fechado y
congelado en el momento en que se hizo. No se mantienen al día — sirven para entender *por
qué* algo es como es, no *cómo* está hoy. Si contradicen a los docs de la tabla, mandan
estos.

## Entornos (Supabase)

Dos proyectos separados:

- **Producción** — lo usa el deploy de Vercel (variables configuradas allí).
- **Dev** — lo usa el desarrollo local; `.env.local` apunta aquí. Todo lo que hagas con
  `npm run dev` (búsquedas que cachean catálogo, usuarios de prueba, imports) escribe **solo**
  en dev.

⚠️ **Supabase es remoto también en desarrollo.** No hay stack local: la latencia media es de
~240 ms por consulta, con picos de más de 1 s. Eso condiciona los timeouts de los tests y es
la causa habitual de e2e "flaky" — ver [Trampas](docs/TRAMPAS.md).

Para (re)crear el proyecto dev desde cero:

1. Crear un proyecto nuevo en [supabase.com](https://supabase.com) (plan free).
2. Aplicar [`supabase/schema-baseline.sql`](supabase/schema-baseline.sql) en el SQL editor —
   es el replay ordenado de las migraciones de producción.
3. Copiar URL y anon key a `.env.local`.
4. Crear el usuario de prueba (`TEST_USER_*` de `.env.example`) vía `/signup` + onboarding.

**Regla de migraciones:** primero en dev, se verifica, y después en producción. Y anexarla a
`schema-baseline.sql` **en el orden de aplicación real de prod**, no en orden alfabético.

## Android (Capacitor)

El wrapper carga `server.url` apuntando a la URL de producción, así que las sesiones nativas
se mezclan con las de web en las métricas. El escáner de ISBN (ML Kit) **solo existe en
nativo** — en el navegador ese control no se pinta.
