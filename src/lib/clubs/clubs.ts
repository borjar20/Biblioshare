"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Club = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  visibility: "public" | "private";
  ownerId: string;
  createdAt: string;
};

export type ClubMembershipStatus = "none" | "invited" | "active";

function mapClub(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  visibility: "public" | "private";
  owner_id: string;
  created_at: string;
}): Club {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    coverUrl: row.cover_url,
    visibility: row.visibility,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

// Sin política INSERT en clubs (ver migración 20260712_clubs.sql) — create_club
// es el único camino, inserta clubs + la fila de owner en club_members
// atómicamente vía SECURITY DEFINER.
export async function createClub(input: {
  name: string;
  slug: string;
  description?: string;
  visibility: "public" | "private";
  coverUrl?: string;
}): Promise<Club> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("create_club", {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description ?? "",
    p_visibility: input.visibility,
    p_cover_url: input.coverUrl ?? "",
  });
  if (error) throw error;
  return mapClub(data);
}

export async function updateClub(
  clubId: string,
  input: {
    name?: string;
    description?: string;
    visibility?: "public" | "private";
    coverUrl?: string;
  },
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("clubs")
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.visibility !== undefined && { visibility: input.visibility }),
      ...(input.coverUrl !== undefined && { cover_url: input.coverUrl }),
    })
    .eq("id", clubId);
  if (error) throw error;
}

export async function getClub(slug: string): Promise<
  (Club & { viewerStatus: ClubMembershipStatus; viewerRole: "member" | "moderator" | "owner" | null }) | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: clubRow, error } = await supabase
    .from("clubs")
    .select("id, slug, name, description, cover_url, visibility, owner_id, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!clubRow) return null;

  let viewerStatus: ClubMembershipStatus = "none";
  let viewerRole: "member" | "moderator" | "owner" | null = null;
  if (user) {
    const { data: membership } = await supabase
      .from("club_members")
      .select("status, role")
      .eq("club_id", clubRow.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership) {
      viewerStatus = membership.status;
      viewerRole = membership.status === "active" ? membership.role : null;
    }
  }

  return { ...mapClub(clubRow), viewerStatus, viewerRole };
}

export async function listMyClubs(): Promise<Club[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("club_members")
    .select("clubs(id, slug, name, description, cover_url, visibility, owner_id, created_at)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error) throw error;

  type ClubMemberRow = {
    clubs: {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      cover_url: string | null;
      visibility: "public" | "private";
      owner_id: string;
      created_at: string;
    } | null;
  };

  return (data as unknown as ClubMemberRow[] ?? [])
    .map((row) => row.clubs)
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map(mapClub);
}

export async function discoverPublicClubs(
  query?: string,
): Promise<(Club & { viewerStatus: ClubMembershipStatus })[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let request = supabase
    .from("clubs")
    .select("id, slug, name, description, cover_url, visibility, owner_id, created_at")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(30);
  if (query) request = request.ilike("name", `%${query}%`);

  const { data, error } = await request;
  if (error) throw error;
  const clubs = (data ?? []).map(mapClub);
  if (!user || clubs.length === 0) {
    return clubs.map((c) => ({ ...c, viewerStatus: "none" as const }));
  }

  const { data: memberships } = await supabase
    .from("club_members")
    .select("club_id, status")
    .eq("user_id", user.id)
    .in("club_id", clubs.map((c) => c.id));
  const statusByClub = new Map((memberships ?? []).map((m) => [m.club_id, m.status]));

  return clubs.map((c) => ({ ...c, viewerStatus: statusByClub.get(c.id) ?? "none" }));
}
