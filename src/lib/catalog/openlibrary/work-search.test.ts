import { describe, expect, it } from "vitest";
import { mapWorkDoc } from "./work-search";

describe("mapWorkDoc", () => {
  it("mapea un doc de search.json como OBRA, sin datos de edición", () => {
    const result = mapWorkDoc({
      key: "/works/OL893415W",
      title: "Dune",
      author_name: ["Frank Herbert"],
      cover_i: 8100921,
      first_publish_year: 1965,
      edition_count: 312,
    });

    expect(result).toEqual({
      itemType: "book",
      externalId: "/works/OL893415W",
      title: "Dune",
      subtitle: "Frank Herbert",
      coverUrl: "https://covers.openlibrary.org/b/id/8100921-M.jpg",
      year: 1965,
      synopsis: null,
      genres: null,
      editionCount: 312,
    });
  });

  it("junta varios autores y tolera campos ausentes", () => {
    const result = mapWorkDoc({
      key: "/works/OL1W",
      title: "Buenos presagios",
      author_name: ["Terry Pratchett", "Neil Gaiman"],
    });

    expect(result.subtitle).toBe("Terry Pratchett, Neil Gaiman");
    expect(result.coverUrl).toBeNull();
    expect(result.year).toBeNull();
    expect(result.editionCount).toBe(1);
  });
});
