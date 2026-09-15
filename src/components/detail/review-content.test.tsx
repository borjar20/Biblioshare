import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewContent } from "./review-content";

it("presenta el formato básico y enlaces seguros sin ejecutar el HTML del export", () => {
  const html = renderToStaticMarkup(<ReviewContent text={'<p>Una <strong>gran</strong> película.</p><p><em>Otra idea</em> <a href="https://example.test/review" onclick="alert(1)">fuente</a><script>alert(1)</script><a href="javascript:alert(2)">sin enlace</a></p>'} />);
  expect(html).toContain("<strong>gran</strong>");
  expect(html).toContain("<em>Otra idea</em>");
  expect(html).toContain('href="https://example.test/review"');
  expect(html).toContain("<br/>");
  expect(html).not.toMatch(/onclick|javascript:|<script|alert\(/);
});
