"use server";

import { redirect } from "next/navigation";
import { notifyClub } from "./notify-club";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/social/notifications";
import { revalidateClubPages } from "@/lib/reactivity/revalidate";
import { getInteractionSummary, type InteractionSummary } from "@/lib/social/interactions";
import type { ItemType } from "@/lib/catalog/types";
import type { Json } from "@/lib/supabase/database.types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

export type ActivityKind =
  | "buddy_read"
  | "tierlist"
  | "list_challenge"
  | "criteria_challenge"
  // Evento: actividad NO participativa (spec 2026-07-22). Solo fecha, título y
  // descripción; sin pool, sin participantes, sin vista de detalle.
  | "evento";
export type ActivityStatus = "proposed" | "active" | "finished" | "archived";

export type ClubActivity = {
  id: string;
  clubId: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  status: ActivityStatus;
  // Configuración específica del kind (SD-8). Opaca a SQL/RLS -- la interpreta cada kind en
  // la capa de app. criteria_challenge (Bloque H4) es su primer consumidor real: ahí vive el
  // criterio del reto (modo, tipo, meta, género, saga).
  config: Json | null;
  createdBy: string;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  viewerIsParticipant: boolean;
  participantCount: number;
  spawnedFromActivityId: string | null;
  spawnedFromItem: { itemType: ItemType; itemId: string } | null;
};

export type ActivityItem = {
  id: string;
  itemType: ItemType;
  itemId: string;
  itemTitle: string;
  itemCoverUrl: string | null;
  addedBy: string;
  position: number;
};

export type ActivityParticipant = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type ActivityDetail = ClubActivity & {
  items: ActivityItem[];
  /** Muestra para el stack de avatares (máx. 4); el total está en participantCount. */
  participants: ActivityParticipant[];
  /** Chat general solo para participantes de actividades no buddy_read; null cuando está oculto. */
  chat: InteractionSummary | null;
  /** Actividades hijas nacidas de esta (spawn desde list_challenge: buddy_read o tierlist de cierre). */
  linkedChildren: LinkedChild[];
};

export type LinkedChild = {
  id: string;
  kind: ActivityKind;
  title: string;
  status: ActivityStatus;
  fromItem: { itemType: ItemType; itemId: string; itemTitle: string } | null;
};

export async function proposeActivity(
  clubId: string,
  kind: ActivityKind,
  title: string,
  description?: string,
  startsOn?: string,
  endsOn?: string,
  config?: Json,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const trimmedTitle = title.trim();
  if (!trimmedTitle) throw new Error("title_required");

  // config va en el propio INSERT -- la política "club_activities insert member" ya gatea
  // (miembro del club, created_by = auth.uid(), status forzado a 'proposed').
  const { data, error } = await supabase
    .from("club_activities")
    .insert({
      club_id: clubId,
      kind,
      title: trimmedTitle,
      description: description?.trim() || null,
      config: config ?? null,
      created_by: userId,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  await notifyClub(supabase, clubId, userId, "club_activity_proposed", data.id);
  revalidateClubPages();
}

// Editar la config de una actividad (EPIC-05 Bloque H4). Va por RPC porque Bloque G no dejó
// política UPDATE de cliente sobre club_activities: la RPC revalida en servidor que el
// llamante sea creador o moderator+ Y que la actividad siga en 'proposed' -- el criterio se
// congela al activar, o el progreso de todos se movería bajo sus pies a mitad de reto.
export async function updateActivityConfig(activityId: string, config: Json): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_activity_config", {
    p_activity_id: activityId,
    p_config: config,
  });
  if (error) throw error;
  revalidateClubPages();
}

export async function activateActivity(activityId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { data: activity, error: fetchError } = await supabase
    .from("club_activities")
    .select("club_id")
    .eq("id", activityId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.rpc("activate_club_activity", { p_activity_id: activityId });
  if (error) throw error;

  await notifyClub(supabase, activity.club_id, userId, "club_activity_activated", activityId);
  revalidateClubPages();
}

export async function finishActivity(activityId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("finish_club_activity", { p_activity_id: activityId });
  if (error) throw error;
  revalidateClubPages();
}

export async function archiveActivity(activityId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("archive_club_activity", { p_activity_id: activityId });
  if (error) throw error;
  revalidateClubPages();
}

export async function joinActivity(activityId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("club_activity_participants")
    .insert({ activity_id: activityId, user_id: userId });
  if (error) throw error;
  revalidateClubPages();
}

export async function leaveActivity(activityId: string): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("club_activity_participants")
    .delete()
    .eq("activity_id", activityId)
    .eq("user_id", userId);
  if (error) throw error;
  revalidateClubPages();
}

export async function addActivityItem(
  activityId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { count } = await supabase
    .from("club_activity_items")
    .select("id", { count: "exact", head: true })
    .eq("activity_id", activityId);
  const { error } = await supabase.from("club_activity_items").insert({
    activity_id: activityId,
    item_type: itemType,
    item_id: itemId,
    added_by: userId,
    position: count ?? 0,
  });
  if (error) throw error;
  revalidateClubPages();
}

