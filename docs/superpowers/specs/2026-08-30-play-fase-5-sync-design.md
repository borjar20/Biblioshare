# BiblioPlay Fase 5 — Guardar en Supabase + historial local-first

> Spec de diseño (brainstorming 2026-08-30, epic #931). Estado del arte al escribirla:
> fases 0–4 en main — motor de eventos puro, Commander y puntuación por rondas,
> persistencia IndexedDB (`biblioshare-play` v1, almacenes `active` y `saved`),
> `store.save()` sella la partida terminada en `saved` pero **nadie lo lee** y no
> existe sincronización con el servidor.

## 1. Alcance

**Dentro:**

- Subir una partida guardada a Supabase (tabla nueva `play_games`), con cola
  offline: si no hay red, queda «pendiente de subir» y se reintenta sola.
- Historial «Guardadas» en `/partidas`, **espejo local completo**: la lista lee
  solo IndexedDB y funciona offline; un sincronizador de fondo la mantiene igual
  al servidor.
- Borrado de partidas guardadas (funciona offline vía tombstone).
- Adopción explícita de partidas guardadas como anónimo al iniciar sesión.

**Fuera (decisiones, no huecos):**

- Estadísticas (win rate por comandante, medias) — fase posterior; el log íntegro
  en `events` jsonb las hace posibles sin re-jugar nada.
- Ver el log evento a evento desde el historial — el detalle es el `summary`.
- Jugadores habituales / vinculación (`play_players`) — fase 6 del epic.
- Sync en tiempo real multi-dispositivo de la partida ACTIVA — fase 9; por eso
  NO hay tabla `play_events` por filas: el log viaja entero como JSONB.
- Supabase anonymous auth — descartado (cuentas huérfanas, adopción más difícil).

### Decisiones cerradas en el brainstorming

| Decisión | Elección |
|---|---|
| Alcance | Guardar + historial simple (stats después) |
| Qué se sube | Log completo (`events` jsonb) + resumen derivado (`summary` jsonb) |
| Anónimos | Guardar sigue funcionando en local; subir exige sesión; adopción explícita al entrar |
| Fuente del historial | Espejo local completo: la UI lee solo IndexedDB, el sync la iguala al servidor |
| Arquitectura | Opción A — espejo unificado en el almacén `saved` con `syncStatus`, push+pull de fondo |

## 2. Esquema Supabase — tabla única `play_games`

```sql
create table public.play_games (
  id uuid primary key,                    -- gameId del cliente (= committed[0].id, el game_started)
  owner_id uuid not null references auth.users (id) on delete cascade,
  tool_id text not null,                  -- "mtg" | "score" (sin enum: las herramientas crecen)
  started_at timestamptz not null,        -- at del primer evento
  finished_at timestamptz not null,       -- at del último evento
  saved_at timestamptz not null,          -- momento del «Guardar» en el cliente
  summary jsonb not null,                 -- derivado en cliente (ver §4); la lista lee esto
  events jsonb not null,                  -- log committeado ÍNTEGRO (PlayEvent[])
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index play_games_owner_saved on public.play_games (owner_id, saved_at desc);

alter table public.play_games enable row level security;

create policy "play_games_select" on public.play_games
  for select using (owner_id = (select auth.uid()));
create policy "play_games_insert" on public.play_games
  for insert with check (owner_id = (select auth.uid()));
create policy "play_games_update" on public.play_games
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "play_games_delete" on public.play_games
  for delete using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.play_games to authenticated;
```

- **Privada total**: sin acceso `anon`, sin lectura de terceros. RLS por ownership
  (epic: «privada por defecto»).
- **Grants**: tabla entera, sin grant fino por columna. Trampa #375 presente en la
  cabeza: si algún día se añade una columna a una tabla con grant fino, correr la
  superficie 6 de DRIFT-CHECK. Aquí se evita el grant fino a propósito.
- **Idempotencia**: `id` viene del cliente y es el UUID del `game_started`; el push
  es un upsert por PK — repetir un push no duplica nada.
- **Migración**: dev (`supabase-dev`) primero, prod después. `data-model.md` se
  actualiza en la misma tarea (definición de hecho).
- Regla #437: JAMÁS `use cache` sobre nada de esta tabla — todo se lee en cliente
  con la sesión del navegador.

## 3. Espejo local — `SavedGameRecord` v2 (IndexedDB v2)

```ts
export type SavedGameRecord = {
  gameId: string;              // = committed[0].id
  identity: string;            // uid real o "anon"
  v: 2;
  committed: PlayEvent[];
  savedAt: number;             // epoch ms
  summary: SavedGameSummary;   // el MISMO objeto que sube a play_games.summary
  syncStatus: "pending" | "synced";
  deletedAt: number | null;    // tombstone: borrado local pendiente de replicar
};
```

- `DB_VERSION` pasa a `2`. Migración en `onupgradeneeded`: los registros v1 del
  almacén `saved` ganan `syncStatus: "pending"`, `deletedAt: null` y un `summary`
  derivado por replay (una sola vez, en la migración). Los almacenes no cambian.
- `store.save()` (fase 3) pasa a: derivar `summary`, escribir el registro v2 como
  `pending`, limpiar la activa (igual que hoy) y **disparar un push sin esperar**
  (el guardado local nunca depende de la red).
- Un registro con `deletedAt` no aparece en la lista; existe solo hasta que el
  sync confirme el delete en servidor (o inmediatamente si era `pending` puro:
  borrar algo nunca subido = borrarlo local sin tombstone).

## 4. `SavedGameSummary` — derivado en cliente, una vez

Objeto por herramienta, calculado con los selectores existentes al guardar (y en
la migración v1→v2). Forma común + extensión por herramienta:

```ts
type SavedGameSummary = {
  toolId: ToolId;
  participants: { kind: "user" | "regular" | "guest"; name: string; userId?: string }[];
  winners: number[];           // asientos ganadores (empate posible en score)
  ranking: { seat: number; position: number }[];
  durationMs: number;          // at último - at primero
  // mtg:  { mode: string; turns: number; commanders: (string | null)[] }
  // score:{ rounds: number; direction: "highest" | "lowest"; totals: number[];
  //         target: { kind: "rounds" | "points"; value: number } | null }
  tool: Record<string, unknown>;
};
```

- El registro de herramientas (`tools.ts`) gana un `summarize(state, log)` por
  herramienta — misma mecánica que `describe()`: el core no conoce MTG ni score.
- La lista y el detalle del historial renderizan SOLO este objeto. Nunca replay
  en la UI de historial.

## 5. Sincronizador — `src/lib/play/core/sync.ts`

Corre **solo** con sesión (identity ≠ "anon") y `navigator.onLine`. Nunca
bloquea la UI; sus errores dejan el estado visible (badge «pendiente»), no toasts.

**Algoritmo (por pasada):**

1. **Push tombstones**: registros con `deletedAt` → `delete` en servidor → borrar
   registro local. Si falla, el tombstone sobrevive y se reintenta.
2. **Push pendientes**: registros `pending` sin tombstone → upsert (`id` PK) con
   `owner_id = uid` → marcar `synced`.
3. **Pull**: `select` de todas las partidas del usuario (`id, tool_id, saved_at,
   started_at, finished_at, summary, events`). Escala pequeña; sin cursores, y
   si algún día duele, se pagina entonces (issue, no ahora).
4. **Reconciliar** (función pura, ver abajo):
   - remota que no existe local → insertar como `synced`;
   - remota que existe local `synced` → pisar con la del servidor;
   - local `pending` o con tombstone → NO tocar (el push de la próxima pasada manda);
   - local `synced` que ya no está en el servidor → borrar local (la borró otro
     dispositivo).
5. Notificar por BroadcastChannel (canal nuevo `biblioshare:play:saved:<identity>`)
   para que las listas abiertas en otras pestañas se refresquen.

**Testabilidad:** la reconciliación es `planSync(localRecords, remoteRows) →
{ pushes, deletes, upserts locales, borrados locales }` — pura, sin IDB ni red.
El ejecutor recibe un cliente Supabase inyectado (interfaz estrecha: `upsert`,
`delete`, `selectAll`) y se prueba con dobles.

**Disparadores:** montar `/partidas` (hub), evento `online`, tras `save()`, tras
borrar del historial. Pasadas concurrentes: un candado en memoria por identidad
(si hay pasada en vuelo, la nueva se anota y corre al acabar — sin colas largas).

## 6. Historial — sección «Guardadas» en `/partidas`

- Isla cliente bajo el hub existente. Lee IndexedDB (índice `identity`), filtra
  tombstones, ordena `savedAt` desc.
- Fila: icono/nombre de herramienta, fecha relativa, ganador (nombre), nº de
  jugadores, duración, badge «Pendiente de subir» si `syncStatus === "pending"`
  y hay sesión (sin sesión el badge no aparece: local es lo esperado).
- Tocar fila → sheet de detalle (patrón PlaySheet): ranking completo con nombres,
  comandantes (mtg) o totales y target (score), duración, fecha.
- Borrar: dentro del sheet, con confirmación. Marca tombstone (o borra directo si
  nunca subió) y dispara sync. Offline funciona igual.
- Vacío: texto invitación («Las partidas que guardes aparecerán aquí»).

## 7. Anónimos y adopción

- Sin sesión, «Guardar» hace lo mismo que hoy: registro local (`pending`). Sync
  no corre. Cero avisos de login en el flujo de guardar — la partida está a salvo
  en el dispositivo.
- Con sesión, al montar el hub: si existen registros `identity: "anon"` sin
  tombstone → banner «Tienes N partidas guardadas en este dispositivo.
  ¿Añadirlas a tu cuenta?» con «Añadir» / «Ahora no».
  - **Añadir**: re-key `identity` → uid (delete+put, el keyPath es `gameId` así
    que es actualizar el campo), quedan `pending`, se dispara push.
  - **Ahora no**: sin persistir la negativa; el banner reaparece la próxima
    visita. Nunca adopción automática (principio del epic: nada de matching
    silencioso).

## 8. Errores

- Push falla (red, RLS, 500): registro sigue `pending`, badge visible, próxima
  pasada reintenta. Sin toast.
- Pull falla: la lista local queda intacta — es la fuente de la UI, no la red.
- IndexedDB indisponible (patrón fase 3): guardar devuelve `false` y el resumen
  no se cierra; la lista muestra el vacío. Igual que hoy.
- Logout: el espejo NO se purga (issue si se decide otra cosa) — pertenece a la
  identidad y la lista filtra por `identity`, así que otra cuenta no lo ve.

## 9. Testing

- **Unit** (vitest): `planSync` — casos: pending+no remoto (push), tombstone
  (delete), remoto nuevo (insert local), remoto pisado sobre synced, local synced
  ausente en remoto (borrar local), pending NUNCA pisado por pull. Migración IDB
  v1→v2 (summary derivado, pending por defecto). `summarize` de mtg y score.
  Ejecutor con cliente Supabase doble (orden: tombstones → pushes → pull).
- **E2e** (playwright, anon local): guardar partida score → aparece en
  «Guardadas» sin badge (anon) con ganador y duración; borrar la quita; banner
  de adopción NO aparece sin sesión.
- Sync real contra Supabase dev: verificación manual al cerrar (dos navegadores,
  guardar en uno, pull en el otro; borrar cruzado).

## 10. Definición de hecho

- Migración aplicada en dev y prod; `data-model.md` actualizado con `play_games`.
- Casilla de backlog + entrada en `decisiones.md` (espejo local como fuente de la
  UI; una tabla JSONB en vez de eventos por filas hasta fase 9).
- Issues por los límites asumidos: pull sin paginación; espejo no purgado en
  logout; adopción sin «no volver a preguntar».
