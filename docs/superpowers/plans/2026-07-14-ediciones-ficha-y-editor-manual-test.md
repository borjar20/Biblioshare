# Checklist manual — Ediciones en la ficha y editor de ficha oficial

Cubre el diseño de `docs/superpowers/specs/2026-07-14-ediciones-ficha-y-editor-design.md`:
el panel de metadatos deja de mentir (ya no pinta datos de una tirada como si fueran de la
obra), las ediciones reales se importan de OpenLibrary al abrir la ficha, y colaborador+ tiene
un editor de ficha oficial (título, sinopsis, géneros, portada, ediciones, sagas). El proyecto
no usa E2E automático (`docs/TESTING.md`): este documento lo ejecuta una persona en su
navegador.

## 0. Preparación

```bash
npm run dev
```

⚠️ **Migraciones aplicadas solo en dev, pendientes en prod**: `20260714_editions_sync.sql`,
`20260714_editions_sync_rls.sql`, `20260714_covers_bucket.sql`,
`20260714_edition_delete_guard.sql`, `20260714_catalog_edit_grants.sql`. Ejecuta este checklist
contra el proyecto **dev**, no contra producción.

Login con la cuenta de pruebas `devtest` (credenciales en `.env.local`:
`TEST_USER_EMAIL`/`TEST_USER_PASSWORD`/`TEST_USER_USERNAME`).

**Rol necesario para los puntos 6, 7 y 9** (editar la ficha exige colaborador+, §7.35):

```sql
select username, role from profiles where username = 'devtest';
update profiles set role = 'collaborator' where username = 'devtest';
```

El cambio de rol se lee en cada request (no hace falta volver a loguearse), pero sí recarga la
página tras aplicarlo. Recuerda devolver el rol a `user` en la limpieza final si lo cambiaste
(a menos que `devtest` ya fuera collaborator/admin de antes) — lo necesitas también en `user`
para el punto 8.

**Candidato para el punto 3-c ("un libro viejo sin work key")**: antes de empezar, busca uno en
tu catálogo de dev que se añadiera antes de esta feature (por SQL):

```sql
select id, title, isbn, openlibrary_work_key, editions_synced_at
from books
where openlibrary_work_key is null and isbn is not null
limit 10;
```

Si no sale ninguno, cualquier libro con `editions_synced_at is null` sirve para el punto 3-a;
para el 3-c en concreto necesitas uno con `openlibrary_work_key is null` e `isbn` real, así que
si la consulta no devuelve nada añade uno manualmente por ISBN (`/buscar/manual`) y ponle tú
mismo `google_books_id` con un ID de Google Books (no un `/works/...`) para simular una alta
antigua, o simplemente usa uno que ya tuvieras de antes de julio de 2026.

---

## 1. El panel de la obra ya no muestra editorial, ISBN ni páginas

**Qué hacer**: abre la ficha de cualquier libro con edición(es) conocidas (`/libro/[id]`),
pestaña **Información**, sin pulsar ninguna tarjeta de la tira de ediciones.

**Qué debe verse**:
- El panel bajo la sinopsis solo muestra **autoría** (enlazada a su ficha de persona si se
  resolvió), **año de primera publicación** y **géneros** — nada de editorial, ISBN, páginas ni
  idioma.
- Repite en una **película**: el panel de obra tampoco muestra duración (esa es de la versión);
  en **serie** no hay cambio (nunca tuvo ediciones).

---

## 2. Pulsar una edición muestra sus datos; el registro personal NO cambia

**Qué hacer**: en la misma ficha, con al menos dos ediciones en la tira, pulsa una que **no**
sea la marcada "La tuya" (si el libro no está en tu biblioteca o no tiene pase abierto, ninguna
llevará el check — pulsa cualquiera).

**Qué debe verse**:
- El panel bajo la sinopsis cambia a los datos de **esa** edición: etiqueta, editorial, año de
  la tirada, idioma, páginas, ISBN, y su propia portada si la tiene (imagen distinta a la de la
  obra).
- Si el libro tiene un pase abierto con una edición asignada (ver punto 4), la tarjeta marcada
  ✓ **"La tuya"** en la tira **sigue siendo la del pase** aunque estés mirando otra — pulsar para
  mirar no la mueve.
- Pulsa **"Volver a la obra"**: el panel vuelve a mostrar autoría/año/géneros de la obra (punto
  1), no los de la última edición mirada.
- Comprueba también que el registro no cambió: abre la pestaña **Mi registro** — el progreso, la
  nota y la edición del pase (si tenías uno) son los mismos que antes de curiosear.

---

## 3. Ediciones reales de OpenLibrary al abrir la ficha

**Qué hacer** (tres casos, cada uno con un libro distinto):

**a) Uno famoso, recién añadido** (que no tuvieras ya en el catálogo de dev): añádelo desde
`/buscar`, abre su ficha por primera vez.

