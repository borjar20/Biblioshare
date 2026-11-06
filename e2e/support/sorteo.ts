import { expect, type Locator, type Page } from "@playwright/test";

/** Juega una partida de «Sacar un lomo» con reduced motion hasta el CTA.
 *  Sirve para 1, 2 o 3+ elegibles: 1 va directo a la revelación, 2 al duelo y
 *  3+ pasa antes por el descarte. */
export async function playToReveal(page: Page): Promise<{ stage: Locator; cta: Locator }> {
  const stage = page.getByRole("dialog", { name: "Sacar un lomo" });
  await stage.getByRole("button", { name: "¡Tirar!" }).click();
  const cta = stage.getByRole("button", { name: /empezar a leer|ver esta noche|empezar la t1/i });
  const discard = stage.getByRole("button", { name: /^Devolver .* a la balda$/ });
  const luck = stage.getByRole("button", { name: /que decida la suerte/i });

  // Descarte (3+): se devuelve el primero y se sigue al duelo.
  await expect(cta.or(discard.first()).or(luck)).toBeVisible({ timeout: 15_000 });
  if (await discard.first().isVisible()) {
    await discard.first().click();
  }
  // Duelo (2+): si aparece, la suerte decide; si ya estamos en la revelación, seguimos.
  await expect(cta.or(luck)).toBeVisible({ timeout: 15_000 });
  if (await luck.isVisible()) {
    await luck.click();
  }
  await expect(cta).toBeVisible({ timeout: 15_000 });
  return { stage, cta };
}
