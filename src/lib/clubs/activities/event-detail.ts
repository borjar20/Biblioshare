import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ItemType } from "@/lib/catalog/types";
import { orderFollowers, type FollowerRow } from "./event-follow-optimistic";
import { deriveEventState, type DeclaredEventState, type EventState } from "./event-state";
import {
  parseEventConfig,
  type EventType,
  type EventConfig,
  type LanzamientoConfig,
  type FechaDestacadaConfig,
} from "./event-types";

// Lecturas de la ficha de un evento. Módulo aparte de events.ts (que es
// `"use server"` y solo puede exportar acciones) y de core.ts, que está montado
// alrededor del pool de ítems, los participantes y las opiniones -- tres cosas
// que un evento no tiene.
//
// La RLS de club_activities y club_event_followers ya limita a miembros activos
// del club, así que aquí no hay gate adicional: la página comprueba `viewerRole`
// para decidir 404 vs contenido, igual que el calendario.

/** Cuántos avatares caben antes de plegar el resto tras «Ver todos». */
export const FOLLOWER_PREVIEW = 8;

/** Página de la lista completa. Se pagina porque un evento de club grande puede
 *  tener cientos de seguidores y traerlos todos para pintar ocho es absurdo. */
export const FOLLOWER_PAGE = 24;

export type ClubEventDetail = {
  id: string;
  clubId: string;
  clubSlug: string;
  clubName: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  location: string | null;
  modality: Database["public"]["Enums"]["event_modality"] | null;
  onlineUrl: string | null;
  eventType: EventType;
  /** true = sin hora concreta (lanzamiento «todo el día» / fecha destacada). */
  allDay: boolean;
  config: EventConfig;
  /** Lanzamiento: la obra ya hidratada (título/portada) o null si no resuelve. */
  hydratedItem: { itemType: ItemType; itemId: string; title: string; coverUrl: string | null } | null;
  /** Fecha destacada: relaciones ya hidratadas para pintar como enlaces. `href`
   *  ya resuelve la ruta correcta por `kind` de la actividad enlazada (evento
   *  vs. el resto -- `/evento/` y `/actividad/` son rutas distintas). */
  hydratedRelations: Array<
    | { kind: "item"; itemType: ItemType; itemId: string; title: string; coverUrl: string | null }
    | { kind: "activity"; activityId: string; title: string; href: string }
  >;
  declaredState: DeclaredEventState;
  /** Derivado del reloj en el servidor: incluye en_curso y finalizado. */
  state: EventState;
  organizerId: string;
  organizerName: string;
  organizerUsername: string | null;
  organizerAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** Estado de seguimiento de quien mira. */
  viewerFollows: boolean;
  viewerRemindMinutesBefore: number | null;
  /** El instante que la BD tiene armado para quien mira. Se LEE, no se recalcula:
   *  la autoridad es `private.club_event_reminder_due`. */
  viewerReminderDueAt: string | null;
  followersCount: number;
  /** Los primeros, ya ordenados. El resto llega por getEventFollowers. */
  followersPreview: FollowerRow[];
};

type ProfileRow = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function followerFrom(
  userId: string,
  followedAt: string,
  profile: ProfileRow | undefined,
): FollowerRow {
  return {
    userId,
    // Nunca se expone el correo ni nada que no se vea normalmente en el club
    // (§8): solo nombre visible, usuario y avatar.
    displayName: profile?.display_name || profile?.username || "Miembro",
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    followedAt,
  };
}

