// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { groupReleaseWorks } from "@/lib/releases/presentation";
import { releaseFixture } from "./test-fixture";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/releases/queries", () => ({ getPublicReleases: mocks.read }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/novedades/actions", () => ({ addNoveltyToPending: vi.fn(), chooseReleaseNotice: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async (namespace: "releases") => createTranslator({ locale: "es", messages, namespace }) }));
vi.mock("@/components/route-messages", () => ({ RouteMessages: ({ children }: { children: React.ReactNode }) => children }));
import { ThisWeekReleases, PublicReleaseFan } from "./this-week-releases";

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T23:30:00Z"));
  mocks.read.mockResolvedValue(groupReleaseWorks(Array.from({ length: 4 }, (_, i) => releaseFixture({
    id: `release-${i}`, work_key: `work-${i}`, title: `Semana ${i}`, date_value: "2026-10-09",
    cover_url: `https://images.example/${i}.jpg`, synopsis: "Sinopsis disponible", movie_id: null,
  })), {}, new Date("2026-10-08T12:00:00Z")));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const display = (content: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={{ releases: messages.releases }}>{content}</NextIntlClientProvider>);

it("the public landing fills four weekly slots using Madrid's civil week and complete works", async () => {
  display(await ThisWeekReleases({ wide: true }));
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ from: "2026-10-08", to: "2026-10-11", completeness: "complete", limit: 4 }));
  expect(screen.getAllByRole("article")).toHaveLength(4);
  expect(screen.queryByRole("link", { name: "Avisarme" })).toBeNull();
});

it("the fan uses three real public covers with working detail links", async () => {
  display(await PublicReleaseFan());
  expect(screen.getAllByRole("link", { name: /Ver detalles de Semana/ })).toHaveLength(3);
  expect(screen.getAllByRole("link", { name: /Ver detalles de Semana/ })[0].getAttribute("href")).toBe("/novedades?lanzamiento=release-0");
});

it("a failed weekly query preserves an explicit retry instead of an empty showcase", async () => {
  mocks.read.mockRejectedValue(new Error("unavailable"));
  display(await ThisWeekReleases({ wide: true }));
  expect(screen.getByText("No se pudieron cargar las novedades")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Volver a intentarlo" })).toBeTruthy();
});