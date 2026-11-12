import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RatingHistogram } from "./rating-histogram";

const distribution = [0, 1, 0, 2, 3, 6, 9, 14, 8, 5];

describe("RatingHistogram", () => {
  it("sin animate no marca las barras (raíl de /post/[id])", () => {
    const html = renderToStaticMarkup(<RatingHistogram itemType="book" distribution={distribution} />);
    expect(html).not.toContain("data-grow");
    expect(html).not.toContain("--i");
  });
  it("con animate marca las diez barras, también las de cero, con su índice", () => {
    const html = renderToStaticMarkup(<RatingHistogram itemType="book" distribution={distribution} animate />);
    expect(html.match(/data-grow/g)).toHaveLength(10);
    for (let i = 0; i < 10; i++) expect(html).toContain(`--i:${i}`);
  });
});
