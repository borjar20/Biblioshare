# Búsqueda e hidratación de libros — checklist manual

Rama: `worktree-catalogo-busqueda-hidratacion` · Spec: `docs/superpowers/specs/2026-07-14-busqueda-e-hidratacion-de-libros-design.md` · Requisitos: §7.39

**Antes de empezar:**
- `npm run dev` (apunta a **dev**, donde ya está aplicada `20260715_book_hydration.sql`).
- Sesión iniciada. Varios casos exigen usuario autenticado, y se indica cuál.
- Para mirar la BD de dev, la Management API (ver memoria `supabase-environments`).

Lo ya verificado automáticamente, para que no lo repitas a mano: 99 tests unitarios en verde
(incluido el mapeo de géneros contra subjects reales de Dune, 1984 y El nombre del viento), `tsc`
limpio, build de producción OK, y los tres endpoints de OpenLibrary comprobados contra la API real.
Lo de abajo es lo que solo se ve en el navegador.

---

### 1. La búsqueda devuelve OBRAS, no ediciones repetidas

1. Ve a `/buscar?type=book` y busca **dune**.

- [ ] Sale **una tarjeta por obra** (Dune, Dune Messiah, Children of Dune…), no diez tiradas casi
      idénticas del mismo libro.
- [ ] Cada tarjeta muestra portada, título, autoría y año — y **nada más**. En concreto: **no**
      aparecen ni editorial ni "N págs." (eran datos de una tirada, y las páginas eran la mediana de
      todas las ediciones).
- [ ] Sobre la portada aparece el contador de ediciones (Dune ≈ 120). Es el número real de
      OpenLibrary, no el de resultados agrupados a mano.

### 2. Buscar no ensucia el catálogo

1. Antes de buscar, cuenta las filas: `select count(*) from books;`
2. Busca **dune**, mira los resultados, y **no pulses nada**.
3. Vuelve a contar.

- [ ] El número **no ha cambiado**. Antes, cada búsqueda insertaba una fila por resultado.

### 3. Abrir un resultado nuevo crea la obra, ya hidratada

1. Con sesión iniciada, busca **dune** y pulsa la tarjeta de *Dune*.

- [ ] Redirige a `/libro/<uuid>` (la obra se ha creado al pulsar).
- [ ] La ficha muestra **sinopsis** a la primera. Antes salía "sin sinopsis": la búsqueda pedía la
      descripción a un endpoint que no la devuelve.
- [ ] Los **géneros** son etiquetas limpias del vocabulario canónico (Dune: Ciencia ficción,
      Fantasía). **No** aparece nada como "Protected DAISY", "New York Times bestseller" ni
      `nyt:mass-market-monthly=2021-11-07`.
- [ ] En la BD: `select hydrated_at, genres from books where title = 'Dune';` → `hydrated_at` puesto.

### 4. La ficha no vuelve a preguntar

1. Recarga la ficha de Dune un par de veces.

- [ ] Carga rápido y no cambia nada. `hydrated_at` ya está puesto, así que no hay segunda llamada a
      OpenLibrary. (Comprobable en la consola del server: no debe aparecer tráfico a `/works/`.)

### 5. Los libros viejos y sucios se curan solos

1. Elige un libro cacheado con el flujo antiguo — en dev, uno con
   `select id, title from books where hydrated_at is null limit 1;`
2. Abre su ficha. Recárgala una vez (la hidratación va en `after()`, o sea, después de pintar).

- [ ] A la segunda carga tiene sinopsis y/o géneros limpios, y `hydrated_at` ha quedado puesto.
- [ ] Si el libro no tenía work key, se resuelve por su ISBN. Si no hay ni una ni otro, se marca
      hidratado igualmente (para no reintentar en cada visita) y la ficha se queda como estaba: es el
      comportamiento correcto, no un fallo.

### 6. El ISBN sigue siendo un lookup (el escáner)

1. Busca por ISBN: **9780451524935** (1984).

- [ ] Cae en la **obra** correcta (*Nineteen Eighty-Four*), no en una tirada suelta.
- [ ] Al abrirla/añadirla con sesión, esa tirada concreta aparece registrada en la tira de ediciones.
- [ ] Repite la misma búsqueda por ISBN: ahora sale del catálogo local, sin llamar a la API.

### 7. Un libro que ya tienes no sale duplicado

1. Con *Dune* ya en el catálogo (caso 3), vuelve a buscar **dune**.

- [ ] *Dune* aparece **una sola vez** y **la primera** (lo local va arriba).
- [ ] Las demás obras de la API siguen apareciendo debajo. Esto es lo que antes no pasaba: un hit
      local cortocircuitaba la API y *Dune Messiah* desaparecía del listado.

### 8. El panel de metadatos no miente (§7.38, sigue en pie)

- [ ] En la ficha, el panel de la **obra** no muestra editorial, ISBN ni páginas.
- [ ] Esos datos aparecen al pulsar una **edición** de la tira.

### 9. OpenLibrary caído no rompe nada

1. Corta la red (o bloquea `openlibrary.org` en el `hosts`).
2. Busca un título que ya tengas en el catálogo, y abre su ficha.

- [ ] La búsqueda devuelve los resultados **locales** y no revienta.
- [ ] La ficha se pinta con lo que hay en la BD.
- [ ] Un libro sin hidratar deja `hydrated_at` a null: al recuperar la red, la siguiente visita lo
      hidrata.

### 10. El importador de Goodreads sigue emparejando

1. Importa un CSV pequeño de Goodreads con ISBN en `/importar`.

- [ ] Los libros se emparejan igual que antes (el ISBN ahora pasa por `lookupIsbn`, y el título por
      `searchWorks`).

---

## Qué NO se ha podido verificar aquí

- **El escáner de código de barras con cámara real** (§7.3): sigue necesitando un dispositivo
  Android. Solo se ha probado la ruta de ISBN que el escáner alimenta (`/buscar?type=book&q=<isbn>`).
- **Producción**: la migración `20260715_book_hydration.sql` está aplicada **solo en dev**. A prod va
  cuando esta PR se revise.
