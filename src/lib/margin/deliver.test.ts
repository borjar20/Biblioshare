import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.fn();
vi.mock("@/lib/social/notifications", () => ({ notify: (...a: unknown[]) => notify(...a) }));
vi.mock("server-only", () => ({}));

import { deliverMarginNotices } from "./deliver";

function client(rows: unknown[] | null, error: unknown = null, title: string | null = null) {
  const from = vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: title === null ? null : { title }, error: null }) }) }),
  }));
  return { rpc: vi.fn().mockResolvedValue({ data: rows, error }), from } as never;
}

const row = { encounter_id: "e1", reader_id: "r", author_id: "a", target_id: "t1", item_type: "book", item_id: "b", chapter_label: "Cap. 12" };

describe("deliverMarginNotices", () => {
  beforeEach(() => notify.mockReset());

  it("avisa al lector con el autor como actor y el hilo como destino", async () => {
    await deliverMarginNotices(client([row], null, "Dune"));
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "r", actorId: "a", type: "margin_note_dedicated", interactionTargetId: "t1",
      dedupeKey: "margin_note_dedicated:e1", context: { subject: "Dune" },
    }));
  });

  it("avisa sin título si la obra no se resuelve", async () => {
    await deliverMarginNotices(client([row], null, null));
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "r", context: undefined }));
  });

  it("nunca lanza aunque falle la RPC", async () => {
    await expect(deliverMarginNotices(client(null, new Error("boom")))).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });
});
