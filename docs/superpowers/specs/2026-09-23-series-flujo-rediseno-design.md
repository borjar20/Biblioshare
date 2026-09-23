# Series: revisión del flujo de registro y propuesta de rediseño

`[Propuesta · 2026-09-23 · decisiones D1–D4 aceptadas con la recomendación · fases 1–4 implementadas]` — diagnóstico del flujo actual verificado
contra el código de `main` a esta fecha. De la «Propuesta», están implementadas las cuatro fases (§6).

## 1. Por qué

Registrar una serie hoy es lioso: hay demasiadas puertas para hacer lo mismo, dos notas que no se
hablan (la de episodio y la de la serie) y no existe el estado más común de quien sigue series en
emisión: **«lo he visto todo lo que hay y espero la temporada nueva»**. Además, dos fallos de
fondo hacen que ese estado sea imposible aunque la UI lo quisiera pintar (§3, H1 y H2).

## 2. Inventario: dónde puede tocar hoy el usuario una serie

| # | Pantalla | Qué hace | Fichero |
|---|---|---|---|
| 1 | Píldora del hero / «Seguir» | Estado del pase (4 estados) | `detail/hero-status-or-follow.tsx` |
| 2 | Raíl de PC | Estado, barra «16/20 vistos», nota de la serie, CTA a Episodios | `detail/item-rail-actions.tsx` |
| 3 | Pestaña **Episodios** — lista | Índice de temporadas → temporada → detalle inline con nota (dots) + reseña + botón «Guardar» | `detail/episode-panel.tsx`, `episode-list.tsx`, `episode-detail.tsx`, `season-index.tsx` |
| 4 | Pestaña **Episodios** — rejilla | Mapa de calor Mías/Comunidad; tocar una celda solo enseña detalle, **no marca** | `detail/episode-grid.tsx` |
| 5 | «Marcar siguiente» | Solo en PC y solo en vista lista | `episode-panel.tsx` |
| 6 | Pestaña **Registro** | 4 segmentos de estado, progreso, **nota de la serie** (`ratePass`), sesiones, diario de pases, notas | `detail/log-panel.tsx` |
| 7 | Hoja **/sesion** | Marcar varios episodios **de una sola temporada**; estado plegado en `<details>`; crea `progress_sessions` | `session/session-sheet.tsx`, `series-episode-grid.tsx`, `lib/sessions/actions.ts` |
| 8 | Tarjeta de Inicio | Marcar el siguiente episodio | `stats/today-card.tsx`, `today-actions.tsx` |
| 9 | Hoja de cierre | Salta sola al marcar el último episodio del catálogo: fecha, nota de la serie, reseña | `detail/close-pass-sheet.tsx` |

Nueve sitios, tres escrituras distintas (`setEpisodeWatched`/`rateEpisode`, `addSession`,
`updateStatus`/`ratePass`) y dos modelos de «qué he visto» (con sesión o sin ella).

## 3. Hallazgos

### Fallos de fondo (bloquean «al día / esperando temporada»)

- **H1 — El catálogo de episodios no se refresca nunca.** `ensureSeriesEpisodes`
  (`src/lib/library/ensure-series-episodes.ts`) sale si ya hay alguna fila en `series_episodes`.
  Una temporada que se estrena después de la primera visita a la ficha **no aparece jamás**: ni
  en la pestaña, ni en el progreso, ni en la tarjeta de Inicio.
- **H2 — Los episodios anunciados cuentan como emitidos.** `getSeriesEpisodes` guarda todo lo
  que devuelve TMDB por temporada, incluidos episodios con `air_date` futuro, y nadie filtra por
  fecha: el cursor «siguiente episodio» y «Marcar siguiente» pueden apuntar a un episodio que no
  ha salido, y el auto-cierre (`rollSeriesProgress.reachedEnd`) compara contra el último
  episodio *anunciado*.
- **H3 — El auto-cierre da la serie por «Vista» aunque siga en emisión.** Llegar al último
  episodio del catálogo → `completed` + hoja de cierre. No se mira si la serie ha terminado (no
  guardamos el `status` de TMDB: `Returning Series` / `Ended` / `Canceled`).
