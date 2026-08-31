# BiblioPlay Fase 6 — Jugadores habituales

> Spec de diseño (brainstorming 2026-08-31, epic #931). Estado del arte: fases 0–5 en main —
> motor de eventos, Commander y puntuación, espejo IndexedDB v2 de partidas guardadas con sync
> a `play_games` (planSync + ejecutor con guardas de sesión viva y anti-resurrección).
> `Participant.kind: "regular"` existe en el tipo desde fase 0 pero nada lo usa: los setups
> crean todo como invitado y ningún jugador persiste.

## 1. Alcance

**Dentro:**

- **Jugadores habituales**: personas persistentes del entorno del usuario, sin cuenta
  Biblioshare. Crear desde el setup («Recordar»), elegir al montar mesa (chips), gestionar
  (renombrar, borrar) desde el hub.
- Tabla `play_players` + espejo IndexedDB local-first con el mismo ciclo de sync de fase 5.
- Las partidas guardadas referencian al habitual por `playerId` (base de stats futuras).
- Generalización de `planSync` a registro-espejo genérico (lo instancia guardadas y jugadores).

**Fuera (decisiones, no huecos):**

- **Vinculación habitual → usuario Biblioshare**: fase futura. La columna `linked_user_id`
  nace ya (nullable, sin UI) para no migrar después; ninguna lógica la lee. El epic exige que
  cuando llegue sea acción explícita, jamás matching automático por nombre.
- Habituales para identidad anónima: no. Anon monta mesa con invitados, como hoy; sin espejo
  anon ni flujo de adopción para esta entidad.
- Stats por jugador: fase posterior; esta fase solo garantiza el `playerId` en los datos.
- Foto/avatar/color del habitual: nada de eso; solo nombre.
- Selección de participante `kind: "user"` (otros usuarios Biblioshare en tu mesa): fuera —
  el único user posible sigue siendo el flujo actual.

### Decisiones cerradas en el brainstorming

| Decisión | Elección |
|---|---|
| Alcance | Crear + elegir + gestionar (renombrar/borrar); vinculación fuera |
| Persistencia | Supabase (`play_players`, RLS owner) + espejo IndexedDB; setup lee SOLO el espejo |
| Anónimos | Habituales solo con sesión |
| UX de asiento | Chips bajo el asiento + acción «Recordar» sobre texto libre; cero pasos extra si se ignoran |
| Sync | Opción A: `planSync` genérico compartido con fase 5, no un segundo reconciliador |

## 2. Esquema Supabase — tabla `play_players`

```sql
create table public.play_players (
  id uuid primary key,                    -- generado en cliente (crypto.randomUUID)
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  linked_user_id uuid references auth.users (id) on delete set null, -- fase futura; sin UI ni lógica aún
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index play_players_owner on public.play_players (owner_id);

alter table public.play_players enable row level security;

create policy "play_players_select" on public.play_players
  for select using (owner_id = (select auth.uid()));
create policy "play_players_insert" on public.play_players
  for insert with check (owner_id = (select auth.uid()));
create policy "play_players_update" on public.play_players
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "play_players_delete" on public.play_players
  for delete using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.play_players to authenticated;
```

Mismas reglas que `play_games`: privada total, grant de tabla entera (nada fino, #375),
dev → e2e → prod + anexo a `schema-baseline.sql` en la misma pasada, `data-model.md` al día.
Regla #437: cero `use cache`; todo se lee en cliente.

## 3. Espejo local — almacén `players` (IndexedDB v3)

```ts
export type PlayerRecord = {
  playerId: string;            // = play_players.id
  identity: string;            // uid; NUNCA "anon" (los habituales exigen sesión)
  v: 1;
  name: string;
  syncStatus: "pending" | "synced";
  deletedAt: number | null;    // tombstone, mismo ciclo que las guardadas
};
```

- `DB_VERSION` pasa a `3`. `onupgradeneeded`: crear almacén `players`
  (`keyPath: "playerId"`, índice `identity`). Sin datos que migrar (almacén nuevo).
- `db.ts` gana `listPlayers(identity)`, `readPlayer(playerId)`, `putPlayer(record)`,
  `deletePlayer(playerId)` — mismo estilo defensivo (sin BD → vacío/no-op).
- Renombrar = `putPlayer({...record, name, syncStatus: "pending"})`; el upsert del push
  propaga. Borrar = tombstone (o borrado duro si nunca subió), como las guardadas.

## 4. Sync — `planSync` genérico, segundo ejecutor

- `planSync` se generaliza a `MirrorRecord = { id: string; syncStatus: "pending" | "synced";
  deletedAt: number | null }`: `planSync<L extends MirrorRecord, R extends { id: string }>
  (local: L[], remote: R[]): SyncPlan<L, R>`. Los tests de fase 5 no cambian de semántica
  (solo adaptación mecánica si el tipo lo pide). El ejecutor de guardadas queda como está.
- Ejecutor nuevo `runPlayersSync(identity, api)` en `core/players-sync.ts` con las MISMAS
  guardas de fase 5: sesión viva verificada en `selectAll` (la identidad inyectada debe ser
  el uid vivo), relectura antes de cada escritura (un rename/borrado del usuario durante la
  pasada no se pisa), fallo remoto → local intacto, nunca lanza. Notifica por BroadcastChannel
  `biblioshare:play:players:<identity>`.
- Adaptador `createPlayPlayersApi(ownerId)` (interfaz selectAll/upsert/remove); `updated_at`
  fresco en cada upsert (lección M2 de fase 5).
- `requestPlayersSync(identity)`: mismo candado por identidad (no-op anon/offline). Corre al
  montar `/partidas` y los setups, al evento `online` y tras crear/renombrar/borrar. Fila del
  registro: `{ id, name, updated_at? }`; conversores triviales registro↔fila.
- Conflicto de rename entre dispositivos: gana el último push (upsert completo); sin merge de
  campos — un habitual es un nombre, no un documento.

## 5. Dominio — `Participant` regular con identidad

```ts
export type Participant =
  | { id: string; kind: "user"; name: string; userId: string }
  | { id: string; kind: "regular"; name: string; playerId: string }
  | { id: string; kind: "guest"; name: string };
```

- `SavedParticipant` gana `playerId?: string` (solo kind regular lo lleva), y
  `buildSavedSummary` lo copia. El summary y el log embeben COPIA del nombre: borrar o
  renombrar un habitual no toca partidas guardadas (conservan el nombre de aquella noche).
- El reducer no cambia: `kind`/`playerId` son datos de setup, no de juego.

## 6. UX

### Setup (mtg y score, mismo componente de asiento)

- Con sesión y habituales existentes: bajo cada asiento, **chips** con los habituales aún no
  sentados en esta mesa, filtradas en vivo por lo escrito en el input. Toque = el asiento pasa
  a `kind: "regular"` con su `playerId` y su nombre en el input. El nombre del habitual se
  cambia en gestión, no por asiento: si se edita el texto tras asignar, el asiento degrada a
  invitado con ese texto (regla simple y visible; nunca renombra al habitual por accidente).
- Asiento con texto libre no vacío que no coincide con un habitual: acción **«Recordar»**
  (botón pequeño junto al input) — crea el habitual (pending) y asigna el asiento. Sin salir
  del setup.
- Sin sesión o sin habituales: ni chips ni «Recordar»; el setup queda EXACTAMENTE como hoy.
- La mesa recordada (`table-memory`) conserva el `playerId` de los asientos regular; al
  rehidratar, si el habitual ya no existe en el espejo, el asiento degrada a invitado con el
  nombre recordado.

### Gestión — sheet «Tus jugadores»

- Entrada en el hub `/partidas` (solo con sesión; oculta sin habituales Y sin sesión, visible
  vacía con sesión para descubrir la feature). Patrón PlaySheet.
- Lista con nombre; renombrar in situ (input + confirmar); borrar con confirmación
  («Sus partidas guardadas conservan su nombre»). Badge «Pendiente de subir» si pending.
- Isla cliente que lee SOLO el espejo; se suscribe al canal y al evento online, dispara
  `requestPlayersSync` al montar (mismo patrón que `saved-games.tsx`).

## 7. Errores

Los de fase 5, aplicados igual: push falla → pending con badge; pull falla → espejo intacto;
IDB indisponible → chips/gestión vacíos, setup sigue con invitados; el sync jamás bloquea.

## 8. Testing

- **Unit**: `planSync` genérico (los casos de fase 5 siguen verdes + instancia de jugadores);
  `runPlayersSync` con API doble (push/rename/tombstone/fallos, relectura anti-pisado);
  migración IDB v2→v3 (almacén nuevo, guardadas intactas); filtrado de chips como función
  pura (excluye ya sentados, filtra por prefijo case-insensitive); degradación de mesa
  recordada con habitual borrado.
- **E2e (anon)**: setup sin chips ni «Recordar», flujo actual intacto; hub sin «Tus jugadores».
- Con sesión: unit + verificación manual en dev (crear, sentar, guardar partida, comprobar
  playerId en el summary; renombrar y ver que la guardada conserva el nombre viejo).

## 9. Definición de hecho

- Migración en dev y prod (prod tras e2e) + anexo a `schema-baseline.sql`; `data-model.md`.
- Backlog + entrada en `decisiones.md` (habituales solo con sesión; copia embebida del nombre
  en partidas; planSync genérico compartido).
- Issues por límites asumidos: rename último-gana sin merge; sin vinculación aún
  (`linked_user_id` dormido); habituales invisibles para anon.
