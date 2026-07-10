# MVP: funcionalidades, alcance e historial

> Parte de [Requisitos y alcance](../REQUIREMENTS.md). Secciones §4, §5, §6 y §10.
>
> El MVP se cerró como **v1.0** el 2026-07-08. A partir de ahí el desarrollo continúa sobre el [backlog pendiente](./backlog-pending.md).

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

Estas ideas se guardan para una v2, no se implementan ahora (varias ya construidas después; ver [backlog hecho](./backlog-done.md)):

- Seguir usuarios / feed de actividad social / notificaciones.
- Dashboard de estadísticas (libros por mes, horas vistas, géneros favoritos, gráficos).
- Offline-first con edición sin conexión y sincronización posterior.
- Apps nativas (React Native u otro) — se decidió PWA-only.
- Recomendaciones (colaborativas o por IA).
- Comentarios / reseñas largas en ítems.
- Listas personalizadas (ej. "mis 10 favoritos de 2026").

## 6. Tareas técnicas pendientes derivadas de este documento

Checklist del MVP — **completo al 100%** (cerró la v1.0).

- [x] Migración: crear tabla `profiles` (con `username` único, `is_public`).
- [x] Migración: modelo de progreso unificado `library_entries` con RLS de lectura pública según `profiles.is_public`.
- [x] Migración: `diary_entries` para relecturas/re-visionados.
- [x] Elegir e integrar librería de i18n para App Router (`next-intl`).
- [x] Definir clave de TMDB API (variable de entorno, no comprometida en el repo).
- [x] Diseñar el service worker / estrategia de cache para el modo offline de solo lectura.
- [x] Definir flujo de onboarding (elección de `username` tras el primer login).
- [x] Página de perfil público `/u/[username]` con toggle de visibilidad público/privado.
- [x] Definir helpers/tipos de la capa de dominio para `position` (JSONB) por tipo de ítem, con UI de edición de rating/progreso/notas en "Mi biblioteca".
- [x] UI del diario de pases (relecturas/re-visionados) en "Mi biblioteca".
- [x] Flujo de "añadir ítem manualmente" (`/buscar/manual`) sin depender de la API externa — cierra §4.2.

## 10. Historial de versiones

### v1.0 — 2026-07-08 — MVP completo
Todas las funcionalidades de §4 implementadas y verificadas manualmente (navegador + limpieza de datos de prueba):
- Autenticación (registro, login, onboarding de `username`).
- Añadir ítems: búsqueda (Google Books + TMDB, con modo mock para desarrollo) **y** añadido manual (`/buscar/manual`).
- Gestión de la colección: estado, rating, progreso (`position` tipado por tipo de ítem), notas, diario de pases.
- Perfil público `/u/[username]` con toggle de visibilidad.
- PWA instalable con cache de solo lectura offline.
- i18n cableado desde el inicio (español).
- Estética visual con grids de portadas.

A partir de aquí, el desarrollo continúa sobre el backlog de tareas pendientes: ver [backlog pendiente](./backlog-pending.md) y [backlog hecho](./backlog-done.md).
