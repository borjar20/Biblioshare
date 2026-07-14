# Registro, pases y ediciones — diseño

Fecha: 2026-07-14
Mockups de referencia:
- `Paper - Ficha de título completa.html` (pantallas 1, 3, 5)
- `Paper - Registrar sesión.html` (pantallas 1, 2, 3)

## Problema

Dos problemas que se resuelven juntos porque comparten modelo.

**El registro personal está fragmentado.** Hoy el usuario puede puntuar en dos
sitios (`library_entries.rating`, que alimenta la media de la comunidad, y
`diary_entries.rating`, que alimenta las reseñas) y escribir texto en tres
(`library_entries.notes`, `progress_sessions.note` y `diary_entries.review`).
Progreso y diario viven escondidos detrás de enlaces "mostrar". Nadie sabe
dónde va cada cosa.

**No hay ediciones.** Una ficha de libro mezcla la obra (título, autoría,
sinopsis) con una edición concreta (editorial, ISBN, páginas). Eso hace que
"voy por la página 240 de 662" sea falso para quien lee la de bolsillo (880 p),
e imposibilita el caso que motivó esta spec: en El Señor de los Anillos, tener
un pase contra la versión teatral y otro contra la extendida, cada uno con su
nota y su reseña.

## Modelo

### El pase

Un **pase** es una lectura o un visionado: la unidad que posee la nota y la
reseña. Puede estar **abierto** (`finished_on` nulo, "lo estoy leyendo ahora") o
cerrado.

La tabla física sigue siendo `diary_entries` — nada la referencia por clave
foránea, pero renombrarla obligaría a tocar RLS, feed, notificaciones e
interacciones de reseña sin ganar nada funcional. En la capa de dominio
(`src/lib/passes/`) y en la interfaz se habla de pases y de "diario".

Cambios sobre `diary_entries`:

| Columna | Cambio |
|---|---|
| `finished_on` | pasa a nullable (nulo = pase abierto) |
| `is_public` | nueva, `boolean not null default true` — el interruptor "visible para la comunidad" |
| `edition_id` | nueva, uuid nullable — la edición contra la que se hizo el pase |

Invariante: **como máximo un pase abierto por `library_entry`**, garantizado por
un índice único parcial sobre `library_entry_id where finished_on is null`.

Nadie crea un pase a mano. Lo abre y lo cierra el cambio de estado:

- **Libro/serie:** pasar a `in_progress` abre pase. Pasar a `completed` cierra
  el abierto (o, si no había, crea uno ya cerrado).
- **Película:** el ciclo natural es Pendiente → Visto, sin pasar por "viendo".
  Marcar `completed` abre y cierra el pase en un solo gesto.
- **Relectura:** volver a `in_progress` con todos los pases cerrados abre uno
  nuevo automáticamente.
- **`dropped`:** cierra el pase abierto marcando `finished_on` (se abandonó ese
  día). Un pase abandonado cuenta como pase en el diario, pero **no aporta nota
  a la comunidad**.

La palabra "pase" no aparece en la interfaz: el usuario ve estados y un diario.

### Nota: 5 estrellas mostradas, 1–10 guardadas

El selector pasa a medias estrellas (0,5–5) y todo lo visible es `/5`. La
columna sigue siendo `smallint` 1–10, así que no hay migración de notas y no se
pierde precisión. La conversión vive en un único módulo nuevo
(`src/lib/rating/stars.ts`). No se toca `src/lib/series/rating-scale.ts`: eso
son los colores por tramo de la rejilla de episodios, otra cosa.

### Lo que pierde `library_entries`

- `rating` → pasa a ser del pase.
- `notes` → pasa a ser reseña privada (`is_public = false`) del pase.

Se queda con lo que es suyo: `status`, `position`, `queue_id`, `pinned_order`.
Ambas columnas se dejan en la base de datos durante esta spec (nadie las lee ya)
y se eliminan en una limpieza posterior, para poder revertir sin pérdida.

### Ediciones

Dos tablas nuevas. `books` y `movies` **siguen siendo la obra** (título,
autoría, sinopsis, géneros, año, portada canónica).

```
book_editions(id, book_id → books, label, publisher, published_year,
              language, total_pages, isbn, cover_url, is_primary,
              created_by, created_at)

movie_versions(id, movie_id → movies, label, release_year,
               duration_minutes, is_primary, created_by, created_at)
```

`label` es texto libre con sugerencias en la interfaz (Tapa dura, Bolsillo,
Ilustrada, Original / Teatral, Extendida, IMAX). Un índice único parcial
garantiza **una sola edición primaria** por obra.

- **Migración:** cada libro y cada película existentes engendran su edición
  primaria con los datos que hoy tienen sueltos (`publisher`, `isbn`,
  `total_pages` / `duration_minutes`). Las columnas viejas se quedan como
  espejo de la primaria hasta una limpieza posterior.
- **Permisos (RLS):** lectura pública; crear y editar exige colaborador o
  superior, igual que asignar sagas (§7.35). El usuario normal elige entre las
  existentes.
- **Series no tienen ediciones.** Su unidad de progreso son los episodios.
- **Alta desde la búsqueda:** `group-editions.ts` ya agrupa los resultados de
  Google Books por obra, así que al añadir un libro se sabe qué ISBN concreto
  eligió el usuario. Si ese ISBN no existe como edición, se crea (esta alta la
  puede hacer cualquier usuario: viene de una fuente de datos, no es curación a
  mano).

### Elección de edición

`edition_id` es opcional. El pase apunta a la edición primaria salvo que el
usuario elija otra desde el Registro. Quien no quiera saber nada de ediciones no
las ve nunca.

