import type { Locator, Page } from "@playwright/test";

// Streaming can retain another form in a hidden segment. Keep every visible
// candidate so that Playwright still rejects an ambiguous, visible interface.
export function visibleFormContaining(page: Page, controlSelector: string): Locator {
  return page.locator("form").filter({
    visible: true,
    has: page.locator(controlSelector).filter({ visible: true }),
  });
}
