import { describe, expect, expectTypeOf, it } from "vitest";

import type { FeedEvent } from "./feed";
import { resolveSharedActivity } from "./shared-activity";

// Fake mínimo del cliente: una fila por tabla, cadena select/eq/not/order/limit
// terminada en maybeSingle. Suficiente para resolver UNA fila compartida.
function client(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        async maybeSingle() {
          return { data: rows[table] ?? null, error: null };
        },
      };
      return builder;
    },
  };
}

const actor = {
  profile_identities: {
    user_id: "author-1",
    username: "ana",
    display_name: "Ana",
    avatar_url: null,
  },
};

describe("resolveSharedActivity", () => {
  it("mantiene obligatorio el UUID cuando un evento es interactivo", () => {
    expectTypeOf<NonNullable<FeedEvent["interactionTarget"]>["interactionTargetId"]>()
      .toEqualTypeOf<string>();
  });

  it("expone un preview sin contrato de interacciones", async () => {
    const preview = await resolveSharedActivity(
      client({
        ...actor,
        pass_reviews: {
          id: "pass-1",
          user_id: "author-1",
          item_type: "book",
          item_id: "book-1",
          finished_on: "2026-08-01",
          rating: 4,
          review: "Muy bueno",
          updated_at: "2026-08-01T10:00:00Z",
        },
        books: { title: "Libro", author: "Autora", cover_url: "/cover.jpg" },
      }) as never,
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

  // #345: sortDate = updated_at (hora real del terminado), NO created_at.
  it("usa updated_at como sortDate de una reseña compartida", async () => {
    const preview = await resolveSharedActivity(
      client({
        ...actor,
        pass_reviews: {
          id: "pass-1",
          user_id: "author-1",
          item_type: "book",
          item_id: "book-1",
          finished_on: "2026-08-01",
          rating: null,
          review: null,
          updated_at: "2026-08-05T12:00:00Z",
        },
        books: { title: "Libro", author: null, cover_url: null },
      }) as never,
      { sourceTable: "diary_entries", rowId: "pass-1" },
    );
    expect(preview?.sortDate).toBe("2026-08-05T12:00:00Z");
  });

  // #345: sin updated_at (imposible en la práctica) la fila se trata como "ya no
  // disponible", igual que sin id -> el contrato sortDate=timestamp-real se cumple.
  it("descarta la reseña si no hay updated_at real", async () => {
    const preview = await resolveSharedActivity(
      client({
        ...actor,
        pass_reviews: {
          id: "pass-1",
          user_id: "author-1",
          item_type: "book",
          item_id: "book-1",
          finished_on: "2026-08-01",
          rating: 4,
          review: "x",
          updated_at: null,
        },
        books: { title: "Libro", author: null, cover_url: null },
      }) as never,
      { sourceTable: "diary_entries", rowId: "pass-1" },
    );
    expect(preview).toBeNull();
  });

  // #301: un avance compartido resuelve page/percent (contra total_pages) y la
  // nota PÚBLICA, en vez de dejarlos a null.
  it("resuelve página, porcentaje y nota pública de un avance compartido", async () => {
    const preview = await resolveSharedActivity(
      client({
        ...actor,
        progress_sessions: {
          id: "sess-1",
          user_id: "author-1",
          pass_id: "pass-1",
          session_date: "2026-08-02",
          duration_minutes: 30,
          created_at: "2026-08-02T09:00:00Z",
          position: { page: 150 },
        },
        passes: { item_type: "book", item_id: "book-1" },
        books: { title: "Libro", author: "Autora", cover_url: null, total_pages: 300 },
        notes: { body: "Qué giro", is_spoiler: true },
      }) as never,
      { sourceTable: "progress_sessions", rowId: "sess-1" },
    );
    expect(preview?.progress).toEqual({
      durationMinutes: 30,
      page: 150,
      percent: 50,
      note: { body: "Qué giro", isSpoiler: true },
    });
  });
});
