// @vitest-environment jsdom
import { useSyncExternalStore } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { groupReleaseWorks } from "@/lib/releases/presentation";
import { releaseFixture } from "./test-fixture";
import { ReleaseCalendarAgenda } from "./release-calendar-agenda";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), pending: vi.fn(), notice: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(
    (listener) => { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener); },
    () => window.location.search, () => "")),
}));
vi.mock("@/app/novedades/actions", () => ({ addNoveltyToPending: mocks.pending, chooseReleaseNotice: mocks.notice }));
const now = new Date("2026-10-07T10:00:00Z");
function rows(changes: Parameters<typeof releaseFixture>[0][]) {
  return groupReleaseWorks(changes.map((row) => releaseFixture({ cover_url: "https://images.example/cover.jpg", synopsis: "Sinopsis disponible", ...row })), { from: "1400-01-01" }, now);
}
const main = rows([
  { id: "cinema", title: "Cine y digital", work_key: "film", date_value: "2026-10-09" },
  { id: "digital", title: "Cine y digital", work_key: "film", date_value: "2026-11-13", modality: "digital" },
  { id: "other", title: "Sólo noviembre", work_key: "november", date_value: "2026-11-20" },
  { id: "partial", title: "Libro de octubre", work_key: "partial", item_type: "book", modality: "book", language: "es", date_precision: "month", date_value: "2026-10" },
  { id: "unknown", title: "Libro sin fecha", work_key: "unknown", item_type: "book", modality: "book", language: "es", date_precision: "unknown", date_value: null },
]);
const limited = rows([{ id: "limited", title: "Obra limitada", work_key: "limited", date_value: "2026-10-10", cover_url: null }]);
function display(props: Partial<Parameters<typeof ReleaseCalendarAgenda>[0]> = {}) {
  return render(<NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={{ releases: messages.releases }}>
    <ReleaseCalendarAgenda main={main} limited={limited} today="2026-10-07" {...props} />
  </NextIntlClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/novedades?mes=2026-10");
  const push = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((...args) => { push(...args); window.dispatchEvent(new PopStateEvent("popstate")); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("agenda mensual sin perder las tarjetas de obra", () => {
  it("la agenda muestra sólo octubre; noviembre recupera el lanzamiento digital de la misma obra", () => {
    display();
    expect(screen.getByRole("heading", { name: "Cine y digital" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Sólo noviembre" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Libro de octubre" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Libro sin fecha" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(screen.getByRole("heading", { name: "Cine y digital" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sólo noviembre" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Libro de octubre" })).toBeNull();
    expect(new URLSearchParams(window.location.search).get("mes")).toBe("2026-11");
  });
  it("información limitada está accesible arriba sin recorrer los estrenos y un día puede abrirla directamente", () => {
    display();
    fireEvent.click(screen.getByRole("button", { name: /Información limitada/ }));
    expect(screen.getByRole("heading", { name: "Obra limitada" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Cine y digital" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /9 de octubre de 2026: 1 obra/ }));
    expect(screen.getByRole("heading", { name: "Cine y digital" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Libro de octubre" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /10 de octubre de 2026: 1 obra/ }));
    expect(screen.getByRole("heading", { name: "Obra limitada" })).toBeTruthy();
  });
  it("los anuncios sin mes confirmado se abren globalmente y no inventan una marca en el día uno", () => {
    display();
    fireEvent.click(screen.getByRole("button", { name: /Sin mes confirmado/ }));
    expect(screen.getByRole("heading", { name: "Libro sin fecha" })).toBeTruthy();
    expect(screen.getByText("Fecha por confirmar")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^1 de octubre de 2026: 0 obras/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(screen.getByRole("heading", { name: "Libro sin fecha" })).toBeTruthy();
  });
  it("cambiar mes conserva filtros y el anuncio abierto; los enlaces de acción regresan al período consultado", () => {
    window.history.replaceState(null, "", "/novedades?tipo=movie&mercado=INT&seleccion=personal&lanzamiento=aviso&mes=2026-10&dia=2026-10-09");
    display();
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(window.location.search).toContain("tipo=movie&mercado=INT&seleccion=personal&lanzamiento=aviso&mes=2026-11");
    expect(new URLSearchParams(window.location.search).has("dia")).toBe(false);
    const card = screen.getByRole("heading", { name: "Sólo noviembre" }).closest("article")!;
    const next = new URL(within(card).getByRole("link", { name: "Añadir a Pendiente" }).getAttribute("href")!, "http://localhost").searchParams.get("next");
    expect(next).toBe("/novedades?tipo=movie&mercado=INT&seleccion=personal&lanzamiento=aviso&mes=2026-11");
  });
  it("un aviso histórico cancelado se conserva en el mes correspondiente con Retirar aviso", () => {
    const history = rows([{ id: "8174f7cd-39ed-40eb-8195-3d3d713a6a01", title: "Aviso anterior", work_key: "history", date_value: "2026-09-01", status: "cancelled" }]);
    display({ main: history, limited: [], authenticated: true, userState: { [history[0].releases[0].id]: { inLibrary: false, subscribed: true } } });
    fireEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(screen.getByRole("heading", { name: "Aviso anterior" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retirar aviso" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Avisarme" })).toBeNull();
  });
});

it("un día mixto conserva Información limitada y permite alternar vistas sin borrar ese día", () => {
  const mixedLimited = rows([{ id: "mixed-limited", title: "Limitada del día nueve", work_key: "mixed-limited", date_value: "2026-10-09", cover_url: null }]);
  display({ limited: mixedLimited });
  fireEvent.click(screen.getByRole("button", { name: /Información limitada/ }));
  fireEvent.click(screen.getByRole("button", { name: /9 de octubre de 2026: 2 obras/ }));
  expect(screen.getByRole("heading", { name: "Limitada del día nueve" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Cine y digital" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Estrenos/ }));
  expect(new URLSearchParams(window.location.search).get("dia")).toBe("2026-10-09");
  expect(screen.getByRole("heading", { name: "Cine y digital" })).toBeTruthy();
});

it("el selector mensual tiene un nombre accesible independiente de sus opciones", () => {
  display();
  expect(screen.getByRole("combobox", { name: "Ir a un mes" })).toBeTruthy();
});
