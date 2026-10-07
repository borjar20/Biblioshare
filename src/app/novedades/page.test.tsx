// @vitest-environment jsdom
import { Children, Suspense, cloneElement, isValidElement, useSyncExternalStore, type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { groupReleaseWorks } from "@/lib/releases/presentation";
import { releaseFixture as baseReleaseFixture } from "@/components/releases/test-fixture";
function releaseFixture(changes: Parameters<typeof baseReleaseFixture>[0] = {}) {
  return baseReleaseFixture({ cover_url: "https://images.example/cover.jpg", synopsis: "Una sinopsis disponible", ...changes });
}

const mocks = vi.hoisted(() => ({ user: vi.fn(), public: vi.fn(), personal: vi.fn(), sources: vi.fn(), state: vi.fn(), byId: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/releases/queries", () => ({ getPublicReleases: mocks.public, getPersonalReleases: mocks.personal, getReleaseSourceStatus: mocks.sources, getReleaseUserState: mocks.state, getReleaseById: mocks.byId }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); }, useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }), useSearchParams: () => new URLSearchParams(useSyncExternalStore((listener) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); }, () => window.location.search, () => "")) }));
vi.mock("next-intl/server", () => ({ getTranslations: async (namespace: "releases") => createTranslator({ locale: "es", messages, namespace }) }));
vi.mock("@/app/novedades/actions", () => ({ addNoveltyToPending: vi.fn(), chooseReleaseNotice: vi.fn() }));

import ReleasesPage from "./page";
import ReleasesLayout from "./layout";
import { RouteMessages } from "@/components/route-messages";

// Resolve the real async server boundary from the page entry. Client components
// keep their actual hooks/provider and data branches run through the query contracts.
async function body(params: Record<string, string> = {}) {
  const root = await ReleasesPage({ searchParams: Promise.resolve(params) });
  const suspense = Children.toArray(root.props.children).find((child) => isValidElement(child) && child.type === Suspense) as ReactElement<{ children: ReactElement<{ searchParams: Promise<Record<string, string>> }> }>;
  const child = suspense.props.children;
  const resolve = child.type as (props: typeof child.props) => Promise<ReactElement>;
  return resolve(child.props);
}
async function display(params: Record<string, string> = {}) {
  const presentation = { mes: "2027-02", ...params };
  window.history.replaceState(null, "", "/novedades?" + new URLSearchParams(presentation));
  const content = await body(presentation);
  return render(<NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={{ releases: messages.releases }}>{content}</NextIntlClientProvider>);
}
beforeEach(() => { vi.clearAllMocks();
  const push = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => { push(...args); window.dispatchEvent(new PopStateEvent("popstate")); }); mocks.user.mockResolvedValue(null); mocks.public.mockResolvedValue([]); mocks.personal.mockResolvedValue([]); mocks.sources.mockResolvedValue([]); mocks.state.mockResolvedValue({}); mocks.byId.mockResolvedValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("calendario público y frontera privada", () => {
  it("la consulta pública usa España/castellano sin escribir ni exigir sesión", async () => {
    await display();
    expect(mocks.public).toHaveBeenCalledWith({ type: "all", market: "ES", language: "es", includeUndated: true, from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(mocks.state).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mercado", { exact: true }).getAttribute("name")).toBe("mercado");
    expect(within(screen.getByRole("navigation", { name: "Filtros de novedades" })).getByRole("link", { name: "Todo" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("No hay novedades para estos filtros")).toBeTruthy();
  });
  it("un error de lectura ofrece reintento y nunca finge un vacío", async () => {
    mocks.public.mockRejectedValue(new Error("provider unavailable"));
    await display();
    expect(screen.getByText("No se pudieron cargar las novedades")).toBeTruthy();
    expect(screen.queryByText("No hay novedades para estos filtros")).toBeNull();
    expect(screen.getByRole("button", { name: "Volver a intentarlo" })).toBeTruthy();
  });
  it("mantiene los resultados si solo falla la revisión de las fuentes", async () => {
    mocks.public.mockResolvedValue(groupReleaseWorks([releaseFixture()], {}, new Date("2026-10-06T12:00:00Z")));
    mocks.sources.mockRejectedValue(new Error("source unavailable"));
    await display();
    expect(screen.getByRole("heading", { name: "La misma película" })).toBeTruthy();
    expect(screen.getByText("No se pudo consultar el estado de revisión de las fuentes.")).toBeTruthy();
    expect(screen.queryByText("No hay novedades para estos filtros")).toBeNull();
  });
  it("separa los anuncios parciales del día exacto sin repetir la obra", async () => {
    const movie = releaseFixture();
    const partial = releaseFixture({ id: "8174f7cd-39ed-40eb-8195-3d3d713a6a02", work_key: "editorial:new", title: "Libro de febrero", item_type: "book", modality: "book", language: "es", date_precision: "month", date_value: "2027-02" });
    mocks.public.mockResolvedValue(groupReleaseWorks([movie, partial], {}, new Date("2026-10-06T12:00:00Z")));
    await display();
    expect(screen.getByRole("heading", { name: "Con día confirmado" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Anuncios sin día exacto" })).toBeTruthy();
    expect(within(screen.getByRole("heading", { name: "Libro de febrero" }).closest("article")!).getByText("febrero de 2027")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });
  it("una serie con fecha internacional ofrece ese filtro explícitamente", async () => {
    mocks.public.mockResolvedValueOnce([]).mockResolvedValueOnce([{ releases: [releaseFixture()] }]);
    await display({ tipo: "series" });
    expect(screen.getByText("Las fechas disponibles de estas series son internacionales")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver fechas internacionales" }).getAttribute("href")).toBe("/novedades?tipo=series&mercado=INT");
    expect(screen.queryByText("No hay novedades para estos filtros")).toBeNull();
  });
  it("Lo que esperas preserva el filtro en el retorno a login", async () => {
    await expect(body({ seleccion: "personal", tipo: "movie", mercado: "INT" })).rejects.toThrow("redirect:/login?next=%2Fnovedades%3Fseleccion%3Dpersonal%26tipo%3Dmovie%26mercado%3DINT");
    expect(mocks.personal).not.toHaveBeenCalled();
  });
  it("una lectura privada fallida conserva calendario y bloquea las elecciones", async () => {
    mocks.user.mockResolvedValue({ id: "actor" });
    mocks.public.mockResolvedValue(groupReleaseWorks([releaseFixture()], {}, new Date("2026-10-06T12:00:00Z")));
    mocks.state.mockRejectedValue(new Error("state unavailable"));
    await display();
    expect(screen.getByText("No pudimos consultar tu biblioteca ni tus avisos. Vuelve a intentarlo para gestionarlos.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Avisarme" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Añadir a Pendiente" })).toBeNull();
    expect(screen.getByRole("heading", { name: "La misma película" })).toBeTruthy();
  });
  it("un aviso cancelado internacional abre sin sesión fuera del filtro", async () => {
    const row = releaseFixture({ market: "INT", status: "cancelled" });
    mocks.byId.mockResolvedValue(row);
    await display({ lanzamiento: row.id });
    expect(screen.getByRole("heading", { name: "Detalles del lanzamiento" })).toBeTruthy();
    expect(screen.getByText("Lanzamiento cancelado")).toBeTruthy();
    expect(within(screen.getByRole("article")).getByText("Internacional")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Avisarme" })).toBeNull();
  });
  it("validar un enlace evita consultar identificadores malformados", async () => {
    await display({ lanzamiento: "invento" });
    expect(mocks.byId).not.toHaveBeenCalled();
  });
  it("el provider público incluye solo Novedades y los mensajes base", () => {
    const layout = ReleasesLayout({ children: null });
    const provider = RouteMessages(layout.props);
    expect(provider.props.messages.releases).toEqual(messages.releases);
    expect(provider.props.messages.releaseAdmin).toBeUndefined();
    expect(provider.props.messages.nav).toBeDefined();
  });

  it("moves an incomplete public work into a separate manageable list", async () => {
    const incomplete = releaseFixture({ title: "Anuncio incompleto", work_key: "limited-work", cover_url: null, synopsis: null });
    const complete = releaseFixture({ id: "8174f7cd-39ed-40eb-8195-3d3d713a6a02", title: "Anuncio completo", work_key: "complete-work",
      cover_url: "https://images.example/cover.jpg", synopsis: "Una descripción disponible" });
    mocks.public.mockResolvedValue(groupReleaseWorks([incomplete, complete], {}, new Date("2026-10-06T12:00:00Z")));
    await display();
    fireEvent.click(screen.getByRole("button", { name: /Información limitada/ }));
    expect(screen.getByRole("heading", { name: "Anuncio incompleto" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Anuncio completo" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Estrenos/ }));
    const main = screen.getByRole("heading", { name: "Con día confirmado" }).closest("section")!;
    expect(within(main).queryByRole("heading", { name: "Anuncio incompleto" })).toBeNull();
    expect(within(main).getByRole("heading", { name: "Anuncio completo" })).toBeTruthy();
  });

  it("keeps incomplete personal choices visible and direct links manageable", async () => {
    const incomplete = releaseFixture({ title: "Anuncio propio", cover_url: null, synopsis: "An English description", synopsis_language: "en" });
    mocks.user.mockResolvedValue({ id: "actor" });
    mocks.personal.mockResolvedValue(groupReleaseWorks([incomplete], {}, new Date("2026-10-06T12:00:00Z")));
    mocks.state.mockResolvedValue({ [incomplete.id]: { subscribed: true, inLibrary: true } });
    await display({ seleccion: "personal" });
    expect(screen.getByRole("heading", { name: "Anuncio propio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retirar aviso" })).toBeTruthy();
    expect(screen.queryByText("Anuncios con información limitada")).toBeNull();
    cleanup();
    mocks.byId.mockResolvedValue(incomplete);
    await display({ lanzamiento: incomplete.id });
    expect(screen.getByText("An English description")).toBeTruthy();
    expect(screen.getByText("Sinopsis en inglés")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retirar aviso" })).toBeTruthy();
  });
});

it("quick type filters preserve the personal selection and the explicit market", async () => {
  mocks.user.mockResolvedValue({ id: "actor" });
  await display({ seleccion: "personal", tipo: "movie", mercado: "INT" });
  const filters = within(screen.getByRole("navigation", { name: "Filtros de novedades" }));
  const path = new URL(filters.getByRole("link", { name: "Libros" }).getAttribute("href")!, "http://localhost");
  expect(Object.fromEntries(path.searchParams)).toEqual({ mes: "2027-02", seleccion: "personal", tipo: "book", mercado: "INT" });
  expect(filters.getByRole("link", { name: "Películas" }).getAttribute("aria-current")).toBe("page");
});
it("una obra enfocada conserva su marca de calendario sin duplicar la ficha", async () => {
  const row = releaseFixture();
  mocks.byId.mockResolvedValue(row);
  mocks.public.mockResolvedValue(groupReleaseWorks([row], {}, new Date("2026-10-06T12:00:00Z")));
  await display({ lanzamiento: row.id });
  expect(screen.getByRole("button", { name: /^14 de febrero de 2027: 1 obra/ })).toBeTruthy();
  expect(screen.getAllByRole("heading", { name: row.title })).toHaveLength(1);
});

it("el retorno de login de la ficha enfocada sigue el mes elegido en el cliente", async () => {
  const row = releaseFixture();
  mocks.byId.mockResolvedValue(row);
  mocks.public.mockResolvedValue(groupReleaseWorks([row], {}, new Date("2026-10-06T12:00:00Z")));
  await display({ lanzamiento: row.id });
  fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
  const article = screen.getByRole("heading", { name: row.title }).closest("article")!;
  const login = new URL(within(article).getByRole("link", { name: "Añadir a Pendiente" }).getAttribute("href")!, "http://localhost");
  const next = new URL(login.searchParams.get("next")!, "http://localhost");
  expect(next.searchParams.get("mes")).toBe("2027-03");
  expect(next.searchParams.get("lanzamiento")).toBe(row.id);
});

it("cerrar el detalle mediante un filtro conserva el mes visible derivado de ese anuncio", async () => {
  const row = releaseFixture();
  mocks.byId.mockResolvedValue(row);
  mocks.public.mockResolvedValue(groupReleaseWorks([row], {}, new Date("2026-10-06T12:00:00Z")));
  await display({ lanzamiento: row.id, mes: "" });
  const filters = within(screen.getByRole("navigation", { name: "Filtros de novedades" }));
  const path = new URL(filters.getByRole("link", { name: "Libros" }).getAttribute("href")!, "http://localhost");
  expect(path.searchParams.get("mes")).toBe("2027-02");
  expect(path.searchParams.has("lanzamiento")).toBe(false);
});

async function displayPageWithTopControl() {
  const root = await ReleasesPage({ searchParams: Promise.resolve({}) });
  const content = await body();
  const children = Children.map(root.props.children, (child) => isValidElement(child) && child.type === Suspense ? content : child);
  return render(<NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={{ releases: messages.releases }}>{cloneElement(root, {}, children)}</NextIntlClientProvider>);
}
function scrollPageTo(top: number) {
  act(() => { vi.stubGlobal("scrollY", top); window.dispatchEvent(new Event("scroll")); });
}

describe("volver arriba desde la lista de novedades", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("aparece al bajar y desaparece al volver al inicio", async () => {
    vi.stubGlobal("scrollY", 0);
    await displayPageWithTopControl();
    expect(screen.queryByRole("button", { name: "Volver arriba" })).toBeNull();
    scrollPageTo(700);
    expect(screen.getByRole("button", { name: "Volver arriba" })).toBeTruthy();
    scrollPageTo(0);
    expect(screen.queryByRole("button", { name: "Volver arriba" })).toBeNull();
  });
  it("devuelve scroll y foco al título sin modificar la URL", async () => {
    vi.stubGlobal("scrollY", 700);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("scrollTo", (options: ScrollToOptions) => scrollPageTo(options.top ?? 0));
    await displayPageWithTopControl();
    const path = window.location.href;
    fireEvent.click(screen.getByRole("button", { name: "Volver arriba" }));
    expect(window.scrollY).toBe(0);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Novedades", level: 1 }));
    expect(window.location.href).toBe(path);
    expect(screen.queryByRole("button", { name: "Volver arriba" })).toBeNull();
  });
  it("vuelve sin animación cuando se prefiere movimiento reducido", async () => {
    vi.stubGlobal("scrollY", 700);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const movement: ScrollBehavior[] = [];
    vi.stubGlobal("scrollTo", (options: ScrollToOptions) => { movement.push(options.behavior!); scrollPageTo(options.top ?? 0); });
    await displayPageWithTopControl();
    fireEvent.click(screen.getByRole("button", { name: "Volver arriba" }));
    expect(window.scrollY).toBe(0);
    expect(movement).toEqual(["instant"]);
  });
});

it("agrupa tipos, mercado y vistas sin perder el período al cambiar de vista", async () => {
  const complete = releaseFixture({ work_key: "grouped-main", title: "Estreno de febrero" });
  const limited = releaseFixture({ id: "8174f7cd-39ed-40eb-8195-3d3d713a6a04", work_key: "grouped-limited", title: "Limitado de febrero", cover_url: null });
  mocks.public.mockResolvedValue(groupReleaseWorks([complete, limited], {}, new Date("2026-10-06T12:00:00Z")));
  await display({ mercado: "all", dia: "2027-02-03" });
  const filters = within(screen.getByRole("region", { name: "Filtros de novedades" }));
  expect(filters.getByRole("link", { name: "Libros" })).toBeTruthy();
  expect(filters.getByRole("combobox", { name: "Mercado" })).toBeTruthy();
  expect(filters.getByRole("button", { name: "Aplicar filtros" })).toBeTruthy();
  fireEvent.click(filters.getByRole("button", { name: /Información limitada/ }));
  const params = new URLSearchParams(window.location.search);
  expect(Object.fromEntries(params)).toMatchObject({ mercado: "all", mes: "2027-02", dia: "2027-02-03", vista: "limitadas" });
  const form = filters.getByRole("form", { name: "Filtros de novedades" });
  expect(form.querySelector<HTMLInputElement>('input[name="mes"]')?.value).toBe("2027-02");
  expect(form.querySelector<HTMLInputElement>('input[name="vista"]')?.value).toBe("limitadas");
});
