import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { analyzeLetterboxdArchive } from "../../src/lib/import/letterboxd-archive";
import { randomUUID } from "node:crypto";
import { zipFixture } from "../../src/lib/import/test-zip-fixture";

test("ZIP completo: confirmar, cerrar, historial, pendientes, privacidad y deshacer", async ({ page }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (url !== "http://127.0.0.1:54321") throw new Error("Requires disposable local Supabase");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const email = `archive-${randomUUID()}@example.test`;
  const password = `Archive-${randomUUID()}!`;
  const actorIds: string[] = [];
  const movieId = randomUUID();
  try {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(error).toBeNull();
    actorIds.push(data.user!.id);
    const profile = await admin.from("profiles").insert({ user_id: data.user!.id, username: `arc_${randomUUID().slice(0, 8)}`, is_public: false, onboarded_at: new Date().toISOString() });
    expect(profile.error).toBeNull();
    const seeded = await admin.from("movies").insert({ id: movieId, tmdb_id: 90000001, title: "Archive Fiction", original_title: "Archive Fiction", release_year: 2020, duration_minutes: 90 });
    expect(seeded.error).toBeNull();
    await page.goto("/login");
    await page.getByLabel(/email|correo/i).fill(email);
    await page.getByLabel(/contraseña/i).fill(password);
    await page.getByRole("button", { name: /entrar|iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/importar");
    const archive = zipFixture({
      "watched.csv": "Name,Year,Letterboxd URI\nArchive Fiction,2020,https://boxd.it/film",
      "diary.csv": "Name,Year,Letterboxd URI,Rating,Watched Date\nArchive Fiction,2020,https://boxd.it/log1,3,2020-01-01\nArchive Fiction,2020,https://boxd.it/log2,4,2020-01-01",
      "reviews.csv": 'Name,Year,Letterboxd URI,Review,Watched Date\nArchive Fiction,2020,https://boxd.it/log2,"<p>Una <strong>gran</strong> historia</p>",2020-01-01',
      "ratings.csv": "Name,Year,Letterboxd URI,Rating\nArchive Fiction,2020,https://boxd.it/film,4.5",
      "watchlist.csv": "Name,Year,Letterboxd URI\nArchive Fiction,2020,https://boxd.it/film",
      "likes/films.csv": "Name\nExcluded",
    });
    await page.getByLabel("Archivo ZIP", { exact: true }).setInputFiles({ name: "letterboxd.zip", mimeType: "application/zip", buffer: archive });
    await page.getByRole("button", { name: "Analizar ZIP", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Resumen del archivo" })).toBeVisible();
    const before = await admin.from("passes").select("id").eq("user_id", actorIds[0]);
    expect(before.data).toHaveLength(0);
    await page.getByRole("button", { name: "Confirmar importación", exact: true }).click();
    await page.close();
    const back = await page.context().newPage();
    await back.goto("/importar");
    await expect(back.getByText("1 de 1 películas incorporadas", { exact: true })).toBeVisible();
    await back.goto(`/pelicula/${movieId}?tab=log`);
    await expect(back.locator("strong").filter({ hasText: "gran" }).first()).toBeVisible();
    const passes = await admin.from("passes").select("id,status,finished_on,rating,review,is_public").eq("user_id", actorIds[0]).eq("item_id", movieId);
    expect(passes.data).toHaveLength(3);
    expect(passes.data!.filter((p) => p.status === "planned")).toHaveLength(1);
    expect(passes.data!.every((p) => !p.is_public)).toBe(true);
    const stranger = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const denied = await stranger.from("archive_imports").select("id");
    expect(denied.error).not.toBeNull();
    await back.goto("/importar");
    await back.getByText("Deshacer esta importación", { exact: true }).click();
    await back.getByRole("button", { name: "Confirmar deshacer", exact: true }).click();
    await expect(back.getByRole("heading", { name: /Deshecha/ })).toBeVisible();
    const after = await admin.from("passes").select("id").eq("user_id", actorIds[0]);
    expect(after.data).toHaveLength(0);
    await back.close();
  } finally {
    for (const id of actorIds) {
      const deleted = await admin.auth.admin.deleteUser(id);
      expect(deleted.error).toBeNull();
    }
    const deleted = await admin.from("movies").delete().eq("id", movieId);
    expect(deleted.error).toBeNull();
  }
});


test("procedencia, actualizaciones, RLS real, cron y deshacer protegido", async ({ request }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (url !== "http://127.0.0.1:54321") throw new Error("Requires disposable local Supabase");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const ids: string[] = [];
  const movieId = randomUUID();
  const clients = [];
  try {
    for (let i = 0; i < 2; i++) {
      const email = `archive-${randomUUID()}@example.test`;
      const password = `Archive-${randomUUID()}!`;
      const actor = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(actor.error).toBeNull(); ids.push(actor.data.user!.id);
      expect((await admin.from("profiles").insert({ user_id: ids[i], username: `arc_${randomUUID().slice(0, 8)}`, is_public: false, onboarded_at: new Date().toISOString() })).error).toBeNull();
      const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
      clients.push(client);
    }
    const [owner, other] = clients;
    expect((await admin.from("movies").insert({ id: movieId, tmdb_id: 90000001, title: "Archive Fiction", release_year: 2020 })).error).toBeNull();
    const unknown = analyzeLetterboxdArchive(zipFixture({ "watched.csv": "Name,Year,Letterboxd URI\nArchive Fiction,2020,https://boxd.it/film", "ratings.csv": "Name,Year,Letterboxd URI,Rating\nArchive Fiction,2020,https://boxd.it/film,4" }));
    const dated = analyzeLetterboxdArchive(zipFixture({ "diary.csv": "Name,Year,Letterboxd URI,Rating,Watched Date\nArchive Fiction,2020,https://boxd.it/log,4.5,2020-01-01" }));
    async function create(analysis: unknown) {
      const result = await owner.rpc("archive_create", { p_analysis: analysis });
      expect(result.error).toBeNull(); return result.data as string;
    }
    async function confirm(job: string, visible = false) {
      expect((await owner.rpc("archive_confirm", { p_job: job, p_public: visible, p_announce: visible })).error).toBeNull();
    }
    async function apply(job: string) {
      const result = await owner.rpc("archive_apply", { p_job: job, p_ordinal: 0, p_movie: movieId });
      expect(result.error).toBeNull(); return result.data;
    }
    const first = await create(unknown);
    expect(await create(unknown)).toBe(first);
    const hidden = await other.from("archive_imports").select("id").eq("id", first);
    expect(hidden.error).toBeNull(); expect(hidden.data).toEqual([]);
    expect((await other.rpc("archive_confirm", { p_job: first, p_public: true, p_announce: true })).error).not.toBeNull();
    await confirm(first);
    expect(await Promise.all([apply(first), apply(first)])).toEqual(["imported", "imported"]);
    expect((await owner.rpc("archive_finish", { p_job: first })).error).toBeNull();
    const firstPass = await owner.from("passes").select("id,finished_on,rating,status").eq("item_id", movieId).single();
    expect(firstPass.data).toMatchObject({ finished_on: null, rating: 8, status: "completed" });
    // Ten old failed jobs must not starve executable work behind them.
    for (let i = 0; i < 10; i++) {
      const blockedJob = randomUUID();
      expect((await admin.from("archive_imports").insert({ id: blockedJob, user_id: ids[1], fingerprint: String(i).repeat(64), analysis: unknown, state: "running", created_at: "2000-01-01T00:00:00Z" })).error).toBeNull();
      expect((await admin.from("archive_import_items").insert({ job_id: blockedJob, ordinal: 0, user_id: ids[1], payload: unknown.movies[0], state: "error" })).error).toBeNull();
    }
    const second = await create(dated); await confirm(second);
    // No browser action processes this job: only the authenticated worker endpoint.
    const unauthenticated = await request.post("/api/cron/archive-imports");
    expect(unauthenticated.status()).toBe(401);
    const recovered = await request.post("/api/cron/archive-imports", { headers: { "x-cron-secret": process.env.CRON_SECRET! } });
    expect(recovered.status()).toBe(200);
    expect((await request.post("/api/cron/archive-imports", { headers: { "x-cron-secret": process.env.CRON_SECRET! } })).status()).toBe(200);
    const completed = await owner.from("passes").select("id,finished_on").eq("item_id", movieId);
    expect(completed.data).toHaveLength(2);
    expect(completed.data!.some((p) => p.id === firstPass.data!.id && p.finished_on === null)).toBe(true);
    expect((await owner.rpc("archive_undo", { p_job: second })).data).toBe(0);
    expect((await owner.from("passes").select("id").eq("item_id", movieId)).data).toHaveLength(1);
    const third = await create(dated); expect(third).not.toBe(second); await confirm(third); expect(await apply(third)).toBe("imported");
    await owner.rpc("archive_finish", { p_job: third });
    const localPass = await owner.from("passes").select("id").eq("item_id", movieId).eq("finished_on", "2020-01-01").single();
    expect((await owner.from("passes").update({ review: "Mi edicion posterior" }).eq("id", localPass.data!.id)).error).toBeNull();
    const changed = structuredClone(dated); changed.fingerprint = "c".repeat(64); changed.movies[0].passes[0].rating = 6;
    const fourth = await create(changed); await confirm(fourth); expect(await apply(fourth)).toBe("conflict");
    expect((await owner.rpc("archive_undo", { p_job: third })).data).toBeGreaterThan(0);
    const preserved = await owner.from("pass_reviews").select("review,rating").eq("id", localPass.data!.id).single();
    expect(preserved.error).toBeNull();
    expect(preserved.data).toEqual({ review: "Mi edicion posterior", rating: 9 });
    expect((await other.from("passes").select("id").eq("user_id", ids[0])).data).toEqual([]);
    // A separate account explicitly announces once; importing creates no watch post.
    const announced = await other.rpc("archive_create", { p_analysis: unknown }); expect(announced.error).toBeNull();
    expect((await other.rpc("archive_confirm", { p_job: announced.data, p_public: true, p_announce: true })).error).toBeNull();
    expect((await other.rpc("archive_apply", { p_job: announced.data, p_ordinal: 0, p_movie: movieId })).error).toBeNull();
    expect((await other.rpc("archive_finish", { p_job: announced.data })).error).toBeNull();
    const posts = await admin.from("posts").select("id,kind").eq("author_id", ids[1]);
    expect(posts.data).toEqual([{ id: announced.data, kind: "thought" }]);
    expect((await other.rpc("archive_undo", { p_job: announced.data })).data).toBe(0);
    expect((await admin.from("posts").select("id").eq("author_id", ids[1])).data).toEqual([]);
    const orphan = analyzeLetterboxdArchive(zipFixture({ "watched.csv": "Name,Year,Letterboxd URI\nArchive Fiction,2020,https://boxd.it/film", "reviews.csv": "Name,Year,Letterboxd URI,Review,Rating\nArchive Fiction,2020,https://boxd.it/orphan,Resena sin fecha,4" }));
    const reviewJob = await other.rpc("archive_create", { p_analysis: orphan }); expect(reviewJob.error).toBeNull();
    expect((await other.rpc("archive_confirm", { p_job: reviewJob.data, p_public: false, p_announce: false })).error).toBeNull();
    expect((await other.rpc("archive_apply", { p_job: reviewJob.data, p_ordinal: 0, p_movie: movieId })).error).toBeNull();
    expect((await other.rpc("archive_resolve", { p_job: reviewJob.data, p_ordinal: 0, p_decision: "review", p_source: orphan.movies[0].passes[0].sourceKey, p_review: orphan.conflicts[0].sourceKey })).error).toBeNull();
    expect((await other.rpc("archive_apply", { p_job: reviewJob.data, p_ordinal: 0, p_movie: movieId })).error).toBeNull();
    const resolvedReview = await other.from("pass_reviews").select("review,finished_on,status,rating").eq("user_id", ids[1]).eq("item_id", movieId).single();
    expect(resolvedReview.error).toBeNull();
    expect(resolvedReview.data).toEqual({ review: "Resena sin fecha", finished_on: null, status: "completed", rating: 8 });
  } finally {
    for (const id of ids) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    expect((await admin.from("movies").delete().eq("id", movieId)).error).toBeNull();
  }
});
