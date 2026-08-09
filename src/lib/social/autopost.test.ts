import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createPost: vi.fn() }));
vi.mock("./post-actions", () => ({ createPost: mocks.createPost }));

import { maybeAutopostMilestone } from "./autopost";

// Doble mínimo: `maybeAutopostMilestone` solo lee post_preferences. `prefs` es
// la fila devuelta; `null` = sin fila => defaults de columna (finished ON, resto
// OFF).
function makeClient(prefs: Record<string, boolean> | null) {
  return {
    from(table: string) {
      if (table !== "post_preferences") throw new Error(`Tabla inesperada: ${table}`);
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          return { data: prefs, error: null };
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const base = {
  userId: "u1",
  passId: "p1",
  itemType: "book" as const,
  itemId: "b1",
  created: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPost.mockResolvedValue({ ok: true, id: "post-1" });
});

describe("maybeAutopostMilestone", () => {
  it("to=in_progress con autopost_started=false => no publica", async () => {
    await maybeAutopostMilestone(
      makeClient({ autopost_started: false, autopost_finished: true, autopost_dropped: false }),
      { ...base, to: "in_progress", closed: false },
    );
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("to=in_progress con autopost_started=true => publica started", async () => {
    await maybeAutopostMilestone(
      makeClient({ autopost_started: true, autopost_finished: true, autopost_dropped: false }),
      { ...base, to: "in_progress", closed: false },
    );
    expect(mocks.createPost).toHaveBeenCalledWith({
      kind: "started",
      anchorType: "book",
      anchorId: "b1",
      sourceKind: "pass",
      sourceId: "p1",
    });
  });

  it("completed cerrado sin fila de prefs (default finished ON) => publica finished", async () => {
    await maybeAutopostMilestone(makeClient(null), { ...base, to: "completed", closed: true });
    expect(mocks.createPost).toHaveBeenCalledWith({
      kind: "finished",
      anchorType: "book",
      anchorId: "b1",
      sourceKind: "pass",
      sourceId: "p1",
    });
  });

  it("to=dropped con default (dropped OFF) => no publica", async () => {
    await maybeAutopostMilestone(makeClient(null), { ...base, to: "dropped", closed: true });
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("best-effort: si createPost lanza, no propaga", async () => {
    mocks.createPost.mockRejectedValue(new Error("boom"));
    await expect(
      maybeAutopostMilestone(makeClient(null), { ...base, to: "completed", closed: true }),
    ).resolves.toBeUndefined();
  });
});
