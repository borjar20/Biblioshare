# Visión y alcance — Biblioshare

> **[Canónico · estable]** Extraído de `REQUIREMENTS.md` §1–5 el 2026-07-20.
> Para el **esquema** manda [`data-model.md`](./data-model.md); para el **estado de
> funcionalidades** manda [`backlog.md`](./backlog.md); para el **porqué de las decisiones**,
> [`decisiones.md`](./decisiones.md). Donde otro doc contradiga la visión, manda este.

## 1. Visión

Una PWA para llevar el registro de tus "hobbies de consumo cultural": libros, películas y
series. Para cada ítem se guardan metadatos (autor, sinopsis, portada…) y tu progreso/estado
personal (leyendo, terminado, valoración…). Cada usuario tiene un perfil público donde otros
pueden ver su colección.

Piénsalo como un **Goodreads + Letterboxd + tracker de series**, unificado, con estética
visual centrada en portadas.

## 2. Usuarios y cuentas

- Multi-usuario: cualquiera puede registrarse (Supabase Auth).
- Cada usuario tiene un **perfil público** en `/u/[username]`, visible por defecto a cualquier
  visitante (con o sin cuenta). El dueño puede marcarlo **privado**.
- **Roles** (`user < collaborator < admin`): contribuir al catálogo (alta manual, editar
  ficha, curar sagas) es `collaborator+`; `admin` gestiona roles. Ver `data-model.md` §8.

## 3. Modelo de datos (resumen)

Arquitectura **"columna vertebral compartida"**: los metadatos viven en tablas por tipo
(`books`/`movies`/`series`) y todo lo del usuario es polimórfico vía `(item_type, item_id)`.
Añadir un hobby nuevo = 1 tabla de metadata + su integración de API.

> El detalle canónico y actualizado del esquema vive en [`data-model.md`](./data-model.md).
> **No dupliques el esquema aquí.** En particular: el estado vivo del usuario está en `passes`
> (no en `library_entries`, congelada).

## 4. Funcionalidades del MVP (v1.0, cerrado 2026-07-08)

- **Autenticación**: registro/login (email+contraseña), elección de `username`.
- **Añadir ítems**: búsqueda (OpenLibrary/TMDB) + alta manual (`/buscar/manual`).
- **Colección personal**: estado, valoración, progreso, notas, diario de pases.
- **Perfil público** `/u/[username]` con toggle de visibilidad.
- **PWA** instalable con cache de solo lectura offline.
- **i18n** cableado desde el inicio (español).
- **Estética** de grids de portadas.

## 5. Fuera de alcance del MVP

Guardadas para más adelante (ver estado real en [`backlog.md`](./backlog.md), muchas ya
construidas después del MVP): recomendaciones por IA, offline-first con edición sin conexión,
apps nativas más allá del wrapper Capacitor, y features sociales que en su día fueron v2 y hoy
existen (seguidores, feed, clubes).

---

*El backlog post-MVP y su estado (hecho/pendiente) vive en [`backlog.md`](./backlog.md). La
narrativa de "cómo se construyó cada cosa" vive en `docs/superpowers/specs/` y `plans/`
(historia, no se mantiene al día).*
