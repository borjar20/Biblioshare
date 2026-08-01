import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyMany: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("./notifications", () => ({ notifyMany: mocks.notifyMany }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import { notifyMentions, resolveDeliverableMentions } from "./notify-mentions";

type Row = Record<string, unknown>;

function makeFakeSupabase(tables: Record<string, Row[]>) {
  function queryBuilder(table: string) {
    const eqFilters: [string, unknown][] = [];
    const inFilters: [string, unknown[]][] = [];
    let maybeSingleFlag = false;

    function matchingRows(): Row[] {
      let rows = tables[table] ?? [];
      for (const [column, value] of eqFilters) {
        rows = rows.filter((row) => row[column] === value);
      }
      for (const [column, values] of inFilters) {
        rows = rows.filter((row) => values.includes(row[column]));
      }
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

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => queryBuilder(table) as any,
    rpc: async (name: string, args: { candidate_ids: string[] }) => {
      if (name !== "filter_unblocked_user_ids") {
        return { data: null, error: { message: `RPC inesperada: ${name}` } };
      }
      const blocks = tables.user_blocks ?? [];
      const blockedIds = new Set(
        blocks
          .filter((row) => row.blocker_id === "author" || row.blocked_id === "author")
          .map((row) =>
            row.blocker_id === "author" ? row.blocked_id : row.blocker_id,
          ),
      );
      return {
        data: args.candidate_ids.filter((id) => !blockedIds.has(id)),
        error: null,
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function canonicalTarget(audienceKind: string, audienceId: string): Row {
  return {
    id: "target-1",
    audience_kind: audienceKind,
    audience_id: audienceId,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyMany.mockImplementation(
    async (_supabase: unknown, params: { userIds: string[] }) => params.userIds,
  );
});

describe("resolveDeliverableMentions — bloqueos", () => {
  it("excluye bloqueos en cualquiera de las dos direcciones", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("profile", "author")],
      profile_identities: [
        { user_id: "blocked", username: "bloqueado" },
        { user_id: "blocked-by", username: "mebloqueo" },
        { user_id: "ok", username: "visible" },
      ],
      profiles: [{ user_id: "author", is_public: true }],
      user_blocks: [
        { blocker_id: "author", blocked_id: "blocked" },
        { blocker_id: "blocked-by", blocked_id: "author" },
      ],
    });

    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@bloqueado @mebloqueo @visible",
      interactionTargetId: "target-1",
    });

    expect(out).toEqual(["ok"]);
  });
});

describe("resolveDeliverableMentions — perfil", () => {
  it("en perfil público entrega a todos menos al autor", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("profile", "owner")],
      profile_identities: [
        { user_id: "u-borja", username: "borja" },
        { user_id: "u-ana", username: "ana" },
        { user_id: "author", username: "yo" },
      ],
      profiles: [{ user_id: "owner", is_public: true }],
    });

    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@borja @ana @yo",
      interactionTargetId: "target-1",
    });

    expect(out.sort()).toEqual(["u-ana", "u-borja"]);
  });

  it("en perfil privado entrega solo a seguidores aceptados del dueño", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("profile", "owner")],
      profile_identities: [
        { user_id: "accepted", username: "aceptado" },
        { user_id: "pending", username: "pendiente" },
      ],
      profiles: [{ user_id: "owner", is_public: false }],
      follows: [
        { follower_id: "accepted", followee_id: "owner", status: "accepted" },
        { follower_id: "pending", followee_id: "owner", status: "pending" },
      ],
    });
    mocks.createServiceRoleClient.mockReturnValue(
      makeFakeSupabase({
        follows: [
          { follower_id: "accepted", followee_id: "owner", status: "accepted" },
          { follower_id: "pending", followee_id: "owner", status: "pending" },
        ],
      }),
    );

    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@aceptado @pendiente",
      interactionTargetId: "target-1",
    });

    expect(out).toEqual(["accepted"]);
  });

  it("usa service role para ver al otro seguidor aceptado de un owner privado", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("profile", "owner")],
      profile_identities: [{ user_id: "other-follower", username: "otra" }],
      profiles: [{ user_id: "owner", is_public: false }],
      follows: [
        { follower_id: "author", followee_id: "owner", status: "accepted" },
      ],
    });
    mocks.createServiceRoleClient.mockReturnValue(
      makeFakeSupabase({
        follows: [
          { follower_id: "author", followee_id: "owner", status: "accepted" },
          { follower_id: "other-follower", followee_id: "owner", status: "accepted" },
          { follower_id: "outsider", followee_id: "elsewhere", status: "accepted" },
        ],
      }),
    );

    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@otra",
      interactionTargetId: "target-1",
    });

    expect(out).toEqual(["other-follower"]);
  });
});

