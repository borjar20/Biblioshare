import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref, sagaHref } from "@/lib/catalog/item-href";
import { PERSON_COLUMNS, enrichTmdbBio, toPerson, type PersonRow } from "./get-person";
import { hydratePersonCredits, needsCreditHydration } from "./hydrate-person-credits";
import { deriveCollaborators, deriveRoleCounts, type CollaboratorRow } from "./derive-person-works";
import type { CreditRole } from "./types";
import type { PersonProfile, ProfileWork, SagaProgress, WorkStatus } from "./profile-types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books",
  movie: "movies",
  series: "series",
};

// Cada tabla de catálogo nombra el año y el tamaño a su manera (verificado
// contra information_schema el 2026-08-12).
const YEAR_COLUMN: Record<ItemType, string> = {
  book: "published_year",
  movie: "release_year",
  series: "release_year",
};

const SIZE_COLUMN: Record<ItemType, string> = {
  book: "total_pages",
  movie: "duration_minutes",
  series: "episode_runtime_minutes",
};

/**
 * El contrato de datos de la ficha de persona: la persona, TODAS sus obras con
 * el estado del visitante, y los agregados del raíl.
 *
 * NO es cacheable (regla #437): depende de `passes` del que MIRA —estado, nota,
 * progreso, "te falta ver", "tu actividad"—. Un `use cache` aquí le serviría a
 * un usuario las filas que solo otro podía ver, y NO se vería en desarrollo con
 * una sola cuenta abierta.
 *
 * Hidrata la obra completa de la persona la PRIMERA vez que se abre su ficha
 * (ver hydratePersonCredits). Se llama desde dentro del <Suspense> de la
 * página, no desde after(): así todo lo que se pinta ya tiene id de catálogo y
 * es enlazable.
 */