El **progreso se mide contra la edición del pase**: "240 de 662" o "240 de 880"
según cuál leas. Si el pase no tiene edición, contra la primaria.

### Sesiones

`progress_sessions` gana `pass_id` (uuid, nullable durante la migración, luego
obligatorio) y cuelga del pase abierto. Hereda su edición: eso es el
"Edición: Plaza & Janés · tapa dura" que el mockup rotula sobre las sesiones.
Se migran colgándolas del pase abierto de su `library_entry`.

Sigue siendo tracking de hábito: lo que importa es el agregado (páginas y
minutos por semana), no releer cada sesión.

### Series y episodios

Los episodios vistos (`episode_watches`) son una **capa acumulativa al margen
del pase**: no se resetean en un revisionado y la marca de visto no cambia.

- El `position` de la entrada deja de escribirse a mano: se **deriva del último
  episodio marcado**.
- Una sesión de serie marca varios episodios de golpe; la pestaña Episodios los
  marca de uno en uno. Ambas escriben la misma marca (`episode_watches`).

### Comunidad

Media, histograma y reseñas siguen siendo **de la obra**, nunca de la edición.

- La media pasa a salir de la nota del **último pase cerrado no abandonado** de
  cada usuario, en vez de `library_entries.rating`. Como el rating actual se
  migra a un pase, el número no se mueve.
- Las reseñas son los pases con `is_public = true` y texto.
- Cada reseña luce un **chip de edición** ("Extendida", "DeBolsillo · 880 p")
  cuando el pase tiene una. Sin filtro por edición: con pocas reseñas dejaría la
  lista vacía. Se añadirá cuando haya volumen.

## Interfaz

### Pestaña Registro (rehecha, pantalla 3 del mockup)

1. **Estado**: segmented control de cuatro pastillas con punto de color
   (Pendiente / Leyendo / Leído / Dejado), no un `<select>`.
2. **Progreso** (solo con pase abierto): estrellas de tu nota, "voy por la
   página 240 de 662" contra tu edición, selector de edición, y el botón que
   lleva a registrar sesión.
3. **Sesiones** del pase abierto, con la edición rotulada encima, una por línea:
   "p. 180 → 240 · 45 min · ayer".
4. **Diario**: la lista de pases, visible sin desplegar nada. Cada tarjeta lleva
   estrellas, fecha, edición, reseña y el delta contra el pase anterior
   ("▲ +1★ vs. anterior"), que ya se calcula hoy en `diary-panel.tsx`.
5. **Quitar de mi biblioteca** al pie.

### Hoja de cierre de pase

Al marcar Leído/Visto: fecha de fin, estrellas, reseña e interruptor "visible
para la comunidad". Se puede saltar (se guarda solo el estado) y completar
después desde el diario. En película, esta hoja *es* toda la interacción.

### Página de sesión (`/sesion/[entryId]`, repintada)

Se mantiene como página propia: se entra desde varios puntos. Contexto del ítem
arriba (portada, título, badge de tipo).

- **Libro:** tramo desde → hasta con delta en vivo ("▲ 60 páginas · quedan 422",
  contra el total de tu edición). Duración en dos modos: **a mano** o
  **cronómetro**.
- **Serie:** selector de temporada y chips de episodios que se marcan vistos.
  Sin duración. Delta: "▲ 2 episodios · vas por T2·E6".
- Nota corta opcional, siempre privada.

**Cronómetro persistente:** guarda el instante de arranque en `localStorage`
(clave por `entryId`), así que sobrevive a recargar y a cerrar la app, y sigue
contando en segundo plano porque calcula por diferencia de tiempo, no con un
intervalo corriendo. No cruza de dispositivo — leer no suele repartirse entre
móvil y portátil, y llevarlo a la base de datos costaría tabla, acciones de
servidor y resolución de conflictos.

**Olvidos:** si al volver el cronómetro lleva más de 4 horas, se muestra en
pausa con un aviso ("parece que lo dejaste corriendo") y dos salidas: escribir
los minutos a mano o descartarlo.

### Pestaña Info

- Tira de **Ediciones / Versiones**: tarjetas horizontales, la tuya con ✓, y
  "+ Añadir edición" solo para colaborador+.
- Los metadatos se leen de la edición primaria.

## Fuera de alcance

Piezas del mockup que se abordarán en specs propias:

- Sagas múltiples con selector (pantalla 1).
- Editor de ficha oficial del moderador (pantalla 6).
- Reparto con avatares y "Dónde verla" / plataformas (pantalla 5).
- Filtro de reseñas por edición.
- Eliminar `library_entries.rating` y `notes`, y las columnas de edición
  duplicadas en `books` / `movies`.

## Riesgos

- **La migración toca los datos de todos.** Es la parte delicada: cada
  `library_entry` con nota o notas engendra un pase, y las sesiones se recuelgan.
  Se hace en una sola migración idempotente y se verifica con dos consultas de
  control antes y después: número de notas y media de comunidad por ítem deben
  coincidir exactamente.
- **La media de comunidad cambia de fuente.** Si algún `library_entry` con nota
  quedara sin pase, ese voto desaparecería de la media. La consulta de control
  lo detecta.
- **Un pase abierto por entrada** es un invariante nuevo: hay que garantizarlo en
  base de datos (índice único parcial), no solo en la aplicación, porque los
  cambios de estado pueden llegar en paralelo.

## Verificación

Checklist manual (`docs/TESTING.md` — el proyecto no usa E2E automático) que
cubra: abrir y cerrar pase en libro, película marcada vista de golpe, relectura
con dos ediciones distintas, sesión con cronómetro (incluido el caso de dejarlo
corriendo), sesión de serie que marca episodios, y que la nota media de un ítem
no cambie tras la migración.
