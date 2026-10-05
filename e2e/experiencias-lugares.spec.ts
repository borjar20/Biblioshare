import { test, expect } from "@playwright/test";
import { clearExperienceFixtures, EXPERIENCE_QA_PREFIX, experienceActor, deleteExperienceActor, experienceRest, loginExperienceUser } from "./support/experience-fixtures";
import { signPlace } from "../src/lib/places/token";

const prado = { provider: "osm" as const, providerRef: "W28118138", name: "Museo Nacional del Prado", category: "tourism:museum", layer: "poi" as const, lat: 40.4138, lng: -3.6921, city: "Madrid", region: "Comunidad de Madrid", country: "España", countryCode: "ES", wikidataQid: "Q160112" };

test("choosing a suggested place links the moment and shows the official name", async ({ page }) => {
  const secret = process.env.PLACES_SIGNING_SECRET;
  test.skip(!secret, "PLACES_SIGNING_SECRET missing in .env.local");
  const actor = await experienceActor("Lugares");
  try {
    await clearExperienceFixtures(actor.id);
    await loginExperienceUser(page, actor);
    await page.route("**/api/places/search?*", (route) => route.fulfill({ json: { items: [{ token: signPlace(prado, secret!), name: prado.name, layer: "poi", subtitle: "Madrid, España" }] } }));
    await page.goto("/experiencias/nueva?kind=museum");
    await page.getByRole("textbox", { name: "Nombre *", exact: true }).fill(`${EXPERIENCE_QA_PREFIX}Mañana en el Prado`);
    await page.getByText("Añadir fecha o lugar").click();
    await page.getByRole("combobox", { name: "Lugar" }).fill("prado");
    await page.getByRole("option", { name: /Museo Nacional del Prado/ }).click();
    await expect(page.getByRole("button", { name: "Quitar Museo Nacional del Prado" })).toBeVisible();
    await page.getByRole("button", { name: "Guardar experiencia" }).click();
    await expect(page).toHaveURL(/\/experiencia\/[0-9a-f-]+$/);
    const id = page.url().split("/").at(-1)!;
    const [moment] = await (await experienceRest(`experience_moments?experience_id=eq.${id}&select=place_id,place_label`)).json() as { place_id: string | null; place_label: string }[];
    expect(moment.place_label).toBe(prado.name);
    expect(moment.place_id).not.toBeNull();
    const [place] = await (await experienceRest(`places?id=eq.${moment.place_id}&select=provider_ref,wikidata_qid`)).json();
    expect(place).toEqual({ provider_ref: "W28118138", wikidata_qid: "Q160112" });
    await expect(page.getByText(prado.name).first()).toBeVisible();
  } finally {
    await clearExperienceFixtures(actor.id);
    await deleteExperienceActor(actor);
  }
});
