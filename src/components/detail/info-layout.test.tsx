// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InfoLayout } from "./info-layout";
import { DETAIL_ASIDE_STICKY } from "./detail-container";

afterEach(cleanup);

describe("InfoLayout", () => {
  it("pinta principal y datos una sola vez, en ese orden de documento", () => {
    render(
      <InfoLayout
        main={<p className="order-2 xl:order-none">sinopsis</p>}
        aside={<p className="order-3 xl:order-none">ficha</p>}
      />,
    );
    expect(screen.getAllByText("sinopsis")).toHaveLength(1);
    expect(screen.getAllByText("ficha")).toHaveLength(1);
    const main = screen.getByTestId("info-main");
    const aside = screen.getByTestId("info-aside");
    expect(main.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("la columna de datos es la pegajosa y las dos se aplanan en móvil", () => {
    render(<InfoLayout main={<p>a</p>} aside={<p>b</p>} />);
    const aside = screen.getByTestId("info-aside");
    for (const cls of DETAIL_ASIDE_STICKY.split(" ")) expect(aside.className).toContain(cls);
    expect(aside.className).toContain("contents");
    expect(screen.getByTestId("info-main").className).toContain("contents");
  });

  it("las dos columnas empiezan en xl, no en lg", () => {
    render(<InfoLayout main={<p>a</p>} aside={<p>b</p>} />);
    const root = screen.getByTestId("info-main").parentElement!;
    expect(root.className).toContain("xl:grid-cols-[minmax(0,1fr)_280px]");
    expect(root.className).not.toContain("lg:grid");
    expect(screen.getByTestId("info-main").className).not.toContain("lg:");
    expect(screen.getByTestId("info-aside").className).not.toContain("lg:");
  });
});
