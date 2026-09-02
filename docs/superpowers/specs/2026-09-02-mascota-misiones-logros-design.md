# Mascota fase 2: misiones diarias y logros

> **[Histórico · congelado 2026-09-02]** Spec de diseño de la fase 2 de la mascota (#1013): tres
> misiones diarias generadas y una galería de logros permanentes. Extiende la fase 1
> (`2026-09-02-mascota-rpg-design.md`) sin cambiar su criterio. Explica el *porqué*; el estado de hoy
> manda en el código. Se construye en la rama `feat/mascota-rpg`, que **no sube a producción** hasta
> que el conjunto esté estable: la migración de esta spec se aplica **solo en dev** y en prod al
> mergear.

## Criterio

El de la fase 1, sin recortes: **la mascota es un espejo, no una máquina de culpa**. Una misión no
inventa clics: pide algo que la app ya mide (minutos, notas, valoraciones, terminar una obra) y se da
por cumplida sola cuando las tablas lo dicen. No hay botón de reclamar ni aviso espontáneo: las
misiones viven en `/mascota` y la compañera solo reacciona cuando una se completa, por el canal de
celebraciones que ya existe. **Todo lo derivable se deriva; se guarda lo que es decisión**: qué tres
misiones te tocaron hoy es una decisión (si no, mutarían a mediodía al cambiar de clase o al subir un
atributo), así que se guardan; el progreso, la XP y los logros se calculan.

Decisiones del usuario (2026-09-02, brainstorming en terminal): reparto **fijo primario / flojo /
azar**; recompensa **XP fija al atributo** (bellotas cuando exista qué comprar, #1017); cumplimiento
**automático** al calcular el snapshot; logros **solo umbrales derivados**, sin XP y sin ocultos;
misiones visibles **solo en `/mascota`**; XP de misión **igual a la orgánica de la acción** y las
duras **solo cuando son alcanzables hoy**.

## 1. Misiones

### 1.1 Plantillas

`src/lib/pet/missions/templates.ts`: una entrada por plantilla, sin lógica. El objetivo y la XP viven
en `BALANCE.missions` (`balance.ts` sigue siendo el único sitio con números).

| id | atributo | mide (solo filas de HOY) | objetivo | XP | coste |
|---|---|---|---|---|---|
| `rating` | SAB | valoraciones puestas (pases + episodios) | 1 | 1 | ligera |
| `vote` | CAR | votos en encuestas | 1 | 1 | ligera |
| `new_work` | DES | obras nuevas en la colección (pases creados hoy, vividos) | 1 | 2 | ligera |
| `any_activity` | CON | ¿hay actividad hoy? (sesión, terminado, nota, post o voto) | 1 | 2 | ligera |
| `session_minutes` | FUE | minutos de sesión | 20 | 2 | ligera |
| `note` | SAB | notas | 1 | 3 | media |
| `quote` | SAB | citas | 1 | 3 | media |
| `post` | CAR | posts de club (no encuestas) | 1 | 3 | media |
| `session_pages` | FUE | páginas avanzadas | 30 | 3 | media |
| `daily_goal` | CON | minutos de sesión ≥ `profiles.daily_goal_minutes` | objetivo del perfil | 5 | media |
| `episodes` | FUE | episodios vistos | 2 | 6 | media |
| `review` | SAB | reseñas escritas (obra terminada en los últimos 7 días) | 1 | 8 | dura |
| `finish_pass` | INT | obras terminadas | 1 | 10 | dura |

**XP = la orgánica que ya da la acción, duplicada.** Es la regla, no una tabla aparte: `rating` da 1
SAB, `note` 3, `finish_pass` 10 (`BALANCE.INT.perFinishedPass`). Un día activo normal ronda 8 XP
orgánicos (30 min + día activo + una nota); tres misiones cumplidas añaden entre 5 y 15. Bonus, no
motor. Sin escalado por nivel en esta fase.

Objetivos fijos: `session_minutes` 20, `session_pages` 30, `episodes` 2, todo lo demás 1;
`daily_goal` copia el objetivo del perfil en el momento de asignar.

### 1.2 Elegibilidad

Se filtra ANTES de sortear, para no asignar misiones imposibles:

- `daily_goal`: solo si el perfil tiene `daily_goal_minutes > 0`.
- `post`, `vote`: solo si el usuario pertenece a algún club (`club_members`).
- `episodes`: solo si tiene algún pase de serie abierto.
- `finish_pass` (dura): solo si tiene un pase abierto **a punto de acabar**: libro con posición ≥ 70 %
  de sus páginas (páginas por `pagesForPass`, `src/lib/editions/edition-label.ts`: edición del pase o
  `books.total_pages`; sin páginas conocidas, no elegible) o serie con ≤ 2 episodios sin ver
  (`series_episodes` menos `episode_watches` del pase). La misión lleva la obra: «Termina *Dune*». Si
  hay varias candidatas, la de mayor porcentaje.
- `review` (dura): solo si hay un pase terminado (`finished_on`) en los últimos 7 días sin reseña
  (vía la vista `pass_reviews`; **nunca** `passes.review`, ver fase 1). Lleva la obra: «Reseña
  *Dune*». Si hay varias, la más reciente.

Las dos duras cuentan progreso **sobre la obra asignada**, no sobre cualquiera: terminar otra cosa
no cumple «Termina *Dune*».

### 1.3 Generación

`src/lib/pet/missions/generate.ts`, pura:

```
pickDailyMissions(seed, primary, attributes, eligible): MissionPick[3]
```

- **Hueco 0 (primario)**: plantilla del atributo primario de la clase, coste ligera o media.
- **Hueco 1 (flojo)**: plantilla del atributo con menor valor en `attributes` distinto del primario
  (empate: orden de `PET_ATTRIBUTES`), coste ligera o media.
- **Hueco 2 (azar)**: plantilla de cualquier atributo no usado en 0 y 1, coste media o **dura si hay
  alguna elegible**. Máximo una dura al día, y siempre en este hueco.
- Sin repetir plantilla ni atributo entre huecos. Si un atributo no tiene plantilla elegible, el
  hueco toma la siguiente del orden de `PET_ATTRIBUTES` que sí tenga.
- Azar determinista: `hash(userId + day)` (FNV-1a de 32 bits, sin dependencias) para elegir dentro de
  cada hueco. La fila guardada manda de todos modos; el determinismo solo evita que dos pestañas
  generen sets distintos antes del `on conflict`.

`MissionPick = { template, target, xp, itemType?, itemId? }`.

### 1.4 Progreso

`src/lib/pet/missions/progress.ts`, pura: `missionProgress(mission, day: PetDayCounts): number`.
`PetDayCounts` (en `counts.ts`) son los contadores **del día local de hoy**, calculados en
`getPetCounts` a partir de las filas que ya carga, sin consultas nuevas:

| contador | fuente |
|---|---|
| `minutes`, `pages` | `progress_sessions` con `session_date = hoy` (páginas con la misma regla que `sessionUnits`) |
| `episodes` | `episode_watches.watched_on = hoy` |
| `finishedKeys` | `passes.finished_on = hoy`, como `"tipo:id"` (para las duras con obra) |
| `notes`, `quotes` | `notes.created_at` a día local = hoy |
| `ratings` | pases con `rating` y `updated_at` a día local = hoy, más episodios con `rating` vistos hoy |
| `reviewedKeys` | `pass_reviews` con reseña no vacía, como `"tipo:id"` (la vista no expone `updated_at`; `review` se cumple por ESTADO: la obra asignada, que no tenía reseña al asignar, la tiene ahora) |
| `posts`, `votes` | `club_posts.created_at` / `club_poll_votes.voted_at` a día local = hoy |
| `newWorks` | pases vividos con `created_at` a día local = hoy |

Requiere añadir `updated_at`/`watched_on`/`created_at` a los `select` de `getPetCounts`; no cambia el
número de consultas. «Día local» = `toISODate(new Date(ts))`, la convención de `session_date` y
`todayISO()`.

Trampa asumida: `ratings` usa `passes.updated_at`, que también se mueve al editar otro campo del
pase. Una edición sin cambio de nota puede contar como «valoración de hoy». Es un falso positivo raro
y a favor del usuario; se documenta, no se corrige en esta fase.

## 2. Logros

`src/lib/pet/achievements.ts`: lista fija `{ id, counter, threshold }` sobre `PetCounts`, más dos
entradas derivadas del nivel. `unlockedAchievements(counts, level): AchievementId[]` pura.

| id | mide | umbral |
|---|---|---|
| `finished_10` / `finished_50` / `finished_100` | `finishedPasses` (vividos) | 10 / 50 / 100 |
| `sessions_100` | `sessionUnits` | 100 |
| `episodes_100` | `episodes` | 100 |
| `notes_50` | `notes + quotes` | 50 |
| `reviews_10` | `reviews` | 10 |
| `genres_10` | `distinctGenres` | 10 |
| `streak_30` / `streak_100` | `bestStreak` (nuevo en `PetCounts`, de `getStreaks().best`) | 30 / 100 |
| `posts_50` | `posts` | 50 |
| `sagas_3` | `completedSagas` | 3 |
| `missions_50` | `missionsCompleted` (nuevo en `PetCounts`) | 50 |
| `adult` / `veteran` | nivel | 10 / 40 |

Sin XP (la actividad ya la dio), sin ocultos, sin tabla: desbloqueado ⟺ contador ≥ umbral. El rastro
es la celebración `pet_achievement:<id>`, y su `first_triggered_at` es la fecha que enseña la
galería.

## 3. Datos

**Tabla `pet_daily_missions`** (`supabase/migrations/20260903_pet_daily_missions.sql`, **dev
primero; prod solo al mergear la rama**):

| columna | tipo | notas |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | |
| `user_id` | uuid not null FK `auth.users` `on delete cascade` | |
| `day` | date not null | día LOCAL del usuario (`todayISO()`) |
| `slot` | smallint not null, check 0..2 | |
| `template` | text not null | id de plantilla; texto, no enum, como `event_type` |
| `target` | int not null | congelado al asignar |
| `xp` | int not null | congelado al asignar |
| `item_type` / `item_id` | text / uuid null | solo duras con obra |
| `completed_at` | timestamptz null | |
| `created_at` | timestamptz not null default now() | |

`unique (user_id, day, slot)`. Índice `(user_id, completed_at)` para la suma de XP. RLS:
`select`/`insert`/`update` propias (`auth.uid() = user_id`), sin `delete`, sin `anon`. **Grants por
columna** a `authenticated` (todas en insert; `completed_at` en update) y superficie 6 de
`docs/DRIFT-CHECK.md` antes de cerrar (#375). Actualizar `data-model.md` §8bis.2 y
`schema-baseline.sql`; regenerar `database.types.ts`.

**`PetCounts` crece con**: `missionXp: Record<PetAttribute, number>` (suma de `xp` de las filas
completadas, agrupada por el atributo de la plantilla), `missionsCompleted`, `bestStreak`.
`deriveAttributes` suma `missionXp[attr]` a cada atributo: sin tope y con el bonus de clase normal,
como cualquier fuente.

**`BALANCE.missions`**: `{ targets: { session_minutes: 20, session_pages: 30, episodes: 2 },
finishThreshold: 0.7, seriesEpisodesLeft: 2, reviewWindowDays: 7 }`. La XP de cada plantilla se
deriva de los pesos que ya existen en `BALANCE` (regla §1.1), no se lista dos veces.

## 4. Flujo en `getPetSnapshot`

Único punto de escritura, como ya lo es para nivel y etapa:

1. Lee `pet_daily_missions` de `day = hoy`. Si no hay filas, genera con `pickDailyMissions` e
   inserta las tres con `on conflict (user_id, day, slot) do nothing`, y relee (dos pestañas a la
   vez: la primera gana, la segunda lee lo de la primera).
2. Calcula `PetDayCounts` y, por misión sin `completed_at`, `missionProgress`. Si progreso ≥
   `target`: `update completed_at = now()` y gana `pet_mission_done` con `key = "<day>:<slot>"`.
3. Logros: `unlockedAchievements` menos los ya ganados (lectura de `user_celebrations` con
   `event_type = 'pet_achievement'`, que además da las fechas para la galería). Solo se gana lo
   nuevo: ninguna escritura en una visita sin novedades.
4. El snapshot devuelve `missions: MissionView[3]` (plantilla, texto, obra, progreso, objetivo, XP,
   completada) y `achievements: AchievementView[]` (id, desbloqueado, fecha, progreso/umbral).

**Límite asumido**: como el nivel (#1020), todo se detecta al abrir `/mascota`. Una misión cumplida a
las 23:59 y vista al día siguiente sigue contando: el progreso se evalúa sobre el `day` de la fila,
no sobre hoy, así que el paso 2 se ejecuta también para las filas de **ayer** sin completar (una
consulta que ya trae `day in (ayer, hoy)`). Más atrás no: a los dos días la misión caduca sin más.

## 5. Celebraciones

Dos eventos nuevos en `registry.ts`: `pet_mission_done` (`medium`, 1400 ms, fallback `fade`) y
`pet_achievement` (`high`, 1800 ms, fallback `static`). Scope nuevo **`"key"`**: la clave es
`<event>:<payload.key>`, con `key?: string` en `CelebrationPayload`. Hace falta porque `day` no
distingue dos misiones del mismo día y `milestone` es numérico. El overlay los pinta con el texto de
la misión/logro en `payload.title`. La compañera ya reacciona a `celebrations:shown` (fase 1): no
se toca.

## 6. UI en `/mascota`

Dos secciones bajo «Qué la sube», servidor, sin estado cliente:

- **`mission-board.tsx`** «Misiones de hoy»: tres tarjetas con el icono del atributo, el texto (con
  el título de la obra en las duras), barra `progreso / objetivo` y `+N XP`. Completada: tachada con
  marca. Sin botones. Al cambiar el día local, el siguiente snapshot genera las nuevas.
- **`achievement-grid.tsx`** «Logros»: rejilla; desbloqueado con fecha («12 ago 2026»); bloqueado en
  gris con umbral y progreso («Termina 50 obras · 22/50»). Orden: desbloqueados primero por fecha,
  luego bloqueados por cercanía.

Textos en `messages/es.json`, namespaces `pet.missions.<template>` (con `{title}` para las duras) y
`pet.achievements.<id>`; el layout ya carga `pet`.

## 7. Testing

- **Vitest**: `pickDailyMissions` (reparto primario/flojo/azar; sin repetir atributo ni plantilla;
  dura solo si elegible, máximo una y en el hueco 2; determinismo por seed; flojo = primario toma el
  siguiente; atributo sin plantilla elegible); `missionProgress` por plantilla, incluidas las duras
  sobre la obra asignada y `review` cumplida por estado; `PetDayCounts` con filas de ayer y hoy y
  con `updated_at` a caballo de medianoche local; `unlockedAchievements` en los umbrales; `deriveAttributes` con `missionXp`;
  `getCelebrationKey` con scope `key` (y error si falta `key`); hash determinista.
- **E2E** (contra `next build` + `next start`, Supabase dev): abrir `/mascota` crea tres misiones y
  las pinta; registrar una sesión de 20 minutos y volver marca `session_minutes` completada y la
  celebración se drena; la galería enseña logros bloqueados con progreso. Limpieza: borrar
  `pet_daily_missions` y las celebraciones `pet_*` del usuario de prueba en el `afterEach`.

## 8. Fuera de fase 2

Cada línea, una issue al cerrar esta spec:

- Misión semanal para las duras cuando no hay obra a punto de acabar.
- Logros ocultos («leíste a las 3 de la mañana»).
- Tarjeta «Misiones de hoy» en la portada.
- Escalado de objetivos por nivel o por historial del usuario.
- `finish_pass` para películas (hoy solo libros y series tienen «a punto de acabar»).
- Push por misión pendiente (fase 3, #1014).
- Falso positivo de `ratings` por `updated_at` (si molesta, columna `rated_at`).
