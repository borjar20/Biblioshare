# Biblioshare — Requisitos y alcance

Última actualización: 2026-07-07

## 1. Visión

Una PWA para llevar el registro de tus "hobbies de consumo cultural": libros, películas y series. Para cada uno se guardan metadatos (autor, sinopsis, portada...) y tu progreso/estado personal (leyendo, terminado, valoración...). Cada usuario tiene un perfil público donde otros pueden ver su colección.

Pensar en ello como un Goodreads + Letterboxd + trackers de series, unificado, con estética visual centrada en portadas.

## 2. Usuarios y cuentas

- Multi-usuario: cualquiera puede registrarse (Supabase Auth).
- Cada usuario tiene un **perfil público** en `/u/[username]`:
  - Visible por defecto a cualquier visitante (con o sin cuenta).
  - El propio usuario puede marcar su perfil como **privado** (solo él ve su colección/progreso).
- **Fuera de alcance del MVP**: seguir a otros usuarios, feed de actividad, notificaciones sociales, comentarios. Se revisita en v2 (ver §7).

## 3. Modelo de datos

Arquitectura elegida: **"columna vertebral compartida"**. El metadata (que varía mucho por
tipo) vive en tablas separadas y tipadas; el progreso del usuario (casi idéntico entre tipos)
vive en una única tabla `library_entries`. Así, **añadir un hobby nuevo = 1 tabla de metadata +
su integración de API**, reutilizando el mismo RLS, la misma query de "mi biblioteca" y la misma
UI de progreso. Ver §8 (decisiones) para el razonamiento.

### 3.1 Catálogo (compartido entre usuarios) — *creado*
Tablas `books`, `movies`, `series`.
- Metadatos propios de cada tipo (autor/director/creador, portada, sinopsis, año, género...).
- Se rellenan automáticamente vía búsqueda en APIs externas (ver §4.2) y se comparten entre todos los usuarios (evita duplicar/re-consultar la misma película dos veces).
- `SELECT` abierto a cualquiera (incl. visitantes sin cuenta) — necesario para renderizar perfiles públicos; son metadatos públicos no sensibles.
- `INSERT` restringido a usuarios autenticados (al trackear algo se añade el ítem al catálogo si no existe).

### 3.2 Progreso unificado — *creado*
Tabla única `library_entries` (una fila por `usuario` × `ítem de catálogo`):
- `item_type` (`book` | `movie` | `series`, **extensible**) + `item_id` → referencia polimórfica al catálogo.
- `status`: `planned` | `in_progress` | `completed` | `dropped`.
- `rating` 1–10, `started_at`, `finished_at`, `notes` — comunes y tipados.
- `position` (JSONB): el único detalle que varía por tipo. Ej: `{"page": 42}` (libros), `{"season": 2, "episode": 5}` (series). La app valida su forma con los tipos de TypeScript.
- RLS: el dueño ve/edita sus filas; cualquiera (incl. anónimo) puede **leer** las filas de un perfil público. Escritura solo el dueño.
- Trade-off aceptado: los detalles finos de `position` no se validan a nivel de BD (viven en JSONB), a cambio de eliminar la deuda de replicar toda la vertical por cada tipo nuevo.

### 3.3 Diario de pases (relecturas / re-visionados) — *creado*
Tabla `diary_entries` (muchas filas por `library_entry`):
- `library_entry_id` → FK al ítem de la estantería (borrado en cascada).
- `started_on`, `finished_on` (fecha del pase), `rating` (de ese pase), `review` (reseña de ese pase).
- Permite registrar leer/ver el mismo ítem varias veces con sus propias fechas y valoraciones (estilo diario de Letterboxd).
- Separación clave: `library_entries` = **estado actual** del ítem; `diary_entries` = **historial de pases**. Añadir el diario después con datos reales habría sido una migración dolorosa, por eso se modela desde el MVP.
- RLS: mismo modelo que `library_entries` (dueño escribe; lectura pública si el perfil lo es).

### 3.4 Perfiles — *creado*
Tabla `profiles`:
- `user_id` (FK a `auth.users`, PK)
- `username` (único, `^[a-z0-9_]{3,30}$`, usado en la URL pública; **modificable** después, con unicidad garantizada)
- `display_name`, `avatar_url`, `bio`
- `is_public` (boolean, default `true`)
- `created_at`, `updated_at`
- RLS: perfiles públicos legibles por cualquiera (incl. anónimo); el dueño siempre ve el suyo. Solo el dueño inserta/edita.

## 4. Funcionalidades del MVP

### 4.1 Autenticación
- Registro / login (email+contraseña; valorar login social como Google más adelante).
- Cada usuario elige un `username` único al registrarse (o en onboarding posterior).

### 4.2 Añadir ítems a tu colección
- Buscador que consulta:
  - **Google Books API** para libros.
  - **TMDB API** para películas y series.
- Al seleccionar un resultado: se guarda (o reutiliza si ya existe) en la tabla de catálogo correspondiente, y se crea una fila de progreso para el usuario actual con estado inicial `planned`.
- También debe poder añadirse un ítem manualmente (sin encontrarlo en la API).

