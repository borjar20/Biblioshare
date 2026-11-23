// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InfoLayout } from "./info-layout";

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

  it("las secciones de datos y contenido comparten columna en todos los anchos", () => {
    render(<InfoLayout main={<p>a</p>} aside={<p>b</p>} />);
    expect(screen.getByTestId("info-main").className).toBe("contents");
    expect(screen.getByTestId("info-aside").className).toBe("contents");
  });
});
