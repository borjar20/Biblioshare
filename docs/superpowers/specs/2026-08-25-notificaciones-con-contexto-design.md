# Diseño: notificaciones que cuentan lo que pasó, no solo su tipo

- **Fecha**: 2026-08-25
- **Estado**: propuesta, aprobada para plan de implementación
- **Área**: `area:social`
- **Origen**: petición del usuario — «que las notificaciones sean menos genéricas y más basadas
  en lo que ocurre, no todo es like». Dos genericidades distintas conviven hoy: una la creó la
  feature de reacciones con emoji (toda reacción se anuncia como «le gustó», aunque fuera 🔥),
  y otra es más vieja (`{name} terminó una obra`, sin decir cuál).

## 1. Punto de partida

`notifications` guarda `user_id`, `actor_id`, `type`, `target_type`, `target_id`,
`interaction_target_id`, `dedupe_key`, `read_at` y `created_at`. **No guarda ni el emoji, ni el
título de la obra, ni el texto del comentario**: la copia se construye solo a partir del `type`,
y de ahí que todo suene igual.

Copia actual, literal de `messages/es.json`:

| Clave | Texto |
|---|---|
| `reviewLiked` | `{name} le gustó tu reseña` |
| `activityLiked` | `A {name} le gustó tu actividad` |
| `thoughtLiked` | `A {name} le gustó tu pensamiento` |
| `reviewCommented` | `{name} comentó tu reseña` |
| `followedFinished` | `{name} terminó una obra` |

Desde que `reactions.kind` guarda el emoji literal (spec `2026-08-24-reacciones-emoji-libre`),
la primera fila **es falsa**: alguien reacciona con 😱 y la campana dice que le gustó.

El push tampoco va por un camino totalmente distinto, como parecía al principio: su texto se
construye en `notifications.ts` desde una clave i18n por tipo, y algunos puntos de llamada lo
sustituyen entero con un `pushBody` propio. La campana lo construye por su lado, en el
componente cliente. Son dos sitios que hoy coinciden **por convención**, más una tercera vía
para los casos especiales — frágil, y la razón por la que la función de copia debe ser
compartida.

## 2. Decisiones tomadas

| Decisión | Elegido | Alternativa descartada |
|---|---|---|
| Qué enriquecer | Emoji de la reacción, nombre del objeto, y extracto de lo que se dijo | Agrupar por emoji («3 personas reaccionaron 🔥») |
| De dónde sale el dato | **Foto guardada al crear** la notificación | Resolverlo al leer (JOINs polimórficos en cada carga de la campana); o mezcla |
| Spoilers | **No se guarda extracto** si el comentario es spoiler | Guardarlo y taparlo en la UI; enseñarlo igual |
| Push | **Misma copia** que la campana | Push más corto sin extracto; dejar el push como está |

## 3. Modelo de datos

Se añade **una sola columna** a `notifications`:

```sql
alter table public.notifications add column context jsonb;
```

Forma del valor, con todos los campos opcionales:

```json
{ "emoji": "🔥", "subject": "Dune", "excerpt": "Lo terminé anoche y…", "spoiler": false }
```

**Por qué `jsonb` y no tres columnas sueltas**: los tres campos son opcionales y distintos por
tipo (una notificación de seguidor no tiene ninguno; una reacción no tiene extracto), y así solo
hay **un `grant` que revisar** en vez de tres cada vez que el contexto crezca. El precio es que
Postgres no valida la forma: eso lo hace un tipo de TypeScript en el único sitio que la escribe.

Reglas:

- **`excerpt` no se guarda si el comentario es spoiler.** Se marca `spoiler: true` y el texto no
  llega ni a la base de datos, así que no puede escaparse después por el push, por una
  exportación ni por un lector nuevo.
- **El recorte se hace al escribir** (~140 caracteres), no al pintar. Lo que no se guarda no se
  filtra.
- **`context` es nullable y las filas viejas lo tienen a `null`.** La copia genérica actual es
  el respaldo. **Sin backfill**: inventar el contexto de una notificación de hace tres meses
  sería fabricar datos.
- La foto **no se actualiza** si luego editan el comentario o corrigen el título. Es un aviso
  histórico: dice lo que pasó entonces.

