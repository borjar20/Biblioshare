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

import { listNotifications, notifyMany } from "./notifications";
import { notifyClub } from "../clubs/activities/notify-club";

type Row = Record<string, unknown>;

// Fake de supabase-js suficiente para las cadenas que usa notifications.ts:
// select/delete/insert + eq/in/order/limit/maybeSingle, resueltas contra un
// mapa de tablas en memoria. No reproduce RLS ni el cleanup por edad de
// listNotifications (irrelevante aquí) -- delete() es un no-op a propósito.
function makeFakeSupabase(tables: Record<string, Row[]>) {
  function queryBuilder(table: string) {
    const eqFilters: [string, unknown][] = [];
    const inFilters: [string, unknown[]][] = [];
    let mode: "select" | "delete" | "insert" = "select";
    let insertRows: Row[] = [];
    let maybeSingleFlag = false;

    function matchingRows(): Row[] {
      let rows = tables[table] ?? [];
      for (const [col, val] of eqFilters) rows = rows.filter((r) => r[col] === val);
      for (const [col, vals] of inFilters) rows = rows.filter((r) => vals.includes(r[col]));
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
      select() {
        mode = "select";
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
      neq() {
        return builder;
      },
      is() {
        return builder;
      },
      or() {
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
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
    notifications: [],
  };
}

beforeEach(() => {
  sendPushToUser.mockClear();
  sendPushToUsers.mockClear();
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