export async function removeActivityItem(itemId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("club_activity_items").delete().eq("id", itemId);
  if (error) throw error;
  revalidateClubPages();
}

// Crea una actividad hija enlazada a una list_challenge padre (EPIC-05 interconexión):
// buddy_read desde un ítem del pool (padre activo) o la tierlist de cierre (padre finished,
// única por padre). La RPC hace todas las validaciones server-side; aquí solo se lanza el
// fan-out de notificación y se revalida.
export async function spawnLinkedActivity(input: {
  parentActivityId: string;
  kind: "buddy_read" | "tierlist";
  title: string;
  fromItemType?: ItemType | null;
  fromItemId?: string | null;
}): Promise<string> {
  const { supabase, userId } = await requireUser();
  const { data: childId, error } = await supabase.rpc("spawn_linked_activity", {
    p_parent_activity_id: input.parentActivityId,
    p_kind: input.kind,
    p_title: input.title,
    // Sin cast: desde la migración 20260811 los dos tienen `default null`, que es
    // lo que la función siempre aceptó a propósito -- la tierlist de cierre no
    // lleva ítem de origen (§ RPC arriba). Antes el tipo generado los marcaba
    // no-nulables y había que mentirle con un `as` (#133).
    p_from_item_type: input.fromItemType ?? undefined,
    p_from_item_id: input.fromItemId ?? undefined,
  });
  if (error) throw error;

  // La hija ya nace en el mismo club que el padre; leemos su club_id para el fan-out.
  const { data: child } = await supabase
    .from("club_activities")
    .select("club_id")
    .eq("id", childId as string)
    .single();
  if (child) {
    await notifyClub(supabase, child.club_id, userId, "club_activity_spawned", childId as string);
  }
  revalidateClubPages();
  return childId as string;
}

export async function listClubActivities(clubId: string): Promise<ClubActivity[]> {
  const { supabase, userId } = await requireUser();
  const { data: rows, error } = await supabase
    .from("club_activities")
    .select(
      "id, club_id, kind, title, description, status, config, created_by, starts_on, ends_on, created_at, spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id",
    )
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const activityIds = rows.map((r) => r.id);
  const { data: participantRows } = await supabase
    .from("club_activity_participants")
    .select("activity_id, user_id")
    .in("activity_id", activityIds);
  const countByActivity = new Map<string, number>();
  const viewerParticipates = new Set<string>();
  for (const p of participantRows ?? []) {
    countByActivity.set(p.activity_id, (countByActivity.get(p.activity_id) ?? 0) + 1);
    if (p.user_id === userId) viewerParticipates.add(p.activity_id);
  }

  return rows.map((r) => ({
    id: r.id,
    clubId: r.club_id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    status: r.status,
    config: r.config,
    createdBy: r.created_by,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    createdAt: r.created_at,
    viewerIsParticipant: viewerParticipates.has(r.id),
    participantCount: countByActivity.get(r.id) ?? 0,
    spawnedFromActivityId: r.spawned_from_activity_id,
    spawnedFromItem:
      r.spawned_from_item_type && r.spawned_from_item_id
        ? { itemType: r.spawned_from_item_type as ItemType, itemId: r.spawned_from_item_id }
        : null,
  }));
}

