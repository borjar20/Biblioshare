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

export type ActivityKind = "buddy_read" | "tierlist" | "list_challenge" | "criteria_challenge";
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
  /** Chat general de la actividad (vacío/oculto en buddy_read). RLS lo filtra a participantes. */
  chat: InteractionSummary;
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

export async function listClubActivities(clubId: string): Promise<ClubActivity[]> {
  const { supabase, userId } = await requireUser();
  const { data: rows, error } = await supabase
    .from("club_activities")
    .select("id, club_id, kind, title, description, status, config, created_by, starts_on, ends_on, created_at")
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
  }));
}

export async function getActivity(activityId: string): Promise<ActivityDetail | null> {
  const { supabase, userId } = await requireUser();

  const { data: row, error } = await supabase
    .from("club_activities")
    .select("id, club_id, kind, title, description, status, config, created_by, starts_on, ends_on, created_at")
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

  const chatSummary = await getInteractionSummary(supabase, "club_activity", [activityId]);
  const chat = chatSummary.get(activityId) ?? {
    reactionCount: 0,
    viewerReacted: false,
    commentCount: 0,
    comments: [],
  };

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
    items,
    participants,
    chat,
  };
}
