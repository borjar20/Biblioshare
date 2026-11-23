// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { Edition } from "@/lib/editions/types";
import { EditionStrip } from "./edition-strip";

vi.mock("@/lib/editions/actions", () => ({ createEdition: vi.fn() }));
vi.mock("@/lib/catalog/edit-actions", () => ({ deleteEdition: vi.fn() }));

const editions: Edition[] = Array.from({ length: 7 }, (_, i) => ({
  id: String(i), label: `Edición ${i}`, publisher: null, year: null, language: null,
  totalUnits: null, isbn: null, coverUrl: null,
}));

afterEach(cleanup);

function renderStrip(itemType: "book" | "movie", selectedEditionId: string | null) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <EditionStrip itemType={itemType} itemId="item" editions={editions} usedEditionIds={[]}
        selectedEditionId={selectedEditionId} canContribute={false} />
    </NextIntlClientProvider>,
  );
}

describe("edición del usuario en la ficha", () => {
  it.each([["book", "Tu edición"], ["movie", "Tu versión"]] as const)(
    "%s coloca la selección real antes del corte de cinco tarjetas", (type, label) => {
      renderStrip(type, "6");
      const cards = screen.getAllByTestId("edition-card");
      expect(cards[0].textContent).toContain("Edición 6");
      expect(screen.getByText(label).closest("[data-testid='edition-card']")).toBe(cards[0]);
      expect(cards[1].textContent).toContain("Edición 0");
    },
  );
  it("sin selección conserva el orden de catálogo y omite la marca personal", () => {
    renderStrip("book", null);
    expect(screen.queryByText("Tu edición")).toBeNull();
    expect(screen.getAllByTestId("edition-card")[0].textContent).toContain("Edición 0");
  });
});