- **H4 — Volver a una serie «Vista» cuando sale temporada nueva la trata como revisionado.**
  Pasar un pase `completed` a `in_progress` hace `archiveAndCreate` (`lib/passes/transitions.ts`):
  pase nuevo, cursor a cero, los vistos anteriores quedan como «visto alguna vez». Y marcar
  episodios sin cambiar el estado escribe sobre un pase cerrado que sigue diciendo «Vista»
  (`ensureWritablePass` no reabre, a propósito).

### Fricción de UX

- **H5 — Dos notas sin relación.** La nota de la serie (`passes.rating`) vive en Registro y en la
  hoja de cierre; las de episodio (`episode_watches.rating`) en Episodios. No se sugiere una a
  partir de la otra, y la «nota de temporada» solo existe como media calculada.
- **H6 — Guardar la reseña de un episodio es un paso aparte**, y puntuar guarda de rebote el
  borrador del textarea. Dos gestos con reglas distintas en el mismo bloque.
- **H7 — Desmarcar un episodio borra su nota y su reseña sin avisar** (`setEpisodeWatched(false)`
  hace `delete` de la fila).
- **H8 — No hay alta masiva.** Quien añade una serie que ya lleva vista (lo normal) tiene que
  marcar episodio a episodio; la hoja de sesión solo deja una temporada a la vez. Falta
  «marcar temporada» y «vista hasta aquí».
- **H9 — La rejilla no es interactiva** y «Marcar siguiente» no existe en móvil, que es donde
  más se usa.
- **H10 — Marcar desde Episodios no crea sesión; marcar desde /sesion sí.** El mismo hecho
  («vi el 3×04 el martes») aparece o no en Sesiones/estadísticas según por dónde entraste.

## 4. Propuesta

### 4.1 Modelo de estados de una serie

Se mantienen los cuatro estados guardados (`planned`, `in_progress`, `completed`, `dropped`) y se
añade **un estado derivado, no guardado: «Al día»** = pase `in_progress` + todos los episodios
*emitidos* vistos + la serie NO ha terminado.

| Situación | Estado guardado | Se muestra como |
|---|---|---|
| Quiero verla | `planned` | Pendiente |
| Voy por el 2×05 | `in_progress` | Viendo · T2 E5 |
| He visto todo lo emitido, sigue en emisión | `in_progress` | **Al día** · «T3 se estrena el 12 oct» / «Esperando temporada» |
| Sale episodio nuevo | `in_progress` | Vuelve solo a «Viendo» · aviso «1 episodio nuevo» |
| He visto todo y la serie ha terminado | `completed` | Vista |
| La dejé | `dropped` | Abandonada |

Por qué derivado y no un valor nuevo del enum: no hay que tocar `media_status`, estadísticas,
filtros ni RLS; «Al día» → «Viendo» sucede solo cuando entra un episodio nuevo, sin escrituras.
(Relacionado: #426 pide «Pausada», que sí sería un valor guardado porque es una decisión del
usuario, no un hecho del catálogo.)

**Auto-cierre nuevo:** al ver el último episodio emitido
- serie terminada (`Ended`/`Canceled`) → `completed` + hoja de cierre, como hoy;
- serie en emisión → **no se cierra**; aparece una tarjeta «Estás al día» con opción de puntuar
  «hasta ahora» (nota de la serie, editable después);
- sin dato de TMDB (serie manual) → la hoja pregunta «¿Ha terminado la serie?».

**Una serie ya «Vista» a la que le sale temporada** (datos heredados o terminada que se renueva):
se ofrece «Seguir con la T5» que **reabre el mismo pase** (`completed → in_progress` como
corrección, sin `archiveAndCreate`), distinto de «Volver a verla» (revisionado).

### 4.2 Catálogo vivo

- Nuevas columnas en `series`: `tmdb_status`, `next_episode_air_date`, `episodes_synced_at`
  (con sus grants por columna — DRIFT-CHECK superficie 6).
- `ensureSeriesEpisodes` pasa de «solo si está vacío» a «si está vacío **o** la serie no ha
  terminado y (`episodes_synced_at` > 7 días **o** `next_episode_air_date` ≤ hoy)». Inserta lo
  nuevo y actualiza título/fecha de lo existente (service role, como hoy). En `after()`, no en el
  render.
- **Emitido = `air_date` ≤ hoy** (o nulo en temporadas antiguas). Todo lo que cuenta progreso,
  cursor, auto-cierre, tarjeta de Inicio y «Al día» usa solo emitidos. Los anunciados se pintan
  como «Próximamente · 12 oct», no marcables.

