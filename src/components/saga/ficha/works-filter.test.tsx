// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorksFilter } from "./works-filter";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

afterEach(cleanup);

function setup() {
  render(
    <WorksFilter>
      <ul>
        <li data-type="book" data-status="done">A</li>
        <li data-type="movie" data-status="pending">B</li>
      </ul>
    </WorksFilter>,
  );
  return screen.getByTestId("works-filter");
}

// jsdom no aplica el CSS de Tailwind: se comprueban la clase de ocultación y
// aria-pressed, no la visibilidad real (eso es del chequeo en navegador).
describe("WorksFilter", () => {
  it("empieza sin ocultar nada", () => {
    const wrapper = setup();
    expect(wrapper.className).not.toContain("hidden");
    expect(screen.getAllByRole("button", { name: "filterAll" }).every((b) => b.getAttribute("aria-pressed") === "true")).toBe(true);
  });

  it("filtrar por tipo pone la clase de ocultación y marca el chip", () => {
    const wrapper = setup();
    fireEvent.click(screen.getByRole("button", { name: "filterBooks" }));
    expect(wrapper.className).toContain("[&_li[data-type]:not([data-type=book])]:hidden");
    expect(screen.getByRole("button", { name: "filterBooks" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getAllByRole("button", { name: "filterAll" })[0]);
    expect(wrapper.className).not.toContain("data-type");
    expect(screen.getByRole("button", { name: "filterBooks" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("filtrar por estado se combina con el tipo", () => {
    const wrapper = setup();
    fireEvent.click(screen.getByRole("button", { name: "filterMovies" }));
    fireEvent.click(screen.getByRole("button", { name: "filterPending" }));
    expect(wrapper.className).toContain("[&_li[data-type]:not([data-type=movie])]:hidden");
    expect(wrapper.className).toContain("[&_li[data-status=done]]:hidden");
  });
});