export async function getPersonProfile(
  supabase: SupabaseServerClient,
  viewerId: string | null,
  personId: string
): Promise<PersonProfile | null> {
  const { data: row } = await supabase
    .from("people")
    .select(PERSON_COLUMNS)
    .eq("id", personId)
    .maybeSingle();
  if (!row) return null;

  const enriched = await enrichTmdbBio(supabase, row as unknown as PersonRow);

  const hydratable = {
    id: enriched.id,
    tmdbId: enriched.tmdb_id,
    openlibraryKey: enriched.openlibrary_key,
    creditsHydratedAt: enriched.credits_hydrated_at,
  };
  if (needsCreditHydration(hydratable)) {
    await hydratePersonCredits(supabase, hydratable);
  }

  const { data: creditRows } = await supabase
    .from("credits")
    .select("item_type, item_id, role, character")
    .eq("person_id", personId);

  const credits = (creditRows ?? []) as Array<{
    item_type: ItemType;
    item_id: string;
    role: CreditRole;
    character: string | null;
  }>;

  const empty: PersonProfile = {
    person: toPerson(enriched),
    works: [],
    roleCounts: [],
    collaborators: [],
    sagas: [],
    userAverage: null,
    globalAverage: null,
  };
  if (credits.length === 0) return empty;

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  const seenIds = new Set<string>();
  for (const c of credits) {
    const key = `${c.item_type}:${c.item_id}`;
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    idsByType[c.item_type].push(c.item_id);
  }

  // Metadatos de catálogo, estado del visitante, notas de la comunidad y sagas,
  // todo en paralelo: no dependen entre sí.
  const meta = new Map<
    string,
    { title: string; coverUrl: string | null; year: number | null; durationMinutes: number | null }
  >();
  const statusByItem = new Map<
    string,
    { status: WorkStatus; rating: number | null; finishedOn: string | null }
  >();
  const globalByItem = new Map<string, { sum: number; count: number }>();
  const sagaByItem = new Map<string, { sagaId: string; name: string }>();

  await Promise.all([
    // Catálogo.
    ...(Object.keys(idsByType) as ItemType[]).map(async (type) => {
      const ids = idsByType[type];
      if (ids.length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select(`id, title, cover_url, ${YEAR_COLUMN[type]}, ${SIZE_COLUMN[type]}`)
        .in("id", ids);
      for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        meta.set(`${type}:${r.id as string}`, {
          title: r.title as string,
          coverUrl: (r.cover_url as string | null) ?? null,
          year: (r[YEAR_COLUMN[type]] as number | null) ?? null,
          // En libros el "tamaño" son PÁGINAS y no se pinta como minutos: la
          // fila usa este campo solo para cine y series.
          durationMinutes:
            type === "book" ? null : ((r[SIZE_COLUMN[type]] as number | null) ?? null),
        });
      }
    }),

    // Estado del VISITANTE. Sin sesión, este bloque no corre.
    ...(viewerId
      ? (Object.keys(idsByType) as ItemType[]).map(async (type) => {
          const ids = idsByType[type];
          if (ids.length === 0) return;
          const { data } = await supabase
            .from("passes")
            .select("item_id, status, is_active, rating, finished_on")
            .eq("user_id", viewerId)
            .eq("item_type", type)
            .in("item_id", ids);
          for (const r of data ?? []) {
            const key = `${type}:${r.item_id}`;
            const prev = statusByItem.get(key);
            // "completed" gana sobre el resto: una relectura en curso no debe
            // restar avance. Mismo criterio que get-saga-detail.ts.
            if (r.status === "completed") {
              statusByItem.set(key, {
                status: "completed",
                rating: (r.rating as number | null) ?? prev?.rating ?? null,
                finishedOn: (r.finished_on as string | null) ?? prev?.finishedOn ?? null,
              });
            } else if (prev?.status !== "completed" && r.is_active) {
              statusByItem.set(key, {
                status: r.status as WorkStatus,
                rating: (r.rating as number | null) ?? null,
                finishedOn: (r.finished_on as string | null) ?? null,
              });
            }
          }
        })
      : []),

    // Nota de la comunidad. Sin `dropped` y sin `finished_on` nulo, igual que
    // get-saga-detail.ts: apply-transition cierra el pase abandonado con
    // finished_on SIN limpiar el rating, y sin este filtro contaminaría la media.
    ...(Object.keys(idsByType) as ItemType[]).map(async (type) => {
      const ids = idsByType[type];
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("passes")
        .select("item_id, rating")
        .eq("item_type", type)
        .in("item_id", ids)
        .not("rating", "is", null)
        .not("finished_on", "is", null)
        .neq("status", "dropped");
      for (const r of data ?? []) {
        const key = `${type}:${r.item_id}`;
        const acc = globalByItem.get(key) ?? { sum: 0, count: 0 };
        acc.sum += r.rating as number;
        acc.count += 1;
        globalByItem.set(key, acc);
      }
    }),

    // Sagas de sus obras.
    (async () => {
      const allIds = (Object.keys(idsByType) as ItemType[]).flatMap((t) => idsByType[t]);
      if (allIds.length === 0) return;
      const { data } = await supabase
        .from("saga_items")
        .select("saga_id, item_type, item_id, saga:sagas(id, name)")
        .in("item_id", allIds);
      for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        const saga = r.saga as { id: string; name: string } | null;
        if (!saga) continue;
        sagaByItem.set(`${r.item_type as string}:${r.item_id as string}`, {
          sagaId: saga.id,
          name: saga.name,
        });
      }
    })(),
  ]);

  // Una fila por OBRA, con todos sus roles juntos.
  const byWork = new Map<string, ProfileWork>();
  for (const c of credits) {
    const key = `${c.item_type}:${c.item_id}`;
    const m = meta.get(key);
    if (!m) continue; // crédito huérfano: la obra ya no está en catálogo.

    const existing = byWork.get(key);
    if (existing) {
      if (!existing.roles.includes(c.role)) existing.roles.push(c.role);
      if (c.role === "cast" && c.character && !existing.character) existing.character = c.character;
      continue;
    }

    const state = statusByItem.get(key);
    const global = globalByItem.get(key);
    const saga = sagaByItem.get(key);

    byWork.set(key, {
      itemType: c.item_type,
      itemId: c.item_id,
      title: m.title,
      coverUrl: m.coverUrl,
      href: itemHref(c.item_type, c.item_id),
      year: m.year,
      durationMinutes: m.durationMinutes,
      roles: [c.role],
      character: c.role === "cast" ? c.character : null,
      globalRating: global ? global.sum / global.count : null,
      sagaId: saga?.sagaId ?? null,
      sagaName: saga?.name ?? null,
      status: state?.status ?? null,
      userRating: state?.rating ?? null,
      finishedOn: state?.finishedOn ?? null,
      // El porcentaje de avance vive en `passes.position` (jsonb) y su cálculo
      // depende del tipo (página ÷ total_pages en libros, episodio sobre
      // total_episodes en series). Se deja en null a sabiendas: la fila "en
      // progreso" pinta la etiqueta sin barra. Ver la issue de cobertura.
      progressPercent: null,
    });
  }

  const works = [...byWork.values()];
  if (works.length === 0) return empty;

  // Colaboradores: personas con crédito en las MISMAS obras.
  const collaboratorRows: CollaboratorRow[] = [];
  {
    const allIds = works.map((w) => w.itemId);
    const { data } = await supabase
      .from("credits")
      .select("person_id, item_type, item_id, role, person:people(name, photo_url)")
      .in("item_id", allIds)
      .neq("person_id", personId);
    for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const person = r.person as { name: string; photo_url: string | null } | null;
      if (!person) continue;
      collaboratorRows.push({
        personId: r.person_id as string,
        name: person.name,
        photoUrl: person.photo_url,
        role: r.role as CreditRole,
        itemKey: `${r.item_type as string}:${r.item_id as string}`,
      });
    }
  }

  // Progreso por saga: sobre las obras DE ESTA PERSONA en cada saga, no sobre la
  // saga entera — el raíl dice "de lo suyo en esta saga, has visto X".
  const sagaProgress = new Map<string, SagaProgress>();
  for (const w of works) {
    if (!w.sagaId || !w.sagaName) continue;
    const entry = sagaProgress.get(w.sagaId) ?? {
      sagaId: w.sagaId,
      name: w.sagaName,
      href: sagaHref(w.sagaId),
      total: 0,
      completed: 0,
    };
    entry.total += 1;
    if (w.status === "completed") entry.completed += 1;
    sagaProgress.set(w.sagaId, entry);
  }

  const avg = (list: number[]) =>
    list.length === 0 ? null : list.reduce((a, b) => a + b, 0) / list.length;

  return {
    person: toPerson(enriched),
    works,
    roleCounts: deriveRoleCounts(works),
    collaborators: deriveCollaborators(collaboratorRows),
    sagas: [...sagaProgress.values()].sort((a, b) => b.total - a.total),
    userAverage: avg(works.map((w) => w.userRating).filter((r): r is number => r != null)),
    globalAverage: avg(works.map((w) => w.globalRating).filter((r): r is number => r != null)),
  };
}
