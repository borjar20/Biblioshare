import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/supabase/database.types";

type LocalAuth = {
  database: SupabaseClient<Database>;
  name: string;
  editId: string;
  login: (page: Page, destination: string) => Promise<void>;
};

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

const test = base.extend<{ localAuth: LocalAuth }>({
  localAuth: async ({}, provide, info) => {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321") {
      throw new Error("#1025 requires disposable local Supabase");
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing local service key");
    const database = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const marker = `qa1025_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const name = `${marker} saga`;
    const credentials = { email: `${marker}@example.test`, password: `Qa1025!${randomUUID()}` };
    let actorId: string | undefined;
    const cleanup = { sagas: -1, profiles: -1, auth404: false };
    try {
      const actor = await database.auth.admin.createUser({ ...credentials, email_confirm: true });
      if (actor.error) throw actor.error;
      if (!actor.data.user) throw new Error("Missing disposable actor");
      actorId = actor.data.user.id;
      check(await database.from("profiles").upsert({
        user_id: actorId, username: marker, role: "collaborator", onboarded_at: new Date().toISOString(),
      }));
      await provide({
        database, name, editId: randomUUID(),
        login: async (page, destination) => {
          await page.goto(`/login?next=${encodeURIComponent(destination)}`);
          await page.locator('input[name="email"]').fill(credentials.email);
          await page.locator('input[name="password"]').fill(credentials.password);
          await page.locator('button[type="submit"]').click();
          await page.waitForURL(url => url.pathname === destination);
        },
      });
    } finally {
      const failures: unknown[] = [];
      try {
        // The fresh exact name also owns a saga created by the real form before
        // its generated ID was read; setup/submit failures still get cleaned.
        check(await database.from("sagas").delete().eq("name", name).eq("source", "manual"));
        const remaining = check(await database.from("sagas").select("id").eq("name", name));
        if (!remaining) throw new Error("Missing saga cleanup result");
        cleanup.sagas = remaining.length;
        expect(remaining).toEqual([]);
      } catch (error) { failures.push(error); }
      if (actorId) {
        try {
          const deleted = await database.auth.admin.deleteUser(actorId);
          if (deleted.error) throw deleted.error;
          cleanup.auth404 = (await database.auth.admin.getUserById(actorId)).error?.status === 404;
          expect(cleanup.auth404).toBe(true);
          const remaining = check(await database.from("profiles").select("user_id").eq("user_id", actorId));
          if (!remaining) throw new Error("Missing profile cleanup result");
          cleanup.profiles = remaining.length;
          expect(remaining).toEqual([]);
        } catch (error) { failures.push(error); }
      }
      await info.attach("cleanup", { body: JSON.stringify({ marker, actorId, cleanup }, null, 2), contentType: "application/json" });
      if (failures.length) throw new AggregateError(failures, "#1025 fixture cleanup failed");
    }
  },
});

// Login credentials and cookies do not belong in persisted browser traces.
// Focus samples, screenshots, cleanup, and Playwright assertions remain evidence.
test.use({ trace: "off" });

const values = ["", "terracota", "verde", "teal", "ambar", "purpura"];
function option(form: Locator, value: string) {
  return form.locator(`input[type="radio"][name="accent"][value="${value}"]`);
}
async function visibleNativeFocus(radio: Locator, value: string) {
  await expect(radio).toBeFocused();
  await expect(radio).toBeChecked();
  const sample = await radio.evaluate(node => {
    const input = node as HTMLInputElement;
    const label = input.closest("label");
    if (!label || !input.form) throw new Error("Accent radio must have a visible label and a form");
    const style = getComputedStyle(label);
    const bounds = label.getBoundingClientRect();
    const siblings = Array.from(input.form.querySelectorAll<HTMLInputElement>('input[type="radio"][name="accent"]'));
    return {
      value: input.value, focusVisible: input.matches(":focus-visible"),
      outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset), outlineColor: style.outlineColor,
      width: bounds.width, height: bounds.height,
      left: bounds.left, right: bounds.right, viewportWidth: document.documentElement.clientWidth,
      selected: new FormData(input.form).get(input.name), checked: siblings.filter(sibling => sibling.checked).length,
      otherOutlined: siblings.filter(sibling => sibling !== input).filter(sibling => {
        const other = getComputedStyle(sibling.closest("label")!);
        return other.outlineStyle !== "none" && Number.parseFloat(other.outlineWidth) > 0;
      }).map(sibling => sibling.value),
    };
  });
  expect(sample.focusVisible).toBe(true);
  expect(sample.outlineStyle).toBe("solid");
  expect(sample.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(sample.outlineOffset).toBeGreaterThanOrEqual(2);
  expect(sample.outlineColor).not.toMatch(/^(?:transparent|rgba\(0, 0, 0, 0\))$/);
  expect(sample.width).toBeGreaterThan(20);
  expect(sample.height).toBeGreaterThan(20);
  expect(sample.left - sample.outlineWidth - sample.outlineOffset).toBeGreaterThanOrEqual(0);
  expect(sample.right + sample.outlineWidth + sample.outlineOffset).toBeLessThanOrEqual(sample.viewportWidth);
  expect(sample.selected).toBe(value);
  expect(sample.checked).toBe(1);
  expect(sample.otherOutlined).toEqual([]);
  return sample;
}

for (const viewport of [{ name: "mobile", width: 320, height: 844 }, { name: "desktop", width: 1280, height: 900 }]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    for (const flow of ["create", "edit"] as const) {
      test(`${flow}: Tab, arrows, visible focus and saved native selection`, async ({ page, localAuth }, info) => {
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        if (flow === "edit") {
          check(await localAuth.database.from("sagas").insert({
            id: localAuth.editId, name: localAuth.name, source: "manual", accent_color: "verde",
          }));
        }
        await localAuth.login(page, flow === "create" ? "/sagas/nueva" : `/saga/${localAuth.editId}/editar`);
        const form = page.locator("form").filter({ has: page.locator('input[name="accent"]') });
        await expect(form.getByRole("radio")).toHaveCount(values.length);
        if (flow === "create") await form.locator('input[name="name"]').fill(localAuth.name);
        const before = form.locator(flow === "create" ? 'input[name="name"]' : 'textarea[name="overview"]');
        await before.focus();
        await expect(before).toBeFocused();
        const initial = flow === "create" ? "" : "verde";
        const start = values.indexOf(initial);
        await page.keyboard.press("Tab");
        const samples = [await visibleNativeFocus(option(form, initial), initial)];
        // Traverse every native option and wrap, including automatic in edit.
        for (let step = 1; step <= values.length; step++) {
          await page.keyboard.press("ArrowRight");
          const value = values[(start + step) % values.length];
          samples.push(await visibleNativeFocus(option(form, value), value));
        }
        const selected = flow === "create" ? "purpura" : "";
        for (let step = 0; step < (flow === "create" ? 1 : 2); step++) await page.keyboard.press("ArrowLeft");
        samples.push(await visibleNativeFocus(option(form, selected), selected));
        const exit = flow === "create" ? form.locator('button[type="submit"]') : form.locator('input[name="show_map"]');
        await page.keyboard.press("Tab");
        await expect(exit).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        samples.push(await visibleNativeFocus(option(form, selected), selected));
        await info.attach("focus-samples", { body: JSON.stringify({ flow, viewport, samples }, null, 2), contentType: "application/json" });
        await page.screenshot({ path: info.outputPath("accent-focus.png") });
        // The document-wide overflow is tracked separately by #1311. This gate
        // checks every focused control and its outline, then completes saving.
        await info.attach("document-geometry", {
          body: JSON.stringify(await page.evaluate(() => {
            const width = document.documentElement.clientWidth;
            return {
              width, documentWidth: document.documentElement.scrollWidth,
              overflowing: Array.from(document.body.querySelectorAll("*")).flatMap(element => {
                const box = element.getBoundingClientRect();
                if (box.width <= 1 || box.right <= width + 0.5) return [];
                return [{ tag: element.tagName, id: element.id, className: element.getAttribute("class"),
                  left: box.left, right: box.right, width: box.width }];
              }).slice(0, 25),
            };
          }), null, 2), contentType: "application/json",
        });

        await page.keyboard.press("Tab");
        if (flow === "edit") await page.keyboard.press("Tab");
        await expect(form.locator('button[type="submit"]')).toBeFocused();
        await page.keyboard.press("Enter");
        await expect.poll(async () => {
          const rows = check(await localAuth.database.from("sagas").select("accent_color").eq("name", localAuth.name));
          return rows?.[0]?.accent_color;
        }).toBe(selected || null);
        const saved = check(await localAuth.database.from("sagas").select("id").eq("name", localAuth.name).single());
        if (!saved) throw new Error("Missing saved saga");
        if (flow === "create") await expect(page).toHaveURL(`/saga/${saved.id}`);
        await page.goto(`/saga/${saved.id}/editar`);
        await expect(option(page.locator("form").filter({ has: page.locator('input[name="accent"]') }), selected)).toBeChecked();
        expect(errors).toEqual([]);
      });
    }
  });
}
