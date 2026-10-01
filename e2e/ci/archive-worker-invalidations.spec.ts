import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { analyzeLetterboxdArchive } from "../../src/lib/import/letterboxd-archive";
import { zipFixture } from "../../src/lib/import/test-zip-fixture";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email|correo/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /entrar|iniciar sesión/i }).click();
  await expect(page).toHaveURL("/");
}

test("#1250: cron and owner dispatch refresh a warm public rating without accepting another account", async ({ browser, page, request }, testInfo) => {
  test.setTimeout(90_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (url !== "http://127.0.0.1:54321") throw new Error("Requires disposable local Supabase");
  const baseURL = process.env.PLAYWRIGHT_BASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const movieId = randomUUID();
  const actors: string[] = [];
  const contexts: BrowserContext[] = [];
  const clients: (typeof admin)[] = [];
  const pages: Page[] = [];
  const evidence: Record<string, unknown> = { movieId };
  let ownsMovie = false;

  try {
    const existing = await admin.from("movies").select("id").eq("tmdb_id", 90000001);
    expect(existing.error).toBeNull();
    expect(existing.data, "refusing to adopt another test's movie").toEqual([]);
    const movie = await admin.from("movies").insert({
      id: movieId, tmdb_id: 90000001, title: "Archive Fiction", original_title: "Archive Fiction",
      release_year: 2020, duration_minutes: 90, hydrated_at: new Date().toISOString(),
    }).select("id,tmdb_id,title").single();
    expect(movie.error).toBeNull();
    ownsMovie = true;
    expect(movie.data).toEqual({ id: movieId, tmdb_id: 90000001, title: "Archive Fiction" });

    for (let index = 0; index < 2; index++) {
      const unique = randomUUID().replaceAll("-", "");
      const email = `archive1250_${unique}@example.test`;
      const password = "Archive1250LocalOnly!";
      const actor = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(actor.error).toBeNull();
      actors.push(actor.data.user!.id);
      const profile = await admin.from("profiles").insert({
        user_id: actors[index], username: `arc1250_${unique.slice(0, 14)}`,
        is_public: true, onboarded_at: new Date().toISOString(),
      });
      expect(profile.error).toBeNull();
      const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      clients.push(client);
      const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
      contexts.push(context);
      const actorPage = await context.newPage();
      pages.push(actorPage);
      await login(actorPage, email, password);
    }

    // Two anonymous visits warm the public cache before any imported vote exists.
    await page.goto(`/pelicula/${movieId}`);
    await expect(page.getByRole("heading", { name: "Archive Fiction", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Archive Fiction", exact: true })).toBeVisible();
    await expect(page.getByText("1 valoración", { exact: true })).toHaveCount(0);
    evidence.warmedWithoutVotes = true;

    async function confirmedJob(date: string, rating: number) {
      const analysis = analyzeLetterboxdArchive(zipFixture({
        "diary.csv": `Name,Year,Letterboxd URI,Rating,Watched Date\nArchive Fiction,2020,https://boxd.it/qa1250-${date},${rating},${date}`,
      }));
      const created = await clients[0].rpc("archive_create", { p_analysis: analysis });
      expect(created.error).toBeNull();
      expect((await clients[0].rpc("archive_confirm", { p_job: created.data, p_public: true, p_announce: false })).error).toBeNull();
      return created.data as string;
    }
    async function expectPublicRating(label: string) {
      await page.reload();
      await expect(page.getByText("1 valoración", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("img", { name: label, exact: true }).first()).toBeVisible();
    }

    // No progress screen is mounted: only the scheduled handler can run this job.
    const firstJob = await confirmedJob("2020-01-01", 4);
    const cron = await request.post("/api/cron/archive-imports", { headers: { "x-cron-secret": process.env.CRON_SECRET! } });
    expect(cron.status()).toBe(200);
    await expectPublicRating("4 de 5");
    evidence.afterCron = "4 de 5, 1 valoración";

    const secondJob = await confirmedJob("2021-01-01", 5);
    const dispatchURL = `/api/import/archive/${secondJob}/dispatch`;
    expect((await request.post(dispatchURL, { headers: { Origin: baseURL } })).status()).toBe(401);
    expect((await pages[1].request.post(dispatchURL, { headers: { Origin: baseURL } })).status()).toBe(404);
    expect((await pages[0].request.post(dispatchURL, { headers: { Origin: "https://unrelated.example" } })).status()).toBe(403);
    const before = await admin.from("passes").select("id,rating").eq("user_id", actors[0]).eq("item_id", movieId);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(1);
    expect(before.data![0].rating).toBe(8);
    evidence.unauthorizedDispatches = [401, 404, 403];

    const ownerDispatch = await pages[0].request.post(dispatchURL, { headers: { Origin: baseURL } });
    expect(ownerDispatch.status()).toBe(200);
    await expectPublicRating("5 de 5");
    evidence.afterOwner = "5 de 5, 1 valoración";

    // One vote per user uses their latest completed pass, not both imported passes.
    const repeatedCron = await request.post("/api/cron/archive-imports", { headers: { "x-cron-secret": process.env.CRON_SECRET! } });
    expect(repeatedCron.status()).toBe(200);
    const passes = await admin.from("passes").select("id,rating,finished_on,is_public")
      .eq("user_id", actors[0]).eq("item_id", movieId).order("finished_on");
    expect(passes.error).toBeNull();
    expect(passes.data).toHaveLength(2);
    expect(passes.data!.map(({ rating, finished_on, is_public }) => ({ rating, finished_on, is_public }))).toEqual([
      { rating: 8, finished_on: "2020-01-01", is_public: true },
      { rating: 10, finished_on: "2021-01-01", is_public: true },
    ]);
    const jobs = await admin.from("archive_imports").select("id,state").in("id", [firstJob, secondJob]);
    expect(jobs.error).toBeNull();
    expect(jobs.data).toHaveLength(2);
    expect(jobs.data!.every(({ state }) => state !== "running")).toBe(true);
    evidence.idempotentPassCount = passes.data!.length;
    await testInfo.attach("archive-invalidation.json", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  } finally {
    const failures: unknown[] = [];
    for (const context of contexts) await context.close().catch((error) => failures.push(error));
    for (const id of actors) {
      const deleted = await admin.auth.admin.deleteUser(id);
      if (deleted.error) failures.push(deleted.error);
      const remaining = await admin.from("profiles").select("user_id").eq("user_id", id);
      if (remaining.error || remaining.data?.length) failures.push(remaining.error ?? new Error(`profile ${id} survived cleanup`));
      const imports = await admin.from("archive_imports").select("id").eq("user_id", id);
      if (imports.error || imports.data?.length) failures.push(imports.error ?? new Error(`imports for ${id} survived cleanup`));
      const passes = await admin.from("passes").select("id").eq("user_id", id);
      if (passes.error || passes.data?.length) failures.push(passes.error ?? new Error(`passes for ${id} survived cleanup`));
    }
    if (ownsMovie) {
      const deleted = await admin.from("movies").delete().eq("id", movieId).eq("tmdb_id", 90000001).eq("title", "Archive Fiction");
      if (deleted.error) failures.push(deleted.error);
      const remaining = await admin.from("movies").select("id").eq("id", movieId);
      if (remaining.error || remaining.data?.length) failures.push(remaining.error ?? new Error(`movie ${movieId} survived cleanup`));
    }
    if (failures.length) throw new AggregateError(failures, "#1250 fixture cleanup failed");
  }
});
