import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createPost: vi.fn() }));
vi.mock("./post-actions", () => ({ createPost: mocks.createPost }));

import { maybeAutopostWatchedDay } from "./autopost-watched";

// Doble mínimo: un builder encadenable por tabla que devuelve lo configurado.
function makeClient(opts: {
  prefs: { autopost_watched: boolean } | null;
  watchIds: string[];
  existingPost: boolean;
}) {
  return {
    from(table: string) {
      const result =
        table === "post_preferences"
          ? { data: opts.prefs, error: null }
          : table === "episode_watches"
            ? { data: opts.watchIds.map((id) => ({ id })), error: null }
            : table === "posts"
              ? { data: opts.existingPost ? [{ id: "post-x" }] : [], error: null }
              : (() => {
                  throw new Error(`Tabla inesperada: ${table}`);
                })();
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (v: typeof result) => unknown) => resolve(result),
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const input = { userId: "u1", seriesId: "s1", day: "2026-09-23" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPost.mockResolvedValue({ ok: true, id: "post-1" });
});

describe("maybeAutopostWatchedDay", () => {
  it("primer episodio del día y sin preferencias: publica colgado del primero", async () => {
    await maybeAutopostWatchedDay(makeClient({ prefs: null, watchIds: ["w1", "w2"], existingPost: false }), input);
    expect(mocks.createPost).toHaveBeenCalledWith({
      kind: "watched",
      anchorType: "series",
      anchorId: "s1",
      sourceKind: "episode_watch",
      sourceId: "w1",
    });
  });

  it("ya hay post ese día: no publica otro", async () => {
    await maybeAutopostWatchedDay(makeClient({ prefs: null, watchIds: ["w1", "w2"], existingPost: true }), input);
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("con la preferencia apagada no publica", async () => {
    await maybeAutopostWatchedDay(
      makeClient({ prefs: { autopost_watched: false }, watchIds: ["w1"], existingPost: false }),
      input,
    );
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("sin episodios ese día (desmarcado entre medias): no publica", async () => {
    await maybeAutopostWatchedDay(makeClient({ prefs: null, watchIds: [], existingPost: false }), input);
    expect(mocks.createPost).not.toHaveBeenCalled();
  });

  it("nunca lanza aunque falle la publicación", async () => {
    mocks.createPost.mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      maybeAutopostWatchedDay(makeClient({ prefs: null, watchIds: ["w1"], existingPost: false }), input),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
