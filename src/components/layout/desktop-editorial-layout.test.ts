import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesktopEditorialLayout } from "./desktop-editorial-layout";

describe("DesktopEditorialLayout", () => {
  it("does not reserve a rail when none is provided", () => {
    const html = renderToStaticMarkup(
      createElement(DesktopEditorialLayout, { main: "principal" }),
    );

    expect(html).toContain('data-editorial-main="true"');
    expect(html).not.toContain('data-editorial-rail="true"');
  });

  it("renders the header, focus, and rail slots once when supplied", () => {
    const html = renderToStaticMarkup(
      createElement(DesktopEditorialLayout, {
        header: "cabecera",
        focus: "foco",
        main: "principal",
        rail: "lateral",
      }),
    );

    expect((html.match(/data-editorial-layout="true"/g) ?? []).length).toBe(1);
    expect((html.match(/data-editorial-main="true"/g) ?? []).length).toBe(1);
    expect((html.match(/data-editorial-rail="true"/g) ?? []).length).toBe(1);
  });
});
