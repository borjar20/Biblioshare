// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { PathnameContext, PathParamsContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalAwareSpeedInsights } from "./local-aware-speed-insights";

const environment = globalThis as typeof globalThis & { jsdom: { reconfigure: (options: { url: string }) => void } };
const initialURL = "https://biblioshare.vercel.app/partidas/mtg/nueva";
const scriptSelector = 'script[data-sdkn="@vercel/speed-insights/next"]';

function inRoute(pathname = "/partidas/mtg/nueva") {
  return <PathParamsContext.Provider value={{}}>
    <PathnameContext.Provider value={pathname}>
      <SearchParamsContext.Provider value={new URLSearchParams()}>
        <LocalAwareSpeedInsights />
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  </PathParamsContext.Provider>;
}

beforeEach(() => {
  environment.jsdom.reconfigure({ url: initialURL });
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG", undefined);
  vi.stubEnv("NEXT_PUBLIC_VERCEL_OBSERVABILITY_BASEPATH", undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.head.querySelectorAll(scriptSelector).forEach(script => script.remove());
  delete window.si;
  delete window.siq;
  vi.unstubAllEnvs();
});

it.each([
  "http://localhost:3000/",
  "http://localhost.:3000/",
  "http://app.localhost:3000/",
  "http://app.localhost.:3000/",
  "http://127.0.0.1:3000/",
  "http://127.255.42.99:3000/",
  "http://127.1:3000/",
  "http://[::1]:3000/",
  "http://[0:0:0:0:0:0:0:1]:3000/",
])("el SDK real no inyecta recursos ni inicializa su cola en %s", url => {
  environment.jsdom.reconfigure({ url });
  render(inRoute());
  expect(document.head.querySelector(scriptSelector)).toBeNull();
  expect(window.si).toBeUndefined();
});

it.each([
  "https://biblioshare.vercel.app/",
  "https://biblioshare-1306-project.vercel.app/",
  "https://biblioshare.example.com/",
  "https://localhost.example.com/",
  "https://127.analytics.example.com/",
  "http://192.168.1.80:3000/",
])("conserva el script del SDK y su ruta en %s aunque VERCEL no esté expuesto", url => {
  environment.jsdom.reconfigure({ url });
  render(inRoute());
  const script = document.head.querySelector<HTMLScriptElement>(scriptSelector);
  expect(script).not.toBeNull();
  expect(script!.src).toBe(new URL("/_vercel/speed-insights/script.js", url).href);
  expect(script!.dataset.route).toBe("/partidas/mtg/nueva");
  expect(typeof window.si).toBe("function");
});

it("conserva la configuración dinámica de Vercel y los cambios de ruta del SDK", () => {
  vi.stubEnv("NEXT_PUBLIC_VERCEL_OBSERVABILITY_CLIENT_CONFIG", JSON.stringify({
    speedInsights: { scriptSrc: "/qa1306-intake/script.js", endpoint: "/qa1306-intake/vitals" },
  }));
  const view = render(inRoute());
  const script = document.head.querySelector<HTMLScriptElement>(scriptSelector)!;
  expect(script.src).toBe("https://biblioshare.vercel.app/qa1306-intake/script.js");
  expect(script.dataset.endpoint).toBe("/qa1306-intake/vitals");
  view.rerender(inRoute("/sagas"));
  expect(document.head.querySelectorAll(scriptSelector)).toHaveLength(1);
  expect(document.head.querySelector(scriptSelector)).toBe(script);
  expect(script.dataset.route).toBe("/sagas");
});

it("prerenderiza sin window y sin inyectar un recurso de navegador", () => {
  vi.stubGlobal("window", undefined);
  expect(renderToString(inRoute())).not.toContain("<script");
});

it.each([
  { url: initialURL, count: 1 },
  { url: "http://127.0.0.1:3000/", count: 0 },
])("hidrata el prerender en $url con $count scripts del SDK", ({ url, count }) => {
  environment.jsdom.reconfigure({ url });
  const html = renderToString(inRoute());
  expect(html).not.toContain("<script");
  expect(document.head.querySelector(scriptSelector)).toBeNull();
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  render(inRoute(), { container, hydrate: true });
  expect(document.head.querySelectorAll(scriptSelector)).toHaveLength(count);
  if (count === 0) expect(window.si).toBeUndefined();
});
