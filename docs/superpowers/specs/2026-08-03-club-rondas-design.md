# La ronda — el latido semanal de un club — diseño

[Canónico · verificado 2026-08-03]

Cada semana, a un miembro del club **le toca** proponer algo: una pregunta al club, con o
sin una obra adjunta. El resto responde. Si el titular no aparece, a mitad de semana entra
una **consigna de la casa** y el club sigue teniendo algo que responder.

El problema que resuelve: hoy **todo lo que pasa en un club hay que crearlo a mano**. Una
actividad la propone alguien, un post lo escribe alguien. Si nadie empuja, el club está
vacío aunque sus miembros estén leyendo a diario. Con 3–8 miembros —el tamaño real de los
clubes de este producto— eso es la muerte por silencio.

La apuesta es que en un grupo pequeño el mecanismo que funciona **no es la novedad, es la
obligación personal**: «te toca a ti» mueve a alguien que un feed vacío no mueve. Y como
la obligación falla, la casa tiene que cubrir el hueco.

Maqueta de los cinco estados: `https://claude.ai/code/artifact/6f9c246b-d135-4ddb-850a-be45d678bda6`

---

## 1. Decisión de fondo: NO es un sexto `kind` de `club_activities`

**SD-8** (`docs/requirements/social-epic.md`) manda que un tipo nuevo de contenido de club
entre como valor del enum `activity_kind`, nunca como tabla propia, y así entró `evento`
(`2026-07-22-club-eventos-design.md`). Aquí se decide lo contrario, y conviene dejar
escrito por qué, porque la próxima persona va a hacerse exactamente esta pregunta.

SD-8 declara su propia premisa: las actividades comparten forma porque **«las propone
alguien, tienen un ciclo de vida (propuesta → activa → finalizada), una participación
opt-in, y una superficie de discusión»**. Una ronda no cumple las tres primeras:

- **No se propone a moderación.** El turno lo asigna la aritmética, no una decisión.
- **No tiene ciclo de vida.** Nace y muere con su semana; nadie la activa ni la cierra.
- **No tiene participación opt-in.** Todo el club es su audiencia por definición.

Solo comparte la cuarta —la superficie de discusión—, y esa ya **no vive en
`club_activities`**: vive en `interaction_targets` desde la fase 1 social, y se hereda
igual siendo tabla propia. La única razón estructural de SD-8 que quedaría en pie ya no
depende de SD-8.

Y el argumento que sí metió `evento` como kind —*el calendario debe leer una sola fuente
de fechas de club*— aquí **juega al revés**. Un evento es una fecha señalada, puntual y
curada: pertenece al calendario. Una ronda es **recurrente y automática, 52 filas al
año**. Meterla en `club_activities` inundaría la lista de actividades y el calendario del
club con ruido semanal, y obligaría a filtrarla explícitamente en las dos superficies que
SD-8 pretendía unificar. Se pagaría el precio de la unificación para después deshacerla.

**Conclusión: `club_rounds` es tabla propia.** Una ronda no es una actividad del club, es
una propiedad del club, como su feed.

## 2. Mecánica

### 2.1 El periodo

La **semana ISO del servidor**: `2026-W32`, de
`to_char(timezone('Europe/Madrid', now()), 'IYYY-"W"IW')`. Fijo, no configurable. Un club
real tendrá que pedir quincenal o mensual antes de que eso se construya.

**`Europe/Madrid` y no UTC, a propósito.** Con UTC la semana cambiaría a las 02:00 del
lunes en horario de verano: quien escribiera un domingo por la noche vería su ronda caer en
la semana siguiente. El producto es de un solo idioma y un solo huso, así que el huso se
fija en vez de arrastrar un desfase silencioso.

### 2.2 El turno

Aritmética pura, sin estado guardado:

```
turno    = (semanas transcurridas desde clubs.created_at) % nº de miembros activos
titular  = miembros activos ORDER BY (joined_at, user_id) [turno]
```

