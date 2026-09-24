// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SagaMembership } from "@/lib/sagas/types";
import { SagaList } from "./saga-list";

afterEach(cleanup);

// Solo los campos que SagaList lee; el resto del tipo no importa aquí.
const saga = (id: string, name: string): SagaMembership =>
  ({ sagaId: id, name, isPrimary: id === "s1", position: 1, total: 3 }) as SagaMembership;

const sagas = [saga("s1", "Dune"), saga("s2", "Villeneuve")];

describe("SagaList · stripShown", () => {
  it("con la tira visible, la principal no se repite en la lista (a ningún ancho)", () => {
    render(<SagaList itemType="movie" sagas={sagas} positionLabel={() => null} stripShown />);
    const main = screen.getByRole("link", { name: /Dune/ });
    expect(main.className.split(" ")).toContain("hidden");
    expect(main.className).not.toContain("lg:flex");
  });

  it("sin tira, la principal SÍ sale en la lista, también en móvil", () => {
    render(<SagaList itemType="movie" sagas={sagas} positionLabel={() => null} stripShown={false} />);
    const main = screen.getByRole("link", { name: /Dune/ });
    expect(main.className.split(" ")).not.toContain("hidden");
  });

  it("las secundarias salen siempre", () => {
    render(<SagaList itemType="movie" sagas={sagas} positionLabel={() => null} stripShown />);
    expect(screen.getByRole("link", { name: /Villeneuve/ }).className.split(" ")).not.toContain("hidden");
  });

  it("una sola saga con la tira visible: no pinta nada", () => {
    const { container } = render(
      <SagaList itemType="movie" sagas={[saga("s1", "Dune")]} positionLabel={() => null} stripShown />,
    );
    expect(container.innerHTML).toBe("");
  });
});