describe("resolveDeliverableMentions — audiencias canónicas", () => {
  it("entrega solo a miembros activos del club del target", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("club_member", "club-1")],
      profile_identities: [
        { user_id: "member", username: "dentro" },
        { user_id: "removed", username: "fuera" },
      ],
      club_members: [
        { club_id: "club-1", user_id: "member", status: "active" },
        { club_id: "club-1", user_id: "removed", status: "removed" },
      ],
    });

    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@dentro @fuera",
      interactionTargetId: "target-1",
    });

    expect(out).toEqual(["member"]);
  });

  it("entrega solo a participantes de la actividad del target", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("activity_participant", "activity-1")],
      profile_identities: [
        { user_id: "participant", username: "dentro" },
        { user_id: "outsider", username: "fuera" },
      ],
      club_activity_participants: [
        { activity_id: "activity-1", user_id: "participant" },
      ],
    });

    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@dentro @fuera",
      interactionTargetId: "target-1",
    });

    expect(out).toEqual(["participant"]);
  });

  it("entrega solo a quienes alcanzaron el checkpoint del target", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("checkpoint_reached", "checkpoint-1")],
      profile_identities: [
        { user_id: "reached", username: "llego" },
        { user_id: "behind", username: "atras" },
      ],
      club_activity_checkpoint_reads: [
        { checkpoint_id: "checkpoint-1", user_id: "reached" },
      ],
    });

    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@llego @atras",
      interactionTargetId: "target-1",
    });

    expect(out).toEqual(["reached"]);
  });
});

describe("notifyMentions", () => {
  it("notifica con el mismo interactionTargetId canónico", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("profile", "owner")],
      profile_identities: [{ user_id: "mentioned", username: "ana" }],
      profiles: [{ user_id: "owner", is_public: true }],
    });

    const notified = await notifyMentions(supabase, {
      authorId: "author",
      text: "hola @ana",
      interactionTargetId: "target-1",
    });

    expect(notified).toEqual(["mentioned"]);
    expect(mocks.notifyMany).toHaveBeenCalledWith(supabase, {
      userIds: ["mentioned"],
      actorId: "author",
      type: "mentioned",
      interactionTargetId: "target-1",
    });
  });

  it("devuelve vacío si el insert no confirma destinatarios", async () => {
    const supabase = makeFakeSupabase({
      interaction_targets: [canonicalTarget("profile", "owner")],
      profile_identities: [{ user_id: "owner", username: "duena" }],
      profiles: [{ user_id: "owner", is_public: true }],
    });
    mocks.notifyMany.mockResolvedValue([]);

    const notified = await notifyMentions(supabase, {
      authorId: "author",
      text: "hola @duena",
      interactionTargetId: "target-1",
    });

    expect(notified).toEqual([]);
  });

  it("sale sin consultar si no hay menciones", async () => {
    const supabase = makeFakeSupabase({});
    await expect(
      resolveDeliverableMentions(supabase, {
        authorId: "author",
        text: "sin menciones",
        interactionTargetId: "missing",
      }),
    ).resolves.toEqual([]);
  });
});
