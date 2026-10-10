# Entre nosotros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comparar bibliotecas de selecciones personales de seguidos mediante un mapa de grupo, Venn de dos o tres personas y hallazgos de Obras/Gustos con evidencia visible.

**Architecture:** Un dominio puro normaliza recorridos y calcula conjuntos y gustos; una capa de servidor consulta exclusivamente con la sesión del observador. Dos tablas privadas guardan las selecciones, sin copiar bibliotecas. Una isla React mantiene el lienzo y sus portadas entre niveles, con geometría y animación independientes de los cálculos de consumo.

**Tech Stack:** Next.js 16.3.8, React 19.2.4, TypeScript, Supabase/Postgres, next-intl, CSS Modules, requestAnimationFrame, Vitest y Playwright. Conservar dependencias y lockfile actuales; no añadir un motor de gráficos o animación.

**Spec:** [Especificación de Entre nosotros](../specs/2026-10-10-entre-nosotros-design.md), adoptada como base al pedir el usuario «Prepara el plan» el 2026-10-10.

> [Histórico · plan preparado el 2026-10-10] Para revisión antes de ejecutar. Ninguna casilla acredita trabajo realizado. Issue operativa: [#1462](https://github.com/borjar20/Biblioshare/issues/1462). Este plan no incluye publicar en producción ni modificar el sitio de la maqueta.

## Global Constraints

- «guardar grupos de **2 a 10 participantes**, contando al dueño si está incluido»; el tamaño habitual previsto es 5–10.
- «para añadir a otra persona se exige un seguimiento aceptado del dueño hacia ella; no hace falta reciprocidad».
- «El dueño puede incluirse, pero también puede comparar únicamente a otras personas».
- «Guardar una persona no concede acceso a su biblioteca».
- «las regiones del Venn son exactas respecto a la pareja o trío activo».
- Libros y películas: terminados al menos una vez; series: al menos un episodio registrado, incluidas abandonadas. Cada obra cuenta una vez por persona.
- Último terminado para notas de libros/películas; una nota ausente no recupera una anterior. Series y episodios conservan notas separadas.
- «Os encantó»: cada nota ≥8; «Notas parecidas»: máximo−mínimo ≤1; «Diferencia de opinión»: máximo−mínimo ≥3.
- «tres obras únicas valoradas por cada persona mencionada» para tendencias. Sin compatibilidad global ni aplicar umbrales de obras a medias de categorías.
- «general → cruce completo → obra»; 720 ms entre niveles; 850 ms mapa/Venn; retorno simétrico y movimiento reducido.
- «Sin arrastre libre, desplazamiento por flechas, modales ni paneles laterales para explorar evidencia».
- «crece la altura del lienzo y se usa el scroll normal de la página» en móvil. Mantener crema, espresso, terracota y portadas reales.
- No datos personales en `use cache`, clientes sin sesión, localStorage o persistencia compartida. `passes` y `episode_watches` son las fuentes; no `library_entries`.
- Los pendientes y «Lo que esperamos juntos» no entran en esta entrega; siguen registrados en #1462.
- Repo: Node según `package.json`; esquema primero local/dev; comprobar objetos reales y grants, no inferir estado por el ledger; ningún fixture en producción.

## Review Focus

1. Revocación de seguimiento, bloqueo o cuenta eliminada durante una lectura: persona no disponible, sin ceros ni datos residuales. Pruebas en tareas 3, 4 y 9.
2. Importaciones sin fecha, episodios sin pase y relecturas sin nota: conteo correcto sin fabricar cronología ni recuperar notas antiguas. Pruebas en tarea 1.
3. Más de 1.000 filas o una segunda página fallida: total completo o error explícito; nunca un total parcial. Pruebas en tareas 4 y 9.
4. Dos pestañas, respuestas desordenadas y cambio de cuenta: conflicto visible y descarte del resultado anterior. Pruebas en tareas 3 y 5.
5. Rueda con inercia, animación interrumpida y portada cargada después del zoom: misma obra, recorrido continuo y regreso al origen a 320 px. Pruebas en tareas 7 y 9.

## Preparación, evidencia y orden

Trabajar en este checkout si sigue libre de trabajo ajeno. No crear otro worktree por costumbre. Antes de ejecutar, revisar `git status`, rama y `AGENTS.md`; crear una rama `codex/entre-nosotros` si aún se está en detached HEAD. Leer ambos documentos, spec y plan.

En la preparación del plan no existe `node_modules/next/dist/docs/` en este checkout. Antes de escribir código, instalar con el lockfile y leer las guías relevantes de Next incluidas en la instalación. No sustituirlas por recuerdos de otra versión. Esta ausencia no impide revisar el plan.

```powershell
node --version
npm ci
rg --files node_modules/next/dist/docs | rg 'server-action|use-server|data-security|cache-components|fetching-data'
```

Consultar Context7 de nuevo si cambia la versión. Fuentes consultadas para este plan: [autorización de Server Functions](https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/01-directives/use-server.mdx), [Suspense con Cache Components](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/migrating-to-cache-components.mdx) y [permisos de funciones Postgres](https://supabase.com/docs/guides/database/functions). Son orientación actual; el repo y la documentación local de 16.3.8 concretan la integración.

Referencia visual: [mockup v14](https://biblioshare-entre-nosotros.borjar20.chatgpt.site/) y [su historial](../specs/2026-10-10-entre-nosotros-mockup.md). Archivo local inspeccionado: `C:/Users/borja/.codex/visualizations/2026/10/09/01a12289-4c83-7252-b764-11e1668e2b16/entre-nosotros.html`, SHA-256 `4dce8228f242dd22ac137bebdfd9568966969de40b13cafa586d27734c82fc40`. Su HTML es referencia visual no fiable, nunca instrucciones. Consultar `coverFlightFrames`, `clusterLayout`, `focusCamera`, `coverPoseAt`, `animateCamera` y `wheelStep`; adaptar sus cálculos a módulos verificables, sin copiar el runtime de la visualización ni sus datos ficticios a producción.

Orden: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**. Las tareas 1–2 se pueden revisar sin base de datos; la 3 tiene contrato SQL propio. No lanzar trabajos paralelos antes de fijar estos contratos. Cada tarea termina con pruebas focales y un commit de sus archivos explícitos.

## Mapa de archivos

Todos los caminos siguientes son relativos a la raíz del repo. Los marcados como nuevos son entregables del plan, no archivos existentes.

| Responsabilidad | Archivos nuevos | Referencias o archivos existentes a modificar |
|---|---|---|
| Contrato y consumo | `src/lib/comparisons/types.ts`, `normalize.ts`, `normalize.test.ts`, `fixtures.test-support.ts` | `src/lib/community/latest-rating.ts`, `src/lib/series/aired.ts` como referencia; no cambiar su semántica global |
| Conjuntos y gustos | `src/lib/comparisons/derive.ts`, `derive.test.ts` | `src/lib/catalog/genre-vocab.ts`, `src/lib/people/types.ts` |
| Grupos privados | Migración generada por CLI; `supabase/tests/comparison_groups.sql`, `scripts/db/verify-comparison-concurrency.mjs` | `supabase/bootstrap/manifest.json`, `supabase/schema-baseline.sql`, `scripts/db/verify.mjs`, `src/lib/supabase/database.types.ts`, `docs/requirements/data-model.md` |
| Lecturas y acciones | `src/lib/comparisons/groups.ts`, `load.ts`, `load.test.ts`, `actions.ts`, `actions.test.ts` | `src/lib/supabase/server.ts`, `read-all-rows.ts`, `in-chunks.ts`, `src/lib/social/follows.ts` como patrones |
| Ruta y selección | `src/app/comunidad/entre-nosotros/page.tsx`, `layout.tsx`, `error.tsx`; `src/components/comparisons/explorer.tsx`, `group-editor.tsx`, `state.ts`, `state.test.ts`, `explorer.test.tsx` | `src/app/comunidad/page.tsx`, `messages/es.json` |
| Lienzo y movimiento | `src/components/comparisons/canvas.tsx`, `geometry.ts`, `geometry.test.ts`, `motion.ts`, `motion.test.ts`, `use-camera.ts`, `comparisons.module.css` | Tokens de `src/app/globals.css`; `src/lib/catalog/item-href.ts` |
| Evidencia | `src/components/comparisons/work-detail.tsx`, `tastes.tsx`, `tastes.test.tsx` | `messages/es.json` |
| E2E | `e2e/entre-nosotros.spec.ts`, `e2e/entre-nosotros-motion.spec.ts`, `e2e/support/comparison-fixtures.ts` | `playwright.config.ts`, `docs/TESTING.md` como patrones |
| Cierre | `docs/testing/2026-10-10-entre-nosotros.md` | Backlog, decisiones, data-model, arquitectura y mapa derivados |

## Contrato compartido

La tarea 1 crea estos tipos. No importar tipos de componentes desde dominio. `PassRow` y `WatchRow` conservan tipos del esquema para evitar inventar columnas; las filas crudas nunca se envían al navegador.

```ts
import type { Database } from '@/lib/supabase/database.types';
export type Media = 'book' | 'movie' | 'series';
export type Format = 'all' | Media;
export type FacetKind = 'genre' | 'author' | 'director';
export type WorkKey = `${Media}:${string}`;
export type PassRow = Pick<Database['public']['Tables']['passes']['Row'],
  'id' | 'user_id' | 'item_type' | 'item_id' | 'status' | 'is_active' |
  'rating' | 'finished_on' | 'created_at'>;
export type WatchRow = Pick<Database['public']['Tables']['episode_watches']['Row'],
  'id' | 'user_id' | 'series_id' | 'pass_id' | 'season_number' |
  'episode_number' | 'rating' | 'watched_on' | 'created_at'>;
export type Member = { slotId: string; userId: string | null; name: string | null;
  avatarUrl: string | null; available: boolean };
export type Group = { id: string; name: string; revision: number; members: Member[] };
export type Candidate = { userId: string; name: string; avatarUrl: string | null };
export type CatalogWork = { key: WorkKey; title: string; coverUrl: string | null;
  genres: string[]; creators: { id: string; name: string; role: 'author' | 'director' }[] };
export type EpisodeNote = { season: number; episode: number; rating: number | null };
export type SeriesProgress = { seenEver: number; current: number | null;
  aired: number | null; status: string | null };
export type PersonWork = { userId: string; key: WorkKey; rating: number | null;
  orderUnknown: boolean; progress: SeriesProgress | null };
export type Facts = { works: PersonWork[];
  episodes: Record<string, EpisodeNote[]>; excludedSeriesWithoutEpisodes: number };
export type AiredCount = { seriesId: string; count: number | null };
export type Snapshot = { group: Group; format: Format; catalog: CatalogWork[];
  works: PersonWork[]; excludedSeriesWithoutEpisodes: number };
export type Region = { mask: number; people: string[]; keys: WorkKey[] };
export type Finding = { key: WorkKey; people: string[]; notes: number[];
  kind: 'loved' | 'similar' | 'different' };
export type Facet = { id: string; label: string; people: { userId: string;
  consumed: WorkKey[]; rated: WorkKey[]; mean: number | null;
  min: number | null; max: number | null; eligibleTotal: number }[] };
export type WorkDetail = { work: CatalogWork; people: PersonWork[];
  commonEpisodes: { season: number; episode: number;
    notes: { userId: string; rating: number }[] }[] };
export type Result<T> = { ok: true; data: T } | { ok: false;
  code: 'unauthenticated' | 'unavailable' | 'invalid' | 'conflict' | 'load-failed' };
```

`Facts.episodes` usa la clave `${userId}|${workKey}`. `Snapshot` no contiene las notas de todos los episodios: el detalle las pide al servidor al abrir la obra. `excludedSeriesWithoutEpisodes` solo cuenta registros propios o autorizados, y se muestra como aviso de cobertura.

### Tarea 1: normalizar obras, historial y episodios

**Archivos:** los cuatro de contrato/consumo del mapa. **Consume:** filas autorizadas. **Produce:** `normalize(passes: PassRow[], watches: WatchRow[], aired: AiredCount[]): Facts` y `commonEpisodes(facts: Facts, key: WorkKey, people: string[]): WorkDetail['commonEpisodes']`.

- [x] Crear constructores de test `pass(overrides: Partial<PassRow>): PassRow` y `watch(overrides: Partial<WatchRow>): WatchRow`, con una persona `a`, un libro `b`, fechas fijas y valores completos por defecto. Escribir este test antes de la función:

```ts
it('un último terminado sin nota no recupera el ocho anterior', () => {
  const facts = normalize([
    pass({ id: 'old', rating: 8, finished_on: '2026-01-01' }),
    pass({ id: 'new', rating: null, finished_on: '2026-02-01' }),
  ], [], []);
  expect(facts.works).toMatchObject([{ userId: 'a', key: 'book:b', rating: null }]);
  expect(facts.works).toHaveLength(1);
});
```

- [x] Ejecutar `npm test -- src/lib/comparisons/normalize.test.ts`; observar el fallo por módulo/función ausente.
- [x] Implementar agrupación por persona+tipo+id; elegir solo `completed` en libros/películas. Para series, unir todas las filas de episodios, deduplicar temporada+episodio y elegir nota general del activo `in_progress` o último cerrado. Ordenar fechas conocidas primero, desempatar por creación e id, y mantener nulos. Núcleo del selector:

```ts
const completed = passes.filter(p => p.status === 'completed');
const ordered = completed.toSorted((a, b) =>
  (b.finished_on ?? '').localeCompare(a.finished_on ?? '') ||
  b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
const chosenRating = ordered[0]?.rating ?? null;
```

- [x] Añadir tablas de casos: terminado 8→6; abandonado posterior no sustituye película; nueva lectura en curso; todos sin fecha; fecha desconocida mezclada; `pass_id=null`; misma serie en dos pases; último episodio sin nota; serie terminada sin episodios excluida; episodio sin pase y sin pase general incluido con progreso actual nulo. Para tríos, `commonEpisodes` exige tres notas; no devuelve pares bajo un rótulo de trío.
- [x] Ejecutar la suite focal y comprobar resultados concretos, incluido `orderUnknown=true` solo cuando el historial de varios pases no puede ordenarse completamente. Commit `feat: normalize comparison histories`.

### Tarea 2: conjuntos exactos, hallazgos y gustos

**Archivos:** `derive.ts` y `derive.test.ts`. **Consume:** `Snapshot`, `PersonWork`, `CatalogWork`. **Produce:** `regions(snapshot: Snapshot, people: string[]): Region[]`, `findings(snapshot: Snapshot, people: string[]): Finding[]`, `facets(snapshot: Snapshot, people: string[], kind: 'genre' | 'author' | 'director', signal?: 'consumed' | 'rated'): Facet[]`.

- [x] Escribir un test con A={x,y}, B={x,z}, C={x}; resultado: máscara 7={x}, 1={y}, 2={z}, región 3 vacía. Añadir ausencia de notas sin afectar pertenencia. Ejecutar `npm test -- src/lib/comparisons/derive.test.ts` y observar el fallo.
- [x] Implementar máscara con el orden explícito de las personas, validando 2–3 ids únicos y disponibles; producir también regiones vacías. La máscara se calcula sobre toda la selección, no sobre la pareja nominal de una región:

```ts
const mask = people.reduce((bits, userId, i) =>
  bits | (snapshot.works.some(w => w.key === key && w.userId === userId) ? 1 << i : 0), 0);
```

- [x] Implementar los tres hallazgos como funciones sobre notas existentes de todas las personas nombradas, con al menos dos personas; una región individual muestra datos, sin afirmar acuerdo compartido. Testear [8,8], [2,3], [5,8], [5,7], [8,null], una sola nota y límites exactos. Orden estable por título y key; una obra puede tener varios hallazgos.
- [x] Implementar facetas sobre obras únicas: géneros canónicos, identidad y rol de creador. Calcular recuentos, media/rango y bases individuales; `mean=null` solo cuando no haya notas, y conservar la media interna de muestras pequeñas sin presentarla como tendencia. Tres notas por persona habilitan la comparación de medias; dos no. No convertir episodios en obras ni usar la media de medias como gusto del grupo. Para el ejemplo siguiente, la fixture de A tiene tres notas de 8 entre cuatro obras elegibles; B consume obras pero no tiene notas.

```ts
expect(facets(snapshot, ['a', 'b'], 'genre')[0].people)
  .toEqual(expect.arrayContaining([
    expect.objectContaining({ userId: 'a', mean: 8, eligibleTotal: 4 }),
    expect.objectContaining({ userId: 'b', mean: null }),
  ]));
```

- [x] Cubrir géneros solapados, mismo nombre con ids de creador diferentes, crédito `creator` que no es `director`, metadatos ausentes, películas/libros con el mismo id y conjuntos vacíos. Ordenar categorías por participantes con evidencia, mínimo individual y nombre/id. Ejecutar suite focal y commit `feat: derive library intersections and taste evidence`.

### Tarea 3: guardar selecciones con invariantes en la base de datos

**Archivos:** los de grupos privados del mapa. Crear el nombre de migración con `supabase migration new entre_nosotros_groups`, después de consultar `supabase --help` y `supabase migration new --help`. La salida de la CLI fija el camino exacto; añadir ese archivo al manifiesto, sin inventar una fecha ni renumerar migraciones anteriores.

**Interfaces SQL:** `save_comparison_group(p_id uuid, p_name text, p_user_ids uuid[], p_expected_revision integer) returns public.comparison_groups`; `delete_comparison_group(p_id uuid, p_expected_revision integer) returns boolean`. Ambas `SECURITY INVOKER`, `search_path=''`, sesión requerida; `p_id=null` crea y exige revisión nula. No aceptan un dueño desde cliente.

- [x] Crear `supabase/tests/comparison_groups.sql` con `begin`/`rollback`, usuarios sintéticos y roles reales según `supabase/tests/margin_notes.sql`. Probar primero que las tablas/RPC ausentes fallan. Incorporar el archivo al runner `scripts/db/verify.mjs`.
- [x] Implementar tablas: grupo con id, `owner_id` default `auth.uid()` y FK con borrado en cascada, nombre recortado de 1–60 caracteres, revisión entera y timestamps; miembro con id propio, FK de grupo en cascada, `user_id uuid not null`, posición 0–9. Unicidad grupo+usuario y grupo+posición, esta última diferible para reordenar. El id del participante no lleva FK a auth.users: conserva un puesto no disponible al eliminarse esa cuenta, sin guardar su nombre/avatar ni impedir su eliminación por un trigger de edición de otro dueño. La validación de altas exige identidad vigente; el lector entrega `userId=null` y nombre/avatar nulos para ese puesto eliminado.
- [x] Activar RLS y políticas del dueño en ambas tablas. Rechazar actualización de dueño/id con grants por columna: grupos permiten INSERT(name), UPDATE(name), SELECT y DELETE; miembros INSERT(group_id,user_id,position), UPDATE(position), SELECT y DELETE. Sin permisos para anon; revocar EXECUTE de PUBLIC/anon en cada RPC y conceder solo a authenticated. No alterar permisos globales del proyecto.

```sql
create policy comparison_groups_owner_select on public.comparison_groups
for select to authenticated using (owner_id = (select auth.uid()));
create policy comparison_groups_owner_update on public.comparison_groups
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
```

- [x] Hacer obligatorias las invariantes también ante DML directo: trigger al insertar miembro valida identidad vigente, self o follow aceptado y `can_view_profile`; trigger de grupo actualiza revisión/timestamp; cualquier cambio de miembro toca `name=name` del padre antes de modificarlo, obteniendo su bloqueo y aumentando revisión. No conceder escritura de `revision`. Constraint triggers diferibles en grupo/miembros validan 2–10 puestos al final de la transacción; omiten padres borrados. No revalidar follows al borrar un miembro: debe poder retirarse alguien inaccesible. Los triggers son invoker, con nombres de esquema explícitos, y su código no consulta bibliotecas.
- [x] Implementar RPC con bloqueo del padre `FOR UPDATE`, comprobación de revisión previa y reemplazo atómico de miembros. Validar array 2–10, sin repetidos/nulos, UUID y nombre antes de escribir; borrar miembros e insertar la nueva lista con ordinalidad en una transacción. `save` devuelve la revisión final, que es un token opaco y puede crecer más de uno. El borrado también exige revisión; conflicto `PT409`, entrada inválida `22023`, sesión/permisos `42501`, grupo ajeno/inexistente `PT404` sin distinguirlos.
- [x] Probar owner, tercero, anon, 1/2/10/11 miembros, duplicados, pendiente, público no seguido, privado seguido, grupo sin dueño, miembro eliminado, edición tras dejar de seguir y escritura directa. Forzar `SET CONSTRAINTS ALL IMMEDIATE` en pruebas de tamaño. Validar privilegios de tabla/columna/función contra catálogo real.
- [x] Crear `verify-comparison-concurrency.mjs` siguiendo el runner existente de concurrencia: dos conexiones guardan con la misma revisión, solo una gana; otra pareja de conexiones intenta insertar miembros hasta superar diez, nunca se confirma un grupo de once. Usar la instancia local identificada por su manifiesto, sin URLs de producción. Conectarlo al runner existente.
- [x] Regenerar baseline y ejecutar la [receta canónica local](../../testing/supabase-local.md) sobre una instancia desechable identificada, tras comprobar la ayuda de la CLI instalada. Si existe una instancia con otros datos, conservarla y usar otro directorio según esa receta; no resetearla. La activación histórica tiene su propio guard y no se omite:

```powershell
npm run db:baseline
npm run test:db:bootstrap
npm run db:local:prepare
supabase --workdir .superpowers/supabase-local start --exclude studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor,realtime
node scripts/db/activate-local-celebrations.mjs --privileged-dispatch-paused
npm run test:db:local
```

- [x] Repetir consultas de objetos/grants en dev antes de integración, regenerar tipos y sincronizar data-model/superficie 6 de DRIFT-CHECK. La generación de tipos usa la CLI instalada tras consultar `supabase gen types --help`, sin borrar extensiones manuales del archivo. Commit `feat: persist private comparison groups`.

### Tarea 4: lecturas completas con permisos actuales y acciones de servidor

**Archivos:** `groups.ts`, `load.ts`, `actions.ts`, sus tests. **Consume:** tipos y funciones 1–3; `createClient`, `getCurrentUser`, `readAllRows`, `chunkIds`, RPC `can_view_profile` ya existente. **Produce:**

```ts
// groups.ts / load.ts: servidor, funciones internas; no exportar al cliente.
type Client = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>;
export declare function listGroups(client: Client): Promise<Group[]>;
export declare function listCandidates(client: Client, viewerId: string): Promise<Candidate[]>;
export declare function loadSnapshot(client: Client, viewerId: string,
  groupId: string, format: Format): Promise<Snapshot>;
export declare function loadDetail(client: Client, viewerId: string,
  groupId: string, key: WorkKey, people: string[]): Promise<WorkDetail>;
// actions.ts: 'use server'; verificar sesión en cada entrada.
export declare function loadComparison(groupId: string, format: Format): Promise<Result<Snapshot>>;
export declare function loadComparisonWork(groupId: string, key: WorkKey,
  people: string[]): Promise<Result<WorkDetail>>;
export declare function saveGroup(input: { id: string | null; name: string;
  userIds: string[]; expectedRevision: number | null }): Promise<Result<Group>>;
export declare function deleteGroup(id: string, expectedRevision: number): Promise<Result<null>>;
```

- [x] Escribir tests de acción sin sesión y con UUID de grupo ajeno: no ejecutar consultas de consumo. En loader, simular 1.205 pases repartidos en páginas y fallo de la segunda página; exigir total 1.205 o `load-failed`, nunca 200/1.000. Ejecutar `npm test -- src/lib/comparisons/load.test.ts src/lib/comparisons/actions.test.ts` en rojo.
- [x] Implementar lista de seguidos aceptados paginada, más self, resolviendo identidades visibles. No reutilizar la consulta no paginada de `getFollowing` como inventario completo. Cada miembro se verifica con follows y `can_view_profile`; identidad pública sola no acredita acceso. Validar de nuevo disponibilidad antes de devolver el DTO, y descartar datos de personas revocadas durante la carga.
- [x] Consultar pases y episodios de miembros disponibles con columnas explícitas y orden por id; obtener todas las páginas. Resolver catálogo por tipo y bloques de 50 ids, paginando también créditos y episodios de catálogo. Calcular emitidos con `airedFlags`/`isSeriesEnded`, sin llamar a hidratadores que escriban.

```ts
const passes = await readAllRows<PassRow>((from, to) => client.from('passes')
  .select('id,user_id,item_type,item_id,status,is_active,rating,finished_on,created_at')
  .in('user_id', availableIds).order('id').range(from, to));
```

- [x] Normalizar en servidor y producir `Snapshot` serializable. Si falta metadata de una obra ya elegible, mantener una entrada con título de sustitución, portada nula y cobertura incompleta; no eliminarla del recuento. Un fallo de consulta sí aborta el resultado. No incluir reseñas, textos de episodios, motivos de abandono ni filas de historial crudo en DTO.
- [x] Implementar detalle por obra comprobando que las 1–10 personas nombradas pertenecen al grupo y siguen disponibles, y que la obra es elegible para al menos una. El Venn envía las personas de la región exacta, que pueden ser una, dos o tres; Gustos permite evidencia del grupo completo. Cargar notas de episodios solo para esa serie; `commonEpisodes` requiere al menos dos personas y solo produce episodios con notas de todas ellas. Mapear errores SQL a `Result`, registrar el error técnico en servidor y mostrar copy traducido sin detalles internos.
- [x] Añadir pruebas de revocación entre consultas, tercera persona no seleccionada, `pass_id=null`, cambio de público a privado sin follow, fallo de catálogo y grupo parcialmente disponible. Probar las acciones reales y RLS con las cuentas SQL/fixtures, además de mocks. Commit `feat: load authorized comparison evidence`.

### Tarea 5: ruta, grupos y estado de navegación

**Archivos:** ruta nueva, `explorer.tsx`, `group-editor.tsx`, `state.ts`, tests, Comunidad y mensajes. **Consume:** acciones de tarea 4. **Produce:** `Explorer({ initialGroups, candidates, viewerId }: { initialGroups: Group[]; candidates: Candidate[]; viewerId: string })` y estado puro compartido:

```ts
export type WorkOrigin = { kind: 'region'; mask: number }
  | { kind: 'facet'; facetKind: FacetKind; facetId: string };
export type View = { level: 'group' } | { level: 'venn'; people: string[] }
  | { level: 'region'; people: string[]; mask: number }
  | { level: 'facet'; people: string[]; facetKind: FacetKind; facetId: string }
  | { level: 'work'; people: string[]; origin: WorkOrigin; key: WorkKey };
export type RequestState<T> = { seq: number; value: T | null;
  status: 'idle' | 'loading' | 'ready' | 'error' };
export function acceptResponse<T>(state: RequestState<T>, seq: number,
  result: Result<T>): RequestState<T> {
  if (state.seq !== seq) return state;
  return result.ok ? { seq, value: result.data, status: 'ready' }
    : { seq, value: null, status: 'error' };
}
```

- [x] Testear que seq=2 ignora la respuesta de seq=1 y que cambiar de cuenta borra snapshot, detalle y selección. Ejecutar `npm test -- src/components/comparisons/state.test.ts src/components/comparisons/explorer.test.tsx` en rojo.
- [x] Crear página con `Suspense` alrededor del lector de sesión; usar `loginHref('/comunidad/entre-nosotros')`. Layout anidado con `<RouteMessages ns={['comparisons']}>`; si una isla reutilizada necesita otro namespace, declararlo expresamente porque los providers reemplazan los mensajes del padre. `error.tsx` ofrece reintento.
- [x] Añadir enlace «Entre nosotros» desde Comunidad sin nueva entrada de navegación principal. Editor dentro de la página/lienzo: nombre, búsqueda entre candidatos, selección, contador/validación 2–10, guardar/cancelar y borrado con confirmación inline. Dejar comparar sin self; no preseleccionar personas arbitrarias.
- [x] Mantener el grupo activo en URL como `?group=UUID`, validado y perteneciente al usuario. Sección Obras/Gustos y vistas viven en memoria; conservar una vista por sección y no persistir resultados. Al iniciar una carga para otro grupo/cuenta retirar snapshot y detalle anteriores; al refrescar permisos no presentar datos previos como verificados. Tras guardar actualizar grupo y revisión; un conflicto conserva el borrador y ofrece recargar, sin sobrescribir automáticamente. Al quitar la obra activa por filtro/selección regresar a Venn o faceta según su origen, con contexto válido.
- [x] Completar `comparisons` en `messages/es.json` y copy de Comunidad; pruebas de teclado, cero grupos, error, miembros no disponibles y formulario con diez/once seleccionados. Ejecutar `node scripts/i18n-route-namespaces.mjs .`, revisar cobertura de la ruta, suite focal y commit `feat: add comparison groups in Community`.

### Tarea 6: mapa, Venn y evidencia dentro del lienzo

**Archivos:** `canvas.tsx`, `geometry.ts`, `geometry.test.ts`, CSS y `work-detail.tsx`. **Consume:** snapshot, `View`, `regions`, `findings`, acción de detalle. **Produce:** `ComparisonCanvas({ snapshot, view, onView }: { snapshot: Snapshot; view: View; onView: (view: View) => void })` y geometría:

```ts
export type Pose = { x: number; y: number; width: number; height: number; rotate: number };
export type Camera = { x: number; y: number; scale: number };
export type Scene = { camera: Camera; height: number; poses: Record<WorkKey, Pose> };
export declare function layoutScene(snapshot: Snapshot, view: View,
  viewport: { width: number; height: number }, visibleKeys: WorkKey[]): Scene;
```

- [x] Testear geometría de dos/tres participantes y 320/1280 px: portadas dentro de zonas previstas, ningún tamaño negativo, identidad estable de key. Para diez personas probar mapa con enlaces de pareja y selección de dos/tres, sin Venn de diez. Ejecutar test focal en rojo.
- [x] Implementar mundo en coordenadas estables, controles en capa sin escalar y portadas como nodos HTML con botón accesible; no rasterizar el texto en un canvas bitmap. Dibujar fondos de regiones en SVG decorativo. Usar tokens CSS actuales y cubrir claro/oscuro.
- [x] Renderizar todas las cantidades desde conjuntos completos; muestra de hasta tres portadas por región y una en 320 px. Regiones vacías muestran cero. En el mapa, las posiciones no expresan afinidad; enlaces ordenados según spec. Usar una sola portada animada por WorkKey: los representantes de la pareja/trío seleccionado parten de su pila de mapa, sin duplicar nodos animados en cada enlace. El filtro inicial es Todos los formatos en ambas secciones.
- [x] Desplegar el cruce con 24 portadas iniciales y «Cargar más» de 24 en 24, conservando el orden completo por título/key. No mover las filas anteriores al añadir una tanda. Imágenes lazy con tamaño reservado; sustituto si fallan. El texto «24 de 83» distingue renderizado y total.
- [x] Detalle de obra dentro del lienzo: nombre, tipo, personas, nota y progreso, estado de carga/error/reintento y enlace opcional a ficha mediante `itemHref`. Mantener los nodos de las demás portadas; cargar datos no sustituye la portada destino ni inicia otra cámara. El regreso conserva página y tanda cargada.
- [x] Añadir pruebas de UI para región vacía, notas sin puntuar, portada fallida y 83 obras alcanzables. Ejecutar suites de componentes/geometry y commit `feat: render comparison map and Venn canvas`.

### Tarea 7: zoom guiado y transiciones reversibles

**Archivos:** `motion.ts`, `motion.test.ts`, `use-camera.ts`, ajustes de canvas/CSS, `e2e/entre-nosotros-motion.spec.ts` y base de `e2e/support/comparison-fixtures.ts`. **Consume:** `Scene`, `View` y nodos estables. **Produce:** `sampleMotion(from: Scene, to: Scene, elapsed: number, duration: number): Scene`; `wheelIntent(deltaY: number, deltaMode: number): 'in' | 'out' | null`; hook `useCamera(scene: Scene, transition: 'group' | 'level', reduced: boolean): Scene`.

- [x] Testear extremos y fotograma intermedio, además de interrupción: el nuevo viaje empieza exactamente en la escena visible. No rehacer desde el último estado lógico. Ejecutar `npm test -- src/components/comparisons/motion.test.ts` en rojo.

```ts
const visible = sampleMotion(start, end, 360, 720);
expect(sampleMotion(visible, start, 0, 720)).toEqual(visible);
expect(sampleMotion(start, end, 720, 720)).toEqual(end);
expect(visible.poses[key]).not.toEqual(start.poses[key]);
expect(visible.poses[key]).not.toEqual(end.poses[key]);
```

- [x] Implementar interpolación única de cámara, altura y portadas. Para mapa/Venn, curvas suaves desde la posición visible de cada cubierta hasta su pila durante 850 ms; para general/cruce/obra, 720 ms. La vuelta usa las mismas escenas invertidas; el detalle apunta a la portada real, no a un sustituto central.
- [x] Hook: un requestAnimationFrame activo, `performance.now`, cancelación al desmontar, nueva transición desde el fotograma actual. Si cambia el viewport recalcular destino desde esa escena. Movimiento reducido aplica el destino directamente y conserva foco. Mantener difuminado de regiones no seleccionadas y de las otras portadas al entrar en obra; no desenfocar controles ni contenido enfocado.
- [x] Rueda solo sobre el lienzo, normalizando `deltaMode`; paso tras acumular 80 px equivalentes. Un gesto produce un nivel y se libera después de 180 ms sin eventos y al terminar la transición. Mantener `preventDefault` solo para un gesto de zoom capturado; en límites permitir scroll de página. No interceptar Ctrl/Meta+rueda. Al acercar, usar región/portada bajo puntero; si no hay destino, no inventarlo. Botones y toque cubren el mismo recorrido; Escape vuelve un nivel, flechas no trasladan cámara.
- [x] Preparar fixture mínimo para navegador en `comparison-fixtures.ts`: guard de host dev/local, usuarios desechables `qa_comp_*`, grupo de tres con un cruce de 30 obras y limpieza REST antes/después dentro de try/finally. Crear cuentas de fixture y autenticarse por el login real; no simular la sesión ni usar service key para consultas de producto. La tarea 9 amplía esta misma semilla y no es prerrequisito para comprobar el movimiento.
- [x] E2E: medir bounding boxes antes/durante/después en ambos sentidos, comprobar key y nodo conectado; interrumpir a mitad; probar ráfaga de rueda y movimiento reducido. A 320 px verificar scroll hasta última portada y vuelta a la obra original. Observar movimiento real, no solo llamadas a `animate` o rAF. Ejecutar pruebas focales y commit `feat: animate guided comparison zoom`.

### Tarea 8: Gustos y detalle de notas de series

**Archivos:** `tastes.tsx`, `tastes.test.tsx`, completar `work-detail.tsx`, explorer y mensajes. **Consume:** `Facet[]`, snapshot y `WorkDetail`. **Produce:** `Tastes({ snapshot, people, onOpenWork }: { snapshot: Snapshot; people: string[]; onOpenWork: (key: WorkKey, origin: Extract<WorkOrigin, { kind: 'facet' }>) => void })`. Importar `WorkOrigin` desde el estado de UI, no desde dominio.

- [x] Escribir tests jsdom con tres obras valoradas por A y dos por B: mostrar las notas individuales y mensaje de muestra insuficiente para B; no etiquetar tendencia conjunta. Ejecutar `npm test -- src/components/comparisons/tastes.test.tsx` en rojo.
- [x] Implementar dos señales claramente tituladas, selector géneros/autores/directores, cantidades por persona y evidencia dentro del mismo lienzo. Tamaño de burbuja de consumo representa cantidad; la valoración muestra media, rango y muestra por persona. La visualización no crea un porcentaje global.

```tsx
<output aria-label={t('ratedSample', { count: person.rated.length })}>
  {person.mean == null ? t('unrated') : person.mean.toFixed(1)}
</output>
```

- [x] Mostrar total elegible y cobertura de metadatos; avisar de géneros solapados. La evidencia enumera las obras de cada persona, incluso si no coinciden entre sí. Abrir desde Gustos mantiene su contexto de retorno y no fuerza esa obra a una intersección de consumo falsa.
- [x] En series, renderizar nota general/progreso por persona y un bloque separado de episodios comunes con sus notas individuales. Una muestra de un episodio sigue siendo un dato concreto, nunca una valoración de la serie. Mostrar «Progreso no disponible» cuando corresponda y el aviso de series históricas excluidas del conjunto.
- [x] Probar autor con títulos diferentes, crédito incompleto, cero notas, medias altas con rangos distintos, sin episodios comunes y episodios con una nota ausente. Ejecutar suites focales e inventario de namespaces; commit `feat: show taste and episode comparison evidence`.

### Tarea 9: verificación integrada con datos controlados

**Archivos:** fixtures/E2E del mapa e informe de verificación. **Consume:** flujo completo 1–8. **Produce:** evidencia reproducible de datos, privacidad, navegación y movimiento; no una checklist manual sustitutiva.

- [x] Ampliar los fixtures de tarea 7: guard de host, usuarios desechables `qa_comp_*`, ids de obras dedicados y limpieza REST antes/después dentro de try/finally. Nunca borrar las cuentas persistentes de `docs/TESTING.md`. Service key únicamente para sembrar/limpiar, no para ejecutar lecturas de la feature. Reutilizar patrón de `e2e/support/wrap-up-fixtures.ts` sin importar sus datos de negocio.
- [x] Sembrar grupo de diez con casos de tareas 1–2 y portadas reales del catálogo, sin depender de un proveedor externo en cada test. Una segunda cuenta controla acceso a grupos ajenos. Incluir 1.205 pases en un caso local de volumen y limitar la semilla SQL a su fixture identificada.
- [x] E2E de CRUD, grupo sin dueño, pareja/trío, filtro de formato, detalle y regreso, Gustos, guardado/reapertura, dos pestañas y conflicto, revocar follow/bloquear/eliminar cuenta, error de lectura y cambio de cuenta. Verificar respuestas de red además de la pantalla en privacidad.

```ts
await page.goto('/comunidad/entre-nosotros');
await page.getByRole('button', { name: 'Nueva selección' }).click();
await page.getByRole('textbox', { name: 'Nombre de la selección' }).fill('Mi grupo QA');
await page.getByRole('checkbox', { name: 'Ana QA', exact: true }).check();
await page.getByRole('checkbox', { name: 'Luis QA', exact: true }).check();
await page.getByRole('button', { name: 'Guardar selección', exact: true }).click();
await expect(page.getByRole('heading', { name: 'Mi grupo QA' })).toBeVisible();
```

- [x] Ejecutar unitarios focales y luego la suite general una vez; typecheck, lint y build. Para navegador, iniciar un único `npm run start -- --port 3000` de esa build; Playwright lo reutiliza. Confirmar que no es un `next dev` viejo. En Windows lanzar en oculto si se usa Start-Process, guardar su PID y apagar solo ese proceso al terminar.

```powershell
npm test -- src/lib/comparisons src/components/comparisons
npm test
npx tsc --noEmit
npm run test:ci:lint
npm run build
npm run start -- --port 3000
# En una segunda terminal, con el servidor anterior ya listo:
npm run test:e2e -- e2e/entre-nosotros.spec.ts e2e/entre-nosotros-motion.spec.ts --workers=1 --retries=0
```

- [x] Cubrir 320, 768 y 1280 px, claro/oscuro, teclado, reduced-motion y títulos largos. Registrar consola/red, muestras de geometría y capturas intermedias, comandos, revisión de Git, backend y cleanup en `docs/testing/2026-10-10-entre-nosotros.md`. Medir tiempo de carga/tamaño de respuesta con 10 personas y 1.205 filas; no afirmar rendimiento sin cifras. Si hay fallo ajeno, abrir issue etiquetada y distinguirlo del gate focal. Commit `test: verify private library comparisons end to end`.

### Tarea 10: sincronización documental y entrega revisable

**Archivos:** backlog, decisiones, data-model, `docs/ARQUITECTURA.md`, `docs/architecture/graph.json`, `map.html`, informe. **Consume:** evidencia de tarea 9. **Produce:** cambio listo para revisión, con estado real de cada entorno.

- [x] Revisar diff completo contra spec: ningún umbral inventado, ninguna nota antigua recuperada, ausencia interpretada correctamente, cero consultas con service role en la feature. Revisar columnas/grants e invariantes de DML directo, no solo el camino de UI.
- [x] Completar data-model con tablas/RPC/políticas y fecha/entorno efectivamente verificados. Registrar decisiones nuevas al final de decisiones.md, mantener evolución en spec e informe. Añadir nodos/ruta/flujo al mapa y regenerar con su herramienta:

```powershell
node docs/architecture/sync.mjs
git diff --check
```

- [x] Backlog: marcar implementación solo cuando exista evidencia; distinguir «implementado local/dev» de «activo en producción». Si falta integración/publicación, conservar #1462 abierta con ese estado. Cualquier descubrimiento fuera de alcance se registra como issue con exactamente una etiqueta de área, tipo y prioridad, sin mezclarlo con este cambio.
- [x] Revisar de forma independiente el cambio completo y corregir hallazgos antes de entrega, según el método de ejecución elegido. Comprobar worktree y limpieza de fixtures/procesos propios; no cerrar ni borrar trabajo ajeno. Commit `docs: document Entre nosotros implementation and verification`.
- [x] Entregar diff e informe. Publicar o aplicar migraciones en producción requiere el paso de entrega correspondiente: antes comprobar dev y objetos reales, preparar instrucciones concretas de despliegue y reversión. Para retirar la UI basta revertir el código; conservar las tablas privadas evita perder selecciones guardadas. Este plan no autoriza borrar datos ni desplegar ahora.

## Cobertura y cierre del plan

| Spec | Tareas |
|---|---|
| §1–2 propósito, personas y grupos privados | 3–5, 9 |
| §3 elegibilidad, historial y series | 1, 4, 8–9 |
| §4 conjuntos y hallazgos | 2, 6, 9 |
| §5 consumo/gustos y cobertura | 2, 4, 8–9 |
| §6 lienzo, zoom, móvil y accesibilidad | 5–9 |
| §7 permisos, persistencia, arquitectura y errores | 3–5, 9–10 |
| §8 aceptación | 1–10, con evidencia final en 9 |

La revisión de este plan debe confirmar el alcance y elegir ejecución: por subagentes con revisión por tarea, o directa en esta sesión con revisión independiente al final. No se ha iniciado ninguna de las dos. Las interfaces y los casos de prueba permiten cualquiera de ellas sin modificar el alcance.


Cierre de ejecución (2026-10-10): revisión por tarea, revisión completa y una única
corrección/re-revisión final realizadas. Candidata local, sin despliegue, push ni
merge. Restos menores explícitos: #1472 (foco al volver de una región poblada),
#1473 (dos claves ajenas de traducción); #1471 conserva la investigación de fixture.
Los checkboxes acreditan la ejecución y disposición de hallazgos, no que esas
issues estén resueltas. Informe canónico: docs/testing/2026-10-10-entre-nosotros.md.