### El `grant` por columna, que es lo que puede romper todo

`public.notifications` tiene **grants por columna**, enumerados uno a uno — verificado el
2026-08-25 contra `information_schema.column_privileges` en dev:

- `anon` y `authenticated`: `SELECT` y `UPDATE` en cada columna.
- `postgres` y `service_role`: `INSERT`, `SELECT`, `UPDATE`, `REFERENCES` en cada columna.

Una columna nueva **sin su `grant` no rompe solo ese campo: rompe la escritura ENTERA de la
tabla**, es decir, todas las notificaciones. Compila, pasa el typecheck y pasa los unitarios, y
revienta en producción. Ha pasado dos veces en este repo (issue #375), y por eso `AGENTS.md`
manda correr la superficie 6 de `docs/DRIFT-CHECK.md` al añadir una columna.

La migración incluye los `grant` imitando exactamente los de las columnas existentes.

## 4. Quién rellena el contexto

`notify()` recibe hoy `{userId, actorId, type, interactionTargetId, dedupeKey}`. Se le añade un
`context` **opcional**. Cada punto de llamada rellena solo lo que ya tiene a mano:

- **Reacciones** (`toggleReaction`): tiene el emoji en el argumento. Rellena **solo `emoji`**.
- **Comentarios y menciones** (`addComment`, `notifyMentions`): tienen el cuerpo y el
  `isSpoiler` en la mano. Rellenan **`excerpt`** (o `spoiler: true`).
- **Avisos de seguimiento** (`createPost`, los `followed_*`): tienen la obra ahí mismo, así que
  rellenan **`subject`** — es justo lo que falta en «terminó una obra».
- **El resto** (invitaciones de club, eventos, rondas…) no cambia: pasan sin `context` y siguen
  con su copia actual.

**Corrección sobre el borrador, verificada el 2026-08-25 contra dev**: `interaction_targets` no
guarda ningún título — solo `kind`, `source_id`, `owner_id`, `audience_*`, `href` y los flags de
`commentable`/`reactable`. Así que **las reacciones y los comentarios NO pueden rellenar
`subject`** sin una consulta extra, que es justo lo que la regla de abajo prohíbe. Su copia
enriquecida nombra el tipo de objeto («tu reseña»), no la obra.

Es una limitación asumida y no una omisión: lo que el usuario pidió arreglar es que *«no todo es
like»*, y eso lo resuelve el emoji. Nombrar la obra en reacciones y comentarios queda como issue
(`tipo:feature`), con su coste real anotado: una consulta polimórfica por notificación, o
desnormalizar el título en `interaction_targets`.

**Regla que evita que esto se convierta en un refactor de todo: no se añaden consultas en el
camino de notificar.** Si un punto de llamada no tiene el dato barato, lo omite y su copia se
queda como está. La latencia contra Supabase está medida en ~240 ms por consulta con picos de
1,3 s (`playwright.config.ts`): una consulta extra por notificación se nota.

**Excepción acotada, decidida al escribir el plan:** `createPost` sí puede pagar **una** consulta
para resolver el título de la obra. Se comprobó que ningún llamante lo tiene a mano — `createPost`
recibe `anchorType`/`anchorId` y consulta el ancla pidiendo solo `id`, y el título vive en otra
tabla — así que sin esa excepción `subject` no se podría rellenar **en ningún sitio** y se caería
una de las tres cosas pedidas («terminó una obra» seguiría sin decir cuál).

La excepción se sostiene porque `createPost` es una **acción de publicación**, no un camino de
lectura: ya hace del orden de cinco consultas, corre una vez al publicar y no se repite por
destinatario — el fan-out a seguidores ocurre después, con el título ya resuelto. Es distinto de
añadir una consulta a `toggleReaction`, que se dispara con cada clic en un emoji.

`notify()` es *best-effort* y no propaga errores — una notificación fallida no debe deshacer el
follow o la reacción ya confirmados — y **eso no cambia**: el contexto viaja dentro de esa misma
garantía.

## 5. Cómo se pinta

La copia deja de ser una cadena por tipo y pasa a tener dos variantes: la de siempre y la
enriquecida, elegida según lo que traiga el `context`.

| Hoy | Con contexto | Lo llena |
|---|---|---|
| `A {name} le gustó tu reseña` | `{name} reaccionó 🔥 a tu reseña` | `emoji` |
| `{name} terminó una obra` | `{name} terminó Elantris` | `subject` |
| `{name} comentó tu reseña` | `{name} en tu reseña: «Lo terminé anoche y…»` | `excerpt` |
| `{name} comentó tu reseña` *(spoiler)* | `{name} comentó tu reseña · contiene spoiler` | `spoiler` |

El emoji se pinta **tal cual llegó**, sin traducirlo a un nombre: es lo que la persona eligió. Y
como puede ser uno que el sistema de quien lee no sepa pintar — problema real y ya conocido: en
Windows 10 hay 70 secuencias ZWJ que no fusionan, ver issue #793 — la campana reutiliza
`src/lib/social/emoji-support.ts` y **cae a la copia sin emoji** en vez de enseñar un cuadradito.

**En el push esa comprobación no corre, y es correcto que no corra**: `emoji-support.ts` mide con
un `<canvas>`, que no existe en el servidor, y ya degrada a «sí soportado» cuando no puede medir.
El push, por tanto, siempre lleva el emoji — lo cual es lo que queremos, porque quien lo pinta es
el sistema operativo del dispositivo, con sus propias fuentes, no nuestro HTML. La misma función
de copia sirve a los dos; lo único que cambia es qué responde la detección en cada entorno.

El selector de variante vive en **una función pura**, `src/lib/social/notification-copy.ts`, no
repartido por el componente de la campana. Eso es lo que hace testeable sin DOM que un contexto
vacío caiga al texto de siempre, que un spoiler nunca imprima el extracto y que un emoji no
soportado degrade.

**El push usa exactamente la misma función.** Hoy campana y push coinciden por convención; en
cuanto alguien toque una de las dos copias, se desincronizan.

## 6. Pruebas

Todo lo interesante es puro, así que se prueba en entorno `node`, sin DOM:

- Un `context` nulo o vacío cae a la copia de siempre. Es el caso de **todas** las filas
  históricas y el que más gente verá el primer día.
- Un comentario con `spoiler: true` **nunca** imprime texto, ni aunque alguien meta un `excerpt`
  a mano en el JSON.
- Un emoji que el dispositivo no sabe pintar degrada a la copia sin emoji.
- El recorte del extracto no parte un emoji ni una palabra por la mitad.
- Cada tipo con variante enriquecida produce el texto esperado; los que no la tienen siguen
  igual.
- Campana y push producen el **mismo** texto para el mismo contexto.

Y una prueba que no es de copia sino de esquema, porque es la que ha mordido dos veces:
**que `notify()` sigue escribiendo después de añadir la columna**. Se verifica contra dev
insertando de verdad, no razonando sobre el SQL.

## 7. Alcance

**Dentro**: la columna con su `grant`, el contexto en reacciones, comentarios, menciones y
avisos de seguimiento, la función de copia compartida por campana y push, y la copia nueva en
`messages/es.json`.

**Fuera, a propósito**:

- Agrupar por emoji («3 personas reaccionaron 🔥»).
- *Backfill* de las notificaciones existentes.
- Tocar los tipos que no ganan nada (invitaciones de club, eventos, rondas).
- Que el extracto se actualice si editan el comentario: es una foto del momento (§3).
- **Nombrar la obra en reacciones y comentarios**: imposible sin una consulta extra, porque
  `interaction_targets` no guarda el título (§4). Queda como issue.

## 8. Definición de hecho

- `docs/requirements/data-model.md`: la columna `context`, su forma, la regla del spoiler y el
  aviso de los `grant` por columna. Actualizar la fecha de verificación.
- `docs/requirements/decisiones.md`: entrada al final con lo que no se lee en el código — foto
  guardada en vez de resolución al leer, `jsonb` en vez de tres columnas, y por qué el extracto
  de un spoiler no se guarda siquiera.
- Correr la **superficie 6 de `docs/DRIFT-CHECK.md`** (grants por columna). No es opcional aquí:
  es exactamente el caso que la regla cubre.
- Issues para lo que quede.