Rotan **todos los miembros activos**, sin apuntarse. La semana del miembro pasivo la cubre
la consigna de la casa, que es justamente para lo que existe.

**Límite conocido y asumido:** si alguien entra o sale del club, la rotación se desplaza —
el que iba a ser titular la semana que viene puede dejar de serlo. Evitarlo exige una
tabla de turnos materializados con su propio mantenimiento. No se paga: el efecto es
invisible en la práctica (nadie sabe de antemano cuándo le toca dentro de tres semanas) y
se autocorrige.

### 2.3 Los tres días que importan

| Momento | Quién puede escribir | Qué ve el club |
|---|---|---|
| Días 1–2 (lun–mar) | Solo el titular | «Esta semana le toca a Marta» |
| Día 3+ (mié–dom) | El titular **o** cualquiera respondiendo a la consigna de la casa | La ronda propuesta, o la consigna de la casa |

**Quien escriba primero define la ronda del periodo.** Una sola regla, cero estado: lo
garantiza `unique (club_id, period_key)`. Si Marta propone el jueves y nadie había
respondido aún a la de la casa, la ronda es suya; si alguien ya respondió, Marta perdió su
semana.

Los días 1–2 están **deliberadamente vacíos de contenido respondible**. Si ahí ya hubiera
algo que contestar, el turno del titular no valdría nada: su valor entero es la
exclusividad. Y dura 48 horas como máximo, con el feed del club encima — no deja una
pantalla en blanco.

### 2.4 La consigna de la casa

Un array de constantes **en SQL**, dentro de `private.house_prompt(club_id, period_key)`,
cuyo índice sale de `hashtext(club_id || period_key)`: dos clubes distintos no reciben la
misma pregunta la misma semana, y el mismo club recibe siempre la misma para una semana
dada (idempotente si se materializa dos veces).

**En SQL y no en TypeScript, aunque un array de strings pida a gritos vivir en TS**: el
texto lo elige el servidor y el cliente no lo manda (si lo mandara, cualquiera podría
publicar la consigna que quisiera con el sello de la casa). Si el servidor lo elige, la
lista tiene que estar donde está el servidor. Añadir consignas es un
`create or replace function`. Se acepta porque el repo es mono-idioma (`es`); el día que
haya un segundo locale, esto se mueve a la capa de traducción.

**La consigna de la casa no tiene fila hasta que alguien la responde.** Se materializa en
ese momento, y el `unique` hace idempotente la carrera entre dos respuestas simultáneas.
Las semanas que nadie toca no dejan basura en la tabla, y el histórico puede pintar el
hueco («Sin ronda») sin distinguir casos.

## 3. Esquema

Una sola migración, **dev primero** (`supabase-dev`), luego producción, verificada contra
los objetos reales (`pg_proc`, `pg_class`, `information_schema.columns`) y **nunca contra
`list_migrations`** — el ledger ya mintió una vez en esta base de código (fase 1 social,
`data-model.md`).

### 3.1 Enums

```sql
alter type public.target_kind       add value if not exists 'club_round';
alter type public.notification_type add value if not exists 'club_round_proposed';
alter type public.notification_type add value if not exists 'club_round_commented';
alter type public.notification_type add value if not exists 'club_round_liked';
commit;   -- Postgres prohíbe USAR una etiqueta de enum en el tx que la crea
```

No se reutilizan `club_post_commented`/`club_post_liked`, que habría sido más barato: el
aviso diría «comentó tu publicación» de algo que no es una publicación. Una copia
mentirosa es un defecto que ve el usuario.

### 3.2 La tabla

```sql
create table public.club_rounds (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  period_key text not null,                          -- '2026-W32'
  author_id  uuid references auth.users(id) on delete set null,  -- NULL = casa
  prompt     text not null,
  item_type  public.item_type,                       -- par (type, id), como
  item_id    uuid,                                   -- club_activity_items
  created_at timestamptz not null default now(),
  unique (club_id, period_key)
);

create index idx_club_rounds_club on public.club_rounds (club_id, created_at desc);
```

