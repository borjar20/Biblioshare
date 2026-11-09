import { test, expect, type Page } from "@playwright/test";
import { submitLogin } from "./support/visible-form";

const EMAIL = process.env.TEST_USER_EMAIL!;
const PASSWORD = process.env.TEST_USER_PASSWORD!;
const USERNAME = process.env.TEST_USER_USERNAME!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// E2E de la ficha como cartel propio de cada obra (spec 2026-11-09): las tres
// formas del cartel (a sangre, atmósfera, tipográfica) en móvil y escritorio, en
// claro y oscuro, el tono por obra, la columna fija, el contraste y que las
// hojas (<dialog>) de las pestañas NO hereden la letra de cartel. Se corre
// contra build de producción. Los helpers de REST están copiados de
// cierre-ritual.spec.ts (los specs no se importan entre sí).

test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(60_000);
});

function headers() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  return (await res.json()) as T;
}

async function patch(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} falló: ${res.status}`);
}

async function devtestId(): Promise<string> {
  const [row] = await rest<{ user_id: string }[]>(
    `profiles?username=eq.${encodeURIComponent(USERNAME)}&select=user_id`,
  );
  if (!row) throw new Error(`no se encontró el perfil de ${USERNAME}`);
  return row.user_id;
}

async function login(page: Page) {
  await page.goto("/login");
  await submitLogin(page, EMAIL, PASSWORD);
  await page.waitForURL("/");
}

// Un fixture ausente falla en voz alta: saltarse el test dejaría la forma sin proteger.
async function needId(what: string, table: string, query: string): Promise<string> {
  const rows = await rest<{ id: string }[]>(`${table}?select=id&${query}&limit=1`);
  const id = Array.isArray(rows) ? rows[0]?.id : undefined;
  expect(id, `falta el fixture «${what}» (${table}?${query}) en este entorno`).toBeTruthy();
  return id!;
}

const MOVIE_TMDB = "cover_url=like.*image.tmdb.org*";

const cases = [
  { name: "película con TMDB", table: "movies", query: MOVIE_TMDB, path: "/pelicula/", kind: "bleed" },
  { name: "libro con portada pequeña", table: "books", query: "cover_url=like.*openlibrary*", path: "/libro/", kind: "atmosphere" },
  { name: "libro sin portada", table: "books", query: "cover_url=is.null", path: "/libro/", kind: "type" },
] as const;

for (const c of cases) {
  for (const [label, viewport] of [
    ["móvil", { width: 412, height: 915 }],
    ["escritorio", { width: 1440, height: 900 }],
  ] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${c.name} · ${label} · ${scheme}`, async ({ page }) => {
        const id = await needId(c.name, c.table, c.query);
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto(`${c.path}${id}`);
        // Durante el streaming el esqueleto y la ficha pueden coexistir un instante:
        // al asentarse debe quedar UN solo cartel.
        await expect(page.locator(`[data-poster="${c.kind}"]`)).toHaveCount(1);
        await expect(page.locator(`[data-poster="${c.kind}"]`)).toBeVisible();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const hue = await page
          .getByTestId("work-scope")
          .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--work-hue"));
        expect(hue).not.toBe("");
        expect(Number(hue)).toBeGreaterThanOrEqual(0);
        expect(Number(hue)).toBeLessThan(360);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
}

test("el modo oscuro del sistema pinta el ámbito de la obra oscuro y el claro, claro", async ({ page }) => {
  const id = await needId("película con TMDB", "movies", MOVIE_TMDB);
  const background = async () =>
    page.getByTestId("work-scope").evaluate((el) => getComputedStyle(el).backgroundColor);
  // Luminosidad relativa aproximada del color computado, vía canvas (el valor
  // llega en oklch/rgb según el navegador, y el canvas lo lleva a sRGB).
  const luminance = (color: string) =>
    page.evaluate((value) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }, color);

  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`/pelicula/${id}`);
  await expect(page.getByTestId("work-scope")).toBeVisible();
  const light = await background();

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByTestId("work-scope")).toBeVisible();
  const dark = await background();

  expect(dark).not.toBe(light);
  expect(await luminance(light)).toBeGreaterThan(0.7);
  expect(await luminance(dark)).toBeLessThan(0.3);
});

