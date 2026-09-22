import { expect, type Page } from "@playwright/test";

export const namespace = "qa1183moderation";
export const ids = {
  book: "11830000-0000-4000-8000-000000000001",
  post: "11830000-0000-4000-8000-000000000002",
  club: "11830000-0000-4000-8000-000000000003",
  clubPost: "11830000-0000-4000-8000-000000000004",
  comment: "11830000-0000-4000-8000-000000000005",
  report: "11830000-0000-4000-8000-000000000006",
  pass: "11830000-0000-4000-8000-000000000007",
};
export type ModerationUser = { id: string; email: string; password: string; token: string };

export async function api(path: string, method = "GET", body?: unknown, token?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (new URL(url).hostname !== "tyvzpuhxfwxrnkcpzxyg.supabase.co") throw new Error("Moderation fixtures require biblioshare-dev");
  const key = token ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! : process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(`${url}/${path}`, { method,
    headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json", Prefer: "return=representation" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export async function write(path: string, method: string, body?: unknown) {
  const response = await api(path, method, body);
  expect(response.ok, `${method} ${path}: ${response.status} ${response.ok ? "" : await response.text()}`).toBe(true);
  return response;
}
export async function cleanupModeration(adminToken?: string) {
  // Ordinary cascades deliberately reject removed parents, even with service
  // credentials. Restore only our own fixtures through the authorized RPC.
  if (adminToken) {
    for (const [kind, id] of [["club", ids.club], ["post", ids.post], ["club_post", ids.clubPost], ["comment", ids.comment]]) {
      const response = await api("rest/v1/rpc/admin_moderate_content", "POST", {
        p_kind: kind, p_id: id, p_action: "restore", p_reason: `${namespace}: fixture cleanup`, p_confirmation: "",
      }, adminToken);
      if (!response.ok) {
        const detail = await response.text();
        expect(/not_found|missing|not_removed|invalid_transition|conflict/.test(detail), `restore fixture ${kind}: ${detail}`).toBe(true);
      }
    }
  }
  await write(`rest/v1/content_reports?id=eq.${ids.report}`, "DELETE");
  await write(`rest/v1/comments?id=eq.${ids.comment}`, "DELETE");
  await write(`rest/v1/clubs?id=eq.${ids.club}`, "DELETE");
  await write(`rest/v1/posts?id=eq.${ids.post}`, "DELETE");
  await write(`rest/v1/passes?id=eq.${ids.pass}`, "DELETE");
  await write(`rest/v1/books?id=eq.${ids.book}`, "DELETE");
  for (let page = 1; ; page++) {
    const response = await write(`auth/v1/admin/users?page=${page}&per_page=100`, "GET");
    const { users } = await response.json() as { users: { id: string; email?: string }[] };
    for (const user of users) {
      if ([`${namespace}admin@example.com`, `${namespace}owner@example.com`].includes(user.email ?? ""))
        await write(`auth/v1/admin/users/${user.id}`, "DELETE");
    }
    if (users.length < 100) break;
  }
}
export async function createUser(role: "admin" | "owner"): Promise<ModerationUser> {
  const email = `${namespace}${role}@example.com`;
  const password = `Qa-${crypto.randomUUID()}!`;
  const response = await write("auth/v1/admin/users", "POST", { email, password, email_confirm: true });
  const { id } = await response.json();
  await write("rest/v1/profiles", "POST", { user_id: id, username: `${namespace}${role}`, role: role === "admin" ? "admin" : "user", is_public: true, onboarded_at: new Date().toISOString() });
  const session = await write("auth/v1/token?grant_type=password", "POST", { email, password });
  return { id, email, password, token: (await session.json()).access_token };
}
export async function seed(owner: ModerationUser, admin: ModerationUser) {
  await write("rest/v1/books", "POST", { id: ids.book, title: `${namespace} book` });
  await write("rest/v1/passes", "POST", { id: ids.pass, user_id: owner.id, item_type: "book", item_id: ids.book, is_active: true });
  await write("rest/v1/posts", "POST", { id: ids.post, author_id: owner.id, kind: "thought", anchor_type: "book", anchor_id: ids.book, body: `${namespace} post`, source_kind: "pass", source_id: ids.pass });
  await write("rest/v1/clubs", "POST", { id: ids.club, name: `${namespace} club`, slug: namespace, owner_id: owner.id, visibility: "public" });
  await write("rest/v1/club_members", "POST", { club_id: ids.club, user_id: owner.id, role: "owner", status: "active" });
  await write("rest/v1/club_posts", "POST", { id: ids.clubPost, club_id: ids.club, author_id: owner.id, kind: "text", body: `${namespace} club post` });
  const response = await write(`rest/v1/interaction_targets?kind=eq.post&source_id=eq.${ids.post}&select=id`, "GET");
  const [target] = await response.json();
  expect(target?.id, "post trigger creates interaction target").toBeTruthy();
  await write("rest/v1/comments", "POST", { id: ids.comment, author_id: owner.id, interaction_target_id: target.id, body: `${namespace} comment` });
  await write("rest/v1/content_reports", "POST", { id: ids.report, reporter_id: admin.id, target_type: "comment", target_id: ids.comment, reason: "spam", details: namespace, snapshot: {} });
}
export async function login(page: Page, user: ModerationUser) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/");
}
