import type { Locator, Page } from "@playwright/test";

// Streaming can retain another form in a hidden segment. Keep every visible
// candidate so that Playwright still rejects an ambiguous, visible interface.
export function visibleFormContaining(page: Page, controlSelector: string): Locator {
  return page.locator("form").filter({
    visible: true,
    has: page.locator(controlSelector).filter({ visible: true }),
  });
}

/** Logs in through the visible login form; a hidden streamed copy is never ambiguous (#1494). */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  const form = visibleFormContaining(page, 'input[name="email"]');
  await form.locator('input[name="email"]:visible').fill(email);
  await form.locator('input[name="password"]:visible').fill(password);
  await form.locator('button[type="submit"]:visible').click();
}