### 4.3 Gestión de la colección personal
- Listado de "mi colección" con filtros por tipo (libro/película/serie) y por estado.
- Editar el estado del ítem: estado, rating actual, página/episodio actual (`position`), notas.
- **Registrar un pase en el diario**: al terminar (o re-leer/re-ver) un ítem, se crea una entrada de diario con fecha, rating y reseña propios. Un ítem puede acumular varios pases.
- Eliminar un ítem de tu colección (no borra el catálogo compartido, solo tu fila de estantería y sus entradas de diario).

### 4.4 Perfil público
- Página `/u/[username]` mostrando la colección del usuario (si `is_public`), agrupada/filtrable por tipo y estado.
- Visible para **cualquier visitante, con o sin cuenta** (si el perfil es público).
- Si el perfil es privado, solo el propio usuario (autenticado) puede verlo.

### 4.5 PWA
- Instalable (manifest + iconos + `display: standalone`).
- **Offline**: cache de solo lectura vía service worker — se puede navegar la colección ya cargada sin conexión. Añadir/editar requiere conexión (no hay cola de sincronización offline en el MVP).

### 4.6 Estética visual
- Grids de portadas grandes, estilo Letterboxd/Goodreads — el contenido visual (portada) es el protagonista de las listas, no tablas de texto.

### 4.7 Internacionalización (i18n)
- Toda la UI pasa por un sistema de traducción desde el primer componente (nada de textos hardcodeados).
- Idioma inicial: español. La arquitectura permite añadir inglés u otros después sin refactor.

## 5. Explícitamente fuera de alcance del MVP

Estas ideas se guardan para una v2, no se implementan ahora:

- Seguir usuarios / feed de actividad social / notificaciones.
- Dashboard de estadísticas (libros por mes, horas vistas, géneros favoritos, gráficos).
- Offline-first con edición sin conexión y sincronización posterior.
- Apps nativas (React Native u otro) — se decidió PWA-only.
- Recomendaciones (colaborativas o por IA).
- Comentarios / reseñas largas en ítems.
- Listas personalizadas (ej. "mis 10 favoritos de 2026").

## 6. Tareas técnicas pendientes derivadas de este documento

- [x] Migración: crear tabla `profiles` (con `username` único, `is_public`).
- [x] Migración: modelo de progreso unificado `library_entries` con RLS de lectura pública según `profiles.is_public`.
- [x] Migración: `diary_entries` para relecturas/re-visionados.
- [x] Elegir e integrar librería de i18n para App Router (`next-intl`).
- [x] Definir clave de TMDB API (variable de entorno, no comprometida en el repo).
- [x] Diseñar el service worker / estrategia de cache para el modo offline de solo lectura.
- [x] Definir flujo de onboarding (elección de `username` tras el primer login).
- [x] Página de perfil público `/u/[username]` con toggle de visibilidad público/privado.
- [ ] Definir helpers/tipos de la capa de dominio para `position` (JSONB) por tipo de ítem.
- [ ] UI del diario de pases (relecturas/re-visionados) — el esquema ya existe.

## 7. Backlog / ideas para v2 (no comprometidas)

- Sistema de seguidores + feed de actividad.
- Estadísticas y gráficos de hábitos.
- Offline-first completo.
- Listas curadas y colecciones temáticas.
- Integración con más fuentes (videojuegos vía IGDB, música, etc.) — encaja con la idea original de "biblioteca de tus hobbies".

## 8. Decisiones registradas

| Fecha | Decisión | Motivo |
|-------|----------|--------|
| 2026-07-07 | Stack: Next.js 16 (App Router) + TypeScript + Tailwind, Supabase (Postgres+Auth), PWA (no apps nativas) | Simplicidad, un solo codebase, sin gestionar backend propio |
| 2026-07-07 | Metadata en tablas separadas por tipo; **progreso unificado** en `library_entries` con `position` JSONB | Minimizar la deuda al añadir nuevos hobbies (norte del proyecto): añadir un tipo no obliga a replicar tabla de progreso + RLS + query + UI |
| 2026-07-07 | `username` modificable (no fijo), con unicidad garantizada | Flexibilidad para el usuario; el coste de validar unicidad en cada cambio es bajo |
| 2026-07-07 | Perfiles públicos legibles también por visitantes sin cuenta | Coherente con la idea de "ver bibliotecas de otros" sin obligar a registrarse para mirar |
| 2026-07-07 | "Añadir manualmente" un ítem es must del MVP | Desacopla la app de que la API externa tenga o no el título; coste bajo al estar el esquema listo |
| 2026-07-07 | Diario de pases (`diary_entries`) desde el MVP, separado del estado del ítem | Soporta relecturas/re-visionados (estilo Letterboxd); modelarlo después sobre datos reales sería una migración dolorosa |
| 2026-07-07 | i18n cableado desde el inicio (idioma inicial: español) | Evita el refactor tedioso de extraer textos hardcodeados más adelante para soportar otros idiomas |
| 2026-07-07 | Catálogo compartido entre usuarios, progreso privado por usuario | Evita duplicar metadatos al buscar el mismo libro/película varias veces |
| 2026-07-07 | Perfiles públicos por defecto, con opción de hacerlos privados | Habilita la función social mínima (ver bibliotecas de otros) sin construir todo el sistema social completo |
| 2026-07-07 | Offline MVP = cache de solo lectura, no offline-first completo | Reduce complejidad de sincronización manteniendo el beneficio principal de una PWA instalable |
