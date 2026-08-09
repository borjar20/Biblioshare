# Tipos de evento de club — diseño

> [Canónico · verificado contra el código el 2026-08-09; sin aplicar todavía]

La actividad **Evento** deja de ser un único formato («una quedada con fecha») y pasa a soportar
varios **tipos** dentro de **un solo sistema**: mismo `kind='evento'`, misma ficha, mismo motor de
seguir/avisar, mismo calendario. Cambia lo que se pide y cómo se pinta según el tipo.

Tipos iniciales: **Encuentro**, **Lanzamiento**, **Fecha destacada**. El modelo queda **extensible**:
añadir un tipo o un subtipo futuro **no crea una actividad nueva ni toca el esquema** — se apoya en
la columna `config (jsonb)` que la BD ya trata como opaca.

Prototipo visual del formulario dinámico (revisado y aprobado el 2026-08-09):
`https://claude.ai/code/artifact/64559028-7914-441c-b419-756c94a9dac8`.

---

## 1. Comportamiento actual (verificado contra el código el 2026-08-09)

Un evento es una fila de `club_activities` con `kind='evento'`, que **nace `active`** (nunca pasa
por `proposed`) y no tiene pool de ítems ni participantes.

| Qué | Dónde | Estado hoy |
|---|---|---|
| Datos | `club_activities` con `kind='evento'` | `title`, `description`, `starts_on`, `starts_at`, `ends_at`, `event_timezone`, `location`, `modality`, `online_url`, `event_state`, `updated_at`. **`config` jsonb SIN usar para eventos.** |
| Formulario | `src/components/clubs/propose/event-form.tsx` | Un solo `EventForm` para crear y editar. Modalidad conmuta `location`/`online_url`. Validación de cliente espejo de la SQL. |
| Escritura | `src/lib/clubs/activities/events.ts` → RPC `create_club_event`/`update_club_event` (10 args) | **Lanzan `Error`** (patrón heredado, no resultado discriminado). La UI muestra un único `eventError` genérico. |
| Validación SQL | `private.validate_event_fields(...)` (`20260823...`) | timezone en `pg_timezone_names`, `location`≤200, `online_url`≤500 y `http(s)://`, `modality='online'` ⇒ sin location, `ends_time > starts_time`. |
| Ficha | `/club/[slug]/evento/[id]` + `event-detail-view.tsx` | Página propia (2026-08-04). `hasDetailView:false` describe la ruta *genérica* de actividad, que sigue dando 404 para eventos. |
| Tipos TS | `event-state.ts`, `event-detail.ts`, `core.ts` | `EventState`, `deriveEventState`, `REMINDER_OPTIONS`, `ClubEventDetail`. **No hay tipo para `config`.** |
| Calendario / lista | `calendar-marks.ts`, `group-activities.ts`, `activity-card.tsx`, `agenda-list.tsx` | Marca de calendario enlaza a `/evento/[id]`; `isPastEvent` deriva «ya pasó» de `starts_on < hoy`. |
| Seguir / avisar | `club_event_followers` + `event-follow-actions.ts` + planificador `pg_cron` | Seguir un evento, elegir recordatorio, barrido cada 5 min. Todo keyado en `starts_at`. **Usa resultado discriminado** (el patrón correcto). |
| Selector de catálogo | `src/components/clubs/item-picker.tsx` (`ItemPicker`) + `activity-actions.ts` | Busca en biblioteca/catálogo y devuelve `PickedItem {itemType,itemId,title,coverUrl}`, resolviendo a uuid de catálogo. **Reutilizable tal cual.** |

Dos hechos que este diseño aprovecha en vez de pelear:

- **`config` está libre para eventos.** Es exactamente donde ya viven los tiers de una tierlist y el
  criterio de un reto: la BD no lo valida, lo interpreta la app según el `kind`. Aquí lo
  interpretará según el `event_type`.
- **Las columnas de Encuentro ya existen** (`location`/`modality`/`online_url`/`starts_at`/`ends_at`/
  `event_timezone`). No se tocan: son los campos de Encuentro. Los otros tipos las dejan nulas.

---