**Qué debe verse**: la tira de ediciones (pestaña Información) aparece con varias ediciones
reales — editorial y año con sentido, mayoría en español si es un clásico en español (verifica
que no sean 20 tiradas casi idénticas en inglés de "Independently Published"/"CreateSpace" — si
las ves, el filtro de impresión bajo demanda no está funcionando). Por SQL:

```sql
select id, openlibrary_work_key, editions_synced_at from books where id = '<book_id>';
-- editions_synced_at debe tener un timestamp reciente.
select count(*) from book_editions where book_id = '<book_id>';
-- debe haber más de una.
```

**b) Uno oscuro, sin ediciones catalogadas en OpenLibrary**: añade un libro real pero muy poco
conocido, abre su ficha por primera vez.

**Qué debe verse**: la ficha se pinta con normalidad (sin errores, sin quedarse cargando). Puede
que la tira de ediciones no aparezca o solo muestre la primaria (backfill). Por SQL:

```sql
select openlibrary_work_key, editions_synced_at from books where id = '<book_id>';
-- editions_synced_at SÍ debe tener timestamp, aunque no se importara ninguna edición nueva.
```

**c) Uno viejo, sin `openlibrary_work_key`** (el candidato que buscaste en la preparación): abre
su ficha por primera vez desde este cambio.

**Qué debe verse**: la ficha no se rompe. Por SQL, tras la visita:

```sql
select openlibrary_work_key, editions_synced_at from books where id = '<book_id>';
```

- Si el ISBN se pudo resolver contra OpenLibrary, `openlibrary_work_key` queda relleno y pueden
  haber aparecido ediciones nuevas.
- Si no se pudo resolver, `openlibrary_work_key` sigue en null pero `editions_synced_at` SÍ tiene
  timestamp (se marcó igualmente, para no repetir el intento en cada visita).

**Recargar NO vuelve a llamar a la API**: anota el valor exacto de `editions_synced_at` de
cualquiera de los tres libros de arriba, **recarga la ficha (F5)** y vuelve a consultarlo por
SQL — debe ser **exactamente el mismo timestamp**, no uno nuevo.

---

## 4. Seguir un libro con varias ediciones: se pregunta cuál tienes

**Qué hacer**: elige un libro con dos o más ediciones (el del punto 3-a sirve) que **no** esté
ya en tu biblioteca, y pulsa **"Seguir"**.