// Los tonos extraídos son centros de tramo (7,5 + 15k) y el hash es entero: un
// entero aquí significa que la extracción no ha funcionado en build de producción.
// En frío, la primera petición puede caer al hash por el presupuesto de 800 ms
// (la extracción sigue y rellena la caché), por eso se recarga hasta verlo.
const coloured = [
  { name: "TMDB", table: "movies", query: "title=eq.Pearl&cover_url=like.*image.tmdb.org*", path: "/pelicula/" },
  {
    name: "OpenLibrary",
    table: "books",
    query: `title=eq.${encodeURIComponent("El imperio final")}&cover_url=like.*openlibrary*`,
    path: "/libro/",
  },
] as const;

for (const c of coloured) {
  test(`el tono sale de la portada real · ${c.name}`, async ({ page }) => {
    // 90 s: un fallo transitorio del origen deja «failed» un minuto en caché.
    test.setTimeout(120_000);
    const id = await needId(c.name, c.table, c.query);
    await expect
      .poll(
        async () => {
          await page.goto(`${c.path}${id}`);
          const hue = await page
            .getByTestId("work-scope")
            .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--work-hue"));
          return Number(hue);
        },
        {
          message: "el tono sigue siendo el hash del título: no se ha extraído de la portada",
          timeout: 90_000,
          intervals: [500, 1_000, 2_000],
        },
      )
      .toSatisfy((hue: number) => !Number.isInteger(hue) && (hue - 7.5) % 15 === 0);
  });
}

test("?tab= sigue abriendo la pestaña", async ({ page }) => {
  const id = await needId("película con TMDB", "movies", MOVIE_TMDB);
  await page.goto(`/pelicula/${id}?tab=community`);
  await expect(page.locator("#item-tabpanel-community")).toBeVisible();
});

test("en escritorio la columna de cartel se queda fija al hacer scroll", async ({ page }) => {
  const id = await needId("película con TMDB", "movies", MOVIE_TMDB);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/pelicula/${id}`);
  const poster = page.locator('[data-poster="bleed"]');
  await expect(poster).toBeVisible();
  await expect(page.getByRole("tablist")).toBeVisible();
  const before = await poster.boundingBox();
  // Sobre la columna de contenido: el cartel fijo no debe ser quien reciba la rueda.
  await page.mouse.move(900, 500);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.waitForTimeout(300);
  expect((await poster.boundingBox())!.y).toBeCloseTo(before!.y, 0);
});

// El repo no depende de axe (ver a11y-landmark-main.spec.ts), así que el
// contraste se calcula aquí: color del texto contra el fondo opaco efectivo
// (se mezclan las capas translúcidas hacia arriba), WCAG AA. Cubre lo que el
// tinte por obra puede romper: título, autor, pestañas y títulos de sección.
for (const c of cases) {
 for (const [label, viewport] of [
  ["móvil", { width: 412, height: 915 }],
  ["escritorio", { width: 1440, height: 900 }],
 ] as const) {
  for (const scheme of ["light", "dark"] as const) {
  test(`contraste AA · ${c.name} · ${label} · ${scheme}`, async ({ page }) => {
    const id = await needId(c.name, c.table, c.query);
    const desktop = viewport.width >= 1280;
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(`${c.path}${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Las pestañas llegan por streaming: se espera a que haya tabpanel con sus títulos.
    await expect(page.getByRole("tablist")).toBeVisible();
    await expect(page.locator('[role="tabpanel"] h2').first()).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });

    const results = await page.getByTestId("work-scope").evaluate((scope, desktop) => {
      const rgba = (value: string): [number, number, number, number] => {
        const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const backdrop = (el: Element): number[] => {
        const layers: [number, number, number, number][] = [];
        for (let node: Element | null = el; node; node = node.parentElement) {
          const bg = rgba(getComputedStyle(node).backgroundColor);
          if (bg[3] > 0) layers.push(bg);
          if (bg[3] === 1) break;
        }
        let out: number[] = [255, 255, 255];
        for (const [r, g, b, a] of layers.reverse()) {
          out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
        }
        return out;
      };
      const contrast = (el: Element) => {
        const fg = rgba(getComputedStyle(el).color);
        const bg = backdrop(el);
        const flat = [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
        const [hi, lo] = [lum(flat), lum(bg)].sort((a, b) => b - a);
        return (hi + 0.05) / (lo + 0.05);
      };
      const pick = (selector: string, min: number) =>
        [...scope.querySelectorAll(selector)]
          .filter((el) => (el as HTMLElement).offsetParent !== null && el.textContent?.trim())
          .map((el) => ({ selector, text: el.textContent!.trim().slice(0, 30), ratio: contrast(el), min }));
      // `backdrop` solo ve background-color: la cabecera de móvil se apoya en el degradado
      // del cartel (background-image), así que allí no se mide y la cubre el test de posición.
      return [
        ...(desktop ? [...pick("h1", 3), ...pick("h1 + p", 4.5)] : []),
        ...pick('[role="tab"]', 4.5),
        ...pick('[role="tabpanel"] h2', 3),
        ...pick('[role="tabpanel"] p', 4.5),
      ];
    }, desktop);

    expect(results.length).toBeGreaterThanOrEqual(4);
    for (const r of results) {
      expect(r.ratio, `${r.selector} «${r.text}» contra su fondo`).toBeGreaterThanOrEqual(r.min);
    }
  });
  }
 }

  // El título nunca va sobre la foto: en móvil la cabecera monta sobre el degradado del
  // cartel, casi opaco desde el 55 % de su alto. Es lo que sustituye al contraste medido.
  test(`el título no se monta sobre la foto · ${c.name} · móvil`, async ({ page }) => {
    const id = await needId(c.name, c.table, c.query);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto(`${c.path}${id}`);
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(page.locator(`[data-poster="${c.kind}"]`)).toHaveCount(1);
    const poster = await page.locator(`[data-poster="${c.kind}"]`).boundingBox();
    const title = await h1.boundingBox();
    expect(title!.y).toBeGreaterThanOrEqual(poster!.y + poster!.height * 0.55);
  });
}

