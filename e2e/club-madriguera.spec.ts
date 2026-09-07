import { expect, test } from "@playwright/test";
import { addClubPet, burrowClub, cleanupClubBurrow, clubApi, clubUser, clubWrite } from "./support/club-burrow-fixtures";

test.describe("S3 madriguera del club", () => {
  test("lectura autorizada: miembro público sin seguir y privado solo con aceptación", async () => {
    test.setTimeout(120_000);
    try {
      await cleanupClubBurrow();
      const owner = await clubUser(0);
      const member = await clubUser(1);
      const privateMember = await clubUser(2, false);
      const club = await burrowClub(owner);
      await addClubPet(club.id, member, "active", "acorn");
      await addClubPet(club.id, privateMember);
      const read = () => clubApi("rest/v1/rpc/get_club_burrow_pets", "POST", { p_club_id: club.id }, owner.token);
      const response = await read();
      expect(response.ok, `RPC S3: ${response.status}`).toBe(true);
      const rows = await response.json();
      expect(rows.map((r: { user_id: string }) => r.user_id)).toEqual([member.id]);
      expect(rows[0]).toMatchObject({ total: 1, pet_stage: "acorn", pet_level: 7 });
      await clubWrite("rest/v1/follows", "POST", { follower_id: owner.id, followee_id: privateMember.id, status: "accepted" });
      expect((await (await read()).json()).map((r: { user_id: string }) => r.user_id).sort()).toEqual([member.id, privateMember.id].sort());
    } finally { await cleanupClubBurrow(); }
  });
  for (const visibility of ["public", "private"] as const) {
  test(`permisos en club ${visibility}: roles, pendientes, bloqueos y salida`, async () => {
    test.setTimeout(180_000);
    try {
      await cleanupClubBurrow();
      const owner = await clubUser(0);
      const member = await clubUser(1);
      const outsider = await clubUser(2);
      const invited = await clubUser(3);
      const requested = await clubUser(4);
      const club = await burrowClub(owner, visibility);
      await addClubPet(club.id, member);
      await addClubPet(club.id, invited, "invited");
      await addClubPet(club.id, requested, "requested");
      const read = (token = owner.token, id = club.id) => clubApi("rest/v1/rpc/get_club_burrow_pets", "POST", { p_club_id: id }, token);
      expect((await (await read()).json()).map((r: { user_id: string }) => r.user_id)).toEqual([member.id]);
      for (const user of [outsider, invited, requested]) expect((await read(user.token)).status).toBe(403);
      expect((await read(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)).ok).toBe(false);
      expect((await read(owner.token, crypto.randomUUID())).status).toBe(403);
      await clubWrite(`rest/v1/club_members?club_id=eq.${club.id}&user_id=eq.${invited.id}`, "PATCH", { status: "active" });
      expect((await read(invited.token)).ok).toBe(true);
      expect((await (await read()).json()).map((r: { user_id: string }) => r.user_id).sort()).toEqual([member.id, invited.id].sort());
      await clubWrite(`rest/v1/club_members?club_id=eq.${club.id}&user_id=eq.${invited.id}`, "PATCH", { status: "invited" });
      await clubWrite(`rest/v1/profiles?user_id=eq.${member.id}`, "PATCH", { is_public: false });
      expect(await (await read()).json()).toEqual([]);
      await clubWrite(`rest/v1/profiles?user_id=eq.${member.id}`, "PATCH", { is_public: true });
      expect((await (await read()).json()).map((r: { user_id: string }) => r.user_id)).toEqual([member.id]);
      await clubWrite(`rest/v1/club_members?club_id=eq.${club.id}&user_id=eq.${member.id}`, "PATCH", { role: "moderator" });
      expect((await read(member.token)).ok).toBe(true);
      await clubWrite("rest/v1/user_blocks", "POST", { blocker_id: owner.id, blocked_id: member.id });
      expect(await (await read()).json()).toEqual([]);
      await clubWrite(`rest/v1/user_blocks?blocker_id=eq.${owner.id}&blocked_id=eq.${member.id}`, "DELETE");
      await clubWrite("rest/v1/user_blocks", "POST", { blocker_id: member.id, blocked_id: owner.id });
      expect(await (await read()).json()).toEqual([]);
      await clubWrite(`rest/v1/user_blocks?blocker_id=eq.${member.id}&blocked_id=eq.${owner.id}`, "DELETE");
      expect((await (await read()).json())).toHaveLength(1);
      await clubWrite(`rest/v1/club_members?club_id=eq.${club.id}&user_id=eq.${member.id}`, "DELETE");
      expect((await read(member.token)).status).toBe(403);
      expect(await (await read()).json()).toEqual([]);
      const raw = await clubApi(`rest/v1/pet_state?user_id=eq.${member.id}`, "GET", undefined, owner.token);
      expect(await raw.json()).toEqual([]);
    } finally { await cleanupClubBurrow(); }
  });
  }

  test("feed: sin mascota, tarjetas y salida propia en móvil", async ({ page }) => {
    test.setTimeout(180_000);
    try {
      await cleanupClubBurrow();
      const owner = await clubUser(0);
      const viewer = await clubUser(1);
      const club = await burrowClub(owner);
      await clubWrite("rest/v1/pet_state", "POST", { user_id: owner.id, name: "Nuez del club", class: "wizard", last_stage: "acorn", last_level: 7 });
      await clubWrite("rest/v1/club_members", "POST", { club_id: club.id, user_id: viewer.id, role: "member", status: "active" });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/login");
      await page.fill('input[name="email"]', viewer.email);
      await page.fill('input[name="password"]', viewer.password);
      await page.click('button[type="submit"]');
      await page.waitForURL("/");
      await page.goto(`/club/${club.slug}`);
      const scene = page.getByRole("region", { name: "Madriguera · Club S3 de prueba", exact: true });
      await expect(scene).toBeVisible();
      await expect(scene.getByRole("listitem")).toHaveCount(1);
      await expect(scene.locator('[role="img"]').first()).toHaveCSS("animation-name", "none");
      await expect(scene.getByText("La tuya")).toHaveCount(0);
      const sprite = scene.getByRole("button", { name: /Nuez del club/ });
      await sprite.focus();
      await page.keyboard.press("Enter");
      await expect(scene.getByRole("link", { name: new RegExp(owner.username) })).toHaveAttribute("href", `/u/${owner.username}`);
      await expect(scene.getByRole("region", { name: "Detalle de la mascota" })).toContainText("Nivel 7");
      await page.screenshot({ path: "test-results/s3-mobile.png", fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(scene).toBeVisible();
      await page.screenshot({ path: "test-results/s3-desktop.png", fullPage: true });
      await page.goto(`/club/${club.slug}?tab=actividades`);
      await expect(scene).toHaveCount(0);
      await page.goto(`/club/${club.slug}`);
      await expect(scene).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Acciones del club" }).click();
      const [leaveResponse] = await Promise.all([
        page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes(`/club/${club.slug}`)),
        page.getByRole("menuitem", { name: /Salir/ }).click(),
      ]);
      expect(leaveResponse.ok()).toBe(true);
      await expect(page.getByRole("button", { name: "Unirse", exact: true })).toBeVisible();
      await expect(scene).toHaveCount(0);
      const response = await clubApi("rest/v1/rpc/get_club_burrow_pets", "POST", { p_club_id: club.id }, viewer.token);
      expect(response.status).toBe(403);
    } finally { await cleanupClubBurrow(); }
  });
  test("club grande: total autorizado, propia, expansión y contracción", async ({ page }) => {
    test.setTimeout(300_000);
    try {
      await cleanupClubBurrow();
      const owner = await clubUser(0);
      const club = await burrowClub(owner);
      await clubWrite("rest/v1/pet_state", "POST", { user_id: owner.id, name: "Mi bellota S3", class: "wizard", last_stage: "acorn", last_level: 1 });
      // Sixty-five public neighbors plus a hidden profile: the cap cannot hide a wrong total.
      for (let offset = 1; offset <= 66; offset += 4) {
        const batch = await Promise.allSettled(Array.from({ length: Math.min(4, 67 - offset) }, async (_, j) => {
          const n = offset + j;
          const user = await clubUser(n, n !== 66, false);
          await addClubPet(club.id, user);
        }));
        for (const result of batch) if (result.status === "rejected") throw result.reason;
      }
      const read = async () => {
        const response = await clubApi("rest/v1/rpc/get_club_burrow_pets", "POST", { p_club_id: club.id }, owner.token);
        expect(response.ok).toBe(true);
        return response.json() as Promise<{ user_id: string; total: number }[]>;
      };
      const rows = await read();
      expect(rows).toHaveLength(61);
      expect(rows[0].user_id).toBe(owner.id);
      expect(new Set(rows.map((r) => r.total))).toEqual(new Set([65]));
      expect((await read()).map((r) => r.user_id)).toEqual(rows.map((r) => r.user_id));
      await page.goto("/login");
      await page.fill('input[name="email"]', owner.email);
      await page.fill('input[name="password"]', owner.password);
      await page.click('button[type="submit"]');
      await page.waitForURL("/");
      await page.goto(`/club/${club.slug}`);
      const scene = page.getByRole("region", { name: "Madriguera · Club S3 de prueba", exact: true });
      await expect(scene.getByRole("listitem")).toHaveCount(12);
      const original = await scene.getByRole("listitem").getByRole("button").evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
      await scene.getByRole("button", { name: "Mostrar más" }).focus();
      await page.keyboard.press("Enter");
      await expect(scene.getByRole("listitem")).toHaveCount(61);
      await expect(scene.getByText("Mostrando 60 de 65 mascotas visibles del club, sin contar la tuya")).toBeVisible();
      await expect(scene.getByRole("button", { name: "Mostrar menos" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(scene.getByRole("listitem")).toHaveCount(12);
      expect(await scene.getByRole("listitem").getByRole("button").evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")))).toEqual(original);
      await clubWrite(`rest/v1/pet_state?user_id=eq.${owner.id}`, "DELETE");
      expect(await read()).toHaveLength(60);
      await page.reload();
      await expect(scene.getByRole("listitem")).toHaveCount(12);
      await scene.getByRole("button", { name: "Mostrar más" }).click();
      await expect(scene.getByRole("listitem")).toHaveCount(60);
    } finally { await cleanupClubBurrow(); }
  });
});
