# Ediciones en la ficha y editor de ficha oficial — diseño

Fecha: 2026-07-14
Continúa: `2026-07-14-registro-pases-ediciones-design.md` (ya en producción)
Mockup: `Paper - Ficha de título completa.html`, pantallas 1, 5 y 6

## Problema

Las ediciones existen en el modelo, pero la ficha todavía no las usa bien y el
catálogo no se puede corregir. Tres huecos, del mismo origen: la ficha sigue
tratando los datos de una tirada como si fueran de la obra.

1. **No hay forma de editar la ficha.** Un colaborador puede añadir ediciones y
   asignar sagas, pero no corregir un título, una sinopsis o unos géneros. La
   pantalla 6 del mockup quedó fuera del alcance anterior, y los datos de
   OpenLibrary llegan sucios.
2. **Al añadir un libro solo se registra una edición.** La búsqueda agrupa las
   variantes de una obra, pero al añadir se guarda únicamente la del ISBN
   elegido: el resto no existe, así que el selector de edición del Registro casi
   siempre tiene una sola opción.
3. **La ficha mezcla obra y edición.** El panel de metadatos pinta editorial,
   ISBN y páginas de `books` como si fueran de la obra. "662 páginas" es
   directamente falso para quien lee la de bolsillo, que tiene 880.

## Sección A — La ficha muestra la edición que estás mirando

El panel de metadatos deja de ser "los datos del libro" y pasa a ser "los datos
de lo que estás mirando".

- **Por defecto, la obra:** autoría, año de primera publicación, géneros. Y nada
  más: editorial, ISBN, páginas e idioma dejan de aparecer ahí.
- **La tira de ediciones pasa a ser clicable.** Al pulsar una edición, el panel
  muestra *esa* edición: etiqueta, editorial, año de la tirada, idioma, páginas,
  ISBN, y su portada propia si la tiene. Un "volver a la obra" deselecciona.
- **Pulsar no adopta.** La edición del pase abierto sigue marcada con su ✓, y
  curiosear por las demás no cambia nada del registro personal. Adoptar una
  edición es un gesto aparte, en el Registro (ver Sección B).
- **Película:** igual, con la duración. Es de la versión, no de la obra.
- **Serie:** sin cambios (no tiene ediciones).

Las columnas `books.publisher`, `.isbn`, `.total_pages` y
`movies.duration_minutes` **no se borran**: siguen siendo el espejo de la
primaria y las usan el importador y los triggers. Solo dejan de pintarse.

## Sección B — Traer las ediciones reales de OpenLibrary

La búsqueda de libros usa **OpenLibrary**, no Google Books. Un resultado de
búsqueda es una *obra*, con una lista de ISBN pero sin el detalle de cada
edición; las ediciones de verdad están en otro endpoint:
`https://openlibrary.org/works/<WORK_KEY>/editions.json`.

- **Cuándo:** al **abrir la ficha** del libro, no al buscarlo ni al añadirlo. Es
  el mismo *cache-as-you-go* que ya enriquece autores: la primera visita paga la
  llamada, las siguientes no.
- **Cómo no repetirla:** columna nueva `books.editions_synced_at`. Si está
  puesta, no se vuelve a preguntar. (Un colaborador podrá forzar una
  resincronización desde el editor.)
- **Qué se guarda la obra:** columna nueva `books.openlibrary_work_key` — hoy no
  se guarda y sin ella no se puede pedir el listado.
- **Qué ediciones entran** (OpenLibrary tiene cientos por obra clásica, y nadie
  elige entre 300 tiradas casi idénticas):
  - Solo con **ISBN válido** (mismo dígito de control que ya valida
    `register_book_edition`).
  - Se prefieren las que traen **páginas o editorial** conocidas.
  - **Español e inglés primero**; el resto de idiomas solo si sobra hueco.
  - **Tope de 20 por obra**, de más reciente a más antigua.
  - La etiqueta (`label`) sale del formato que declare OpenLibrary
    (`physical_format`: "Paperback", "Hardcover"…), traducida; si no lo declara,
    "Edición".
