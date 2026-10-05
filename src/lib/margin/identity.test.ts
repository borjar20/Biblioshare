import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { searchMyFollowers } from "./follower-search";
import { getMarginThread } from "./queries";

// Simula la RLS real: `profiles` esconde al usuario privado (no lo sigo);
// `profile_identities` (vista sin security_invoker) lo expone.
const PRIVATE = { user_id: "priv", username: "marta", display_name: "Marta", avatar_url: null };
const PUBLIC = { user_id: "pub", username: "mario", display_name: "Mario", avatar_url: null };

function fakeClient(extra: Record<string, unknown[]> = {}) {
  const tables: Record<string, unknown[]> = {
    follows: [{ follower_id: "priv" }, { follower_id: "pub" }],
    profiles: [PUBLIC],
    profile_identities: [PRIVATE, PUBLIC],
    ...extra,
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "author" } } }) },
    from(table: string) {
      const rows = tables[table] ?? [];
      const q: Record<string, unknown> = {};
      const chain = () => q;
      for (const m of ["select", "eq", "limit", "in", "order", "range"]) q[m] = chain;
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      q.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
      return q;
    },
  };
  return client;
}

describe("identidad en notas en el margen", () => {
  it("la búsqueda de seguidores devuelve a un seguidor con perfil privado", async () => {
    mocks.createClient.mockResolvedValue(fakeClient());
    const found = await searchMyFollowers("mar");
    expect(found.map((p) => p.username).sort()).toEqual(["marta", "mario"].sort());
  });

  it("el hilo nombra al lector privado (no queda en blanco)", async () => {
    const client = fakeClient({
      margin_note_encounters: [
        { id: "e1", note_id: "n1", reader_id: "priv", found_at: "2026-01-01", found_via: "progress", seen_at: null },
      ],
      margin_notes: [
        {
          id: "n1", author_id: "author", item_type: "book", item_id: "b1", anchor: { kind: "finish" },
          chapter_label: null, body: "hola", is_spoiler: false, audience: "followers",
          recipient_id: null, created_at: "2026-01-01",
        },
      ],
    });
    const thread = await getMarginThread(client as never, "author", "e1");
    expect(thread?.foundBy?.[0].reader.username).toBe("marta");
  });
});
