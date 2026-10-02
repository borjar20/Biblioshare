import { randomUUID } from "node:crypto";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (api !== "http://127.0.0.1:54321") {
  throw new Error("#1300 requires disposable local Supabase");
}
const database = createClient(api, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const namespace = String(Date.now()) + "-" + randomUUID().slice(0, 8);
const marker = "qa1300-" + namespace;
const author = "Ana Torres";
const hydratedAt = new Date().toISOString();
const fixtures = [
  { label: "hex-32", title: "a1b2c3d4e5f60718293a4b5c6d7e8f90" },
  {
    label: "spaced-long",
    title: "Una larga historia de viajes y libros por el bosque entre mares y montes con luz de otoño y muchos días de calma",
  },
  { label: "normal", title: "El viaje" },
].map((fixture) => {
  const volumeId = marker + "_" + fixture.label;
  return {
    ...fixture,
    id: randomUUID(),
    author,
    google_books_volume_id: volumeId,
    cover_url: "https://books.google.com/books/content?id=" + volumeId + "&img=1",
  };
});

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

type CleanupRow = { id: string; table: string; count: number };
async function cleanFixtures() {
  const cleanup: CleanupRow[] = [];
  const failures: string[] = [];
  // Use every planned UUID, including an insert whose response may have failed.
  // One cleanup failure must not prevent deleting the remaining owned fixtures.
  for (const fixture of fixtures) {
    try {
      const rows = check(await database.from("books").select("google_books_volume_id").eq("id", fixture.id));
      if (!rows) throw new Error("Missing ownership lookup result for books");
      if (rows.some((row) => row.google_books_volume_id !== fixture.google_books_volume_id)) {
        throw new Error("Refusing to delete a UUID with a different owned volume");
      }
      check(await database.from("books").delete().eq("id", fixture.id));
      for (const [table, column] of [["books", "id"], ["book_editions", "book_id"], ["credits", "item_id"], ["passes", "item_id"]]) {
        let query = database.from(table).select(column).eq(column, fixture.id);
        if (table === "credits" || table === "passes") query = query.eq("item_type", "book");
        const remaining = check(await query);
        if (!remaining) throw new Error("Missing cleanup result for " + table);
        cleanup.push({ id: fixture.id, table, count: remaining.length });
        if (remaining.length) throw new Error("Remaining owned rows in " + table);
      }
    } catch (error) {
      failures.push(fixture.id + ": " + (error instanceof Error ? error.message : String(error)));
    }
  }
  return { cleanup, failures };
}

test.beforeAll(async () => {
  if (process.env.QA1300_FIXTURE_REGISTRY) {
    await appendFile(process.env.QA1300_FIXTURE_REGISTRY, JSON.stringify({ kind: "planned", marker, fixtures }) + "\n");
  }
  const before = await cleanFixtures();
  if (before.failures.length) throw new Error("#1300 pre-cleanup failed: " + before.failures.join("; "));
  for (const fixture of fixtures) {
    check(await database.from("books").insert({
      id: fixture.id,
      title: fixture.title,
      author: fixture.author,
      google_books_volume_id: fixture.google_books_volume_id,
      cover_url: fixture.cover_url,
      synopsis: "Ficha local de prueba de ajuste de título.",
      total_pages: 128,
      genres: ["Fantasía"],
      hydrated_at: hydratedAt,
      repr_meta: {
        title: { lang: "es", source: "manual" },
        author: { source: "manual" },
        cover: { lang: "other", source: "manual" },
        synopsis: { lang: "es", source: "manual" },
        pages: { source: "manual" },
      },
    }));
  }
});

test.afterAll(async ({}, info) => {
  const result = await cleanFixtures();
  const evidence = { marker, fixtures, ...result };
  await info.attach("cleanup", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
  await writeFile(info.outputPath("cleanup.json"), JSON.stringify(evidence, null, 2));
  if (process.env.QA1300_OUT) {
    await writeFile(join(process.env.QA1300_OUT, "cleanup-" + namespace + "-" + process.pid + ".json"), JSON.stringify(evidence, null, 2));
  }
  if (result.failures.length) throw new Error("#1300 cleanup failed: " + result.failures.join("; "));
});

for (const viewport of [
  { name: "mobile-320", width: 320, height: 844 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 900 },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    for (const fixture of fixtures) {
      test(fixture.label + ": complete title fits its column without clipping", async ({ page }, info) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/*", async (route) => {
          const request = route.request();
          if (request.resourceType() === "image" && request.url().includes(marker)) {
            await route.fulfill({
              status: 200,
              contentType: "image/svg+xml",
              body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="100%" height="100%" fill="#467c67"/></svg>',
            });
          } else if (new URL(request.url()).pathname === "/_vercel/speed-insights/script.js") {
            await route.fulfill({ status: 200, contentType: "application/javascript", body: ";" });
          } else await route.continue();
        });
        const response = await page.goto("/libro/" + fixture.id);
        expect(response?.status()).toBe(200);
        const heading = page.getByRole("heading", { level: 1, name: fixture.title, exact: true });
        await expect(heading).toBeVisible();
        await expect(heading).toHaveText(fixture.title);
        const column = heading.locator("..");
        await expect(column.locator("p").first()).toHaveText(fixture.author);
        const grid = column.locator("..");
        const cover = grid.getByRole("button", { name: "Ampliar imagen", exact: true });
        const follow = grid.getByRole("button", { name: "Seguir", exact: true });
        await expect(cover).toHaveCount(1);
        await expect(follow).toHaveCount(1);
        await expect(follow).toBeEnabled();
        await expect.poll(() => cover.locator("img").evaluate((node) => {
          const image = node as HTMLImageElement;
          return image.complete && image.naturalWidth > 0;
        })).toBe(true);
        await page.evaluate(async () => { await document.fonts.ready; });
        const geometry = await heading.evaluate((node) => {
          const title = node as HTMLElement;
          const column = title.parentElement;
          const grid = column?.parentElement;
          const byline = column?.querySelector("p");
          if (!column || !grid || !byline || getComputedStyle(grid).display !== "grid") {
            throw new Error("Missing actual hero title column, grid or byline");
          }
          const rect = (value: DOMRect) => ({
            left: value.left, right: value.right, top: value.top, bottom: value.bottom,
            width: value.width, height: value.height,
          });
          const text = (element: HTMLElement) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            const style = getComputedStyle(element);
            return {
              text: element.textContent,
              box: rect(element.getBoundingClientRect()),
              lines: [...range.getClientRects()].filter((line) => line.width > 0).map(rect),
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              fontSize: style.fontSize,
              overflowX: style.overflowX,
              textOverflow: style.textOverflow,
              lineClamp: style.getPropertyValue("-webkit-line-clamp"),
            };
          };
          return {
            heading: text(title),
            byline: text(byline),
            column: rect(column.getBoundingClientRect()),
            grid: rect(grid.getBoundingClientRect()),
            columnOverflowX: getComputedStyle(column).overflowX,
            document: {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              bodyScrollWidth: document.body.scrollWidth,
            },
          };
        });
        const coverBox = await cover.boundingBox();
        const followBox = await follow.boundingBox();
        await info.attach("detail-title-geometry", {
          body: JSON.stringify({ marker, fixture, viewport, geometry, coverBox, followBox, errors }, null, 2),
          contentType: "application/json",
        });
        await page.screenshot({ path: info.outputPath("detail-title.png"), fullPage: true });
        expect(geometry.heading.text).toBe(fixture.title);
        expect(geometry.byline.text).toBe(fixture.author);
        expect(geometry.heading.lines.length).toBeGreaterThan(0);
        // DOM width alone stays small even when the text paints outside it.
        // Range rectangles also reject hiding the overflow instead of wrapping it.
        for (const measured of [geometry.heading, geometry.byline]) {
          expect(measured.scrollWidth - measured.clientWidth).toBeLessThanOrEqual(1);
          expect(["hidden", "clip"]).not.toContain(measured.overflowX);
          expect(measured.textOverflow).not.toBe("ellipsis");
          expect(["", "none", "0"]).toContain(measured.lineClamp);
          for (const line of measured.lines) {
            expect(line.left).toBeGreaterThanOrEqual(geometry.column.left - 1);
            expect(line.right).toBeLessThanOrEqual(geometry.column.right + 1);
          }
        }
        expect(["hidden", "clip"]).not.toContain(geometry.columnOverflowX);
        expect(geometry.document.scrollWidth - geometry.document.clientWidth).toBeLessThanOrEqual(0);
        expect(geometry.document.bodyScrollWidth - geometry.document.clientWidth).toBeLessThanOrEqual(0);
        if (fixture.label === "normal") expect(geometry.heading.lines).toHaveLength(1);
        else if (viewport.width < 640 || fixture.label === "spaced-long") {
          expect(geometry.heading.lines.length).toBeGreaterThan(1);
        }
        expect(Number.parseFloat(geometry.heading.fontSize)).toBe(viewport.width >= 1024
          ? fixture.title.length > 40 ? 34 : 44
          : 25);
        expect(coverBox).not.toBeNull();
        expect(followBox).not.toBeNull();
        expect(coverBox!.width).toBe(viewport.width >= 1024 ? 200 : 110);
        for (const control of [coverBox!, followBox!]) {
          expect(control.x).toBeGreaterThanOrEqual(geometry.grid.left - 1);
          expect(control.x + control.width).toBeLessThanOrEqual(geometry.grid.right + 1);
          expect(control.x + control.width).toBeLessThanOrEqual(viewport.width);
        }
        expect(errors).toEqual([]);
      });
    }
  });
}
