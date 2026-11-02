# Accesos a «Sacar un lomo» y «Entre nosotros» — diseño

[Histórico · congelado 2026-11-01]

## Problema

Las dos funciones existen y funcionan, pero cuesta llegar a ellas y sus nombres
no avisan de lo que hay detrás.

**Sacar un lomo** (el Sorteo, `SpineDraw` + `SorteoSheet`):

- Vive en el Rincón (`/coleccion/rincon`), en el rail, debajo de Retos y
  Memorizar; en móvil queda al final de la página.
- Desde Biblioteca solo se llega por la herramienta «Retos y objetivos», que no
  menciona el sorteo.
- En Inicio solo aparece en el estado 2 de la escalera (sin nada en curso y con
  pendientes, `ProximaLectura`). En cuanto hay algo en curso desaparece.
- No hay enlace directo que abra el sorteo.

**Entre nosotros** (`/comunidad/entre-nosotros`):

- En Comunidad es un enlace de texto suelto entre las pestañas y el buscador,
  sin explicación.
- En el perfil ajeno (con follow aceptado) el botón se llama «Comparar» y no
  dice que lleva a Entre nosotros.
- No hay acceso desde los clubes.

Fuera de alcance: el flujo dentro del sorteo o del atlas, y la traducción a
otros idiomas.

## Decisión de enfoque

El sorteo se abre fuera del Rincón por **enlace directo**
(`/coleccion/rincon?sorteo=1`), no montando la hoja en cada sitio. Se
descartaron:

- Hoja en el sitio con el pool cargado al pulsar (server action nueva, estado
  de carga y error, sorteo montado en tres sitios).
- Hoja en el sitio con el pool siempre cargado (`getSorteoPool` en cada render
  de Inicio aunque nadie pulse).

El enlace directo deja una sola implementación del sorteo y no añade consultas
a Inicio. Si el salto de página molesta, se puede migrar a la hoja en el sitio
sin tirar nada.

## Diseño

### 1. Enlace directo al sorteo

- `/coleccion/rincon?sorteo=1` abre la `SorteoSheet` al montar.
- `SpineDraw` acepta `initialOpen` (por defecto `false`). `RinconTab` lo recibe
  de la página (`searchParams.sorteo === "1"`) y lo pasa al `SpineDraw` del
  rail. `ProximaLectura` no cambia.
- Al cerrar la hoja abierta por URL, se quita `sorteo` con `router.replace`
  (sin scroll) para que recargar o volver atrás no la reabra.
- Con el pool vacío, `initialOpen` se ignora: se ve la tarjeta vacía de siempre
  («añade pendientes»).

### 2. Biblioteca

- Cuarta entrada en `LibraryTools` (`src/components/library/library-tools.tsx`):
  «Sacar un lomo» → `/coleccion/rincon?sorteo=1`, con su propio icono (lomo o
  dado, de `@/components/ui/icons`; si no existe, se añade uno en el mismo
  estilo).
- «Retos y objetivos» se queda igual.

### 3. Inicio

- En el estado «en curso» (`focus.featured`), la cabecera de «Para más tarde»
  (`LaterShelf`) gana un enlace discreto «Sacar un lomo» →
  `/coleccion/rincon?sorteo=1`, junto a «Ver todos».
- Solo aparece cuando hay pendientes, que son las mismas condiciones en que se
  pinta `LaterShelf`.
- Sin nada en curso no cambia nada: sigue `ProximaLectura` con el sorteo
  integrado.
- No añade consultas: `planned` ya se pide.

### 4. Comunidad

- El `<Link>` suelto de `src/app/comunidad/page.tsx` pasa a ser una tarjeta
  enlazada: título «Entre nosotros», una línea «Compara lo que leéis y veis con
  la gente a la que sigues» y un chevron.
- Visible en las dos pestañas (Clubes y Personas), igual que hoy.

### 5. Perfil ajeno

- `CompareWithLink` cambia la etiqueta `profile.compareWith` de «Comparar» a
  «Entre nosotros». El `title` (`compareWithHint`) sigue explicando qué hace.
- La condición no cambia: solo con follow aceptado.

### 6. Club

- Botón «Entre nosotros» en la página de miembros del club
  (`src/app/club/[slug]/miembros/page.tsx`), en la cabecera de la lista.
- Enlaza a `/comunidad/entre-nosotros?personas=<id>,<id>,…` con los miembros
  del club que el usuario sigue con follow aceptado, sin él mismo.
- Si no sigue a nadie del club, el botón no se pinta.
- En el atlas, `?personas=` abre el editor de grupo nuevo con esas personas
  preseleccionadas, reutilizando `setEditor({ group: null, people })`, el mismo
  camino que «guardar el par sin guardar». El usuario pone nombre y guarda.
- **Nadie se fía de la URL.** Las `personas` se filtran en el cliente
  contra `candidates` (que ya son solo follows aceptados y visibles, de
  `listEntry`), y el guardado ya valida tamaño y follows en el servidor. Un id
  que no está entre los candidatos se descarta en silencio.
- Si tras filtrar no queda nadie, el atlas abre como siempre, sin editor.
- `?con=` y `?group=` tienen prioridad sobre `?personas=`. Tras abrir el
  editor, `personas` se quita de la URL.

### Copy y glosario

- Claves nuevas en `messages/es.json`: herramienta de Biblioteca, enlace de
  Inicio, tarjeta de Comunidad (título y descripción) y botón del club. Cambia
  el valor de `profile.compareWith`.
- `docs/UI-GLOSARIO.md`: la fila **Sorteo** pasa a listar Rincón, Biblioteca e
  Inicio; se añade o actualiza la fila **Entre nosotros** con Comunidad, perfil
  ajeno y club.

### Caché y RLS

No se añade ningún `use cache`. La lista de miembros que sigues depende de la
sesión y se calcula en la petición, con el cliente del usuario.

## Pruebas

- **Unitarios**
  - `SpineDraw` con `initialOpen` abre la hoja; con el pool vacío no la abre.
  - El cierre quita `sorteo` de la URL.
  - El parseo de `personas`: descarta ids ajenos a `candidates` y al propio
    usuario; con `con` o `group` se ignora.
  - `LibraryTools` incluye el enlace nuevo.
  - El botón del club no se pinta sin miembros seguidos.
- **e2e**
  - Biblioteca → «Sacar un lomo» → hoja del sorteo visible.
  - Club → «Entre nosotros» → editor con los miembros seguidos preseleccionados.
- Los e2e corren contra build de producción (regla #437), aunque no se añade
  caché.

## Definición de hecho

- `docs/UI-GLOSARIO.md` actualizado.
- Casilla en `docs/requirements/backlog.md`, si existe una entrada para esto.
- Entrada en `docs/requirements/decisiones.md` con la decisión «enlace directo
  frente a hoja en el sitio».