export async function getClubEvent(
  activityId: string,
  viewerId: string,
  now: Date = new Date(),
): Promise<ClubEventDetail | null> {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("club_activities")
    .select(
      "id, club_id, kind, title, description, status, created_by, created_at, updated_at, starts_at, ends_at, event_timezone, location, modality, online_url, event_state, event_type, config, clubs!inner(slug, name)",
    )
    .eq("id", activityId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  // Un no-evento no se sirve por esta ruta aunque el id exista: la URL es
  // adivinable y sin esto se pintaría una ficha de evento sobre una lectura
  // conjunta. Lo mismo con un evento archivado, que se retiró a propósito.
  if (row.kind !== "evento" || row.status !== "active") return null;

  // postgrest-js tipa el join como array cuando no puede probar la cardinalidad,
  // igual que en calendar.ts.
  const club = (Array.isArray(row.clubs) ? row.clubs[0] : row.clubs) as {
    slug: string;
    name: string;
  };

  // Contador y primeras filas en UNA consulta, con el count exacto en la misma
  // respuesta (cabecera Content-Range). Así el contador no puede discrepar de la
  // lista que se acaba de leer (§21): no es una columna `followers_count` que
  // haya que mantener.
  const { data: followerRows, count, error: followersError } = await supabase
    .from("club_event_followers")
    .select("user_id, followed_at, remind_minutes_before, reminder_due_at", {
      count: "exact",
    })
    .eq("activity_id", activityId)
    .order("followed_at", { ascending: true })
    .limit(FOLLOWER_PREVIEW + 1);
  if (followersError) throw followersError;

  const viewerRow = (followerRows ?? []).find((f) => f.user_id === viewerId);
  // Quien mira puede seguir el evento y NO estar entre los primeros por fecha.
  // Se lee su fila aparte en ese caso, en vez de traer la lista entera.
  let viewerFollow = viewerRow ?? null;
  if (!viewerFollow) {
    const { data } = await supabase
      .from("club_event_followers")
      .select("user_id, followed_at, remind_minutes_before, reminder_due_at")
      .eq("activity_id", activityId)
      .eq("user_id", viewerId)
      .maybeSingle();
    viewerFollow = data ?? null;
  }

  const ids = new Set<string>([row.created_by, ...(followerRows ?? []).map((f) => f.user_id)]);
  const { data: profiles } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", [...ids]);
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p as ProfileRow]));
  const organizer = byId.get(row.created_by);

  const preview = orderFollowers(
    (followerRows ?? []).map((f) =>
      followerFrom(f.user_id, f.followed_at, byId.get(f.user_id)),
    ),
    { viewerId, organizerId: row.created_by },
  ).slice(0, FOLLOWER_PREVIEW);

  const declaredState = row.event_state;

  const eventType = (row.event_type ?? "encuentro") as EventType;
  const config = parseEventConfig(eventType, row.config);
  const allDay =
    eventType === "fecha_destacada" ||
    (eventType === "lanzamiento" && (config as LanzamientoConfig).allDay);

  // Reúne los ids de catálogo a hidratar (obra del lanzamiento + relaciones item)
  // y las actividades relacionadas de una fecha destacada. Mismo patrón de
  // resolución por tabla que core.ts: nunca una consulta por ítem.
  const catalogRefs: Array<{ itemType: ItemType; itemId: string }> = [];
  if (eventType === "lanzamiento") {
    const it = (config as LanzamientoConfig).item;
    if (it) catalogRefs.push(it);
  }
  const relActivityIds: string[] = [];
  if (eventType === "fecha_destacada") {
    for (const r of (config as FechaDestacadaConfig).relations) {
      if (r.kind === "item") catalogRefs.push({ itemType: r.itemType, itemId: r.itemId });
      else relActivityIds.push(r.activityId);
    }
  }

  const byType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const r of catalogRefs) byType[r.itemType].push(r.itemId);
  const catalogTitles = new Map<string, { title: string; coverUrl: string | null }>();
  const [bookRows, movieRows, seriesRows] = await Promise.all([
    byType.book.length
      ? supabase.from("books").select("id, title, cover_url").in("id", byType.book)
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
    byType.movie.length
      ? supabase.from("movies").select("id, title, cover_url").in("id", byType.movie)
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
    byType.series.length
      ? supabase.from("series").select("id, title, cover_url").in("id", byType.series)
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
  ]);
  for (const r of bookRows.data ?? []) catalogTitles.set(`book:${r.id}`, { title: r.title, coverUrl: r.cover_url });
  for (const r of movieRows.data ?? []) catalogTitles.set(`movie:${r.id}`, { title: r.title, coverUrl: r.cover_url });
  for (const r of seriesRows.data ?? []) catalogTitles.set(`series:${r.id}`, { title: r.title, coverUrl: r.cover_url });

  // El href depende del `kind`: un evento vive en /evento/[id], el resto (que
  // SÍ tiene ficha propia) en /actividad/[id] -- mezclarlos da 404 (#T13 fix
  // round 1: enlazaba todo a /actividad/ y un evento enlazado 404aba).
  const relInfo = new Map<string, { title: string; href: string }>();
  if (relActivityIds.length) {
    const { data } = await supabase
      .from("club_activities")
      .select("id, title, kind")
      .eq("club_id", row.club_id)
      .in("id", relActivityIds);
    for (const a of data ?? []) {
      const href =
        a.kind === "evento"
          ? `/club/${club.slug}/evento/${a.id}`
          : `/club/${club.slug}/actividad/${a.id}`;
      relInfo.set(a.id, { title: a.title, href });
    }
  }

  let hydratedItem: ClubEventDetail["hydratedItem"] = null;
  if (eventType === "lanzamiento") {
    const it = (config as LanzamientoConfig).item;
    if (it) {
      const hit = catalogTitles.get(`${it.itemType}:${it.itemId}`);
      if (hit) hydratedItem = { ...it, title: hit.title, coverUrl: hit.coverUrl };
    }
  }

  const hydratedRelations: ClubEventDetail["hydratedRelations"] = [];
  if (eventType === "fecha_destacada") {
    for (const r of (config as FechaDestacadaConfig).relations) {
      if (r.kind === "item") {
        const hit = catalogTitles.get(`${r.itemType}:${r.itemId}`);
        if (hit) hydratedRelations.push({ kind: "item", itemType: r.itemType, itemId: r.itemId, ...hit });
      } else {
        const info = relInfo.get(r.activityId);
        if (info) hydratedRelations.push({ kind: "activity", activityId: r.activityId, ...info });
      }
    }
  }

  return {
    id: row.id,
    clubId: row.club_id,
    clubSlug: club.slug,
    clubName: club.name,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.event_timezone,
    location: row.location,
    modality: row.modality,
    // El enlace de acceso solo se sirve a quien es miembro -- y llegar aquí ya
    // exige serlo (RLS + el gate de la página). Se deja explícito para que
    // añadir una superficie nueva no lo filtre por descuido.
    onlineUrl: row.online_url,
    eventType,
    allDay,
    config,
    hydratedItem,
    hydratedRelations,
    declaredState,
    state: deriveEventState(
      { eventState: declaredState, startsAt: row.starts_at, endsAt: row.ends_at },
      now,
    ),
    organizerId: row.created_by,
    organizerName: organizer?.display_name || organizer?.username || "Miembro",
    organizerUsername: organizer?.username ?? null,
    organizerAvatarUrl: organizer?.avatar_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    viewerFollows: viewerFollow !== null,
    viewerRemindMinutesBefore: viewerFollow?.remind_minutes_before ?? null,
    viewerReminderDueAt: viewerFollow?.reminder_due_at ?? null,
    followersCount: count ?? 0,
    followersPreview: preview,
  };
}

