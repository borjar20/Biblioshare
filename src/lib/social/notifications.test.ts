import { describe, it, expect, vi, beforeEach } from "vitest";

// notifications.ts hace I/O real (supabase, next-intl/server, push) — se
// mockean sus tres dependencias externas para poder ejercer resolveTargetHrefs
// (privada) a través de sus dos únicos consumidores públicos: listNotifications
// (campana in-app) y notifyMany (fan-out + payload push). El objetivo de este
// test es justo comprobar que ambos comparten la misma resolución: un target
// 'club_event' (evento de club, sin página de detalle -- ver notify-club.ts)
// debe enlazar a la ficha del club en los dos casos, mientras que un
// 'club_activity' hermano debe seguir enlazando a /actividad/[id] en ambos.

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => {
    return (key: string, vars?: Record<string, unknown>) =>
      `${namespace}.${key}${vars ? `:${JSON.stringify(vars)}` : ""}`;
  }),
}));

const sendPushToUser = vi.fn();
const sendPushToUsers = vi.fn();
vi.mock("@/lib/push/send-push", () => ({
  sendPushToUser: (...args: unknown[]) => sendPushToUser(...args),
  sendPushToUsers: (...args: unknown[]) => sendPushToUsers(...args),
}));

const trustedWriter = vi.hoisted(() => ({
  create: vi.fn(),
}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => trustedWriter.create(),
}));

import { listNotifications, notify, notifyMany } from "./notifications";
import { notifyClub } from "../clubs/activities/notify-club";

type Row = Record<string, unknown>;

