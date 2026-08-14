import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  notifyMentions: vi.fn(),
  revalidateReadingLog: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/social/notify-mentions", () => ({ notifyMentions: mocks.notifyMentions }));
vi.mock("@/lib/reactivity/revalidate", () => ({
  revalidateReadingLog: mocks.revalidateReadingLog,
}));

import { closePass, parseDroppedReason } from "./actions";

function makePassClient(targetId: string | null, targetError: unknown = null) {
  const targetFilters: Array<[string, unknown]> = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "author" } } }) },
    from(table: string) {
      if (table === "passes") {
        const builder = {
          update() {
            return builder;
          },
          eq() {
            return builder;
          },
          then(resolve: (value: unknown) => void) {
            resolve({ error: null });
          },
        };
        return builder;
      }
      if (table === "interaction_targets") {
        const builder = {
          select() {
            return builder;
          },
          eq(column: string, value: unknown) {
            targetFilters.push([column, value]);
            return builder;
          },
          async maybeSingle() {
            return {
              data: targetId ? { id: targetId } : null,
              error: targetError,
            };
          },
        };
        return builder;
      }
      throw new Error(`Tabla inesperada: ${table}`);
    },
  };
  return { client, targetFilters };
}

function publicReviewForm() {
  const form = new FormData();
  form.set("finishedOn", "2026-07-30");
  form.set("review", "hola @ana");
  form.set("isPublic", "on");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyMentions.mockResolvedValue([]);
});

describe("parseDroppedReason", () => {
  it("vacío → null (motivo opcional)", () => {
    expect(parseDroppedReason(null)).toBeNull();
    expect(parseDroppedReason("")).toBeNull();
  });

  it("categoría válida → se conserva", () => {
    expect(parseDroppedReason("aburrido")).toBe("aburrido");
  });

  it("valor fuera de la lista → undefined (inválido)", () => {
    expect(parseDroppedReason("no_existe")).toBeUndefined();
  });
});

describe("closePass — menciones", () => {
  it("resuelve exactamente diary_entry:<passId>", async () => {
    const fake = makePassClient("target-diary");
    mocks.createClient.mockResolvedValue(fake.client);

    await closePass("pass-1", "book", "book-1", {}, publicReviewForm());

    expect(fake.targetFilters).toEqual([
      ["kind", "diary_entry"],
      ["source_id", "pass-1"],
    ]);
    expect(mocks.notifyMentions).toHaveBeenCalledWith(fake.client, {
      authorId: "author",
      text: "hola @ana",
      interactionTargetId: "target-diary",
    });
  });

  it("conserva el pase y revalida si la resolución del target falla", async () => {
    const fake = makePassClient(null, { message: "lookup failed" });
    mocks.createClient.mockResolvedValue(fake.client);

    await expect(
      closePass("pass-1", "book", "book-1", {}, publicReviewForm()),
    ).resolves.toEqual({});

    expect(mocks.notifyMentions).not.toHaveBeenCalled();
    expect(mocks.revalidateReadingLog).toHaveBeenCalledWith("book", "book-1");
  });
});