// Las hojas de las pestañas son <dialog>: conservan su letra y su caja (el
// scope solo pone la letra de cartel a los h2 del tabpanel que no estén en un
// dialog). El cierre de película lo abre «Vista» sobre un pase real de devtest,
// fotografiado antes y restaurado en `finally` (patrón de cierre-ritual.spec.ts).
test("la hoja de cierre dentro de una pestaña no adopta la letra del cartel", async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, "TEST_USER_* no configurado");
  test.setTimeout(90_000);
  const userId = await devtestId();
  const [pass] = await rest<{ id: string; item_id: string }[]>(
    `passes?user_id=eq.${userId}&item_type=eq.movie&status=eq.completed&is_active=eq.true&select=id,item_id&limit=1`,
  );
  if (!pass) throw new Error("devtest no tiene ningún pase de película completado para reutilizar");
  const COLUMNS = "status,position,started_on,finished_on,rating,review,is_public";
  const [snapshot] = await rest<Record<string, unknown>[]>(`passes?id=eq.${pass.id}&select=${COLUMNS}`);
  if (!snapshot) throw new Error(`no se pudo fotografiar el pase ${pass.id}`);
  const postIds = async () => {
    const rows = await rest<{ id: string }[]>(
      `posts?author_id=eq.${userId}&anchor_id=eq.${pass.item_id}&select=id`,
    );
    return new Set(rows.map((r) => r.id));
  };
  const postsBefore = await postIds();

  try {
    await patch(`passes?id=eq.${pass.id}`, { status: "in_progress", finished_on: null, rating: null });

    await login(page);
    await page.goto(`/pelicula/${pass.item_id}?tab=log`);
    await page.getByRole("group", { name: "Tu estado" }).getByRole("button", { name: "Vista" }).click();

    const title = page.getByRole("dialog").getByRole("heading", { name: "¿Qué te ha parecido?" });
    await expect(title).toBeVisible({ timeout: 20_000 });
    const style = await title.evaluate((el) => {
      const s = getComputedStyle(el);
      return { fontFamily: s.fontFamily, textTransform: s.textTransform };
    });
    expect(style.fontFamily).not.toMatch(/anton/i);
    expect(style.textTransform).not.toBe("uppercase");

    await page.getByRole("button", { name: "Ahora no" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await patch(`passes?id=eq.${pass.id}`, snapshot);
    const newIds = [...(await postIds())].filter((id) => !postsBefore.has(id));
    if (newIds.length) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/posts?id=in.(${newIds.join(",")})`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) throw new Error(`DELETE posts falló: ${res.status}`);
    }
  }
});
