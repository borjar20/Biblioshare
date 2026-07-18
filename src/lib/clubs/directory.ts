"use server";

import { createClient } from "@/lib/supabase/server";
import { listMembers } from "./clubs";

// Directorio de miembros (frame 9): abierto a todo miembro, solo lectura. Se
// apoya en listMembers() (misma fuente que el roster de Gestión, RLS gatea a
// miembros) y lo enriquece con «en N actividades». El orden/filtro/paginado se
// resuelve aquí (server), no en cliente: los clubes públicos llegan a 300+.

export type DirectoryFilter = "all" | "team" | "active" | "new";

export type DirectoryMember = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: "member" | "moderator" | "owner";
  joinedAt: string;
  activityCount: number;
};

export type ClubDirectoryPage = {
  /** Sección «Equipo» (dueño + mods). Vacía en los filtros que no la separan. */
  team: DirectoryMember[];
  /** Página de la lista principal. */
  rows: DirectoryMember[];
  /** Total de la lista principal, para el pie «Mostrando N de M». */
  rowsTotal: number;
  /** Total de miembros activos (equipo incluido) — «Todos · N». */
  allTotal: number;
  /** «Equipo · N». */
  teamTotal: number;
};

const DIRECTORY_PAGE_SIZE = 30;

// Recuento de participación por usuario: cruza las actividades del club con la
// tabla unificada de participantes. Dos consultas, sin group-by en el cliente.
async function activityCountsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data: acts } = await supabase
    .from("club_activities")
    .select("id")
    .eq("club_id", clubId);
  const ids = (acts ?? []).map((a) => a.id);
  if (ids.length === 0) return counts;

  const { data: parts } = await supabase
    .from("club_activity_participants")
    .select("user_id")
    .in("activity_id", ids);
  for (const p of parts ?? []) {
    counts.set(p.user_id, (counts.get(p.user_id) ?? 0) + 1);
  }
  return counts;
}

function isTeam(m: DirectoryMember): boolean {
  return m.role === "owner" || m.role === "moderator";
}

export async function listClubDirectory(
  clubId: string,
  {
    filter = "all",
    search = "",
    page = 0,
  }: { filter?: DirectoryFilter; search?: string; page?: number },
): Promise<ClubDirectoryPage> {
  const supabase = await createClient();
  const [roster, counts] = await Promise.all([
    listMembers(clubId),
    activityCountsFor(supabase, clubId),
  ]);

  const members: DirectoryMember[] = roster
    .filter((m) => m.status === "active")
    .map((m) => ({
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt,
      activityCount: counts.get(m.userId) ?? 0,
    }));

  const q = search.trim().toLowerCase();
  const matches = (m: DirectoryMember) =>
    !q ||
    m.username.toLowerCase().includes(q) ||
    (m.displayName ?? "").toLowerCase().includes(q);

  const teamAll = members.filter(isTeam);
  const nonTeam = members.filter((m) => !isTeam(m));

  // Estos totales son constantes entre filtros: alimentan el segmentado
  // (Todos · N / Equipo · N), no la página actual.
  const allTotal = members.length;
  const teamTotal = teamAll.length;

  // Equipo: el dueño primero, luego mods por antigüedad.
  const orderedTeam = [...teamAll].sort(
    (a, b) =>
      (a.role === "owner" ? 0 : 1) - (b.role === "owner" ? 0 : 1) ||
      a.joinedAt.localeCompare(b.joinedAt),
  );

  const byJoinAsc = (a: DirectoryMember, b: DirectoryMember) =>
    a.joinedAt.localeCompare(b.joinedAt);
  const byJoinDesc = (a: DirectoryMember, b: DirectoryMember) =>
    b.joinedAt.localeCompare(a.joinedAt);
  const byActiveDesc = (a: DirectoryMember, b: DirectoryMember) =>
    b.activityCount - a.activityCount || byJoinAsc(a, b);

  let team: DirectoryMember[] = [];
  let list: DirectoryMember[] = [];

  if (filter === "team") {
    team = orderedTeam.filter(matches);
  } else if (filter === "all") {
    team = orderedTeam.filter(matches);
    list = nonTeam.filter(matches).sort(byJoinAsc);
  } else if (filter === "active") {
    list = members.filter(matches).sort(byActiveDesc);
  } else {
    list = members.filter(matches).sort(byJoinDesc);
  }

  const start = page * DIRECTORY_PAGE_SIZE;
  return {
    team,
    rows: list.slice(start, start + DIRECTORY_PAGE_SIZE),
    rowsTotal: list.length,
    allTotal,
    teamTotal,
  };
}