export async function getActivity(activityId: string): Promise<ActivityDetail | null> {
  const { supabase, userId } = await requireUser();

  const { data: row, error } = await supabase
    .from("club_activities")
    .select(
      "id, club_id, kind, title, description, status, config, created_by, starts_on, ends_on, created_at, spawned_from_activity_id, spawned_from_item_type, spawned_from_item_id",
    )
    .eq("id", activityId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: participantRows } = await supabase
    .from("club_activity_participants")
    .select("user_id")
    .eq("activity_id", activityId);
  const participantCount = participantRows?.length ?? 0;
  const viewerIsParticipant = (participantRows ?? []).some((p) => p.user_id === userId);

  // Muestra de identidades para el stack de avatares. Mismo criterio que los
  // autores de opiniones más abajo: profile_identities es legible por diseño,
  // el gate real es poder ver la actividad (pertenencia al club).
  const sampleIds = (participantRows ?? []).slice(0, 4).map((p) => p.user_id);
  const { data: sampleIdentities } = sampleIds.length
    ? await supabase
        .from("profile_identities")
        .select("user_id, username, display_name, avatar_url")
        .in("user_id", sampleIds)
    : {
        data: [] as {
          user_id: string | null;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }[],
      };
  const participants: ActivityParticipant[] = (sampleIdentities ?? [])
    .filter((p): p is typeof p & { user_id: string; username: string } => p.user_id != null && p.username != null)
    .map((p) => ({
      userId: p.user_id,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
    }));

  const { data: itemRows } = await supabase
    .from("club_activity_items")
    .select("id, item_type, item_id, added_by, position")
    .eq("activity_id", activityId)
    .order("position", { ascending: true });

  const idsByType: Record<ItemType, Set<string>> = { book: new Set(), movie: new Set(), series: new Set() };
  for (const r of itemRows ?? []) idsByType[r.item_type as ItemType].add(r.item_id);
  const [books, movies, series] = await Promise.all([
    idsByType.book.size
      ? supabase.from("books").select("id, title, cover_url").in("id", [...idsByType.book])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
    idsByType.movie.size
      ? supabase.from("movies").select("id, title, cover_url").in("id", [...idsByType.movie])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
    idsByType.series.size
      ? supabase.from("series").select("id, title, cover_url").in("id", [...idsByType.series])
      : Promise.resolve({ data: [] as { id: string; title: string; cover_url: string | null }[] }),
  ]);
  const catalogByKey = new Map<string, { title: string; coverUrl: string | null }>();
  for (const r of books.data ?? []) catalogByKey.set(`book:${r.id}`, { title: r.title, coverUrl: r.cover_url });
  for (const r of movies.data ?? []) catalogByKey.set(`movie:${r.id}`, { title: r.title, coverUrl: r.cover_url });
  for (const r of series.data ?? []) catalogByKey.set(`series:${r.id}`, { title: r.title, coverUrl: r.cover_url });

  const items: ActivityItem[] = (itemRows ?? [])
    .map((r): ActivityItem | null => {
      const catalog = catalogByKey.get(`${r.item_type}:${r.item_id}`);
      if (!catalog) return null;
      return {
        id: r.id,
        itemType: r.item_type as ItemType,
        itemId: r.item_id,
        itemTitle: catalog.title,
        itemCoverUrl: catalog.coverUrl,
        addedBy: r.added_by,
        position: r.position,
      };
    })
    .filter((i): i is ActivityItem => i !== null);

  // El chat general no se pinta en buddy_read (que ya tiene sus chats por
  // checkpoint) ni se consulta para quien no participa: su RLS lo oculta y
  // perder el detalle completo por ese dato opcional sería incorrecto.
  let chat: InteractionSummary | null = null;
  if (viewerIsParticipant && row.kind !== "buddy_read") {
    chat = (await getInteractionSummary(supabase, "club_activity", [activityId])).get(activityId) ?? null;
    if (!chat) throw new Error(`Interaction summary missing for club_activity:${activityId}`);
  }

  // Actividades hijas (spawn desde list_challenge): mismo patrón de resolución de
  // catálogo por tipo que el pool de ítems de arriba, aplicado al ítem de origen de cada hija.
  const { data: childRows } = await supabase
    .from("club_activities")
    .select("id, kind, title, status, spawned_from_item_type, spawned_from_item_id")
    .eq("spawned_from_activity_id", activityId)
    .order("created_at", { ascending: true });

  const childIdsByType: Record<ItemType, Set<string>> = {
    book: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const c of childRows ?? []) {
    if (c.spawned_from_item_type && c.spawned_from_item_id) {
      childIdsByType[c.spawned_from_item_type as ItemType].add(c.spawned_from_item_id);
    }
  }
  const [cBooks, cMovies, cSeries] = await Promise.all([
    childIdsByType.book.size
      ? supabase.from("books").select("id, title").in("id", [...childIdsByType.book])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    childIdsByType.movie.size
      ? supabase.from("movies").select("id, title").in("id", [...childIdsByType.movie])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    childIdsByType.series.size
      ? supabase.from("series").select("id, title").in("id", [...childIdsByType.series])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const childTitleByKey = new Map<string, string>();
  for (const r of cBooks.data ?? []) childTitleByKey.set(`book:${r.id}`, r.title);
  for (const r of cMovies.data ?? []) childTitleByKey.set(`movie:${r.id}`, r.title);
  for (const r of cSeries.data ?? []) childTitleByKey.set(`series:${r.id}`, r.title);

  const linkedChildren: LinkedChild[] = (childRows ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    status: c.status,
    fromItem:
      c.spawned_from_item_type && c.spawned_from_item_id
        ? {
            itemType: c.spawned_from_item_type as ItemType,
            itemId: c.spawned_from_item_id,
            itemTitle:
              childTitleByKey.get(`${c.spawned_from_item_type}:${c.spawned_from_item_id}`) ?? "",
          }
        : null,
  }));

  return {
    id: row.id,
    clubId: row.club_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    config: row.config,
    createdBy: row.created_by,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    createdAt: row.created_at,
    viewerIsParticipant,
    participantCount,
    spawnedFromActivityId: row.spawned_from_activity_id,
    spawnedFromItem:
      row.spawned_from_item_type && row.spawned_from_item_id
        ? { itemType: row.spawned_from_item_type as ItemType, itemId: row.spawned_from_item_id }
        : null,
    items,
    participants,
    chat,
    linkedChildren,
  };
}
