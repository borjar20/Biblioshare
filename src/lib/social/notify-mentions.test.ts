import { describe, it, expect } from "vitest";
import { resolveDeliverableMentions } from "./notify-mentions";

// Fake de supabase-js suficiente para las cadenas que usa
// resolveDeliverableMentions: select/eq/in + maybeSingle. A diferencia del
// sketch del brief, aquí SÍ se distingue maybeSingle() (resuelve a un objeto
// o null) de una cadena select().eq().in() normal (resuelve a un array) --
// mezclar ambas formas habría dejado pasar un bug real: profiles.maybeSingle()
// devuelve una fila suelta, no una lista de una fila.
type Row = Record<string, unknown>;

function makeFakeSupabase(tables: Record<string, Row[]>) {
  function queryBuilder(table: string) {
    const eqFilters: [string, unknown][] = [];
    const inFilters: [string, unknown[]][] = [];
    let maybeSingleFlag = false;

    function matchingRows(): Row[] {
      let rows = tables[table] ?? [];
      for (const [col, val] of eqFilters) rows = rows.filter((r) => r[col] === val);
      for (const [col, vals] of inFilters) rows = rows.filter((r) => vals.includes(r[col]));
      return rows;
    }

    async function exec(): Promise<{ data: unknown; error: null }> {
      const rows = matchingRows();
      if (maybeSingleFlag) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        eqFilters.push([col, val]);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        inFilters.push([col, vals]);
        return builder;
      },
      maybeSingle() {
        maybeSingleFlag = true;
        return exec();
      },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
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

describe("resolveDeliverableMentions — bloqueos", () => {
  it("excluye bloqueos en cualquiera de las dos direcciones", async () => {
    const supabase = makeFakeSupabase({
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
      gate: { kind: "profile", ownerId: "author" },
    });

    expect(out).toEqual(["ok"]);
  });
});

describe("resolveDeliverableMentions — perfil público", () => {
  it("entrega a todos los mencionados existentes menos el autor", async () => {
    const supabase = makeFakeSupabase({
      profile_identities: [
        { user_id: "u-borja", username: "borja" },
        { user_id: "u-ana", username: "ana" },
        { user_id: "author", username: "yo" },
      ],
      profiles: [{ user_id: "author", is_public: true }],
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@borja @ana @yo",
      gate: { kind: "profile", ownerId: "author" },
    });
    expect(out.sort()).toEqual(["u-ana", "u-borja"]);
  });
});

describe("resolveDeliverableMentions — perfil privado", () => {
  it("solo entrega a seguidores aceptados del dueño", async () => {
    const supabase = makeFakeSupabase({
      profile_identities: [
        { user_id: "u-borja", username: "borja" },
        { user_id: "u-ana", username: "ana" },
      ],
      profiles: [{ user_id: "owner", is_public: false }],
      follows: [
        { follower_id: "u-borja", followee_id: "owner", status: "accepted" },
        // ana no sigue al dueño -> no debe recibir la mención pese a estar mencionada.
      ],
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "owner",
      text: "@borja @ana",
      gate: { kind: "profile", ownerId: "owner" },
    });
    expect(out).toEqual(["u-borja"]);
  });

  it("un seguidor pendiente (no aceptado) no recibe la mención", async () => {
    const supabase = makeFakeSupabase({
      profile_identities: [{ user_id: "u-borja", username: "borja" }],
      profiles: [{ user_id: "owner", is_public: false }],
      follows: [{ follower_id: "u-borja", followee_id: "owner", status: "pending" }],
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "owner",
      text: "@borja",
      gate: { kind: "profile", ownerId: "owner" },
    });
    expect(out).toEqual([]);
  });
});

describe("resolveDeliverableMentions — club", () => {
  it("solo entrega a miembros activos del club", async () => {
    const supabase = makeFakeSupabase({
      profile_identities: [
        { user_id: "u-borja", username: "borja" },
        { user_id: "u-ana", username: "ana" },
      ],
      club_members: [{ user_id: "u-ana", club_id: "c1", status: "active" }],
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@borja @ana",
      gate: { kind: "club", clubId: "c1" },
    });
    expect(out).toEqual(["u-ana"]);
  });

  it("un miembro inactivo/expulsado no recibe la mención", async () => {
    const supabase = makeFakeSupabase({
      profile_identities: [{ user_id: "u-ana", username: "ana" }],
      club_members: [{ user_id: "u-ana", club_id: "c1", status: "removed" }],
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@ana",
      gate: { kind: "club", clubId: "c1" },
    });
    expect(out).toEqual([]);
  });

  it("un miembro activo de OTRO club no recibe la mención", async () => {
    const supabase = makeFakeSupabase({
      profile_identities: [{ user_id: "u-ana", username: "ana" }],
      club_members: [{ user_id: "u-ana", club_id: "c-other", status: "active" }],
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@ana",
      gate: { kind: "club", clubId: "c1" },
    });
    expect(out).toEqual([]);
  });
});

describe("resolveDeliverableMentions — sin menciones", () => {
  it("devuelve vacío sin tocar la BD", async () => {
    const supabase = makeFakeSupabase({});
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "a",
      text: "texto sin menciones",
      gate: { kind: "profile", ownerId: "a" },
    });
    expect(out).toEqual([]);
  });
});

describe("resolveDeliverableMentions — el autor nunca se autonotifica", () => {
  it("se excluye el autor aunque se mencione a sí mismo en perfil público", async () => {
    const supabase = makeFakeSupabase({
      profile_identities: [{ user_id: "author", username: "yo" }],
      profiles: [{ user_id: "author", is_public: true }],
    });
    const out = await resolveDeliverableMentions(supabase, {
      authorId: "author",
      text: "@yo",
      gate: { kind: "profile", ownerId: "author" },
    });
    expect(out).toEqual([]);
  });
});
