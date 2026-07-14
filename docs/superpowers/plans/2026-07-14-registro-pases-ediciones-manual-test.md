# Checklist manual — Registro de pases y ediciones

Cubre el diseño de `docs/superpowers/specs/2026-07-14-registro-pases-ediciones-design.md`:
`diary_entries` como "pase" (una lectura/visionado, con nota y reseña propias),
ediciones de libro/película, cronómetro de sesión y comunidad agregando desde
pases. El proyecto no usa E2E automático (`docs/TESTING.md`): este documento lo
ejecuta una persona en su navegador.

## 0. Preparación

```bash
npm run dev
```

⚠️ **Migraciones aplicadas solo en dev, pendientes en prod**: todas las de
`supabase/migrations/20260714_editions*.sql` y `20260714_passes*.sql`. Ejecuta
este checklist contra el proyecto **dev** (`tyvzpuhxfwxrnkcpzxyg`), no contra
producción.

Login con la cuenta de pruebas `devtest` (credenciales en `.env.local`:
`TEST_USER_EMAIL`/`TEST_USER_PASSWORD`/`TEST_USER_USERNAME`).

**Rol necesario para el punto 6** (añadir una segunda edición a mano exige
colaborador+, §7.35): comprueba el rol de `devtest` y, si es `user`, súbelo
temporalmente:

```sql
select username, role from profiles where username = 'devtest';
update profiles set role = 'collaborator' where username = 'devtest';
```

Recuerda devolverlo a `user` en la limpieza final si lo cambiaste (a menos que
ya fuera collaborator/admin de antes).

Necesitarás también un **segundo usuario desechable** para el punto 11
(comprobar que una reseña privada no aparece en el feed de un seguidor) — el
patrón habitual de `docs/TESTING.md`: `signup` → username único → seguir a
`devtest` → probar → borrar la cuenta entera al terminar.

---

## 1. Libro: Pendiente → Leyendo abre pase

**Qué hacer**: añade un libro nuevo a tu biblioteca (búsqueda o manual) —
queda en Pendiente. Ábrelo, pestaña **Mi registro**, y en el segmented control
de estado pulsa **Leyendo**.

**Qué debe verse**:
- El estado pasa a "Leyendo" sin más diálogo (el ciclo de libro va por
  "viendo" antes de completarse, a diferencia de película).
- Aparece el panel **Progreso** (solo existe con un pase abierto): estrellas
  sin puntuar y, si ya tienes una página guardada, "Voy por la página X de Y".
- Baja a la sección **Diario**: la tarjeta del pase en curso muestra **"En
  curso"** en vez de una fecha de fin.

---

## 2. Libro: Leyendo → Leído abre la hoja de cierre; 4,5★ y reseña pública

**Qué hacer**: con el mismo libro en Leyendo, pulsa **Leído** en el segmented
control. En la hoja "¿Qué te ha parecido?" que se abre: deja la fecha de hoy,
puntúa **4,5 estrellas** (la estrella 5 marcada hasta la mitad), escribe una
reseña de una línea, deja el interruptor **"Visible para la comunidad"**
activado (lo está por defecto) y pulsa **Guardar**.

**Qué debe verse**:
- El estado pasa a "Leído" y la hoja se cierra.
- El diario muestra el pase cerrado con 4,5 estrellas, la fecha de hoy y tu
  reseña.
- Ve a la pestaña **Comunidad** del mismo libro: tu reseña aparece en la
  lista, con un **chip de edición** junto a la fecha (la edición primaria del
  libro, salvo que hubieras elegido otra en el panel Progreso).

---

## 3. "Ahora no" en la hoja de cierre

**Qué hacer**: añade otro libro (o película) distinto, márcalo Leído/Vista
para que se abra la hoja de cierre, y esta vez pulsa **"Ahora no"** sin
rellenar nada.