- **Errores:** si OpenLibrary falla o tarda, la ficha se pinta igual con las
  ediciones que ya haya. Nunca bloquea el render.

**Elegir la tuya se hace en el Registro**, no en la búsqueda: al seguir el libro
y al abrir un pase nuevo se pregunta qué edición tienes, con **"no lo sé"** como
salida (y entonces el pase va contra la primaria, como hoy). Es donde la
pregunta tiene sentido, porque es cuando vas a empezar a leer y cuando decide
contra qué se mide tu progreso.

## Sección C — Editor de ficha oficial

La pantalla 6 del mockup, para **colaborador o superior** (igual que crear
ediciones y asignar sagas), en las **tres** fichas.

Se entra desde un botón "Editar ficha" en la pestaña Info, visible solo si eres
colaborador. La ficha conmuta a formulario en la misma página (patrón de
`ClubForm`), con barra fija de Guardar / Cancelar.

Qué se edita:

- **Obra:** portada, título, autoría, sinopsis, géneros, año de primera
  publicación. (En serie y película, el campo de autoría es creador/director.)
- **Ediciones y versiones:** crear, **editar y borrar** desde la misma pantalla.
  Hoy solo se pueden crear. Borrar una edición que algún pase esté usando debe
  fallar con un mensaje claro, no romper el pase.
- **Sagas:** se mueven aquí dentro y se jubila `saga-assign-form.tsx`.
- **Resincronizar ediciones** desde OpenLibrary (limpia `editions_synced_at`).

**Portada:** subida real a un bucket nuevo de Supabase Storage (`covers`),
replicando el patrón del bucket de avatares que ya existe: tipos permitidos,
límite de tamaño, ruta acotada y RLS que solo deja escribir a colaborador+.

**Sin historial ni deshacer.** Con colaborador+ el riesgo es asumible (es gente
de confianza y `created_by` deja rastro en las ediciones). Si algún día se abre
la edición a cualquier usuario, un historial de cambios pasa a ser el primer
requisito, no un extra.

## Fuera de alcance

- Historial de cambios y revertir (ver arriba).
- Abrir la edición del catálogo a usuarios normales.
- Sugerencias de corrección de un usuario normal a un colaborador.
- Ediciones para series.
- Fusionar dos obras duplicadas del catálogo.

## Riesgos

- **OpenLibrary es lenta y desigual.** La llamada va en el render de la ficha:
  tiene que ir en paralelo con el resto de consultas y no bloquear nunca. Si
  falla, la ficha se pinta con lo que haya.
- **Ruido de catálogo.** Aun con el tope de 20, un clásico puede acabar con 20
  ediciones casi iguales. El filtro (ISBN válido + páginas/editorial + idioma) es
  lo que decide si el selector es útil o inservible; es la parte que hay que
  probar con obras reales, no con un caso de laboratorio.
- **Borrar una edición en uso.** Un pase apunta a ella. La base de datos lo
  **impide** (clave ajena con `on delete restrict`), y el editor lo explica: "hay
  N lecturas registradas contra esta edición". No se reasigna en silencio a la
  primaria: eso falsearía el progreso de gente que no ha pedido nada.

## Verificación

Checklist manual (`docs/TESTING.md`), con casos reales y no de laboratorio:

1. Abrir un libro recién añadido y ver que aparecen sus ediciones de OpenLibrary
   (probar con uno con muchas ediciones y con uno oscuro que no tenga ninguna).
2. Pulsar una edición: el panel muestra sus datos, y el registro personal NO
   cambia.
3. Que el panel de la obra ya no muestre editorial, ISBN ni páginas.
4. Elegir edición al seguir un libro y al abrir un pase, incluido el "no lo sé".
5. Editar la ficha como colaborador: título, sinopsis, géneros, portada nueva.
6. Editar y borrar una edición; intentar borrar una que esté en uso por un pase.
7. Que un usuario normal no vea el botón de editar ni pueda llamar a las acciones.
