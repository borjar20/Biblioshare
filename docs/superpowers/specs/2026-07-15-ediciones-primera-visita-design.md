# Ediciones de libro en la primera visita (reactividad de la hidratación)

**Fecha:** 2026-07-15
**Estado:** Diseño aprobado, pendiente de plan de implementación
**Ámbito:** capa de catálogo/ediciones de libros; construye sobre [[busqueda-hidratacion-libros]] (escalera tarjeta→ficha→edición, PRs #34/#35).

## Problema

Al abrir por primera vez la ficha de un libro recién traído de la búsqueda (pulsando el resultado), la **sinopsis/info de la obra sí carga**, pero las **ediciones no aparecen salvo una "Edición principal" en blanco** (sin editorial, ISBN ni páginas). Las ediciones reales solo se ven al recargar / en la segunda visita.

## Diagnóstico (causa raíz)

Dos mecanismos se combinan mal:

1. **La fila `books` nace ligera.** Desde la búsqueda por texto, `findOrCreateCatalogItem` inserta a propósito solo `openlibrary_work_key, title, author, cover_url, published_year`. Editorial/ISBN/páginas se dejan "para la tirada" (son datos de edición, no de obra).

2. **El trigger `create_primary_book_edition`** (`AFTER INSERT on books`, migración `20260714_editions_b_primary.sql`) crea SIEMPRE una edición primaria copiando `new.publisher / new.total_pages / new.isbn`. Para un libro nacido ligero, todos son `null` → nace una **"Edición principal" en blanco** con solo etiqueta + año + portada, y como es `is_primary` se ordena la primera (`getEditions` hace `order by is_primary desc`).

3. **El sync de ediciones reales corre en `after()`.** En `libro/[id]/page.tsx`, `ensureBookEditions` se pospone con `after()` (Next 16) para no bloquear la ficha (puede tardar hasta ~10 s con 5 páginas de OpenLibrary + hasta 20 RPC). Por eso las ediciones reales no están en la primera respuesta: se ven en la siguiente visita.

Resultado de la primera visita: solo la edición primaria vacía. La sinopsis sí sale porque `openCatalogItem` la hidrata *antes* de redirigir (`ensureBookHydrated` awaited); a las ediciones no se les da ese trato.

**Confirmado seguro de tocar:** la ficha muestra editorial/páginas/ISBN desde las filas `book_editions` (ver comentario en `page.tsx:200-202`), NO desde `books.publisher/total_pages/isbn`. No hay trigger obra←edición (`20260714_editions_d_sync.sql` solo añade `openlibrary_work_key`/`editions_synced_at`). Así que eliminar la primaria en blanco no rompe la ficha; `ensure_primary_book_edition` (BEFORE INSERT) promueve la primera edición real a primaria.

## Diseño

Dos cambios independientes que juntos arreglan los dos síntomas.

### 1. No crear la edición primaria en blanco (BD)

- **Guardar `create_primary_book_edition`:** no insertar la primaria cuando `publisher`, `isbn` y `total_pages` vienen los tres vacíos (obra nacida ligera desde búsqueda). Cuando SÍ hay algún dato de tirada (escáner por ISBN, importador), se sigue creando como hasta ahora. Mismo criterio para `create_primary_movie_version` queda **fuera de alcance** (las versiones de película no tienen sync de una API equivalente; se revisa aparte si hace falta).
- **Limpieza de las que ya existen** (dev y prod): borrar las `book_editions` con `is_primary` y `publisher/isbn/total_pages` los tres nulos. Si el libro tiene además ediciones reales, promover la mejor (más reciente con datos) a `is_primary` antes/después de borrar, respetando el índice único parcial `(book_id) where is_primary`.
- Migración nueva (`2026xxxx_*`), dev primero y luego prod, siguiendo la disciplina de [[supabase-environments]].

### 2. Ediciones reactivas por streaming (app)

- Extraer un **componente servidor `async`** para el bloque de ediciones (p.ej. `EditionsPanel`) que: si hay sesión y `editions_synced_at` es null, hace el sync **acotado a la primera página** de OpenLibrary + `getEditions`, y renderiza `EditionsSection` con el resultado.
- Envolverlo en `<Suspense fallback={<EditionsLoading/>}>` en `libro/[id]/page.tsx`. La ficha (hero, sinopsis, tabs, metadatos) pinta al instante; las ediciones **entran por streaming en la MISMA petición** cuando el sync de la primera página termina. Sin recarga, sin poll, sin segunda visita, sin edición en blanco.
- **Visitas siguientes:** `editions_synced_at` puesto → el ensure corta → `getEditions` devuelve las filas al momento → Suspense resuelve sin fallback.
- **Cola larga:** las páginas 2-5 de ediciones (el resto del catálogo de tiradas) pueden seguir en `after()` para no alargar el streaming; se ven completas en una visita posterior. La primera página (la que importa) llega reactiva ya.
- **Anónimos:** sin sesión no se sincroniza (la RPC exige `auth.uid()`), igual que hoy: el panel solo lee lo que haya. Sin fallback infinito.
- Escribir en BD durante el render ya es patrón del proyecto aquí (`ensureItemEnriched` se hace `await` en el render de `page.tsx`); Suspense solo aísla el coste del sync a su propio boundary en vez de bloquear la página entera — que era el único motivo por el que se movió a `after()`.

### 3. Verificación (E2E)

- Extender `e2e/busqueda-hidratacion.spec.ts`: pulsar un resultado de búsqueda nuevo (obra que no estaba en el catálogo) → en la **primera** visita a su ficha aparecen ediciones reales (por streaming) y **no** existe una "Edición principal" en blanco. Aserción de BD con service key: no hay `book_editions` primaria con los tres campos vacíos.
- Node 22 para el runner (ver [[node-y-vitest]]). Probar contra OpenLibrary real, como el resto del spec.

## Fuera de alcance

- `create_primary_movie_version` (películas): mismo patrón de trigger pero sin sync de API de versiones; se evalúa por separado.
- Rediseño de la sección de ediciones o del panel de detalle.
- Cambiar el modelo obra/edición o la escalera de hidratación de la sinopsis (funciona).
- `addToLibrary` (añadir sin abrir): queda con el comportamiento actual (la ficha sincroniza al abrirse); el arreglo de la primaria en blanco también lo beneficia.

## Riesgos y notas

- **Migración de limpieza:** promover una edición real a primaria al borrar la blanca debe respetar el índice único parcial `book_editions (book_id) where is_primary`; hacerlo en una transacción por libro.
- **Coste del streaming:** acotar el sync en streaming a la primera página mantiene el fallback corto; si aun así se nota, el fallback (`EditionsLoading`) cubre la espera sin bloquear el resto.
- **Datos reales:** probar el sync contra OpenLibrary real antes de darlo por bueno — lección repetida de [[busqueda-hidratacion-libros]] (los bugs de datos externos no salen en tests sintéticos).