**Qué debe verse**:
- La hoja se cierra sin pedir confirmación.
- El diario ya muestra el pase **cerrado** (con fecha de hoy), sin nota ni
  reseña — "Ahora no" no descarta el pase, solo la nota.
- En la tarjeta de ese pase en el diario, pulsa **"Editar"**: se abre un
  formulario inline con fecha/estrellas/reseña/visibilidad. Rellénalo y
  guarda — comprueba que la tarjeta se actualiza con la nota que acabas de
  añadir.

---

## 4. Película: Pendiente → Vista en un solo gesto

**Qué hacer**: añade una película nueva (queda Pendiente). En **Mi registro**,
pulsa directamente **Vista** en el segmented control (sin pasar por
"Viendo").

**Qué debe verse**:
- Se abre la misma hoja de cierre "¿Qué te ha parecido?" que en el punto 2 —
  para película es toda la interacción, no hay paso intermedio.
- Guarda con una nota cualquiera. El diario de la película muestra **un solo
  pase**, ya cerrado con la fecha de hoy (no dos pases, ni un pase "abierto"
  fantasma) — comprueba que no quedó ningún pase con "En curso".

---

## 5. Relectura: 2.º pase abre al volver a Leyendo; 5★ y delta

**Qué hacer**: sobre el libro del punto 2 (ya Leído con 4,5★), vuelve a pulsar
**Leyendo** en el segmented control. Luego márcalo **Leído** otra vez y, en la
hoja de cierre, puntúa **5 estrellas**.

**Qué debe verse**:
- Al volver a "Leyendo" se abre un **segundo pase** (el diario pasará a tener
  dos tarjetas cuando cierres este).
- Tras guardar el cierre con 5★, la tarjeta del pase nuevo (arriba del todo,
  el diario lista del más reciente al más antiguo) muestra el chip verde
  **"▲ +0,5★ vs. anterior"** (diferencia entre 5★ y las 4,5★ del pase
  anterior).

---

## 6. Dos ediciones: un pase contra cada una, chip distinto en el diario

**Qué hacer** (usa un libro nuevo para no mezclar con los pases de arriba):
1. Añádelo a tu biblioteca (esto crea o reutiliza su edición primaria).
2. Pestaña **Información** → tira de ediciones → **"+ Añadir edición"**
   (visible solo si `devtest` es collaborator+, ver preparación). Crea una
   segunda con etiqueta "Bolsillo" y páginas **880**.
3. En **Mi registro**, pásalo a Leyendo. En el panel Progreso, usa el
   selector **"Tu edición"** para elegir la edición primaria (o déjala si ya
   está). Márcalo Leído (cierra el pase 1).
4. Vuelve a Leyendo (2.º pase). Esta vez, en Progreso, elige la edición
   **"Bolsillo"**. Márcalo Leído otra vez (cierra el pase 2).

**Qué debe verse**:
- El diario tiene dos tarjetas, cada una con su **propio chip de edición**
  (la primaria en una, "Bolsillo" en la otra) — no el mismo chip repetido.
- En la pestaña **Comunidad**, tu reseña más reciente (si escribiste alguna)
  luce el chip "Bolsillo".

---

## 7. Progreso contra tu edición: "de 662" cambia a "de 880"

**Qué hacer**: sigue con el libro del punto 6. Vuelve a **Leyendo** (abre un
3.er pase). Ve a `/sesion/[entryId]` (enlace "Añadir sesión" bajo el panel
Progreso) y registra una sesión con una página cualquiera (p. ej. hasta 240).
Vuelve a la ficha: el panel Progreso mostrará "Voy por la página 240 de
**662**" (o el total real de tu edición primaria). Ahora, en el selector
**"Tu edición"** del panel Progreso, cambia a **"Bolsillo"** (880 páginas).

**Qué debe verse**:
- Sin recargar nada más, la línea de progreso pasa a "Voy por la página 240
  de **880**" — el total cambia con la edición, no con la página.