### 4.3 Una sola pantalla de seguimiento

La pestaña **Episodios** pasa a ser el sitio donde se registra una serie; las demás puertas
reutilizan sus mismas piezas.

1. **Cabecera de seguimiento** (móvil y PC): estado (Viendo / Al día / Vista), `12/20`, barra, y
   el botón grande **«Visto: T2 E6 — Título»**. En «Al día» se sustituye por la fecha del
   siguiente estreno.
2. **Al marcar**, sin modal: aparece en línea una fila de dots «¿Qué tal?» durante unos segundos
   (opcional, se ignora sin coste). Así puntuar episodios es un gesto de un toque, no un viaje.
3. **Lista por temporada:** casilla = visto; tocar la fila = despliega detalle con nota y reseña
   que se **guardan solas** (al soltar la nota / al salir del textarea). Se quita el botón
   «Guardar».
4. **Cabecera de cada temporada:** `8/10 · media 7,6` + menú «Marcar temporada vista».
   Mantener pulsado / menú de un episodio: «Vista hasta aquí» (marca todo lo anterior).
5. **Desmarcar un episodio con nota o reseña pide confirmación.**
6. La **rejilla** se queda como *vista de análisis* (mapa de calor Mías/Comunidad), claramente
   secundaria; tocar una celda abre el mismo detalle que la lista.

La hoja **/sesion** de serie y la tarjeta de Inicio llaman a la misma acción de marcar;
la hoja deja cambiar de temporada sin perder lo marcado.

### 4.4 Notas: tres niveles con una regla

- **Episodio** (opcional, 1–10): como hoy.
- **Temporada:** solo media calculada de tus episodios (sin nota propia) — *decisión abierta D2*.
- **Serie** (`passes.rating`): la que cuenta en tu biblioteca y en la comunidad. Se pide en
  «Estás al día» y al cerrar, **precargada con la media de tus episodios** como sugerencia
  («Tus episodios: 7,8 → ●●●●○»), editable.

### 4.5 Sesiones de serie

Decisión abierta D3: o bien toda marca de episodio (desde cualquier puerta) cuelga de una sesión
del día — así Sesiones y estadísticas cuentan lo mismo vengas de donde vengas —, o bien las series
dejan de tener sesiones y las estadísticas leen `episode_watches.created_at`. Recomendación:
**lo segundo** (un episodio visto ya es la unidad; la sesión de serie solo duplica).

## 5. Decisiones del producto (aceptadas el 2026-09-23, todas con la opción recomendada)

- **D1** — ¿«Al día» derivado (recomendado) o valor nuevo guardado en `media_status`?
- **D2** — ¿Nota propia por temporada, o solo la media calculada (recomendado)?
- **D3** — Sesiones de serie: ¿unificar creando sesión siempre, o eliminarlas y medir por
  episodios vistos (recomendado)?
- **D4** — Intervalo de refresco del catálogo para series en emisión (propuesto: 7 días o al
  pasar `next_episode_air_date`).

## 6. Plan por fases (cada una se puede entregar sola)

1. **Catálogo vivo** (H1, H2) — **hecha** (#1193): columnas nuevas, refresco, filtro de emitidos.
   Adelanta una pieza de H3: una serie en emisión ya no se completa sola y el panel dice «Al día».
2. **Estados** (H3, H4) — **hecha**: «Al día» derivado en ficha, biblioteca, Inicio y pestaña
   Episodios (tarjeta con nota «hasta ahora»); «Seguir con la T5» reabre el mismo pase. Queda
   fuera la rama «serie sin estado de TMDB → preguntar si ha terminado»: sin `tmdb_id` no hay
   catálogo de episodios, así que ese auto-cierre no se da en la práctica.
3. **Pantalla de seguimiento** (H5–H9) — **hecha**: cabecera en móvil y PC, marcar + puntuar en
   línea, autosave de la reseña, marcado masivo (temporada / hasta aquí), confirmación al desmarcar
   (#1194) y la rejilla abre el episodio en la lista. La hoja `/sesion` multi-temporada pasa a la
   fase 4.
4. **Sesiones** (H10) según D3 — **hecha**: las series no crean sesiones; `/sesion` de serie marca
   episodios de varias temporadas con fecha; rachas y calendarios cuentan episodios; un post
   `watched` por serie y día en el feed (`autopost_watched`). Ver `decisiones.md`.
