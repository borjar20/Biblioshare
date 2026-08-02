import { describe, expect, expectTypeOf, it } from "vitest";

import type { FeedEvent } from "./feed";
import { resolveSharedActivity } from "./shared-activity";

function sharedReviewClient() {
  const rows: Record<string, unknown> = {
    pass_reviews: {
      id: "pass-1",
      user_id: "author-1",
      item_type: "book",
      item_id: "book-1",
      finished_on: "2026-08-01",
      rating: 4,
      review: "Muy bueno",
    },
    profile_identities: {
      user_id: "author-1",
      username: "ana",
      display_name: "Ana",
      avatar_url: null,
    },
    books: {
      title: "Libro",
      author: "Autora",
      cover_url: "/cover.jpg",
    },
  };

  return {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        not() {
          return builder;
        },
        async maybeSingle() {
          return { data: rows[table] ?? null, error: null };
        },
      };
      return builder;
    },
  };
}

describe("resolveSharedActivity", () => {
  it("mantiene obligatorio el UUID cuando un evento es interactivo", () => {
    expectTypeOf<NonNullable<FeedEvent["interactionTarget"]>["interactionTargetId"]>()
      .toEqualTypeOf<string>();
  });

  it("expone un preview sin contrato de interacciones", async () => {
    const preview = await resolveSharedActivity(
      sharedReviewClient() as never,
      { sourceTable: "diary_entries", rowId: "pass-1" },
    );

    expect(preview).toMatchObject({
      itemType: "book",
      itemId: "book-1",
      itemTitle: "Libro",
      itemCoverUrl: "/cover.jpg",
    });
    expect(preview).not.toHaveProperty("interactionTarget");
  });
});
