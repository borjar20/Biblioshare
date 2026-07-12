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

export type ClubMember = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "member" | "moderator" | "owner";
  status: "invited" | "active";
  joinedAt: string;
};

// Solo miembros ven el roster (RLS: club_members select gateado por
// is_club_member). Incluye 'invited' para que la sección de gestión pueda
// mostrar quién tiene una invitación pendiente de aceptar.
export async function listMembers(clubId: string): Promise<ClubMember[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("club_members")
    .select("user_id, role, status, joined_at")
    .eq("club_id", clubId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const { data: identities, error: identitiesError } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", data.map((m) => m.user_id));
  if (identitiesError) throw identitiesError;

  const byId = new Map(
    (identities ?? [])
      .filter((i): i is typeof i & { user_id: string; username: string } => i.user_id != null && i.username != null)
      .map((i) => [i.user_id, i]),
  );

  return data
    .map((m): ClubMember | null => {
      const identity = byId.get(m.user_id);
      if (!identity) return null;
      return {
        userId: m.user_id,
        username: identity.username,
        displayName: identity.display_name,
        avatarUrl: identity.avatar_url,
        role: m.role,
        status: m.status,
        joinedAt: m.joined_at,
      };
    })
    .filter((m): m is ClubMember => m !== null);
}

// Resuelve un username a user_id para el formulario de invitar (manage-members.tsx) --
// server-side, en vez de una query de cliente ad-hoc, para mantener el mismo
// patrón de dominio del resto del fichero.
export async function resolveUsername(username: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();
  return data?.user_id ?? null;
}
