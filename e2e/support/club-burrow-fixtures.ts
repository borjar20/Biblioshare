import { expect } from "@playwright/test";

const prefix = "s3burrow1130";
export type ClubBurrowUser = { id: string; username: string; email: string; password: string; token: string };

export async function clubApi(path: string, method = "GET", body?: unknown, token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (new URL(url).hostname !== "tyvzpuhxfwxrnkcpzxyg.supabase.co") throw new Error("S3 fixtures require biblioshare-dev");
  const key = token ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! : process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(`${url}/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function clubWrite(path: string, method: string, body?: unknown) {
  const response = await clubApi(path, method, body);
  expect(response.ok, `${method} ${path}: ${response.status} ${response.ok ? "" : await response.text()}`).toBe(true);
  return response;
}

export async function cleanupClubBurrow() {
  // Only exact test namespace; no persistent QA accounts or real clubs.
  await clubWrite(`rest/v1/clubs?slug=like.${prefix}*`, "DELETE");
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const response = await clubApi(`auth/v1/admin/users?page=${page}&per_page=100`);
    expect(response.ok).toBe(true);
    const { users } = await response.json() as { users: { id: string; email?: string }[] };
    for (const user of users) if (new RegExp(`^${prefix}[0-9]+@example\\.com$`).test(user.email ?? "")) ids.push(user.id);
    if (users.length < 100) break;
  }
  for (const id of ids) await clubWrite(`auth/v1/admin/users/${id}`, "DELETE");
}

export async function clubUser(n: number, isPublic = true, signIn = true): Promise<ClubBurrowUser> {
  const username = `${prefix}${n}`;
  const email = `${username}@example.com`;
  const password = `S3-${crypto.randomUUID()}!`;
  const response = await clubWrite("auth/v1/admin/users", "POST", { email, password, email_confirm: true });
  const { id } = await response.json();
  await clubWrite("rest/v1/profiles", "POST", { user_id: id, username, is_public: isPublic, onboarded_at: new Date().toISOString() });
  if (!signIn) return { id, username, email, password, token: "" };
  const session = await clubApi("auth/v1/token?grant_type=password", "POST", { email, password });
  expect(session.ok, `fixture sign-in: ${session.status}`).toBe(true);
  return { id, username, email, password, token: (await session.json()).access_token };
}

export async function burrowClub(owner: ClubBurrowUser, visibility = "public") {
  const slug = `${prefix}-${visibility}`;
  const response = await clubWrite("rest/v1/clubs", "POST", { name: "Club S3 de prueba", slug, owner_id: owner.id, visibility });
  const [club] = await response.json();
  await clubWrite("rest/v1/club_members?on_conflict=club_id,user_id", "POST", { club_id: club.id, user_id: owner.id, role: "owner", status: "active" });
  return { id: club.id as string, slug };
}

export async function addClubPet(clubId: string, user: ClubBurrowUser, status = "active", stage = "adult") {
  await clubWrite("rest/v1/club_members", "POST", { club_id: clubId, user_id: user.id, role: "member", status });
  await clubWrite("rest/v1/pet_state", "POST", { user_id: user.id, name: `Nuez ${user.username}`, class: "wizard", last_stage: stage, last_level: 7 });
}
