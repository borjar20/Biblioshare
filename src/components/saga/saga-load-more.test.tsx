// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SagaLoadMore } from "./saga-load-more";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

// El pie de sagas pasó a ser un envoltorio de `LoadMore` (la mecánica está
// probada en `ui/load-more.test.tsx`). Lo que se comprueba aquí es que la
// delegación sigue cableada: con 12 sagas en la cuenta de dev el botón no
// llega a salir en el navegador, así que este es el único guardián del
// refactor.
describe("SagaLoadMore", () => {
  it("delega en LoadMore: sale el enlace con su href, su etiqueta y el recuento", () => {
    render(
      <SagaLoadMore
        href="/sagas?n=24"
        label="Cargar más"
        showingLabel="Mostrando 12 de 38 sagas con los filtros activos."
        skeletonCount={12}
      />,
    );
    const a = screen.getByText("Cargar más").closest("a");
    expect(a?.getAttribute("href")).toBe("/sagas?n=24");
    expect(screen.getByText("Mostrando 12 de 38 sagas con los filtros activos.")).toBeTruthy();
  });

  it("sin nada que traer no revienta (skeletonCount 0)", () => {
    render(<SagaLoadMore href="/sagas?n=24" label="Cargar más" showingLabel="12 de 12" skeletonCount={0} />);
    expect(screen.getByText("Cargar más")).toBeTruthy();
  });
});
