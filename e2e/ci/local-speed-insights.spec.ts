import { expect, test } from "@playwright/test";

test("#1306: el setup hidratado en loopback no solicita Speed Insights", async ({ page }, testInfo) => {
  const observed = {
    consoleErrors: [] as { message: string; location: { url: string; lineNumber: number; columnNumber: number } }[],
    pageErrors: [] as string[],
    httpErrors: [] as { status: number; url: string }[],
    requestFailures: [] as {
      url: string; method: string; resourceType: string; isNavigation: boolean;
      rsc: string | undefined; routerPrefetch: string | undefined;
      failure: { errorText: string } | null;
    }[],
    speedInsightsRequests: [] as string[],
  };
  page.on("console", message => {
    if (message.type() === "error") observed.consoleErrors.push({ message: message.text(), location: message.location() });
  });
  page.on("pageerror", error => observed.pageErrors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400) observed.httpErrors.push({ status: response.status(), url: response.url() });
  });
  page.on("requestfailed", request => {
    const headers = request.headers();
    observed.requestFailures.push({
      url: request.url(), method: request.method(), resourceType: request.resourceType(),
      isNavigation: request.isNavigationRequest(), rsc: headers.rsc,
      routerPrefetch: headers["next-router-prefetch"], failure: request.failure(),
    });
  });
  page.on("request", request => {
    if (request.url().includes("/speed-insights/")) observed.speedInsightsRequests.push(request.url());
  });

  try {
    await page.goto("/partidas/mtg/nueva?modo=commander&jugadores=6", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Empezar", exact: true })).toBeEnabled();
    // Un cambio visible confirma que el setup ya está hidratado.
    const twenty = page.getByRole("button", { name: "20", exact: true });
    const forty = page.getByRole("button", { name: "40", exact: true });
    await expect(forty).toHaveAttribute("aria-pressed", "true");
    await twenty.click();
    await expect(twenty).toHaveAttribute("aria-pressed", "true");
    await expect(forty).toHaveAttribute("aria-pressed", "false");
    await forty.click();
    await expect(forty).toHaveAttribute("aria-pressed", "true");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('script[data-sdkn="@vercel/speed-insights/next"]')).toHaveCount(0);
    const sdkGlobals = await page.evaluate(() => {
      const globals = window as Window & { si?: unknown; siq?: unknown };
      return { si: typeof globals.si, siq: typeof globals.siq };
    });
    expect(sdkGlobals).toEqual({ si: "undefined", siq: "undefined" });
    expect.soft(observed.speedInsightsRequests).toEqual([]);
    expect.soft(observed.consoleErrors).toEqual([]);
    expect.soft(observed.pageErrors).toEqual([]);
    expect.soft(observed.httpErrors).toEqual([]);
    // Conserva todos los fallos. Solo distingue la firma de un prefetch RSC
    // cancelado; navegación, POST, recursos SDK y fallos sin marcador fallan.
    const unclassified = observed.requestFailures.filter(request => {
      const url = new URL(request.url);
      return !(request.failure?.errorText === "net::ERR_ABORTED"
        && request.method === "GET" && request.resourceType === "fetch"
        && !request.isNavigation && request.rsc === "1"
        && /^[123]$/.test(request.routerPrefetch ?? "")
        && url.origin === new URL(page.url()).origin && url.searchParams.has("_rsc")
        && !url.pathname.includes("/speed-insights/"));
    });
    expect.soft(unclassified).toEqual([]);
  } finally {
    await testInfo.attach("all-console-network-observations", { body: JSON.stringify(observed, null, 2), contentType: "application/json" });
  }
});