- Si vuelves a `/sesion/[entryId]` y guardas otra sesión, el "quedan N"
  también se calcula contra 880, no contra 662.

---

## 8. Sesión con cronómetro: sobrevive a recargar

**Qué hacer**: en un libro con un pase abierto, ve a `/sesion/[entryId]`. En
"Duración" cambia el conmutador a **Cronómetro** y pulsa **"Reanudar"**.
Espera ~10 segundos viendo el reloj correr. **Recarga la página completa**
(F5) sin guardar.

**Qué debe verse**:
- Tras recargar, el cronómetro sigue en el modo Cronómetro, mostrando un
  tiempo **igual o mayor** al que tenía antes de recargar (sigue contando
  desde el instante real de arranque, no desde cero).
- Pulsa **"Pausar"**, rellena una página de llegada y **Guardar sesión**.
- Vuelve a la ficha: la sesión aparece en la lista con los **minutos**
  correspondientes al tiempo que estuvo corriendo el cronómetro (redondeado).

---

## 9. Cronómetro olvidado: aviso a las 4 horas

**Qué hacer**: en `/sesion/[entryId]`, activa el Cronómetro y pulsa
"Reanudar". Anota el `entryId` de la URL. Abre las herramientas de
desarrollador (F12) → Consola, y ejecuta:

```js
const key = "biblioshare:timer:" + "<entryId>"; // sustituye <entryId>
const s = JSON.parse(localStorage.getItem(key));
s.startedAt = Date.now() - 5 * 60 * 60 * 1000; // lo retrasa 5 horas
localStorage.setItem(key, JSON.stringify(s));
```

Recarga la página (F5).

**Qué debe verse**:
- En vez del reloj corriendo, aparece el aviso **"Parece que lo dejaste
  corriendo..."** con dos botones: **"A mano"** y **"Descartar cronómetro"**.
- Pulsa **"A mano"**: el conmutador cambia a modo manual con el campo de
  minutos ya relleno (~300 minutos, los acumulados en las 5 horas simuladas).
- Repite el experimento y esta vez pulsa **"Descartar cronómetro"**: el
  cronómetro vuelve a 00:00:00 en modo Cronómetro, listo para arrancar de
  cero, y `localStorage.getItem(key)` ya no existe (compruébalo en consola).

---

## 10. Serie: sesión que marca E5 y E6

**Qué hacer**: con una serie en Leyendo/Viendo (o pásala a Leyendo primero),
ve a `/sesion/[entryId]`. Elige la temporada correspondiente y marca (clic)
los chips de los episodios **5 y 6** (si ya estaban vistos episodios previos,
dejarlos marcados no hace daño). Guarda la sesión.

**Qué debe verse**:
- Antes de guardar, aparece el chip verde **"▲ 2 episodios · vas por
  T{temporada}·E6"** (cuenta solo lo nuevo marcado en esta sesión).
- Tras guardar, en la pestaña **Episodios** de la ficha, los episodios 5 y 6
  de esa temporada aparecen marcados como vistos (checkmark), con el mismo
  estado que si los hubieras marcado uno a uno desde esa pestaña.
- El progreso de la serie (badge de estado / "vas por") queda en **T{temporada}·E6** — el episodio más alto marcado, no el último tocado.

---

## 11. Reseña PRIVADA no aparece en Comunidad ni en el feed

Esta es **la comprobación de privacidad más importante de todo el lote**.

**Qué hacer**:
1. Con `devtest`, cierra un pase (Leído/Vista) de un ítem, escribe una
   reseña de texto y **apaga el interruptor "Visible para la comunidad"**
   antes de guardar.
2. Ve a la pestaña **Comunidad** de ese mismo ítem.
3. Con el **segundo usuario desechable** (creado en la preparación, siguiendo
   a `devtest`), entra en su cuenta y mira la pestaña **Siguiendo** de su
   home (`?tab=following`).

**Qué debe verse**:
- En el diario de `devtest` (pestaña Mi registro), el pase SÍ muestra la
  reseña — es tu propio contenido.
