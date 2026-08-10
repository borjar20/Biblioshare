import { beforeEach, describe, expect, it, vi } from "vitest";

// Ancla el ruteo de los avisos `followed_*`: si el hito publicó un post, la
// notificación debe llevar el interaction_target_id de ESE post (href
// /post/[id]); si no hay post, cae al target original (ficha) sin cambiar nada.

const mocks = vi.hoisted(() => ({
  notifyMany: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("./notifications", () => ({ notifyMany: mocks.notifyMany }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { notifyFollowersOfEvent } from "./notify-followers";

type Row = Record<string, unknown>;

function makeFakeSupabase(tables: Record<string, Row[]>) {
  function queryBuilder(table: string) {
    const eqFilters: [string, unknown][] = [];
    const inFilters: [string, unknown[]][] = [];
    const containsFilters: [string, unknown[]][] = [];
    let maybeSingleFlag = false;
    let limitN: number | null = null;

    function matchingRows(): Row[] {
      let rows = tables[table] ?? [];
      for (const [column, value] of eqFilters) rows = rows.filter((r) => r[column] === value);
      for (const [column, values] of inFilters) rows = rows.filter((r) => values.includes(r[column]));
      for (const [column, values] of containsFilters) {
        rows = rows.filter((r) => {
          const arr = r[column];
          return Array.isArray(arr) && values.every((v) => arr.includes(v));
        });
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    }

    async function exec(): Promise<{ data: unknown; error: null }> {
      const rows = matchingRows();
      return { data: maybeSingleFlag ? (rows[0] ?? null) : rows, error: null };
    }

    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        eqFilters.push([column, value]);
        return builder;
      },
      in(column: string, values: unknown[]) {
        inFilters.push([column, values]);
        return builder;
      },
      contains(column: string, values: unknown[]) {
        containsFilters.push([column, values]);
        return builder;
      },
      order() {
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      maybeSingle() {
        maybeSingleFlag = true;
        return exec();
      },
      then(resolve: (value: unknown) => void, reject: (error: unknown) => void) {
        exec().then(resolve, reject);
      },
    };
    return builder;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => queryBuilder(table) as any } as any;
}

const FOLLOWER = { follower_id: "seguidor", followee_id: "autor", status: "accepted" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyMany.mockResolvedValue(["seguidor"]);
  // El fan-out lee follows por service-role; el resto de tablas (posts, sesiones,
  // interaction_targets) las lee el cliente de petición que se pasa a la función.
  mocks.createServiceRoleClient.mockReturnValue(
    makeFakeSupabase({ follows: [{ ...FOLLOWER, notify_events: ["finished", "session", "added"] }] }),
  );
});

describe("notifyFollowersOfEvent — ruteo al post del hito", () => {
  it("finished con post publicado → interactionTargetId del post (no la ficha)", async () => {
    const supabase = makeFakeSupabase({
      posts: [{ id: "post-1", source_kind: "pass", source_id: "pase-1", kind: "finished" }],
      interaction_targets: [{ id: "it-post-1", kind: "post", source_id: "post-1" }],
    });

    await notifyFollowersOfEvent(supabase, "autor", "finished", {
      targetType: "diary_entry",
      targetId: "pase-1",
    });

    expect(mocks.notifyMany).toHaveBeenCalledTimes(1);
    const params = mocks.notifyMany.mock.calls[0][1];
    expect(params.interactionTargetId).toBe("it-post-1");
    expect(params.targetType).toBeUndefined();
    expect(params.targetId).toBeUndefined();
    // El colapso sigue clavado al pase, no al post.
    expect(params.dedupeKey).toBe("person:followed_finished:pase-1");
  });

  it("finished SIN post (autopost desactivado) → cae a la ficha (target original)", async () => {
    const supabase = makeFakeSupabase({ posts: [], interaction_targets: [] });

    await notifyFollowersOfEvent(supabase, "autor", "finished", {
      targetType: "diary_entry",
      targetId: "pase-1",
    });

    const params = mocks.notifyMany.mock.calls[0][1];
    expect(params.interactionTargetId).toBeUndefined();
    expect(params.targetType).toBe("diary_entry");
    expect(params.targetId).toBe("pase-1");
  });

  it("added no publica post → ficha aunque exista un post 'finished' del mismo pase", async () => {
    // Añadir no debe secuestrar el post de 'finished': son hitos distintos.
    const supabase = makeFakeSupabase({
      posts: [{ id: "post-1", source_kind: "pass", source_id: "pase-1", kind: "finished" }],
      interaction_targets: [{ id: "it-post-1", kind: "post", source_id: "post-1" }],
    });

    await notifyFollowersOfEvent(supabase, "autor", "added", {
      targetType: "diary_entry",
      targetId: "pase-1",
    });

    const params = mocks.notifyMany.mock.calls[0][1];
    expect(params.interactionTargetId).toBeUndefined();
    expect(params.targetType).toBe("diary_entry");
  });

  it("session compartida → post 'progressed' de una sesión de ese pase", async () => {
    const supabase = makeFakeSupabase({
      progress_sessions: [{ id: "ses-1", pass_id: "pase-1" }],
      posts: [
        { id: "post-p", source_kind: "progress_session", source_id: "ses-1", kind: "progressed" },
      ],
      interaction_targets: [{ id: "it-post-p", kind: "post", source_id: "post-p" }],
    });

    await notifyFollowersOfEvent(supabase, "autor", "session", {
      targetType: "diary_entry",
      targetId: "pase-1",
    });

    const params = mocks.notifyMany.mock.calls[0][1];
    expect(params.interactionTargetId).toBe("it-post-p");
  });
});
