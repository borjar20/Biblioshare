# Wrap-up mensual: revisión visual de Terminado, En marcha, Ritmo y En compañía

[Histórico · congelado 2026-10-13] Diseño acordado tras revisar en el móvil el wrap-up de
septiembre de 2026. Amplía la spec base `2026-10-06-wrap-ups-design.md`; lo que no se toca aquí
sigue como allí.

## Por qué

Revisión con capturas reales (Android, wrap-up de septiembre 2026):

| Story | Qué se ve hoy | Problema |
|---|---|---|
| Terminado | «12 obras terminadas», 4 portadas y «y 8 más» | Enseñar 4 de 12 sugiere que solo hubo 4; sobra alto de pantalla |
| En marcha | Una portada (Reacher) y su título | El usuario tenía 3 obras a medias y solo sale 1; pantalla vacía |
| Ritmo | Tira de 30 celdas «MX J V S D L…» y tres líneas | Ilegible a ancho de móvil; la franja, además, sale en UTC (#1512) |
| En compañía | «4 planes compartidos» = 2 visionados + 2 días de club | Suma unidades distintas; no dice qué ni con quién |

### Diagnóstico de «En marcha» (caso real, prod, @maxteryo)

No es un bug: la regla de la spec base era «pases abiertos **tocados en la ventana**»
(`load/core.ts`, sesión en la ventana o episodio de esa serie). El usuario tenía:

| Obra | Tipo | Último avance | ¿Tocada en sept.? |
|---|---|---|---|
| Reacher | serie | 5 sep | sí |
| Buena suerte, pásalo bien, no mueras | película | sin sesiones (abierta 14 ago) | no |
| Elantris | libro | 13 ago | no |

Además, los pases abiertos se leen **al generar** (aquí, el 12 oct), no al cierre del mes: algo
terminado el 3 de octubre desaparecía del «En marcha» de septiembre.

## Decisiones

1. **En marcha = todo lo abierto al cierre de la ventana**, con lo avanzado en el mes destacado
   («3 a medias · 1 avanzó este mes»). Las series ganan porcentaje.
2. **Terminado = rejilla de 3 columnas con scroll vertical automático** y fundido arriba/abajo.
3. **Ritmo = tres gráficas**: calendario del mes (binario), mapa de calor L–D y mapa de calor de
   12 franjas de 2 h en hora de Madrid.
4. **En compañía = qué y con quién**: visionados con portada y compañeros, clubes con nombre y días.
   Sin cifra sumada. Los compañeros se guardan como ids y se resuelven al pintar.

## 1. Payload `v: 2`

`WrapUpPayload.v` pasa a `1 | 2`; `build.ts` escribe `2`. No hay migración de esquema (el payload
es JSON en `wrap_ups.payload`). Los payloads `v: 1` siguen pintándose: cada story nueva acepta los
campos ausentes y cae al pintado actual (ver §6).

| Story | Campo | Cambio |
|---|---|---|
| `finished` | `items` | tope de 8 → **30** (`total` sigue siendo el total real) |
| `in_progress` | `items` | todo lo abierto al cierre, ordenado: tocadas primero (por último avance en la ventana desc), luego el resto (por `started_on` desc); tope **12** |
| `in_progress` | `touchedTotal` | nuevo: cuántas abiertas avanzaron en la ventana (sin tope) |
| `in_progress` | `items[].touched` | nuevo, `boolean`: avanzó dentro de la ventana |
| `in_progress` | `items[].percent` | también para series (ver §2) |
| `in_progress` | `openTotal` | nuevo: total de abiertas al cierre (puede superar 12) |
| `rhythm` | `byWeekday` | nuevo, `number[7]` (lunes = 0) |
| `rhythm` | `byBand` | nuevo, `number[12]` (franja i = de 2i a 2i+2, **hora de Madrid**) |
| `together` | `viewings` | nuevo: `{ item: ItemRef; watchedOn: string; companionIds: string[] }[]` |
| `together` | `clubs` | nuevo: `{ clubId: string; name: string; days: number }[]`, desc por `days` |

`jointViewings` y `clubDays` se conservan (narradora y retrocompatibilidad).

El resumen público (`ShareSummary`) **no cambia**: ni compañeros ni clubes salen del dueño.

## 2. Cargadores

### En marcha (`load/core.ts`)

«Abierto al cierre» (`endExclusive` de la ventana):

- `status = 'in_progress'` y (`started_on` < `endExclusive` o `started_on` nulo), **o**
- `status = 'completed'` y `finished_on` ≥ `endExclusive` y (`started_on` < `endExclusive` o nulo).

Los pases `dropped` no entran: no guardan fecha de abandono, así que no se sabe si seguían abiertos
al cierre. Límite asumido.

`touched` = la regla actual (sesión del pase en la ventana, o episodio de esa serie en la ventana).

Porcentaje:

- **Libro**: `passPercent(page, total_pages)` con la posición actual, solo si el pase sigue
  `in_progress`; si ya se terminó después del cierre, `null` (la posición actual es la final, no la
  del cierre).
- **Serie**: episodios distintos `(season_number, episode_number)` de `episode_watches` con ese
  `pass_id` y `watched_on` < `endExclusive`, entre `series.total_episodes`. `null` si
  `total_episodes` es nulo o 0. Tope 99 mientras el pase esté abierto (como `passPercent`).
- **Película**: `null`.

### Ritmo (`stats/get-habits.ts` + `load/core.ts`)

`computeHabits` devuelve además `byWeekday` y `byBand`. La franja se calcula con la hora de
`Europe/Madrid` (`Intl.DateTimeFormat` con `timeZone`), no con `getUTCHours`. Esto arregla #1512
también en `/estadisticas`, que consume la misma función. `favoriteBand` y `favoriteWeekday` salen
de esos mismos arrays.

### En compañía (`load/moments.ts`)

- Visionados: por cada `joint_viewing` aceptado en la ventana, su obra (`item_type`, `item_id` →
  `ItemRef`), `watched_on` y los `user_id` de los demás miembros con `status = 'accepted'`.
- Clubes: `club_posts` del usuario en la ventana agrupados por `club_id`, días distintos (Madrid)
  por club, con `clubs.name`.

Corre con service role (cron): toda consulta filtra por el usuario dueño, como el resto del loader.

## 3. Pantallas

Todas mantienen el rótulo, la placa y la narradora de la spec base. `PosterModel` gana los campos
que cada layout necesita; el texto sigue llegando ya escrito desde `view-models.ts`.

### Terminado — layout `covers` con scroll

- Cifra fija arriba: «12 obras terminadas».
- Debajo, rejilla de **3 columnas** con las portadas (hasta 30) que ocupa el alto libre.
- **Más de 9 portadas**: la rejilla sube en bucle lento (transform en CSS, sin JS por frame), con
  `mask-image` en degradado arriba y abajo para el fundido. La animación se pausa con la story
  (pulsación larga) igual que la barra de progreso.
- **Hasta 9**: rejilla quieta; con 4 o menos, cartas más grandes (2 columnas).
- **Reduced motion**: rejilla quieta con las 9 primeras y «y N más».
- Si `total` > portadas del payload, línea «y N más» al pie (cuenta sobre `total`).
- Lector de pantalla: la lista lleva todos los títulos; la animación es decorativa.

### En marcha — layout nuevo `progress`

- Cifra: «3 obras a medias» (`openTotal`). Línea: «1 avanzó este mes» (o «Ninguna avanzó este
  mes» si 0 tocadas).
- Lista de filas: portada pequeña, título, barra de progreso con % si lo hay. Las no tocadas, con
  opacidad reducida y la etiqueta «sin avances este mes» para lector de pantalla.
- **1–2 obras**: cartas grandes (portada a media anchura) con título y barra debajo.
- Más de las que caben (12 en payload, ~6 visibles): se muestran 6 y «y N más».
- La narradora usa `touched` y `openTotal` para su línea.

### Ritmo — layout nuevo `calendar`

De arriba abajo:

1. Cifra «14 días con actividad».
2. **Calendario del mes**: cabecera L M X J V S D, 5–6 filas, el mes empieza en su día de la
   semana. Casilla activa rellena, inactiva en contorno. Número del día dentro de cada casilla.
3. **Mapa de calor de la semana**: 7 casillas L–D, intensidad en 4 niveles relativos al máximo
   (0, ≤⅓, ≤⅔, >⅔). El máximo lleva etiqueta («sábado»).
4. **Mapa de calor de las horas**: 12 casillas (00, 02, … 22), mismos 4 niveles. El máximo lleva
   etiqueta («02–04 h»).
5. Una línea: «Tu mejor racha: 3 días seguidos» (solo si ≥ 2).

Si `byWeekday`/`byBand` faltan (payload `v: 1`) o están a cero, ese mapa no se pinta y vuelve la
línea de texto equivalente («Tu día más activo: …»). El anual no usa calendario (sin `days`): solo
los dos mapas.

Accesibilidad: cada gráfica tiene un texto alternativo con su resumen («Días con actividad: 1, 2,
5…», «Más activo el sábado», «Más activo de 02:00 a 04:00»). Los niveles no dependen solo del
color: el nivel máximo lleva además la etiqueta escrita.

### En compañía — layout nuevo `together`

- Sin cifra sumada. Dos bloques, cada uno solo si tiene datos:
  - **Visto en compañía**: filas con portada pequeña, título y avatares (máx. 3 + «+N») de los
    compañeros. Máx. 4 filas y «y N más».
  - **En tus clubes**: filas «Nombre del club · N días». Máx. 3.
- Si solo hay un bloque, ocupa la pantalla con elementos más grandes.
- Compañeros resueltos al pintar (§5). Si no se puede resolver a nadie de una fila (bloqueado,
  cuenta borrada), la fila queda sin avatares.

## 4. Temporización del player

Hoy todas las stories duran `STEP_MS = 6000`. El player acepta una duración por story; `finished`
con scroll dura `6 s + 1 s × (filas − 3)`, con tope de 15 s. La barra de progreso usa esa
duración. El resto, 6 s.

## 5. Compañeros: resolución al pintar

- El payload guarda solo `companionIds`.
- Al cargar el wrap-up propio (ruta del player), una consulta con **el cliente de la petición**
  trae `username` y avatar de esos ids y descarta los que estén en `user_blocks` en cualquier
  dirección respecto del que mira.
- **Sin `use cache`** (regla #437): el resultado depende de quién mira (bloqueos).
- El feed y la imagen compartida usan el `ShareSummary`, que no lleva compañeros: no cambian.

## 6. Retrocompatibilidad `v: 1`

| Story | Si falta el dato nuevo |
|---|---|
| `finished` | Igual que `v: 2` con las ≤ 8 portadas guardadas |
| `in_progress` | Sin `openTotal`/`touched`: cifra = nº de items, todas como tocadas, sin línea de «avanzó» |
| `rhythm` | Calendario a partir de `days`; sin mapas; líneas de texto actuales |
| `together` | Sin `viewings`/`clubs`: líneas actuales sin la cifra sumada |

Los wrap-ups ya generados no se regeneran automáticamente.

## 7. Pruebas

- `get-habits`: `byWeekday`/`byBand`; una fila con `started_at` `2026-09-05T23:30:00Z` cae en la
  franja 00–02 (01:30 en Madrid, verano) y en invierno se desplaza 1 h.
- Loader de En marcha: caso @maxteryo (3 abiertas, 1 tocada → `openTotal` 3); pase terminado
  después del cierre sigue apareciendo; `dropped` no aparece; % de serie con y sin `total_episodes`.
- `select-stories` y `view-models`: topes nuevos, orden de `in_progress`, textos de cada layout,
  ramas `v: 1`.
- Loader de En compañía: visionados con compañeros (excluido el propio usuario y los no aceptados),
  clubes con días distintos.
- Resolución de compañeros: un bloqueado no sale.
- Player: duración por story.
- Navegador a ancho móvil (375 px) de las cuatro pantallas, con y sin reduced motion, con pocos y
  muchos datos.

## Fuera de alcance

- Regenerar wrap-ups antiguos.
- Intensidad por minutos en el calendario (descartada: los mapas ya cuentan la intensidad).
- Story semanal y anual, salvo lo que heredan de `computeHabits` y del layout de Ritmo.
