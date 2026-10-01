import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const namespace = String(Date.now());
const marker = `qa1208-${namespace}`;
const api = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (api !== "http://127.0.0.1:54321") throw new Error("#1208 requires disposable local Supabase");
const database = createClient(api, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tmdbCover = `https://image.tmdb.org/t/p/w342/${marker}-cover.jpg`;
const backdrop = `https://image.tmdb.org/t/p/w1280/${marker}-backdrop.jpg`;
const googleCover = `https://books.google.com/books/content?id=${marker}&img=1`;
const openLibraryCover = `https://covers.openlibrary.org/b/id/${namespace}-L.jpg`;
function tmdbImageIdentity(url: string) {
  const parsed = new URL(url);
  return {
    origin: parsed.origin,
    path: parsed.pathname.replace(/\/t\/p\/(?:w\d+|original)\//, "/t/p/"),
  };
}
const fixtures = [
  { id: randomUUID(), table: "movies", route: "pelicula", label: "movie", cover: tmdbCover, backdrop },
  { id: randomUUID(), table: "series", route: "serie", label: "series", cover: tmdbCover, backdrop },
  { id: randomUUID(), table: "books", route: "libro", label: "google", cover: googleCover, backdrop: null },
  { id: randomUUID(), table: "books", route: "libro", label: "openlibrary", cover: openLibraryCover, backdrop: null },
  { id: randomUUID(), table: "books", route: "libro", label: "tmdb-cover", cover: tmdbCover, backdrop: null },
];
const owned: typeof fixtures = [];
const cleanup: Array<{ table: string; count: number }> = [];
function check<T>({ data, error }: { data: T; error: { message: string } | null }) {
  if (error) throw new Error(error.message);
  return data;
}

test.beforeAll(async () => {
  for (const fixture of fixtures) {
    const row = {
      id: fixture.id, title: `${marker} ${fixture.label}`, cover_url: fixture.cover,
      hydrated_at: new Date().toISOString(),
    };
    if (fixture.table === "books") check(await database.from(fixture.table).insert({ ...row, author: "QA1208" }));
    else check(await database.from(fixture.table).insert({ ...row, backdrop_url: fixture.backdrop, tmdb_id: null }));
    owned.push(fixture);
  }
});
test.afterAll(async ({}, info) => {
  try {
    for (const fixture of owned) {
      const rows = check(await database.from(fixture.table).select("title").eq("id", fixture.id));
      expect(rows).toEqual([{ title: `${marker} ${fixture.label}` }]);
      check(await database.from(fixture.table).delete().eq("id", fixture.id));
      const remaining = check(await database.from(fixture.table).select("id").eq("id", fixture.id));
      if (!remaining) throw new Error("Cleanup did not return rows");
      cleanup.push({ table: fixture.table, count: remaining.length });
      expect(remaining).toHaveLength(0);
    }
  } finally {
    const evidence = { namespace, created: owned.map(({ id, table }) => ({ id, table })), cleanup };
    await writeFile(info.outputPath("cleanup.json"), JSON.stringify(evidence, null, 2));
    if (process.env.QA1208_OUT) await writeFile(`${process.env.QA1208_OUT}/cleanup.json`, JSON.stringify(evidence, null, 2));
  }
});

for (const viewport of [
  { name: "mobile-1x", width: 375, height: 812, dpr: 1 },
  { name: "mobile-2x", width: 375, height: 812, dpr: 2 },
  { name: "mobile-3x", width: 375, height: 812, dpr: 3 },
  { name: "sm-1x", width: 640, height: 900, dpr: 1 },
  { name: "lg-1x", width: 1024, height: 900, dpr: 1 },
  { name: "desktop-1x", width: 1600, height: 1000, dpr: 1 },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr });
    for (const fixture of fixtures) {
      test(`${fixture.label}: selected hero resources, one high priority and shared cover resource`, async ({ page }, info) => {
        const requests: string[] = [], errors: string[] = [];
        const ours = (url: string) => url.includes(marker) || url.includes(`/id/${namespace}-`);
        // Only owned synthetic images are served here. Bytes/LCP of the public CDN are not measured.
        await page.route("**/*", async route => {
          const url = route.request().url();
          if (ours(url) && route.request().resourceType() === "image") {
            requests.push(url);
            const width = Number(/\/w(\d+)\//.exec(url)?.[1] ?? 400);
            await route.fulfill({ status: 200, contentType: "image/svg+xml", body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Math.round(width * (url.includes("backdrop") ? 9 / 16 : 3 / 2))}"><rect width="100%" height="100%" fill="#467c67"/></svg>` });
          } else if (new URL(url).pathname === "/_vercel/speed-insights/script.js") {
            await route.fulfill({ status: 200, contentType: "application/javascript", body: ";" });
          } else await route.continue();
        });
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`/${fixture.route}/${fixture.id}`);
        await expect(page.getByRole("heading", { level: 1, name: `${marker} ${fixture.label}`, exact: true })).toBeVisible();
        // Only the two visible hero images belong to this resource check.
        // ImageZoom mounts its original on demand (#1278).
        const images = page.locator(`img[src*="${marker}"], img[src*="/id/${namespace}-"]`).filter({ visible: true });
        await expect(images).toHaveCount(2);
        await expect.poll(() => images.evaluateAll(nodes => nodes.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
        const resources = await images.evaluateAll(nodes => nodes.map(node => {
          const image = node as HTMLImageElement;
          return { currentSrc: image.currentSrc, priority: image.fetchPriority, alt: image.alt, width: image.getBoundingClientRect().width, coverWidth: image.closest("button")?.getBoundingClientRect().width, sizes: image.sizes };
        }));
        const front = resources.find(image => image.alt !== "")!;
        const background = resources.find(image => image.alt === "")!;
        // page.route() disables HTTP cache (Playwright API). A duplicate request for the
        // same selected URL is transport detail; a second selected size is not.
        const expectedUrls = fixture.backdrop ? [front.currentSrc, background.currentSrc] : [front.currentSrc];
        const requestedUrls = [...new Set(requests)].sort();
        await info.attach("image-resources", { body: JSON.stringify({ viewport, fixture: fixture.label, resources, requests, requestedUrls, expectedUrls }), contentType: "application/json" });
        expect(resources.filter(image => image.priority === "high")).toHaveLength(1);
        expect(front.coverWidth).toBe(viewport.width >= 1024 ? 200 : viewport.width >= 640 ? 140 : 110);
        expect(requestedUrls).toEqual([...new Set(expectedUrls)].sort());
        if (fixture.backdrop) {
          expect(tmdbImageIdentity(front.currentSrc)).toEqual(tmdbImageIdentity(fixture.cover));
          expect(tmdbImageIdentity(background.currentSrc)).toEqual(tmdbImageIdentity(fixture.backdrop));
          expect(front.currentSrc).not.toBe(background.currentSrc);
          expect(background.priority).toBe("high");
          expect(front.priority).toBe("auto");
          const bucket = viewport.width <= 640 && viewport.dpr < 3 ? 780 : 1280;
          expect(new URL(background.currentSrc).pathname).toContain(`/w${bucket}/`);
        } else {
          expect(front.priority).toBe("high");
          expect(background.currentSrc).toBe(front.currentSrc);
          expect(background.sizes).toBe(front.sizes);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
        if (viewport.name === "mobile-1x" && ["movie", "google"].includes(fixture.label)) await page.screenshot({ path: info.outputPath("hero.png") });
      });
    }
  });
}
