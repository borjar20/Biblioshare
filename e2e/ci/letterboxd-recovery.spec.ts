import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { zipFixture } from "../../src/lib/import/test-zip-fixture";

test("940 películas: worker nuevo, fallos, comparación, selección multipágina, reparación y deshacer", async ({ page, request }) => {
  test.setTimeout(300000);
  const syntheticPoster = createRequire(__filename)("../support/archive-poster.cjs") as (comedy: boolean) => Buffer;
  await page.route("https://image.tmdb.org/**/synthetic-*.png", route => route.fulfill({
    contentType: "image/png", body: syntheticPoster(route.request().url().includes("comedy")),
  }));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (url !== "http://127.0.0.1:54321") throw new Error("Disposable local Supabase required");
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const actorIds: string[] = [];
  const email = `recovery-${randomUUID()}@example.test`;
  const password = `Recovery-${randomUUID()}!`;
  try {
    // Every catalog id belongs exclusively to this synthetic fixture.
    expect((await admin.from("movies").delete().gte("tmdb_id", 90001000).lte("tmdb_id", 90001999)).error).toBeNull();
    for (let i = 0; i < 2; i++) {
      const actor = await admin.auth.admin.createUser({ email: i ? `other-${email}` : email, password, email_confirm: true });
      expect(actor.error).toBeNull(); actorIds.push(actor.data.user!.id);
      expect((await admin.from("profiles").insert({ user_id: actorIds[i], username: `rec_${randomUUID().slice(0, 8)}`, is_public: false, onboarded_at: new Date().toISOString() })).error).toBeNull();
    }
    const localMovies = await admin.from("movies").insert(Array.from({ length: 25 }, (_, i) => ({ tmdb_id: 90001002 + i, title: `Archive Recovery ${i + 2}`, release_year: 2020, hydrated_at: new Date().toISOString() }))).select("id");
    expect(localMovies.error).toBeNull();
    expect((await admin.from("passes").insert(localMovies.data!.map(movie => ({ user_id: actorIds[0], item_type: "movie", item_id: movie.id, status: "completed", is_active: true, finished_on: "2020-01-01", rating: 8, is_public: false })))).error).toBeNull();
    const diary = ["Name,Year,Letterboxd URI,Rating,Watched Date"];
    const watched = ["Name,Year,Letterboxd URI"];
    const reviews = ["Name,Year,Letterboxd URI,Rating,Watched Date,Review"];
    for (let i = 0; i < 940; i++) {
      watched.push(`Archive Recovery ${i},2020,https://boxd.it/film${i}`);
      if (i !== 32) diary.push(`Archive Recovery ${i},2020,https://boxd.it/log${i},4,2020-01-01`);
      if (i >= 2 && i <= 26) reviews.push(`Archive Recovery ${i},2020,https://boxd.it/log${i},4,2020-01-01,Synthetic imported review ${i}`);
    }
    diary.push("Archive Recovery 31,2020,https://boxd.it/log31again,3,2020-01-01");
    const archive = zipFixture({ "diary.csv": diary.join("\n"), "watched.csv": watched.join("\n"), "reviews.csv": reviews.join("\n"),
      "watchlist.csv": "Name,Year,Letterboxd URI\nArchive Recovery 30,2020,https://boxd.it/film30" });
    await page.goto("/login");
    await page.getByLabel(/email|correo/i).fill(email);
    await page.getByLabel(/contraseña/i).fill(password);
    await page.getByRole("button", { name: /entrar|iniciar sesión/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/importar");
    await page.getByLabel("Archivo ZIP", { exact: true }).setInputFiles({ name: "recovery.zip", mimeType: "application/zip", buffer: archive });
    await page.getByRole("button", { name: "Analizar ZIP", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Resumen del archivo" })).toBeVisible();
    expect((await admin.from("passes").select("id", { count: "exact", head: true }).eq("user_id", actorIds[0])).count).toBe(25);
    await page.getByRole("button", { name: "Confirmar importación", exact: true }).click();
    const job = await admin.from("archive_imports").select("id").eq("user_id", actorIds[0]).single();
    expect(job.error).toBeNull();
    await page.goto("/coleccion"); // Worker survives leaving the import page.
    for (let i = 0; i < 12; i++) {
      const pending = await admin.from("archive_import_items").select("ordinal", { count: "exact", head: true }).eq("job_id", job.data!.id).eq("state", "pending");
      if (!pending.count) break;
      const response = await request.post("/api/cron/archive-imports", { headers: { "x-cron-secret": process.env.CRON_SECRET! } });
      expect(response.ok(), `${response.status()}: ${await response.text()}`).toBe(true);
    }
    const first = await admin.from("archive_import_items").select("ordinal,state,message").eq("job_id", job.data!.id);
    expect(first.data).toHaveLength(940);
    expect(first.data!.filter(r => r.state === "pending")).toHaveLength(0);
    expect(first.data!.filter(r => r.state === "conflict")).toHaveLength(25);
    expect(first.data!.filter(r => r.state === "error").map(r => r.message).sort()).toEqual(["provider_missing", "provider_temporary"]);
    expect(first.data!.filter(r => r.state === "imported")).toHaveLength(912);
    expect((await admin.from("movies").select("title,cover_url,hydrated_at").eq("tmdb_id", 90001029).single()).data).toMatchObject({ title: "Archive Recovery 29", cover_url: "https://image.tmdb.org/t/p/w342/synthetic-recovery.png" });
    const other = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await other.auth.signInWithPassword({ email: `other-${email}`, password })).error).toBeNull();
    expect((await other.rpc("archive_review_job", { p_job: job.data!.id })).error).not.toBeNull();
    expect((await other.from("archive_import_items").select("ordinal").eq("job_id", job.data!.id)).data).toEqual([]);
    // Reproduce an older completed import with an incomplete shared catalog shell.
    expect((await admin.from("movies").update({ title: null, cover_url: null, hydrated_at: null }).eq("tmdb_id", 90001029)).error).toBeNull();
    await page.goto("/importar");
    await expect(page.getByRole("heading", { name: /Importación parcial/ })).toBeVisible();
    await page.getByRole("button", { name: "Abrir revisión conjunta", exact: true }).click();
    await page.getByLabel("Filtrar incidencias").selectOption("conflict");
    await page.getByRole("button", { name: "Seleccionar las 25 filas de este filtro (todas las páginas)", exact: true }).click();
    await expect(page.getByText(/25 filas seleccionadas, 5 fuera/)).toBeVisible();
    await page.getByRole("button", { name: "Siguiente", exact: true }).click();
    await expect(page.getByText(/25 filas seleccionadas, 20 fuera/)).toBeVisible();
    await page.getByLabel("Filtrar incidencias").selectOption("error");
    await expect(page.getByText(/25 filas seleccionadas, 25 fuera/)).toBeVisible();
    await page.getByRole("button", { name: "Revisar efectos antes de aplicar", exact: true }).click();
    await expect(page.getByText(/Se aplicarán 25 filas/)).toBeVisible();
    await page.getByRole("button", { name: "Cancelar confirmación", exact: true }).click();
    expect((await admin.from("passes").select("review").eq("user_id", actorIds[0]).in("item_id", localMovies.data!.map(m => m.id))).data!.every(p => p.review === null)).toBe(true);
    await page.getByRole("button", { name: "Preparar plan de reparación", exact: true }).click();
    await expect(page.getByText(/27 filas seleccionadas/)).toBeVisible();
    expect((await admin.from("movies").select("title").eq("tmdb_id", 90001029).single()).data!.title).toBeNull();
    await page.getByRole("button", { name: "Revisar efectos antes de aplicar", exact: true }).click();
    await page.getByRole("button", { name: "Confirmar estos efectos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Resultados por fila", exact: true })).toBeVisible();
    await expect.poll(async () => (await admin.from("movies").select("title").eq("tmdb_id", 90001029).single()).data?.title).toBe("Archive Recovery 29");
    expect((await admin.from("passes").select("review").eq("user_id", actorIds[0]).in("item_id", localMovies.data!.map(m => m.id))).data!.every(p => p.review?.startsWith("Synthetic imported review"))).toBe(true);
    await page.reload();
    await page.getByText("Ver resultados", { exact: true }).click();
    const ambiguous = page.locator("li").filter({ has: page.getByText("Archive Recovery 27 — Elegir película", { exact: true }) });
    await ambiguous.getByRole("button", { name: "Cargar dirección y duración" }).click();
    await expect(ambiguous.getByText("Dirección: Director 27", { exact: true })).toBeVisible();
    await expect(ambiguous.getByRole("button", { name: "Archive Recovery 27 (2020)", exact: true })).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(ambiguous.getByText("Duración: 97 min", { exact: true })).toBeVisible();
    await ambiguous.scrollIntoViewIfNeeded();
    await expect.poll(() => ambiguous.locator("img").evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("candidates-mobile.png") });
    await ambiguous.getByRole("button", { name: "Archive Recovery 27 (2020)", exact: true }).first().click();
    const permanent = page.locator("li").filter({ has: page.getByText("Archive Recovery 1 — Error pendiente de revisión", { exact: true }) });
    await permanent.getByRole("button", { name: "Descartar esta fila y conservar mis datos", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Finalizada/ })).toBeVisible();
    expect((await admin.from("passes").select("id", { count: "exact", head: true }).eq("user_id", actorIds[0])).count).toBe(941);
    expect((await admin.from("passes").select("id", { count: "exact", head: true }).eq("user_id", actorIds[0]).eq("status", "completed").is("finished_on", null)).count).toBe(1);
    // A completed bulk import must render in the library, not just its summary.
    await page.goto("/coleccion");
    await expect(page.getByText(/\d+ de 939 obras/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu biblioteca está vacía", exact: true })).toHaveCount(0);
    await page.goto("/coleccion?type=movie&status=completed");
    await expect(page.getByText(/\d+ de 938 obras/)).toBeVisible();
    await page.goto("/importar");
    await page.getByText("Deshacer esta importación", { exact: true }).click();
    await page.getByRole("button", { name: "Confirmar deshacer", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Deshecha/ })).toBeVisible();
    expect((await admin.from("passes").select("id", { count: "exact", head: true }).eq("user_id", actorIds[0])).count).toBe(25);
  } finally {
    for (const id of actorIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
    expect((await admin.from("movies").delete().gte("tmdb_id", 90001000).lte("tmdb_id", 90001999)).error).toBeNull();
  }
});
