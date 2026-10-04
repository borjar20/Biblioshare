import { expect, test } from "@playwright/test";
import { visibleFormContaining } from "../support/visible-form";

const scenarios = [
  { name: "login", field: "email", inputType: "email", value: "visible@example.test", button: "Entrar" },
  { name: "search", field: "q", inputType: "search", value: "9780000001368", button: "Buscar" },
] as const;

function form(id: string, scenario: typeof scenarios[number]) {
  return `<form id="${id}">
    <input name="${scenario.field}" type="${scenario.inputType}">
    <input name="password" type="password">
    <button type="submit">${scenario.button}</button>
  </form>`;
}

test.describe("#1368 visible forms keep strict uniqueness", () => {
  for (const scenario of scenarios) {
    const selector = `input[name="${scenario.field}"]`;
    for (const hiddenPosition of ["before", "after"] as const) {
      test(`${scenario.name}: hidden segment ${hiddenPosition} does not receive fields or submit`, async ({ page }) => {
        const visible = form("active", scenario);
        const hidden = `<div hidden id="S:3">${form("streamed", scenario)}</div>`;
        await page.setContent(hiddenPosition === "before" ? hidden + visible : visible + hidden);
        await page.evaluate(() => {
          document.addEventListener("submit", event => {
            event.preventDefault();
            document.body.dataset.submitted = (event.target as HTMLFormElement).id;
          });
        });
        const active = visibleFormContaining(page, selector);
        await active.locator(`${selector}:visible`).fill(scenario.value);
        await active.locator('input[name="password"]:visible').fill("Synthetic-only-1368!");
        if (scenario.name === "search") await active.getByRole("button", { name: "Buscar", exact: true }).click();
        else await active.locator('button[type="submit"]:visible').click();
        await expect(page.locator(`#active ${selector}`)).toHaveValue(scenario.value);
        await expect(page.locator('#active input[name="password"]')).toHaveValue("Synthetic-only-1368!");
        await expect(page.locator(`#streamed ${selector}`)).toHaveValue("");
        await expect(page.locator('#streamed input[name="password"]')).toHaveValue("");
        await expect(page.locator("body")).toHaveAttribute("data-submitted", "active");
      });
    }

    test(`${scenario.name}: hidden controls inside the visible form stay untouched`, async ({ page }) => {
      await page.setContent(`<form id="active">
        <input id="current" name="${scenario.field}" type="${scenario.inputType}">
        <input id="current-password" name="password" type="password">
        <button type="submit">${scenario.button}</button>
        <div hidden><input id="hidden-control" name="${scenario.field}"><input id="hidden-password" name="password" type="password"><button type="submit">${scenario.button}</button></div>
      </form>`);
      await page.evaluate(() => document.addEventListener("submit", event => {
        event.preventDefault();
        document.body.dataset.submitted = (event.target as HTMLFormElement).id;
      }));
      const active = visibleFormContaining(page, selector);
      await active.locator(`${selector}:visible`).fill(scenario.value);
      await active.locator('input[name="password"]:visible').fill("Synthetic-only-1368!");
      if (scenario.name === "search") await active.getByRole("button", { name: "Buscar", exact: true }).click();
      else await active.locator('button[type="submit"]:visible').click();
      await expect(page.locator("#current")).toHaveValue(scenario.value);
      await expect(page.locator("#current-password")).toHaveValue("Synthetic-only-1368!");
      await expect(page.locator("#hidden-control")).toHaveValue("");
      await expect(page.locator("#hidden-password")).toHaveValue("");
      await expect(page.locator("body")).toHaveAttribute("data-submitted", "active");
    });

    test(`${scenario.name}: two visible forms fail before either field changes`, async ({ page }) => {
      await page.setContent(form("left", scenario) + form("right", scenario));
      const active = visibleFormContaining(page, selector);
      await expect(active.locator(`${selector}:visible`).fill(scenario.value)).rejects.toThrow(/strict mode violation/);
      await expect(page.locator(`#left ${selector}`)).toHaveValue("");
      await expect(page.locator(`#right ${selector}`)).toHaveValue("");
    });

    test(`${scenario.name}: two visible fields in one form also fail`, async ({ page }) => {
      await page.setContent(`<form><input id="left" name="${scenario.field}"><input id="right" name="${scenario.field}"></form>`);
      const active = visibleFormContaining(page, selector);
      await expect(active.locator(`${selector}:visible`).fill(scenario.value)).rejects.toThrow(/strict mode violation/);
      await expect(page.locator("#left")).toHaveValue("");
      await expect(page.locator("#right")).toHaveValue("");
    });
  }

  test("the locator follows the currently visible form after a segment swap", async ({ page }) => {
    await page.setContent(form("old", scenarios[0]) + `<div hidden id="replacement">${form("new", scenarios[0])}</div>`);
    const active = visibleFormContaining(page, 'input[name="email"]');
    await active.locator('input[name="email"]:visible').fill("old@example.test");
    await page.evaluate(() => {
      (document.getElementById("old") as HTMLFormElement).hidden = true;
      (document.getElementById("replacement") as HTMLDivElement).hidden = false;
    });
    await active.locator('input[name="email"]:visible').fill("new@example.test");
    await expect(page.locator('#old input[name="email"]')).toHaveValue("old@example.test");
    await expect(page.locator('#new input[name="email"]')).toHaveValue("new@example.test");
  });

  test("two visible password fields remain ambiguous", async ({ page }) => {
    await page.setContent('<form><input name="email"><input id="left" name="password" type="password"><input id="right" name="password" type="password"></form>');
    const active = visibleFormContaining(page, 'input[name="email"]');
    await expect(active.locator('input[name="password"]:visible').fill("Synthetic-only-1368!")).rejects.toThrow(/strict mode violation/);
    await expect(page.locator("#left")).toHaveValue("");
    await expect(page.locator("#right")).toHaveValue("");
  });

  for (const scenario of scenarios) test(`${scenario.name}: two visible submit buttons remain ambiguous`, async ({ page }) => {
    await page.setContent(`<form><input name="${scenario.field}"><button type="submit">${scenario.button}</button><button type="submit">${scenario.button}</button></form>`);
    await page.evaluate(() => document.addEventListener("submit", event => {
      event.preventDefault();
      document.body.dataset.submitted = "unexpected";
    }));
    const active = visibleFormContaining(page, `input[name="${scenario.field}"]`);
    const submit = scenario.name === "search" ? active.getByRole("button", { name: "Buscar", exact: true }) : active.locator('button[type="submit"]:visible');
    await expect(submit.click()).rejects.toThrow(/strict mode violation/);
    await expect(page.locator("body")).not.toHaveAttribute("data-submitted", "unexpected");
  });
});
