import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const marker = `qa1278-${Date.now()}`;
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") {
  throw new Error("#1278 requires disposable local Supabase");
}
const database = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const movieId = randomUUID(), bookId = randomUUID(), clubId = randomUUID();
const credentials = { email: `${marker}@example.test`, password: `Qa1278!${randomUUID()}` };
const username = marker.replace("-", "_");
const fixtures = [
  { label: "movie", path: `/pelicula/${movieId}`, src: `https://image.tmdb.org/t/p/w342/${marker}.jpg`, name: `${marker} movie`, distinctOriginal: true },
  { label: "book", path: `/libro/${bookId}`, src: `https://books.google.com/books/content?id=${marker}&img=1`, name: `${marker} book`, distinctOriginal: true },
  { label: "profile", path: `/u/${username}`, src: `https://qa1278.supabase.co/storage/v1/object/public/avatars/${marker}.png`, name: `${marker} profile`, distinctOriginal: true },
  { label: "club", path: `/club/${marker}`, src: `https://qa1278.supabase.co/storage/v1/object/public/club-covers/${marker}.png`, name: `${marker} club`, distinctOriginal: false },
];
const owned: Array<{ table: string; id: string }> = [];
let actorId: string | undefined;
function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

test.beforeAll(async () => {
  // REST before and after, scoped only to this run's fresh IDs.
  for (const [table, id] of [["movies", movieId], ["books", bookId], ["clubs", clubId]]) {
    check(await database.from(table).delete().eq("id", id));
    expect(check(await database.from(table).select("id").eq("id", id))).toEqual([]);
  }
  const actor = await database.auth.admin.createUser({ ...credentials, email_confirm: true });
  if (actor.error) throw actor.error;
  if (!actor.data.user) throw new Error("Missing disposable actor");
  actorId = actor.data.user.id;
  check(await database.from("profiles").upsert({
    user_id: actorId, username, display_name: fixtures[2].name, is_public: true,
    avatar_url: fixtures[2].src, onboarded_at: new Date().toISOString(),
  }));
  check(await database.from("movies").insert({
    id: movieId, title: fixtures[0].name, cover_url: fixtures[0].src,
    tmdb_id: null, hydrated_at: new Date().toISOString(),
  }));
  owned.push({ table: "movies", id: movieId });
  check(await database.from("books").insert({
    id: bookId, title: fixtures[1].name, cover_url: fixtures[1].src,
    author: "QA1278", hydrated_at: new Date().toISOString(),
  }));
  owned.push({ table: "books", id: bookId });
  check(await database.from("clubs").insert({
    id: clubId, slug: marker, name: fixtures[3].name,
    owner_id: actorId, visibility: "public", cover_url: fixtures[3].src,
  }));
  owned.push({ table: "clubs", id: clubId });
});

test.afterAll(async ({}, info) => {
  const cleanup: Array<{ table: string; count: number }> = [];
  let auth404 = false;
  try {
    for (const row of [...owned].reverse()) {
      check(await database.from(row.table).delete().eq("id", row.id));
      const remaining = check(await database.from(row.table).select("id").eq("id", row.id));
      if (!remaining) throw new Error(`Missing cleanup rows for ${row.table}`);
      cleanup.push({ table: row.table, count: remaining.length });
      expect(remaining).toEqual([]);
    }
    if (actorId) {
      const deleted = await database.auth.admin.deleteUser(actorId);
      if (deleted.error) throw deleted.error;
      auth404 = (await database.auth.admin.getUserById(actorId)).error?.status === 404;
      expect(auth404).toBe(true);
      for (const table of ["profiles", "pet_state", "passes", "pet_acorn_ledger", "pet_cosmetics"]) {
        const remaining = check(await database.from(table).select("user_id").eq("user_id", actorId));
        if (!remaining) throw new Error(`Missing cleanup rows for ${table}`);
        cleanup.push({ table, count: remaining.length });
        expect(remaining).toEqual([]);
      }
    }
  } finally {
    const evidence = { marker, actorId, owned, auth404, cleanup };
    await writeFile(info.outputPath("cleanup.json"), JSON.stringify(evidence, null, 2));
    if (process.env.QA1278_OUT) await writeFile(`${process.env.QA1278_OUT}/cleanup.json`, JSON.stringify(evidence, null, 2));
  }
});

for (const viewport of [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    for (const fixture of fixtures) {
      for (const close of ["escape", "click"] as const) {
        test(`${fixture.label}: defer original, ${close}, focus and reopen`, async ({ page }, info) => {
          const requests: string[] = [], errors: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.route("**/*", async route => {
            const url = route.request().url();
            if (url.includes(marker) && route.request().resourceType() === "image") {
              requests.push(url);
              await route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="100%" height="100%" fill="#467c67"/></svg>' });
            } else if (new URL(url).pathname === "/_vercel/speed-insights/script.js") {
              await route.fulfill({ status: 200, contentType: "application/javascript", body: ";" });
            } else await route.continue();
          });
          if (fixture.label === "club") {
            await page.goto(`/login?next=${encodeURIComponent(fixture.path)}`);
            await page.locator('input[name="email"]').fill(credentials.email);
            await page.locator('input[name="password"]').fill(credentials.password);
            await page.locator('button[type="submit"]').click();
          } else await page.goto(fixture.path);
          await expect(page.getByRole("heading", { level: 1, name: fixture.name, exact: true })).toBeVisible();
          const trigger = page.getByRole("button", { name: "Ampliar imagen", exact: true });
          await expect(trigger).toHaveCount(1);
          await expect.poll(() => trigger.locator("img").evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0)).toBe(true);
          const original = page.locator(`dialog img[src="${fixture.src}"]`);
          const before = [...requests];
          await expect(original).toHaveCount(0);
          if (fixture.distinctOriginal) expect(before.filter(url => url === fixture.src)).toEqual([]);
          // The club already uses its full URL for the visible cover; no byte-saving claim there.
          else expect(before).toContain(fixture.src);
          await trigger.click();
          const dialog = page.getByRole("dialog", { name: fixture.label === "club" ? "Ampliar imagen" : fixture.name, exact: true });
          await expect(dialog).toBeVisible();
          expect(await dialog.evaluate(node => node.matches(":modal"))).toBe(true);
          await expect(original).toBeVisible();
          await expect.poll(() => original.evaluate(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth === 600)).toBe(true);
          if (fixture.distinctOriginal) expect(requests.filter(url => url === fixture.src)).toHaveLength(1);
          const afterOpen = [...requests];
          if (close === "escape") await page.keyboard.press("Escape");
          else await original.click();
          await expect(dialog).not.toBeVisible();
          await expect(trigger).toBeFocused();
          await trigger.click();
          await expect(dialog).toBeVisible();
          await expect(original).toBeVisible();
          expect(requests).toEqual(afterOpen);
          await page.keyboard.press("Escape");
          await expect(trigger).toBeFocused();
          expect(errors).toEqual([]);
          await info.attach("zoom-requests", { body: JSON.stringify({ fixture: fixture.label, viewport, before, afterOpen, afterReopen: requests }), contentType: "application/json" });
          if (fixture.label === "movie" && close === "escape") await page.screenshot({ path: info.outputPath("zoom-closed.png") });
        });
      }
    }
  });
}