export type FollowerPage = {
  followers: FollowerRow[];
  total: number;
  /** Si hay más páginas después de esta. */
  hasMore: boolean;
};

/**
 * Página de la lista completa de seguidores. Una consulta para las filas (con el
 * count exacto en la misma respuesta) y UNA para todos sus perfiles: nunca un
 * perfil por seguidor.
 */
export async function getEventFollowers(
  activityId: string,
  viewerId: string,
  organizerId: string,
  page = 0,
): Promise<FollowerPage> {
  const supabase = await createClient();
  const from = page * FOLLOWER_PAGE;

  const { data: rows, count, error } = await supabase
    .from("club_event_followers")
    .select("user_id, followed_at", { count: "exact" })
    .eq("activity_id", activityId)
    .order("followed_at", { ascending: true })
    .range(from, from + FOLLOWER_PAGE - 1);
  if (error) throw error;

  const { data: profiles } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", (rows ?? []).map((r) => r.user_id));
  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p as ProfileRow]));

  const total = count ?? 0;
  return {
    followers: orderFollowers(
      (rows ?? []).map((r) => followerFrom(r.user_id, r.followed_at, byId.get(r.user_id))),
      { viewerId, organizerId },
    ),
    total,
    hasMore: from + (rows?.length ?? 0) < total,
  };
}

export type FollowedEvent = {
  activityId: string;
  clubSlug: string;
  clubName: string;
  title: string;
  startsAt: string | null;
  timezone: string;
  state: EventState;
  remindMinutesBefore: number | null;
};

/**
 * Los eventos que sigue quien mira, dentro de un club (§16). Próximos primero,
 * pasados después: el orden lo decide el consumidor a partir de `state`, pero se
 * devuelven ya ordenados por fecha para que la agenda no tenga que reordenar.
 */
export async function getFollowedEvents(
  clubId: string,
  now: Date = new Date(),
): Promise<FollowedEvent[]> {
  const supabase = await createClient();

  // El `!inner` filtra por club en la misma consulta; la RLS ya limita las filas
  // de club_event_followers a las del propio usuario visible en su club.
  const { data: rows, error } = await supabase
    .from("club_event_followers")
    .select(
      "activity_id, remind_minutes_before, club_activities!inner(id, club_id, title, starts_at, ends_at, event_timezone, event_state, status, kind, clubs!inner(slug, name))",
    )
    .eq("club_activities.club_id", clubId)
    .eq("club_activities.kind", "evento")
    .eq("club_activities.status", "active");
  if (error) throw error;

  const events: FollowedEvent[] = [];
  for (const row of rows ?? []) {
    const a = (Array.isArray(row.club_activities)
      ? row.club_activities[0]
      : row.club_activities) as {
      id: string;
      title: string;
      starts_at: string | null;
      ends_at: string | null;
      event_timezone: string;
      event_state: DeclaredEventState;
      clubs: { slug: string; name: string } | { slug: string; name: string }[];
    };
    const club = (Array.isArray(a.clubs) ? a.clubs[0] : a.clubs) as {
      slug: string;
      name: string;
    };
    events.push({
      activityId: a.id,
      clubSlug: club.slug,
      clubName: club.name,
      title: a.title,
      startsAt: a.starts_at,
      timezone: a.event_timezone,
      state: deriveEventState(
        { eventState: a.event_state, startsAt: a.starts_at, endsAt: a.ends_at },
        now,
      ),
      remindMinutesBefore: row.remind_minutes_before,
    });
  }

  // Cadenas ISO con la MISMA zona (todas UTC desde timestamptz): el orden
  // lexicográfico es el cronológico. Los sin fecha, al final.
  return events.sort((a, b) => {
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return a.startsAt.localeCompare(b.startsAt);
  });
}

/** Los ids de los eventos que sigue quien mira, para marcarlos en el calendario (§17). */
export async function getFollowedEventIds(clubId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("club_event_followers")
    .select("activity_id, club_activities!inner(club_id)")
    .eq("club_activities.club_id", clubId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.activity_id));
}
