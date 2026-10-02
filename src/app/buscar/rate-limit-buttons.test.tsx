// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";

const actions = vi.hoisted(() => ({ open: vi.fn(), add: vi.fn() }));
vi.mock("./actions", () => ({ openCatalogItem: actions.open, addToLibrary: actions.add }));

import { AddToLibraryButton } from "./add-to-library-button";
import { OpenResultButton } from "./open-result-button";
import type { SearchResult } from "@/lib/catalog/types";

const result = { itemType: "book", externalId: "", googleVolumeId: "vol-1", title: "Fixture" } as SearchResult;
const rateLimit = { ok: false as const, error: "RATE_LIMIT" as const, reason: "googleBooksCreate" as const };

function renderWithMessages(ui: React.ReactNode) {
  return render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>);
}

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("search quota feedback", () => {
  it("shows the opening card alert and lets the user retry after a rate limit", async () => {
    actions.open.mockResolvedValueOnce(rateLimit).mockResolvedValueOnce(undefined);
    renderWithMessages(<OpenResultButton result={result}>Abrir Fixture</OpenResultButton>);

    const button = screen.getByRole("button", { name: "Abrir Fixture" });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole("alert").textContent).toContain("límite horario");
    expect(button.getAttribute("aria-describedby")).toBeTruthy();

    await act(async () => { fireEvent.click(button); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(actions.open).toHaveBeenCalledTimes(2);
  });

  it("does not mark an item added when the add action is rate-limited", async () => {
    actions.add.mockResolvedValue(rateLimit);
    renderWithMessages(<AddToLibraryButton result={result} />);

    const button = screen.getByRole("button", { name: "Añadir" });
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole("alert").textContent).toContain("límite horario");
    expect(screen.queryByRole("button", { name: "En tu biblioteca" })).toBeNull();
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
  });
});
