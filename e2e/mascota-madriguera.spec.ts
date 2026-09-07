import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";

// Separate from mascota.spec.ts: that file's hooks change a persistent account.
// This feature only uses these two disposable users, cleaned before and after.
const usernames = ["burrow1083a", "burrow1083b", ...Array.from({ length: 64 }, (_, i) => `burrow1083n${i}`)];
const password = "Burrow-test-1083!";
type TestUser = { id: string; username: string; email: string; token: string };
type Row = { user_id: string; pet_stage: string; pet_level: number; total: number };

function environment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (new URL(url).hostname !== "tyvzpuhxfwxrnkcpzxyg.supabase.co") throw new Error("Burrow tests require biblioshare-dev");
  return { url, key: process.env.SUPABASE_SERVICE_ROLE_KEY!, anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! };
}

async function api(path: string, method = "GET", body?: unknown, token?: string) {
  const { url, key, anon } = environment();
  return fetch(`${url}/${path}`, {
    method, headers: { apikey: token ? anon : key, Authorization: `Bearer ${token ?? key}`,
      "Content-Type": "application/json", Prefer: "return=representation" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function write(path: string, method: string, body?: unknown) {
  const response = await api(path, method, body);
  expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
  return response;
}

async function cleanupUsers() {
  // Exact emails only, including an interrupted signup that never got a profile.
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const response = await api(`auth/v1/admin/users?page=${page}&per_page=100`);
    expect(response.ok).toBe(true);
    const { users } = await response.json() as { users: { id: string; email?: string }[] };
    for (const user of users) {
      if (usernames.some((name) => user.email === `${name}@example.com`)) {
        ids.push(user.id);
      }
    }
    if (users.length < 100) break;
  }
  for (const id of ids) await write(`auth/v1/admin/users/${id}`, "DELETE");
}

async function withTestUsers(run: () => Promise<void>) {
  try {
    await cleanupUsers();
    await run();
  } finally {
    await cleanupUsers();
  }
}

async function createUser(username: string, signIn = true): Promise<TestUser> {
  const email = `${username}@example.com`;
  const response = await write("auth/v1/admin/users", "POST", { email, password, email_confirm: true });
  const { id } = await response.json();
  await write("rest/v1/profiles", "POST", { user_id: id, username, is_public: true, onboarded_at: new Date().toISOString() });
  if (!signIn) return { id, email, username, token: "" };
  const session = await api("auth/v1/token?grant_type=password", "POST", { email, password });
  expect(session.ok).toBe(true);
  return { id, email, username, token: (await session.json()).access_token };
}

async function login(page: Page, user: TestUser) {
  await page.goto("/login");
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("/");
}

async function pets(user: TestUser, limit?: number): Promise<Row[]> {
  const response = await api("rest/v1/rpc/get_burrow_pets_with_level", "POST", limit === undefined ? {} : { p_limit: limit }, user.token);
  expect(response.ok, `get_burrow_pets_with_level: ${response.status}`).toBe(true);
  return response.json();
}

test.describe("Madriguera #1083", () => {
  test("S2: apariencia de perfil respeta público, privado, seguimiento y bloqueos", async () => withTestUsers(async () => {
    const a = await createUser(usernames[0]);
    const b = await createUser(usernames[1]);
    const { anon } = environment();
    const profilePet = async (token: string, userId = b.id) => {
      const response = await api("rest/v1/rpc/get_profile_pet", "POST", { p_user_id: userId }, token);
      expect(response.ok).toBe(true);
      return response.json();
    };
    expect(await profilePet(anon)).toEqual([]);
    await write("rest/v1/pet_state", "POST", { user_id: b.id, name: "Nube", class: "wizard", last_stage: "acorn", last_level: 7 });
    const expected = [{ pet_name: "Nube", pet_class: "wizard", pet_stage: "acorn" }];
    expect(await profilePet(anon)).toEqual(expected);
    expect(await profilePet(a.token)).toEqual(expected);
    await write(`rest/v1/profiles?user_id=eq.${b.id}`, "PATCH", { is_public: false });
    expect(await profilePet(anon)).toEqual([]);
    expect(await profilePet(a.token)).toEqual([]);
    expect(await profilePet(b.token)).toEqual(expected);
    await write("rest/v1/follows", "POST", { follower_id: a.id, followee_id: b.id, status: "pending" });
    expect(await profilePet(a.token)).toEqual([]);
    await write(`rest/v1/follows?follower_id=eq.${a.id}&followee_id=eq.${b.id}`, "PATCH", { status: "accepted" });
    expect(await profilePet(a.token)).toEqual(expected);
    expect((await pets(a))[0].pet_level).toBe(7);
    for (const [blocker, blocked] of [[a, b], [b, a]]) {
      await write("rest/v1/user_blocks", "POST", { blocker_id: blocker.id, blocked_id: blocked.id });
      expect(await profilePet(a.token)).toEqual([]);
      await write(`rest/v1/user_blocks?blocker_id=eq.${blocker.id}&blocked_id=eq.${blocked.id}`, "DELETE");
    }
  }));

  test("S2: ficha móvil/escritorio y OG público incluso con sesión", async ({ page, browser }, testInfo) => withTestUsers(async () => {
    test.setTimeout(180_000);
    const a = await createUser(usernames[0]);
    const b = await createUser(usernames[1]);
    await write("rest/v1/pet_state", "POST", { user_id: b.id, name: "Nube de las bibliotecas", class: "wizard", last_stage: "adult", last_level: 12 });
    const path = `/u/${b.username}`;
    await page.goto(path);
    const card = page.getByTestId("profile-pet");
    await expect(card).toContainText("Nube de las bibliotecas");
    await expect(card).toContainText("Maga");
    await expect(card).toContainText("Adulta");
    await card.screenshot({ path: testInfo.outputPath("profile-pet-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.screenshot({ path: testInfo.outputPath("profile-pet-mobile.png") });
    const meta = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(meta).toBeTruthy();
    const og = new URL(meta!, page.url());
    const imagePath = og.pathname + og.search;
    const publicImage = await page.request.get(imagePath);
    expect(publicImage.ok()).toBe(true);
    expect(publicImage.headers()["content-type"]).toContain("image/png");
    expect(publicImage.headers()["cache-control"]).toContain("no-store");
    await writeFile(testInfo.outputPath("profile-pet-og.png"), await publicImage.body());
    await login(page, a);
    await write(`rest/v1/profiles?user_id=eq.${b.id}`, "PATCH", { is_public: false });
    await write("rest/v1/follows", "POST", { follower_id: a.id, followee_id: b.id, status: "accepted" });
    await page.goto(path);
    await expect(card).toBeVisible();
    const authenticatedImage = await page.request.get(imagePath);
    expect(authenticatedImage.ok()).toBe(true);
    const anonContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    try {
      const anonymousImage = await anonContext.request.get(imagePath);
      expect(anonymousImage.ok()).toBe(true);
      expect(await authenticatedImage.body()).toEqual(await anonymousImage.body());
      expect(await anonymousImage.body()).not.toEqual(await publicImage.body());
      await writeFile(testInfo.outputPath("profile-private-og.png"), await anonymousImage.body());
      const anonymousPage = await anonContext.newPage();
      await anonymousPage.goto(path);
      await expect(anonymousPage.getByText("Cuenta privada", { exact: false })).toBeVisible();
      await expect(anonymousPage.getByTestId("profile-pet")).toHaveCount(0);
    } finally { await anonContext.close(); }
  }));

  test("visibilidad por RPC con sesiones reales y campos mínimos", async () => withTestUsers(async () => {
    const a = await createUser(usernames[0]);
    const b = await createUser(usernames[1]);
    for (const u of [a, b]) await write("rest/v1/pet_state", "POST", { user_id: u.id, name: "Nube", class: "wizard", last_stage: "acorn" });
    expect(await pets(a)).toEqual([]); // propia excluida; no seguido excluido
    const follow = () => write("rest/v1/follows", "POST", { follower_id: a.id, followee_id: b.id, status: "accepted" });
    await follow();
    const visible = await pets(a);
    expect(visible.map((p) => p.user_id)).toEqual([b.id]);
    expect(visible[0].pet_stage).toBe("acorn");
    expect(visible[0].total).toBe(1);
    expect(Object.keys(visible[0]).sort()).toEqual([
      "avatar_url", "display_name", "pet_class", "pet_level", "pet_name", "pet_stage", "total", "user_id", "username",
    ]);
    await write(`rest/v1/profiles?user_id=eq.${b.id}`, "PATCH", { is_public: false });
    expect((await pets(a)).map((p) => p.user_id)).toEqual([b.id]);
    await write(`rest/v1/follows?follower_id=eq.${a.id}&followee_id=eq.${b.id}`, "PATCH", { status: "pending" });
    expect(await pets(a)).toEqual([]);
    await write(`rest/v1/follows?follower_id=eq.${a.id}&followee_id=eq.${b.id}`, "PATCH", { status: "accepted" });
    for (const [blocker, blocked] of [[a, b], [b, a]]) {
      await write("rest/v1/user_blocks", "POST", { blocker_id: blocker.id, blocked_id: blocked.id });
      expect(await pets(a)).toEqual([]);
      await write(`rest/v1/user_blocks?blocker_id=eq.${blocker.id}&blocked_id=eq.${blocked.id}`, "DELETE");
      await follow();
    }
    expect(await pets(a, 0)).toHaveLength(1);
    expect(await pets(a, 1000)).toHaveLength(1);
    const { url, anon } = environment();
    const anonymous = await fetch(`${url}/rest/v1/rpc/get_burrow_pets_with_level`, {
      method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" }, body: "{}",
    });
    expect(anonymous.ok).toBe(false);
    const direct = await api(`rest/v1/pet_state?user_id=eq.${b.id}&select=name`, "GET", undefined, a.token);
    expect(direct.ok).toBe(true);
    expect(await direct.json()).toEqual([]);
  }));

  test("A ve a B antes de eclosionar y después junto a su mascota", async ({ page }, testInfo) => withTestUsers(async () => {
    test.setTimeout(120_000);
    const a = await createUser(usernames[0]);
    const b = await createUser(usernames[1]);
    await write("rest/v1/pet_state", "POST", { user_id: b.id, name: "Nube", class: "wizard", last_stage: "adult", last_level: 12 });
    await login(page, a);
    await page.goto(`/u/${b.username}`);
    await page.getByRole("button", { name: /^seguir$/i }).click();
    await expect(page.getByRole("button", { name: /^siguiendo$/i })).toBeVisible();
    // The label is optimistic; wait until the server action finishes before navigating.
    await expect(page.getByRole("button", { name: /^siguiendo$/i })).toBeEnabled();
    await page.goto("/mascota");
    const burrow = page.getByRole("region", { name: "Madriguera", exact: true });
    await expect(page.getByTestId("hatch-form")).toBeVisible();
    await expect(burrow.getByRole("button", { name: /Nube.*@burrow1083b/ })).toBeVisible();
    await expect(burrow.getByText("La tuya")).toHaveCount(0);
    await expect(burrow.getByText("Nivel 12", { exact: true })).toBeVisible();
    await burrow.getByRole("button", { name: /Nube.*@burrow1083b/ }).click();
    await expect(burrow.getByRole("link", { name: /@burrow1083b/ })).toHaveAttribute("href", "/u/burrow1083b");
    const noPet = await api(`rest/v1/pet_state?user_id=eq.${a.id}&select=user_id`);
    expect(await noPet.json()).toEqual([]);

    await page.getByTestId("hatch-form").getByLabel("Nombre", { exact: true }).fill("Nuez");
    await page.getByRole("radiogroup").getByText("Maga", { exact: true }).click();
    await expect(page.getByRole("radio", { name: /Maga/ })).toBeChecked();
    await page.getByRole("button", { name: "Eclosionar", exact: true }).click();
    await expect(page.getByTestId("pet-detail")).toBeVisible();
    await expect(burrow.getByText("La tuya")).toBeVisible();
    await expect(burrow.getByRole("button").first()).toHaveAccessibleName(/Nuez.*tu mascota/);
    await burrow.getByRole("button", { name: /Nube.*@burrow1083b/ }).click();
    await expect(burrow.getByRole("link", { name: /@burrow1083b/ })).toBeVisible();
    await burrow.screenshot({ path: testInfo.outputPath("madriguera-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await burrow.screenshot({ path: testInfo.outputPath("madriguera-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }));

  test("65 vecinas: RPC limita a 60, conserva total y la escena explica el límite", async ({ page }, testInfo) => withTestUsers(async () => {
    test.setTimeout(180_000);
    const a = await createUser(usernames[0]);
    const neighbors: TestUser[] = [];
    for (let start = 1; start < usernames.length; start += 5) {
      // Wait for all creations in a batch before cleanup even if one fails.
      const batch = await Promise.allSettled(usernames.slice(start, start + 5).map((name) => createUser(name, false)));
      for (const result of batch) {
        if (result.status === "rejected") throw result.reason;
        neighbors.push(result.value);
      }
    }
    await write("rest/v1/pet_state", "POST", neighbors.map((u) => ({ user_id: u.id, name: u.username, class: "wizard", last_stage: "acorn" })));
    await write("rest/v1/follows", "POST", neighbors.map((u) => ({ follower_id: a.id, followee_id: u.id, status: "accepted" })));
    const first = await pets(a);
    expect(first).toHaveLength(60);
    expect(first.every((p) => p.total === 65)).toBe(true);
    expect((await pets(a)).map((p) => p.user_id)).toEqual(first.map((p) => p.user_id));
    const limited = await pets(a, 0);
    expect(limited).toHaveLength(1);
    expect(limited[0].total).toBe(65);
    expect(await pets(a, 1000)).toHaveLength(60);
    await login(page, a);
    await page.goto("/mascota");
    const burrow = page.getByRole("region", { name: "Madriguera", exact: true });
    await expect(burrow.getByRole("list").getByRole("button")).toHaveCount(12);
    await burrow.getByRole("button", { name: "Mostrar más" }).click();
    await expect(burrow.getByRole("list").getByRole("button")).toHaveCount(60);
    await expect(burrow.getByText("Mostrando 60 de 65 mascotas de tus seguidos")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await burrow.screenshot({ path: testInfo.outputPath("madriguera-expanded-mobile.png") });
  }));
});