- En la pestaña **Comunidad** del ítem, tu reseña **NO aparece** en la lista
  (ni la cuenta el histograma/media si es la única nota tuya para ese ítem —
  comprueba que el número de votos no la incluye).
- En la pestaña **Siguiendo** del segundo usuario, **no aparece** ningún
  evento "reseñó" para ese pase.
- Verifícalo también por SQL (ver más abajo): la fila debe tener
  `is_public = false`.

---

## 12. Añadir un libro desde la búsqueda registra la edición de su ISBN

**Qué hacer**: ve a `/buscar`, busca un libro por título (uno que no tengas
ya en el catálogo de dev — prueba con un título poco común) y añádelo a tu
biblioteca desde un resultado que tenga ISBN visible.

**Qué debe verse**: por SQL (sección siguiente), existe una fila en
`book_editions` para ese `book_id` con el `isbn` del resultado elegido y
`created_by = auth.uid()` de `devtest`.

---

## Consultas SQL de comprobación

Contra el proyecto **dev** (`tyvzpuhxfwxrnkcpzxyg`):

```sql
-- Pases de un ítem (sustituye el library_entry_id): abierto primero, luego
-- los cerrados del más reciente al más antiguo.
select id, started_on, finished_on, rating, review, is_public, edition_id
from diary_entries
where library_entry_id = '<library_entry_id>'
order by finished_on nulls first, started_on desc;

-- Invariante "un solo pase abierto por entrada" — no debe devolver filas.
select library_entry_id, count(*)
from diary_entries
where finished_on is null
group by library_entry_id
having count(*) > 1;

-- La reseña privada del punto 11 no debe ser pública.
select id, is_public, review
from diary_entries
where review ilike '%<fragmento de tu reseña privada>%';

-- Edición registrada desde la búsqueda (punto 12): sustituye el ISBN buscado.
select be.id, be.book_id, be.isbn, be.label, be.created_by, b.created_by is not null as author_signed
from book_editions be
join books b on b.id = be.book_id
where be.isbn = '<isbn del resultado que añadiste>';

-- Sesiones colgando del pase correcto (Tarea 13).
select ps.id, ps.pass_id, ps.duration_minutes, ps.position, de.finished_on as pass_finished_on
from progress_sessions ps
join diary_entries de on de.id = ps.pass_id
where ps.library_entry_id = '<library_entry_id>'
order by ps.session_date desc;

-- Media de comunidad de un ítem: último pase cerrado no abandonado por usuario.
select de.user_id, de.rating, de.finished_on
from diary_entries de
join library_entries le on le.id = de.library_entry_id
where le.item_type = '<book|movie|series>'
  and le.item_id = '<item_id>'
  and de.finished_on is not null
  and de.rating is not null
  and le.status <> 'dropped'
order by de.user_id, de.finished_on desc;
```

## Limpieza de datos de prueba

- Borra los libros/películas/series añadidos solo para este checklist de la
  biblioteca de `devtest` (`library_entries`, `diary_entries`,
  `progress_sessions`, y las filas nuevas en `books`/`movies`/`series`/
  `book_editions`/`movie_versions`/`series_episodes`/`episode_watches` que
  hayan quedado sueltas).
- Si subiste el rol de `devtest` a `collaborator` para el punto 6 y no lo
  era antes, revierte: `update profiles set role = 'user' where username =
  'devtest';`.
- Borra la cuenta desechable del punto 11 completa (perfil + `auth.users`).
- Deja `devtest.is_public = true` (su estado por defecto).
- No borres nunca la cuenta `devtest` en sí — es persistente para todo el
  proyecto (`docs/TESTING.md`).

## Si algo falla

Anota exactamente qué punto falló y qué viste en su lugar (captura de
consola del navegador si hay error) en vez de asumir que el comportamiento
descrito es el que hay — se investiga desde ahí.
