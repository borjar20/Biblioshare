import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkSummaryCard } from "./work-summary-card";
import { SpineCover } from "./spine-cover";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

describe("post work cover resolution", () => {
  it("requests the sidebar width instead of stretching a feed thumbnail", async () => {
    const card = await WorkSummaryCard({ work: {
      type: "movie", id: "movie", href: "/pelicula/movie", title: "Movie",
      coverUrl: "/poster.jpg", year: 2006, creator: null, genres: [],
      community: null, viewer: null,
    } });
    const html = renderToStaticMarkup(card);
    const sizes = html.match(/<img[^>]* sizes="([^"]+)"/)?.[1];
    // Column widths minus 28px padding and 2px border in globals.css.
    expect(sizes).toBe("(min-width: 1440px) 220px, (min-width: 1180px) 190px, 150px");
  });

  it("keeps small feed covers at their thumbnail size", () => {
    const html = renderToStaticMarkup(<SpineCover coverUrl="/poster.jpg" title="Movie" />);
    expect(html).toContain('sizes="60px"');
  });
});