// Fake de supabase-js suficiente para las cadenas que usa notifications.ts:
// select/delete/insert + eq/in/order/limit/maybeSingle, resueltas contra un
// mapa de tablas en memoria. No reproduce RLS ni el cleanup por edad de
// listNotifications (irrelevante aquí) -- delete() es un no-op a propósito.
function makeFakeSupabase(tables: Record<string, Row[]>, queriedTables: string[] = []) {
  function queryBuilder(table: string) {
    const eqFilters: [string, unknown][] = [];
    const neqFilters: [string, unknown][] = [];
    const isFilters: [string, unknown][] = [];
    const inFilters: [string, unknown[]][] = [];
    let mode: "select" | "delete" | "insert" = "select";
    let insertRows: Row[] = [];
    let maybeSingleFlag = false;
    let selectedColumns: string[] | null = null;
    let orderBy: { column: string; ascending: boolean } | null = null;
    let rowLimit: number | null = null;

    function matchingRows(): Row[] {
      let rows = [...(tables[table] ?? [])];
      for (const [col, val] of eqFilters) rows = rows.filter((r) => r[col] === val);
      for (const [col, val] of neqFilters) rows = rows.filter((r) => r[col] !== val);
      for (const [col, val] of isFilters) rows = rows.filter((r) => r[col] === val);
      for (const [col, vals] of inFilters) rows = rows.filter((r) => vals.includes(r[col]));
      if (orderBy) {
        const { column, ascending } = orderBy;
        rows.sort((a, b) => {
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return left.localeCompare(right) * (ascending ? 1 : -1);
        });
      }
      if (rowLimit !== null) rows = rows.slice(0, rowLimit);
      if (selectedColumns) {
        rows = rows.map((row) =>
          Object.fromEntries(selectedColumns!.map((column) => [column, row[column]])),
        );
      }
      return rows;
    }

    async function exec(): Promise<{ data: unknown; error: null }> {
      if (mode === "delete") {
        // No-op a propósito: el cleanup por edad no es lo que este test verifica.
        return { data: null, error: null };
      }
      if (mode === "insert") {
        tables[table] = [...(tables[table] ?? []), ...insertRows];
        return { data: insertRows, error: null };
      }
      const rows = matchingRows();
      if (maybeSingleFlag) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    const builder = {
      select(columns = "*") {
        mode = "select";
        selectedColumns =
          columns === "*" ? null : columns.split(",").map((column: string) => column.trim());
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      insert(rows: Row | Row[]) {
        mode = "insert";
        insertRows = Array.isArray(rows) ? rows : [rows];
        return builder;
      },
      eq(col: string, val: unknown) {
        eqFilters.push([col, val]);
        return builder;
      },
      neq(col: string, val: unknown) {
        neqFilters.push([col, val]);
        return builder;
      },
      is(col: string, val: unknown) {
        isFilters.push([col, val]);
        return builder;
      },
      or() {
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderBy = { column, ascending: options?.ascending ?? true };
        return builder;
      },
      limit(count: number) {
        rowLimit = count;
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
    from: (table: string) => {
      queriedTables.push(table);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return queryBuilder(table) as any;
    },
    rpc: async (name: string, args: { other_user_id?: string; candidate_ids?: string[] }) => {
      const blocks = tables.user_blocks ?? [];
      const actorId = "actor-1";
      const isBlocked = (otherId: string) =>
        blocks.some(
          (row) =>
            (row.blocker_id === actorId && row.blocked_id === otherId) ||
            (row.blocker_id === otherId && row.blocked_id === actorId),
        );
      if (name === "users_are_blocked") {
        return { data: isBlocked(args.other_user_id ?? ""), error: null };
      }
      if (name === "filter_unblocked_user_ids") {
        return {
          data: (args.candidate_ids ?? []).filter((id) => !isBlocked(id)),
          error: null,
        };
      }
      return { data: null, error: { message: `RPC inesperada: ${name}` } };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function baseTables(): Record<string, Row[]> {
  return {
    clubs: [{ id: "club-1", slug: "club-lectura" }],
    club_activities: [
      { id: "event-1", club_id: "club-1" },
      { id: "activity-1", club_id: "club-1" },
    ],
    club_members: [
      { user_id: "actor-1", club_id: "club-1", status: "active" },
      { user_id: "user-2", club_id: "club-1", status: "active" },
    ],
    profile_identities: [
      { user_id: "actor-1", username: "ana", display_name: "Ana", avatar_url: null },
    ],
    interaction_targets: [
      {
        id: "target-post",
        kind: "club_post",
        source_id: "post-1",
        owner_id: "user-1",
        audience_kind: "club_member",
        audience_id: "club-1",
        href: "/club/club-lectura",
        commentable: true,
        reactable: true,
        comment_notification_type: "club_post_commented",
        reaction_notification_type: "club_post_liked",
      },
      {
        id: "target-comment",
        kind: "comment",
        source_id: "comment-1",
        owner_id: "user-1",
        audience_kind: "club_member",
        audience_id: "club-1",
        href: "/club/club-lectura",
        commentable: false,
        reactable: true,
        comment_notification_type: null,
        reaction_notification_type: "comment_liked",
      },
      {
        id: "target-pass",
        kind: "pass",
        source_id: "pass-1",
        owner_id: "user-1",
        audience_kind: "profile",
        audience_id: "user-1",
        href: "/libro/book-1",
        commentable: true,
        reactable: true,
        comment_notification_type: "activity_commented",
        reaction_notification_type: "activity_liked",
      },
    ],
    notifications: [],
  };
}

beforeEach(() => {
  sendPushToUser.mockClear();
  sendPushToUsers.mockClear();
  trustedWriter.create.mockReset();
});

describe("notificaciones — frontera de bloqueo", () => {
  it("notify no escribe ni entrega push a una pareja bloqueada", async () => {
    const callerTables = baseTables();
    callerTables.user_blocks = [{ blocker_id: "actor-1", blocked_id: "blocked" }];
    const writerTables: Record<string, Row[]> = { notifications: [] };
    const caller = makeFakeSupabase(callerTables);
    trustedWriter.create.mockReturnValue(makeFakeSupabase(writerTables));

    await notify(caller, {
      userId: "blocked",
      actorId: "actor-1",
      type: "new_follower",
    });

    expect(writerTables.notifications).toHaveLength(0);
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("notifyMany elimina ambas direcciones bloqueadas antes del insert y del push", async () => {
    const callerTables = baseTables();
    callerTables.user_blocks = [
      { blocker_id: "actor-1", blocked_id: "blocked" },
      { blocker_id: "blocked-by", blocked_id: "actor-1" },
    ];
    const writerTables: Record<string, Row[]> = { notifications: [] };
    const caller = makeFakeSupabase(callerTables);
    trustedWriter.create.mockReturnValue(makeFakeSupabase(writerTables));

    await notifyMany(caller, {
      userIds: ["blocked", "blocked-by", "visible"],
      actorId: "actor-1",
      type: "club_event_created",
      targetType: "club_event",
      targetId: "event-1",
    });

    expect(writerTables.notifications.map((row) => row.user_id)).toEqual(["visible"]);
    expect(sendPushToUsers).toHaveBeenCalledWith(
      ["visible"],
      expect.objectContaining({ url: "/club/club-lectura" }),
    );
  });
});

describe("escritura confiable de notificaciones", () => {
  it("notify escribe con service role y conserva el cliente del usuario para resolver el push", async () => {
    const callerTables = baseTables();
    const writerTables: Record<string, Row[]> = { notifications: [] };
    const caller = makeFakeSupabase(callerTables);
    trustedWriter.create.mockReturnValue(makeFakeSupabase(writerTables));

    await notify(caller, {
      userId: "user-2",
      actorId: "actor-1",
      type: "club_event_created",
      targetType: "club_event",
      targetId: "event-1",
    });

    expect(callerTables.notifications).toHaveLength(0);
    expect(writerTables.notifications).toEqual([
      expect.objectContaining({
        user_id: "user-2",
        actor_id: "actor-1",
        target_type: "club_event",
        target_id: "event-1",
      }),
    ]);
    expect(sendPushToUser).toHaveBeenCalledWith(
      "user-2",
      expect.objectContaining({ url: "/club/club-lectura" }),
    );
  });

  it("notifyMany escribe el lote con service role sin delegar el fan-out al cliente del usuario", async () => {
    const callerTables = baseTables();
    const writerTables: Record<string, Row[]> = { notifications: [] };
    const caller = makeFakeSupabase(callerTables);
    trustedWriter.create.mockReturnValue(makeFakeSupabase(writerTables));

    await notifyMany(caller, {
      userIds: ["user-2", "user-3", "user-2", "actor-1"],
      actorId: "actor-1",
      type: "club_event_created",
      targetType: "club_event",
      targetId: "event-1",
    });

    expect(callerTables.notifications).toHaveLength(0);
    expect(writerTables.notifications).toHaveLength(2);
    expect(writerTables.notifications.map((row) => row.user_id)).toEqual(["user-2", "user-3"]);
    expect(sendPushToUsers).toHaveBeenCalledWith(
      ["user-2", "user-3"],
      expect.objectContaining({ url: "/club/club-lectura" }),
    );
  });

  it("notify escribe el target canónico y usa su href para el push", async () => {
    const callerTables = baseTables();
    const writerTables: Record<string, Row[]> = { notifications: [] };
    const queriedTables: string[] = [];
    const caller = makeFakeSupabase(callerTables, queriedTables);
    trustedWriter.create.mockReturnValue(makeFakeSupabase(writerTables));

    await notify(caller, {
      userId: "user-2",
      actorId: "actor-1",
      type: "club_post_liked",
      interactionTargetId: "target-post",
    });

    expect(writerTables.notifications).toEqual([
      expect.objectContaining({
        user_id: "user-2",
        actor_id: "actor-1",
        type: "club_post_liked",
        interaction_target_id: "target-post",
        target_type: null,
        target_id: null,
      }),
    ]);
    expect(sendPushToUser).toHaveBeenCalledWith(
      "user-2",
      expect.objectContaining({ url: "/club/club-lectura" }),
    );
    expect(queriedTables).toContain("interaction_targets");
    expect(queriedTables).not.toContain("club_posts");
    expect(queriedTables).not.toContain("clubs");
  });

  it("notifyMany propaga el target canónico a todo el lote", async () => {
    const callerTables = baseTables();
    const writerTables: Record<string, Row[]> = { notifications: [] };
    const caller = makeFakeSupabase(callerTables);
    trustedWriter.create.mockReturnValue(makeFakeSupabase(writerTables));

    await notifyMany(caller, {
      userIds: ["user-2", "user-3"],
      actorId: "actor-1",
      type: "activity_commented",
      interactionTargetId: "target-pass",
    });

    expect(writerTables.notifications).toHaveLength(2);
    expect(writerTables.notifications.every((row) => row.interaction_target_id === "target-pass"))
      .toBe(true);
    expect(sendPushToUsers).toHaveBeenCalledWith(
      ["user-2", "user-3"],
      expect.objectContaining({ url: "/libro/book-1" }),
    );
  });
});

describe("notificaciones canónicas — agrupación por tipo y target", () => {
  it("agrupa solo reacciones equivalentes y conserva comentarios individuales", async () => {
    const tables = baseTables();
    tables.profile_identities = [
      { user_id: "actor-1", username: "ana", display_name: "Ana", avatar_url: null },
      { user_id: "actor-2", username: "bea", display_name: "Bea", avatar_url: null },
      { user_id: "actor-3", username: "cora", display_name: "Cora", avatar_url: null },
      { user_id: "actor-4", username: "dani", display_name: "Dani", avatar_url: null },
      { user_id: "actor-5", username: "emma", display_name: "Emma", avatar_url: null },
      { user_id: "actor-6", username: "fede", display_name: "Fede", avatar_url: null },
    ];
    tables.notifications = [
      {
        id: "n-post-3",
        user_id: "user-1",
        actor_id: "actor-3",
        type: "club_post_liked",
        interaction_target_id: "target-post",
        target_type: null,
        target_id: null,
        read_at: null,
        created_at: "2026-08-01T12:00:00Z",
      },
      {
        id: "n-post-2",
        user_id: "user-1",
        actor_id: "actor-2",
        type: "club_post_liked",
        interaction_target_id: "target-post",
        target_type: null,
        target_id: null,
        read_at: null,
        created_at: "2026-08-01T11:00:00Z",
      },
      {
        id: "n-post-1",
        user_id: "user-1",
        actor_id: "actor-1",
        type: "club_post_liked",
        interaction_target_id: "target-post",
        target_type: null,
        target_id: null,
        read_at: null,
        created_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "n-comment-2",
        user_id: "user-1",
        actor_id: "actor-5",
        type: "comment_liked",
        interaction_target_id: "target-comment",
        target_type: null,
        target_id: null,
        read_at: null,
        created_at: "2026-08-01T09:00:00Z",
      },
      {
        id: "n-comment-1",
        user_id: "user-1",
        actor_id: "actor-4",
        type: "comment_liked",
        interaction_target_id: "target-comment",
        target_type: null,
        target_id: null,
        read_at: null,
        created_at: "2026-08-01T08:00:00Z",
      },
      {
        id: "n-activity-comment",
        user_id: "user-1",
        actor_id: "actor-6",
        type: "activity_commented",
        interaction_target_id: "target-pass",
        target_type: null,
        target_id: null,
        read_at: null,
        created_at: "2026-08-01T07:00:00Z",
      },
    ];
    const queriedTables: string[] = [];
    const listed = await listNotifications(makeFakeSupabase(tables, queriedTables), "user-1");

    expect(listed.map((n) => [n.type, n.interactionTargetId, n.extraActorsCount])).toEqual([
      ["club_post_liked", "target-post", 2],
      ["comment_liked", "target-comment", 1],
      ["activity_commented", "target-pass", undefined],
    ]);
    expect(listed.map((n) => n.href)).toEqual([
      "/club/club-lectura",
      "/club/club-lectura",
      "/libro/book-1",
    ]);
    expect(queriedTables).toContain("interaction_targets");
    expect(queriedTables).not.toContain("club_posts");
    expect(queriedTables).not.toContain("comments");
    expect(queriedTables).not.toContain("passes");
  });
});

describe("resolución de href de notificaciones — club_event vs club_activity", () => {
  it("listNotifications (campana): club_event_created enlaza a la ficha del club, club_activity_proposed a la actividad", async () => {
    const tables = baseTables();
    tables.notifications = [
      {
        id: "n-event",
        user_id: "user-1",
        actor_id: "actor-1",
        type: "club_event_created",
        interaction_target_id: null,
        target_type: "club_event",
        target_id: "event-1",
        read_at: null,
        created_at: "2026-07-22T10:00:00Z",
      },
      {
        id: "n-activity",
        user_id: "user-1",
        actor_id: "actor-1",
        type: "club_activity_proposed",
        interaction_target_id: null,
        target_type: "club_activity",
        target_id: "activity-1",
        read_at: null,
        created_at: "2026-07-22T09:00:00Z",
      },
    ];
    const supabase = makeFakeSupabase(tables);

    const result = await listNotifications(supabase, "user-1");
    const byId = new Map(result.map((n) => [n.id, n]));

    // El evento NO tiene página de detalle (404 a propósito) -- debe enlazar
    // a la ficha del club, nunca a /actividad/[id].
    expect(byId.get("n-event")?.href).toBe("/club/club-lectura");
    // Un club_activity hermano debe seguir yendo al detalle, sin cambios.
    expect(byId.get("n-activity")?.href).toBe("/club/club-lectura/actividad/activity-1");
  });

  it("notifyMany (payload push): comparte la misma resolución que la campana", async () => {
    const tables = baseTables();
    const supabase = makeFakeSupabase(tables);
    trustedWriter.create.mockReturnValue(supabase);

    await notifyMany(supabase, {
      userIds: ["user-2"],
      actorId: "actor-1",
      type: "club_event_created",
      targetType: "club_event",
      targetId: "event-1",
    });
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    const [, eventPayload] = sendPushToUsers.mock.calls[0];
    expect(eventPayload.url).toBe("/club/club-lectura");

    await notifyMany(supabase, {
      userIds: ["user-2"],
      actorId: "actor-1",
      type: "club_activity_proposed",
      targetType: "club_activity",
      targetId: "activity-1",
    });
    expect(sendPushToUsers).toHaveBeenCalledTimes(2);
    const [, activityPayload] = sendPushToUsers.mock.calls[1];
    expect(activityPayload.url).toBe("/club/club-lectura/actividad/activity-1");
  });
});

describe("notifyClub — target_type escrito según el tipo de notificación", () => {
  // Cubre notify-club.ts directamente: los dos tests de arriba ejercen
  // resolveTargetHrefs() a través de notifyMany/listNotifications con un
  // target_type ya dado a mano, pero nunca pasan por el ternario de
  // notify-club.ts que decide ESE target_type. Revertir ese ternario a
  // 'club_activity' a secas deja el resto de la suite en verde -- estos tests
  // son los que lo detectan.
  it("club_event_created escribe target_type='club_event'", async () => {
    const tables = baseTables();
    const supabase = makeFakeSupabase(tables);

    trustedWriter.create.mockReturnValue(supabase);
    await notifyClub(supabase, "club-1", "actor-1", "club_event_created", "event-1");

    expect(tables.notifications).toHaveLength(1);
    expect(tables.notifications[0]).toMatchObject({
      type: "club_event_created",
      target_type: "club_event",
      target_id: "event-1",
    });
  });

  it("club_activity_proposed / activated / spawned escriben target_type='club_activity'", async () => {
    const activityTypes = [
      "club_activity_proposed",
      "club_activity_activated",
      "club_activity_spawned",
    ] as const;

    for (const type of activityTypes) {
      const tables = baseTables();
      const supabase = makeFakeSupabase(tables);

      trustedWriter.create.mockReturnValue(supabase);
      await notifyClub(supabase, "club-1", "actor-1", type, "activity-1");

      expect(tables.notifications).toHaveLength(1);
      expect(tables.notifications[0]).toMatchObject({
        type,
        target_type: "club_activity",
        target_id: "activity-1",
      });
    }
  });
});