`author_id` es nullable y `on delete set null` **a propósito, y las dos cosas importan**:
si el autor borra su cuenta, la ronda y sus respuestas siguen teniendo sentido para el
club, y queda como ronda sin autor — un estado que la UI ya sabe pintar, porque es el
mismo de la consigna de la casa. Con `cascade` se llevaría por delante la conversación
entera del club; sin acción explícita (el defecto, `no action`) **impediría borrar la
cuenta**, que es peor todavía.

La obra se referencia con el par `(item_type, item_id)` sin FK, igual que
`club_activity_items` — el catálogo no es una sola tabla.

### 3.3 La fecha y el turno viven en SQL, no en TypeScript

**Es la decisión con más consecuencias de la spec.**

```sql
create function public.get_club_round_state(p_club_id uuid)
returns table (period_key text, holder_id uuid, day_of_week int, round_id uuid, ...)
```

El cliente **nunca** calcula ni envía el periodo. TS solo pinta lo que recibe. Esto mata
de raíz, para esta feature, la clase de bug de la issue **#271** («la píldora *Ya pasó*
usa la fecha del NAVEGADOR, no la del servidor»): no hay ninguna fecha de navegador en el
camino.

**Precio asumido:** la lógica de turno no se puede probar con Vitest. Se prueba donde se
aplica, con una matriz transaccional (§5). La alternativa —calcularlo en TS *y* volver a
validarlo en SQL, porque la RPC tiene que validarlo igualmente— son dos implementaciones
de la misma regla, y divergen.

### 3.4 Escritura solo por RPC

Sin política `INSERT` en la tabla; el único camino es una función `SECURITY DEFINER`,
mismo patrón que `create_club` y `create_club_poll`:

```sql
create function public.ensure_club_round(
  p_club_id uuid, p_prompt text default null,
  p_item_type public.item_type default null, p_item_id uuid default null
) returns uuid
```

1. Calcula el periodo **en el servidor**.
2. Si ya hay fila de ese periodo, **devuelve su id** — idempotente. La carrera entre dos
   respuestas simultáneas a la consigna de la casa la resuelve el `unique`, no un lock.
3. Con `p_prompt`: exige que quien llama sea **el titular** del periodo.
4. Sin `p_prompt`: es la consigna de la casa. `author_id` nulo, texto **elegido por el
   servidor** (nunca enviado por el cliente), y solo permitido **del día 3 en adelante**.

### 3.5 RLS

- `SELECT`: `is_club_member(club_id)`. Contenido siempre solo-miembros, con independencia
  de `visibility` — patrón **SD-4**, el mismo de todo el contenido de club.
- `DELETE`: `has_min_club_role(club_id, 'moderator')`. Una consigna abusiva se queda una
  semana entera en lo alto del club; un moderador tiene que poder quitarla.
- `UPDATE`: **ninguna**. Una ronda es inmutable: sus respuestas contestan a *esa* pregunta,
  y permitir editarla las dejaría contestando a otra.

### 3.6 Dos triggers, los dos reutilizando lo que existe

- `after insert` → `private.upsert_interaction_target('club_round', new.id, coalesce(new.author_id, dueño del club), 'club_member', new.club_id, '/club/<slug>?ronda=<period_key>', true, true, 'club_round_commented', 'club_round_liked')`.
  Calcado de `private.sync_club_post_interaction_target()`. El `owner_id` de una ronda de
  la casa es el **dueño del club** porque la columna es `NOT NULL` y la casa no es un
  usuario; consecuencia aceptada: los comentarios a una ronda de la casa avisan al dueño.
- `after delete` → `private.cleanup_social_target('club_round')`, la función genérica que
  ya cierra los reportes pendientes y barre target, comentarios, reacciones y avisos.

Con esto, las respuestas del club **no son una tabla nueva**: son comentarios normales
sobre el registro canónico, y heredan menciones, reacciones, bloqueos bidireccionales y
reportes de las fases 0 y 1 sociales sin escribir una línea de eso.

## 4. UI