**Qué debe verse**:
- Antes de añadirlo, aparece el panel "¿Qué edición tienes?" con una fila por edición y una
  salida **"No lo sé"** al final, con su explicación ("Tu progreso se medirá contra la edición
  principal...").
- Elige una edición concreta (no "No lo sé"). El libro se añade, queda en **Pendiente**.
- Comprueba por SQL que la elección **se descartó** (no hay pase todavía, así que no hay dónde
  guardarla):

```sql
select id, status from library_entries
where user_id = (select id from auth.users where email = '<TEST_USER_EMAIL>')
  and item_id = '<book_id>';
-- status debe ser 'planned'; no debe existir ningún diary_entries con library_entry_id de este.
```

- Pásalo a **Leyendo** (pestaña Mi registro). Como el pase se abre ahora, sin edición asignada
  todavía, la pregunta **vuelve a aparecer** en el panel Progreso (ver punto 5) — la elección
  del punto anterior no sobrevivió, tal como se esperaba.
- **No se repregunta al recargar**: si respondes "No lo sé" en el panel Progreso y recargas la
  página, la pregunta no debe reaparecer para ese mismo pase.

---

## 5. Empezar a leer: se pregunta en Progreso; "de 662" cambia a "de 880"

**Qué hacer**: usa un libro con al menos dos ediciones de páginas distintas (crea una segunda
edición a mano si hace falta — necesitas ser colaborador+, ver preparación — con etiqueta
"Bolsillo" y **880** páginas, dejando la primaria con menos, p. ej. 662). Sigue el libro, pásalo
a **Leyendo**, y en el panel **Progreso** registra o comprueba una página cualquiera (vía
`/sesion/[entryId]`, enlace bajo el panel).

**Qué debe verse**:
- Con el pase sin edición asignada, aparece la pregunta "¿Qué edición estás leyendo?" en el
  panel Progreso, con las mismas opciones y "No lo sé".
- Elige la edición primaria (662 páginas): la línea de progreso muestra "Voy por la página X de
  **662**".
- Cambia la edición del pase con el selector "Tu edición" a **"Bolsillo"**: sin recargar nada
  más, el total pasa a "Voy por la página X de **880**" — el total cambia con la edición, no con
  la página guardada.

---

## 6. Como colaborador: editar la ficha y subir una portada

**Qué hacer** (con `devtest` en `collaborator`, ver preparación): abre cualquier ficha de libro,
pestaña Información, pulsa **"Editar ficha"**.

**Qué debe verse**:
- El banner ámbar "Editando la ficha oficial · Los cambios se aplican para toda la comunidad"
  aparece arriba.
- Cambia el título, la sinopsis y añade/quita un género. Pulsa **"Guardar cambios"**: el editor
  se cierra, aparece "Ficha actualizada", y los cambios se ven en la ficha de lectura normal.
- Vuelve a abrir el editor y sube una **portada nueva** (JPEG/PNG/WebP normal, menor de 2 MB):
  la portada se previsualiza al instante y, tras guardar, persiste (recarga la página para
  confirmar que la URL pública ya sirve la nueva imagen).
- Intenta subir un fichero de **más de 2 MB** (puedes probar con un JPEG grande cualquiera, no
  hace falta que llegue a los 6 MB que menciona la tarea — el límite real del servidor son 2 MB):
  debe aparecer un **mensaje de error legible** bajo la portada, la preview debe **revertir** a
  la portada anterior, y el overlay de "subiendo…" **no debe quedarse colgado** — el botón de
  subir vuelve a estar disponible de inmediato.

---

## 7. Editar y borrar ediciones

**Qué hacer**: en el mismo editor de ficha (colaborador+), baja hasta la sección de
Ediciones/Versiones.

**Qué debe verse**:
- Pulsa el lápiz de una edición: se despliega el formulario con sus datos precargados. Cambia el
  nombre o las páginas y guarda — el desplegable se cierra y la tarjeta muestra el dato nuevo.
- Borra una edición que **no** tenga ningún pase registrado contra ella: desaparece sin error.
- Intenta borrar la edición contra la que tienes un pase **abierto ahora mismo** (o cualquiera
  con pases): debe aparecer el mensaje **"No se puede borrar: hay lecturas registradas contra
  esta edición"**, sin pantalla rota ni la edición desaparecida de la lista.

---

## 8. Como usuario normal: sin botón de editar

**Qué hacer**: baja el rol de `devtest` a `user` (`update profiles set role = 'user' where
username = 'devtest';`), recarga cualquier ficha de libro/película/serie, pestaña Información.

**Qué debe verse**: el botón **"Editar ficha"** no aparece en absoluto (ni siquiera
deshabilitado). La tira de ediciones tampoco muestra el botón "+ Añadir edición"/"+ Añadir
versión".

---

## 9. "Volver a buscar ediciones" trae las que falten

**Qué hacer**: vuelve a subir `devtest` a `collaborator`. Abre el editor de ficha de un libro que
ya tenga ediciones sincronizadas, pulsa **"Volver a buscar ediciones"**.

**Qué debe verse**:
- El botón muestra "Buscando…" mientras dura.
- Al terminar, por SQL, `editions_synced_at` tiene un timestamp **más reciente** que antes de
  pulsar el botón, y si había ediciones nuevas en OpenLibrary desde la última sincronización,
  aparecen en la lista sin duplicar las que ya existían (mismo `isbn` no se repite).

---

## Consultas SQL de comprobación

Contra el proyecto **dev**:

```sql
-- Sincronización de un libro: work key, marca de sincronización.
select id, title, openlibrary_work_key, editions_synced_at, isbn
from books where id = '<book_id>';

-- Ediciones registradas para un libro.
select id, label, publisher, published_year, language, total_pages, isbn, is_primary, created_by
from book_editions where book_id = '<book_id>' order by is_primary desc, published_year desc nulls last;

-- La edición elegida al seguir SIN pase abierto no debe haber quedado guardada en ningún sitio.
select id, status from library_entries where item_id = '<book_id>' and user_id = '<user_id>';

-- La edición del pase abierto (si eliges una en el panel Progreso).
select id, finished_on, edition_id from diary_entries
where library_entry_id = '<library_entry_id>' and finished_on is null;

-- Confirmar que borrar una edición en uso falla (ejecutar como devtest, debe dar ERROR):
delete from book_editions where id = '<edition_id_en_uso>';
-- Esperado: ERROR: edition_in_use

-- Rol de devtest en cada paso.
select username, role from profiles where username = 'devtest';
```

## Limpieza de datos de prueba

- Borra los libros añadidos solo para este checklist de la biblioteca de `devtest`
  (`library_entries`, `diary_entries`, `progress_sessions`, y las filas nuevas en `books`/
  `book_editions` que hayan quedado sueltas, incluidas las ediciones de prueba creadas a mano en
  el punto 5/7).
- Borra también cualquier portada de prueba subida al bucket `covers` en Storage que no
  quieras conservar (Storage → `covers` → busca por el `itemId` del libro/película usado).
- Si subiste el rol de `devtest` a `collaborator` y no lo era antes, revierte:
  `update profiles set role = 'user' where username = 'devtest';`.
- Deja `devtest.is_public = true` (su estado por defecto).
- No borres nunca la cuenta `devtest` en sí — es persistente para todo el proyecto
  (`docs/TESTING.md`).

## Si algo falla

Anota exactamente qué punto falló y qué viste en su lugar (captura de consola del navegador si
hay error) en vez de asumir que el comportamiento descrito es el que hay — se investiga desde
ahí.
