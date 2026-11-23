// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { CommunityRatingHistogram } from "./community-rating-histogram";

afterEach(cleanup);

describe("distribución interactiva de la ficha", () => {
  it("expone las diez notas y muestra los votos al tocar o enfocar incluso un cubo vacío", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <CommunityRatingHistogram itemType="book" distribution={[0, 0, 0, 0, 0, 0, 1, 2, 0, 0]} />
      </NextIntlClientProvider>,
    );
    const chart = screen.getByRole("group", { name: "Distribución de notas" });
    expect(within(chart).getAllByRole("button")).toHaveLength(10);
    expect(screen.getByText("4/5 · 2 votos")).toBeTruthy();
    const half = within(chart).getByRole("button", { name: "3,5/5 · 1 voto" });
    fireEvent.click(half);
    expect(screen.getByText("3,5/5 · 1 voto")).toBeTruthy();
    expect(half.getAttribute("aria-pressed")).toBe("true");
    fireEvent.focus(within(chart).getByRole("button", { name: "0,5/5 · 0 votos" }));
    expect(screen.getByText("0,5/5 · 0 votos")).toBeTruthy();
    expect(half.getAttribute("aria-pressed")).toBe("false");
  });
});