## 2. Decisión de arquitectura: un discriminador + `config` opaco

No hay bifurcación real que sopesar: el repo ya se comprometió con «un solo `kind` + `config` jsonb
por subtipo» (SD-8), y el encargo pide explícitamente «sin crear actividades independientes».
Alternativas descartadas y por qué:

- **Una actividad `kind` nueva por tipo** (`lanzamiento`, `fecha_destacada`…) → rompe «un solo
  sistema», duplica ficha/calendario/seguir por tipo, y multiplica el enum `activity_kind` cada vez
  que se añade un formato. Contra el encargo.
- **Una columna nueva por campo de cada subtipo** (`release_type`, `platform`, `region`,
  `relation_ids[]`…) → viola SD-8, y cada columna nueva es un `grant` por columna que si se olvida
  rompe la escritura ENTERA de `club_activities` (issue #375, ya ha mordido dos veces). Coste alto,
  extensibilidad cero.
- **Tabla satélite por tipo** → tres tablas nuevas con su RLS para lo que son metadatos opacos de
  display. Sobredimensionado.

**Elegido: una columna discriminadora `event_type` + reutilizar `config` jsonb.**

```
club_activities (kind='evento')
├─ event_type: club_event_type   ← NUEVO enum discriminador
├─ title, description, starts_on, starts_at, ends_at, event_timezone, event_state   ← columna vertebral, TODOS los tipos
├─ location, modality, online_url   ← columnas de ENCUENTRO (nulas en los otros tipos)
└─ config: jsonb                   ← campos propios del tipo, OPACO a la BD (como tierlist/reto)
```

Añadir un tipo futuro = un valor de enum (o ni eso, si se resuelve en TS) + un `case` en el
formulario y en los renderizadores + una forma de `config`. **Cero migraciones de columnas.**

---

## 3. Modelo de datos

### 3.1 Enum y columna

- **`club_event_type`** (enum nuevo): `encuentro | lanzamiento | fecha_destacada`. En su propia
  migración/transacción (Postgres prohíbe usar un valor de enum en la misma transacción que lo crea
  — mismo patrón que `20260722_activity_kind_evento.sql`).
- **`club_activities.event_type club_event_type NOT NULL DEFAULT 'encuentro'`.** El default hace el
  backfill gratis: **todo evento existente ES un encuentro** (es literalmente lo único que se podía
  crear hasta hoy). **Grant por columna** para `authenticated` (INSERT/SELECT/UPDATE), verificado
  contra la superficie 6 de `DRIFT-CHECK.md` — issue #375, la trampa que NO se ve en tests.

### 3.2 Formas de `config` por tipo

`config` es **opaco a la BD** (igual que hoy para todo `kind`); lo valida y tipa la app.

```jsonc
// encuentro  → sin config (null / {}); usa las columnas location/modality/online_url
{}

// lanzamiento
{
  "item":        { "itemType": "series", "itemId": "<uuid catálogo>" },  // vía ItemPicker
  "releaseType": "estreno_temporada",        // string de vocabulario por medio (§4.2)
  "platform":    "netflix",                  // solo movie/series, opcional
  "region":      "España",                   // texto libre ≤120, opcional
  "allDay":      true                        // true = sin hora concreta
}

// fecha_destacada
{
  "relations": [                             // opcional, orden preservado
    { "kind": "item",     "itemType": "book", "itemId": "<uuid>" },
    { "kind": "activity", "activityId": "<uuid de club_activities del MISMO club>" }
  ],
  "allDay": true                             // siempre true
}
```

### 3.3 «Todo el día» (hora opcional)

Hoy `starts_at` es siempre un `timestamptz` con hora (el backfill inventó las 19:00). Para
Lanzamiento («hora solo si se necesita») y Fecha destacada (solo día) hace falta un «sin hora»:

- Cuando no hay hora, la RPC ancla `starts_at` a **`00:00` en `event_timezone`** del día
  `starts_on`. **`config.allDay = true`** registra el hecho para el display (no se puede derivar de
  forma fiable de `starts_at`: medianoche es una hora legítima).
- **Los renderizadores reciben un booleano `allDay` ya calculado** por los loaders (que ya parsean
  `config`), nunca leen `config` crudo. Cero columnas nuevas para un dato de display.
- **Los recordatorios no cambian**: el trigger de `club_event_followers` solo lee `starts_at`. Un
  «1 día antes» de un evento de todo el día dispara la víspera a las 00:00 locales. Coherente.

Regla por tipo: **Encuentro exige hora de inicio** (como hoy); **Lanzamiento** hora opcional (switch
«todo el día», por defecto activado); **Fecha destacada** siempre todo el día.

### 3.4 Referencias polimórficas sin FK (mismo trato que `passes`)

`config.item` / `config.relations[].itemId` apuntan al catálogo por `(item_type, item_id)` **sin FK
real** (no se puede apuntar a tres tablas), igual que `passes` (§3 del data-model). Consecuencias
asumidas, con su issue:

- El `ItemPicker` resuelve a un uuid de catálogo **válido en el momento de crear** (`resolveCatalogItem`).
- Borrar esa obra del catálogo **no** está cubierto por `forbid_delete_with_passes` (ese guard mira
  `passes`, no `config` de eventos): la referencia podría quedar colgando. **El display degrada con
  gracia** (omite la relación irresoluble / muestra placeholder). Se abre **issue** para decidir si
  merece un guard; de momento es un límite asumido (`tipo:deuda`).

---

## 4. Los tres tipos

### 4.1 Encuentro (= comportamiento actual, intacto)

Campos: fecha (req), hora inicio (req) + hora fin (opc), zona horaria, modalidad
(`presencial|online|hibrida`), ubicación / enlace (conmutados por modalidad). Sin `config`.
**No se toca su lógica** salvo que ahora comparte formulario con los otros tipos.

### 4.2 Lanzamiento

Campos: **obra** (req, `ItemPicker` book/movie/series) · **tipo de lanzamiento** (req) ·
**plataforma** (opc, solo movie/series) · fecha (req) · **todo el día** (switch) → hora (opc) ·
**región** (opc, texto libre ≤120). Descripción opcional.

**Vocabulario de tipo de lanzamiento — por medio, en constante TS** (`event-release-types.ts`),
`config` guarda el string. Añadir un valor **no toca la BD**:

```
book   → publicacion · tapa_dura · bolsillo · ebook · audiolibro
movie  → cine · streaming · fisico
series → estreno_temporada · final_temporada · episodio · estreno
```

**Plataforma** (movie/series, opcional): `netflix · prime · disney · max · appletv · filmin · otro`
(constante TS + «otro»). Se muestra solo cuando la obra es película o serie. *(Origen: nota del
dueño el 2026-08-09 — «para serie además un plataforma tipo Netflix/Amazon».)*

El título se puede **autoproponer** al elegir obra si está vacío (p. ej. «Estreno · <obra>»),
editable.

### 4.3 Fecha destacada

Campos: título (req) · descripción (opc) · fecha (req, siempre todo el día) · **relaciones**
(opc): obras del catálogo (`ItemPicker`) y/o **actividades del club** (selector de las actividades
del propio club). **Solo enlaces, sin efectos secundarios** (no notifica, no genera nada, no hay
cross-link recíproco). Se pintan como enlaces en la ficha.

---

## 5. RPCs

`create_club_event` / `update_club_event` (moderador+, `SECURITY DEFINER`) ganan dos argumentos:

- `p_event_type club_event_type` (default `'encuentro'` para que el bundle anterior siga resolviendo
  por defaults — «migración primero, merge después»).
- `p_config jsonb default '{}'::jsonb`.
- `p_starts_time` pasa a **verdaderamente opcional**: si es null, `starts_at` se ancla a `00:00` en
  `p_timezone` (§3.3).

Reglas SQL (mínimas, coherentes con «config opaco»):

- **`config` se guarda tal cual, sin validar su forma** — idéntico a como la BD trata el `config` de
  tierlist/reto hoy. La forma la garantiza la app.
- Nuevo guard: **Encuentro exige hora** (`event_type='encuentro' AND p_starts_time IS NULL` →
  `starts_time_required`). El resto de `validate_event_fields` (timezone/location/url/ends) solo
  aplica a los campos de Encuentro, que siguen siendo columnas.
- `p_event_type` debe ser un valor válido del enum (lo garantiza el tipo del argumento).
- **Firma nueva por `DROP` + `CREATE`, no overload** (una llamada ambigua daría `42725`; con
  defaults el bundle viejo sigue funcionando durante el despliegue — como en `20260823`).

La validación de que una `relation` de tipo `activity` pertenece al **mismo club** se hace en la
**server action** (que tiene el contexto de club), no en la RPC — para no meter lógica de `config`
en SQL. Riesgo bajo (display-only, la resolución del título ya la gatea RLS).

---

## 6. Capa TypeScript

- **`src/lib/clubs/activities/event-types.ts`** (nuevo): `EventType`, la unión discriminada
  `EventConfig` (`EncuentroConfig | LanzamientoConfig | FechaDestacadaConfig`), y `parseEventConfig`
  (valida/normaliza el jsonb crudo a la unión, tolerante a formas viejas).
- **`src/lib/clubs/activities/event-release-types.ts`** (nuevo): vocabularios `RELEASE_TYPES` (por
  medio) y `PLATFORMS`, con sus etiquetas — la fuente de verdad de los `case` del formulario.
- **`ClubEventDetail`** (`event-detail.ts`) gana `eventType`, `allDay` (computado), y los campos
  parseados por tipo (obra hidratada con título/portada, releaseType/platform/region; relaciones
  hidratadas). `getClubEvent` parsea `config` y **hidrata** las referencias (una query por lote a
  catálogo + una a `club_activities` para las relaciones de actividad), igual que ya hidrata perfiles.
- **`ClubActivity`** (`core.ts`) gana `eventType` (se añade a la query de lista) para que la tarjeta
  y `EventCardActions` puedan distinguir el tipo sin cargar la ficha entera.

---

## 7. Formulario dinámico

`EventForm` (sigue siendo **uno**, crear + editar) gana un **selector de tipo** arriba:

- **Crear**: se elige el tipo; el formulario se remaqueta (grupos de campos condicionales).
- **Editar**: el tipo es **fijo** (no se convierte un Encuentro en Lanzamiento — cambiaría el
  significado de `config` y las relaciones). El selector se muestra deshabilitado con el tipo actual.

Comportamiento por tipo (ya validado en el prototipo):

- **Encuentro**: modalidad conmuta ubicación/enlace (lógica actual).
- **Lanzamiento**: `ItemPicker` → al elegir obra se puebla el select de tipo de lanzamiento (según
  medio) y aparece plataforma (movie/series); switch «todo el día» oculta la hora; región libre.
- **Fecha destacada**: editor de relaciones (pestañas Obras / Actividades) con chips que se añaden y
  quitan; sin hora.

Los tres reutilizan título/fecha/descripción compartidos. La validación de cliente sigue siendo
espejo de la SQL (más: obra requerida y tipo de lanzamiento requerido en Lanzamiento).

**`EventCardActions`** recibe los campos que hoy le faltan (`eventType` y los de la ficha) para que
editar-desde-la-lista funcione en todos los tipos sin resetear datos (hueco preexistente que se
cierra de paso).

---

## 8. Renderizado (ficha, calendario, tarjeta)

- **Ficha** (`event-detail-view.tsx`): un `switch (event.eventType)` para el bloque específico —
  Encuentro (modalidad/lugar/enlace, actual) · Lanzamiento (obra enlazada + tipo/plataforma/región)
  · Fecha destacada (relaciones como enlaces). El «cuándo» muestra **solo fecha** cuando `allDay`.
- **Tarjeta** (`activity-card.tsx`) y **calendario/agenda** (`calendar-marks.ts`, `agenda-list.tsx`):
  distinguen por `eventType` para el subtítulo/insignia y para el display de fecha sin hora. El
  acento por tipo (opcional, ligero) puede reusar `mark-accent.ts`.
- **Seguir / avisar**: **reutilizado tal cual para los tres tipos** — todos tienen `starts_at`.
  `deriveEventState` y `REMINDER_OPTIONS` no cambian.

---

## 9. Manejo de errores: migrar create/update a resultado discriminado

Hoy `events.ts` **lanza** `Error`; `AGENTS.md` y la memoria del repo marcan esto como **bug real de
producción** (Next.js borra el mensaje de los `Error` de server action al compilar prod → la UI
solo puede mostrar un genérico). Como este diseño **reescribe** esas dos funciones y añade errores
distinguibles (obra/tipo/relación), se migran al patrón que ya usa `event-follow-actions.ts`:

```ts
export type EventFormResult = { ok: true; activityId: string } | { ok: false; code: EventFormError };
```

`EventFormError` = los códigos snake_case que las RPC ya emiten (`title_required`, `title_too_long`,
`starts_on_required`, `starts_time_required`, `description_too_long`, `invalid_timezone`,
`location_too_long`, `online_url_too_long`, `invalid_online_url`, `online_event_has_location`,
`ends_before_starts`, `not_found`, `not_an_event`, `event_not_active`, `forbidden`) + los de app
(`item_required`, `release_type_required`, `relation_not_in_club`) + `unknown`. El formulario mapea
los que valga la pena y cae en genérico para el resto.

---

## 10. Migración y despliegue

**Orden no negociable (migración primero, merge después):**

1. **Dev primero** (`supabase-dev`): (a) enum `club_event_type` en su transacción; (b) columna
   `event_type` + su grant por columna + `DROP`/`CREATE` de las dos RPC con la firma nueva
   (defaults ⇒ el bundle viejo sigue resolviendo).
2. Verificar contra objetos reales (`pg_proc` una sola firma por nombre, `information_schema.columns`
   con el grant, `to_regtype('club_event_type')`), **nunca contra `list_migrations`**.
3. Merge del código.
4. **Prod** con el mismo orden, tras confirmar el despliegue.
5. Regenerar `database.types.ts` **acotado a las adiciones de esta feature** (`git checkout
   origin/main -- …` + re-aplicar a mano; ver memoria «database-types-regen-drift»).

---

## 11. Definición de «hecho» (docs a sincronizar al cerrar)

- **`docs/requirements/data-model.md`** §6/§6.1: enum `club_event_type`, columna `event_type` y su
  grant, forma de `config` por tipo, semántica «todo el día». Actualizar la fecha de verificación.
- **`docs/requirements/backlog.md`**: marcar la casilla de la feature.
- **`docs/requirements/decisiones.md`** (append): la decisión «discriminador + config opaco» y la de
  «all-day como `config.allDay`, no columna».
- **`docs/architecture/graph.json`** si el flujo de creación de evento cambia de ficheros.
- **DRIFT-CHECK superficie 6** tras añadir la columna (grant).
- **Tests**: unit de `parseEventConfig` + vocabularios + all-day; e2e de crear cada tipo (patrón del
  e2e de evento que crea su propio club desechable). **Provocar el bug y ver el test rojo** antes de
  darlo por bueno (regla `tests-que-no-protegen`).

---

## 12. Trade-offs asumidos → issues a abrir

- **`config.item` puede colgar** si se borra la obra del catálogo (sin guard, a diferencia de
  `passes`). Issue `tipo:deuda`, `area:clubes`, P2.
- **`config` opaco a la BD**: una server action con bug podría escribir una forma inválida. Mitigado
  por validación de app + tests; aceptado como en tierlist/reto. (Documentar, no issue propio salvo
  que aparezca.)
- **Relación a actividad = enlace muerto** si la actividad se archiva/borra o el que mira no es
  miembro (RLS). Display degrada; aceptado.
- **No se puede cambiar el tipo al editar**: deliberado. Si alguien lo pide, es feature aparte.

---

## 13. Fuera de alcance (YAGNI — añadir si se pide)

- Filtrar/navegar el calendario **por** tipo de evento.
- Iconografía/acento por tipo más allá de una distinción básica.
- Región como selector estructurado (país/ISO) — se queda texto libre.
- Subtipos con campos propios más allá de un string (p. ej. un lanzamiento con varias plataformas a
  la vez) — el `config` lo soporta el día que se pida, sin migración.
