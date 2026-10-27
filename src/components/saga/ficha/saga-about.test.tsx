// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { SagaAbout } from "./saga-about";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { count?: number }) =>
    values?.count !== undefined ? `${key}:${values.count}` : key,
}));
vi.mock("server-only", () => ({}));

afterEach(cleanup);

type M = { itemType: "book" | "movie" | "series"; year: number | null; placement: string | null };

function detail(over: { members?: M[]; overview?: string | null; avg?: number | null; children?: number } = {}): SagaDetail {
  const members = over.members ?? [{ itemType: "book", year: 1990, placement: "fijo" }];
  return {
    saga: { id: "s1", overview: over.overview === undefined ? "Una sinopsis." : over.overview },
    groups: [{ sagaId: null, members }],
    memberCount: members.length,
    childCount: over.children ?? 0,
    avgRating: over.avg ?? null,
  } as unknown as SagaDetail;
}

async function renderAbout(d: SagaDetail, canConfigure: boolean) {
  render(await SagaAbout({ detail: d, canConfigure }));
}

describe("SagaAbout", () => {
  it("pinta la sinopsis y, sin ella, el texto de reserva", async () => {
    await renderAbout(detail(), false);
    expect(screen.getByText("Una sinopsis.")).toBeTruthy();
    cleanup();
    await renderAbout(detail({ overview: null }), false);
    expect(screen.getByText("noSynopsis")).toBeTruthy();
  });

  it("cuenta por tipo, unidos con ' · ' y sin tipos vacíos", async () => {
    await renderAbout(
      detail({
        members: [
          { itemType: "movie", year: null, placement: "fijo" },
          { itemType: "movie", year: null, placement: "fijo" },
          { itemType: "series", year: null, placement: "fijo" },
        ],
      }),
      false,
    );
    expect(screen.getByText("typeMovies:2 · typeSeries:1")).toBeTruthy();
    expect(screen.queryByText(/typeBooks/)).toBeNull();
  });

  it("la fila de años solo aparece si hay años", async () => {
    await renderAbout(
      detail({
        members: [
          { itemType: "book", year: 1990, placement: "fijo" },
          { itemType: "book", year: 2004, placement: "fijo" },
        ],
      }),
      false,
    );
    expect(screen.getByText("1990–2004")).toBeTruthy();
    cleanup();
    await renderAbout(detail({ members: [{ itemType: "book", year: null, placement: "fijo" }] }), false);
    expect(screen.queryByText("aboutYears")).toBeNull();
  });

  it("media y subsagas solo si existen", async () => {
    await renderAbout(detail({ avg: 9, children: 3 }), false);
    expect(screen.getByText("aboutRating")).toBeTruthy();
    expect(screen.getByText("aboutSubsagas")).toBeTruthy();
    cleanup();
    await renderAbout(detail(), false);
    expect(screen.queryByText("aboutRating")).toBeNull();
    expect(screen.queryByText("aboutSubsagas")).toBeNull();
  });

  it("el aviso de sin clasificar solo sale a curadores y con obras sin clasificar", async () => {
    const sin = detail({ members: [{ itemType: "book", year: null, placement: null }] });
    await renderAbout(sin, true);
    expect(screen.getByText(/unclassifiedNotice:1/)).toBeTruthy();
    cleanup();
    await renderAbout(sin, false);
    expect(screen.queryByText(/unclassifiedNotice/)).toBeNull();
    cleanup();
    await renderAbout(detail(), true);
    expect(screen.queryByText(/unclassifiedNotice/)).toBeNull();
  });
});
