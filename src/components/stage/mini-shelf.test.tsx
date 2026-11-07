// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MiniShelf } from "./mini-shelf";
afterEach(cleanup);

describe("MiniShelf", () => {
  it("pinta los lomos, el que aterriza y lo que se sienta encima", () => {
    const { container, getByText } = render(
      <MiniShelf spines={[{ color: "#b5652f", h: 70 }, { color: "#2f6f73", h: 60 }]} landing={{ color: "#8e3b2b" }}>
        <span>mascota</span>
      </MiniShelf>,
    );
    expect(container.querySelectorAll("[data-spine]")).toHaveLength(2);
    expect(container.querySelector("[data-landing]")).toBeTruthy();
    expect(getByText("mascota")).toBeTruthy();
  });
  it("sin landing no pinta el lomo que aterriza", () => {
    const { container } = render(<MiniShelf spines={[]} />);
    expect(container.querySelector("[data-landing]")).toBeNull();
  });
});