Un bloque **«La ronda» arriba de la pestaña Feed** del club, encima de los posts. Lo
primero que ves al entrar. **No es pestaña nueva**: una pestaña vacía es peor que ningún
sitio, y un latido escondido no es un latido.

Cinco estados (maqueta enlazada arriba):

1. **Te toca a ti** (días 1–2, titular) — composer inline: textarea, botón «+ Añadir una
   obra», y el plazo dicho en cristiano: «Hasta el miércoles es tuya», que es
   `unique(club_id, period_key)` traducido a lenguaje humano.
2. **Le toca a otro** (días 1–2) — «Esta semana le toca a Marta» + los siete puntos de la
   semana. Sin nada que responder, por diseño (§2.3).
3. **Ronda propuesta** — autor, consigna en serif grande, obra opcional con acción
   **«A pendientes»**, respuestas, reacciones, y las caras de quién ya contestó.
4. **Ronda de la casa** — sello dorado, sin autor ni avatar. Aún **sin fila en BD** hasta
   que alguien pulsa «Responder».
5. **Rondas anteriores** — lista compacta (`W31`, `W30`…) con recuento de respuestas, y el
   hueco «Sin ronda» pintado en vez de escondido. No aporta mecánica; aporta que un club
   de tres meses **parezca** un club.

La obra va **detrás de un botón**, no en un campo siempre visible: la mayoría de rondas
serán solo pregunta, y un selector permanente convierte un campo en un formulario.

**Se reutiliza, no se construye:** `ItemPicker` (`src/components/clubs/item-picker.tsx`,
ya trae biblioteca + catálogo + cache-as-you-go), el árbol de comentarios y reacciones
sobre `interaction_targets`, `notifyClub()` para el aviso, y los componentes de avatar y
botón del sistema Paper.

## 5. Pruebas

- **Matriz SQL transaccional** `supabase/tests/club_rounds.sql`, patrón de
  `supabase/tests/social_phase1_interaction_targets.sql`: el turno correcto a lo largo de
  varias semanas consecutivas, unicidad por periodo, un **no-titular rechazado** en días
  1–2, la casa **rechazada antes del día 3**, un no-miembro sin lectura ni escritura, y el
  target canónico creado con la audiencia (`club_member`, `club_id`) correcta.
- **E2E** `e2e/club-ronda.spec.ts`: proponer como titular, responder como otro miembro.
  **Es la parte frágil**: el turno es determinista, así que hay que sembrar un club cuyo
  `created_at` haga titular al usuario de prueba. Sin eso el test es una moneda al aire y
  fallará de forma intermitente.
- **Vitest**: casi nada, que es la señal de que la lógica está donde debe.

## 6. Fuera de alcance, a sabiendas

- **Aviso «te toca a ti» al abrir la semana.** Es el recordatorio que haría funcionar el
  turno de verdad, y **necesita un trabajo programado**: este repo **no tiene cron ni
  `vercel.json`**. Montar esa infraestructura es una decisión propia, no un detalle de
  esta feature. En v1 solo se notifica cuando alguien **propone**, disparado por el actor
  (`notifyClub`, patrón existente). → issue.
- **Periodo configurable** (quincenal, mensual). Semanal fijo hasta que un club real pida
  otra cosa. → issue.
- **Turno con memoria** ante altas y bajas (§2.2). → issue.
- **Editar una ronda propia.** Sin `UPDATE` por diseño (§3.5).

## 7. Al cerrar (regla de `AGENTS.md`)

1. `docs/requirements/data-model.md` §5: tabla `club_rounds`, sus políticas y su fecha de
   verificación **por entorno** (dev y prod por separado).
2. Casilla en `docs/requirements/backlog.md`, sección «Social y clubes (EPIC-05)».
3. Entrada **al final** de `docs/requirements/decisiones.md` con las dos decisiones que
   sobrevivirán a esta feature: *tabla propia contra SD-8* (§1) y *la fecha y el turno
   viven en SQL* (§3.3).
4. `supabase/schema-baseline.sql`: anexar la migración en el orden en que la recibió
   producción.
