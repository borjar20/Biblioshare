// Barrido del cron (spec 2026-10-06 §2 y §6). Idempotente por (user_id, kind):
// un reintento de pg_net recalcula el mismo periodo y no repite el push.
import { getTranslations } from "next-intl/server";
import { sendPushToUser } from "@/lib/push/send-push";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { buildWrapUp } from "./build";
import type { WrapUpPayload } from "./types";
import { wrapUpWindow, type WrapUpKind, type WrapUpWindow } from "./windows";

type AdminClient = ReturnType<typeof createServiceRoleClient>;
type UserRow = { user_id: string };
type UserPage = PromiseLike<{ data: UserRow[] | null; error?: unknown }>;

export type SweepReport = { candidates: number; written: number; deleted: number; pushed: number; failed: number };
export type SweepDeps = {
  candidates: (w: WrapUpWindow) => Promise<string[]>;
  build: (userId: string, w: WrapUpWindow) => Promise<WrapUpPayload | null>;
  current: (userId: string, kind: WrapUpKind) => Promise<{ period_start: string } | null>;
  upsert: (userId: string, p: WrapUpPayload, samePeriod: boolean) => Promise<boolean>;
  remove: (userId: string, kind: WrapUpKind, periodStart: string) => Promise<boolean>;
  push: (userId: string, p: WrapUpPayload) => Promise<void>;
};

export async function sweepWrapUps(kind: WrapUpKind, now: Date, deps: SweepDeps): Promise<SweepReport> {
  const w = wrapUpWindow(kind, now);
  const users = await deps.candidates(w);
  const report: SweepReport = { candidates: users.length, written: 0, deleted: 0, pushed: 0, failed: 0 };
  for (const userId of users) {
    try {
      const payload = await deps.build(userId, w);
      if (!payload) {
        if (await deps.remove(userId, kind, w.start)) report.deleted += 1;
        continue;
      }
      const before = await deps.current(userId, kind);
      const samePeriod = before?.period_start === payload.periodStart;
      const written = await deps.upsert(userId, payload, samePeriod);
      if (!written) continue;
      report.written += 1;
      if (payload.intensity === "full" && !samePeriod) {
        await deps.push(userId, payload);
        report.pushed += 1;
      }
    } catch (e) {
      report.failed += 1;
      // Solo el mensaje: ningún id de usuario en los logs.
      console.error("sweepWrapUps: usuario fallido", e instanceof Error ? e.message : e);
    }
  }
  return report;
}

export function adminSweepDeps(admin: AdminClient): SweepDeps {
  return {
    async candidates(w) {
      // Cruzan a TODOS los usuarios: pueden pasar de 1000 filas, de ahí readAllRows.
      // Se ordena por id (único) para que la paginación por offset sea estable.
      const inWindow = (table: "progress_sessions" | "episode_watches" | "passes", col: string) =>
        readAllRows<UserRow>((from, to) => admin.from(table).select("user_id")
          .gte(col, w.start).lt(col, w.endExclusive).order("id").range(from, to) as unknown as UserPage);
      const [sessions, watches, passes, existing, experiences] = await Promise.all([
        inWindow("progress_sessions", "session_date"),
        inWindow("episode_watches", "watched_on"),
        inWindow("passes", "finished_on"),
        // Quien ya tiene fila de este kind entra para que se la borre si ya no hay actividad.
        readAllRows<UserRow>((from, to) => admin.from("wrap_ups").select("user_id")
          .eq("kind", w.kind).order("user_id").range(from, to) as unknown as UserPage),
        readAllRows<{ creator_id: string }>((from, to) => admin.from("experiences").select("creator_id")
          .eq("audience", "profile").eq("state", "lived").lt("starts_on", w.endExclusive)
          .or(`ends_on.gte.${w.start},and(ends_on.is.null,starts_on.gte.${w.start})`)
          .order("id").range(from, to) as unknown as PromiseLike<{ data: { creator_id: string }[] | null; error?: unknown }>),
      ]);
      return [...new Set([...sessions, ...watches, ...passes, ...existing].map((r) => r.user_id).concat(experiences.map((r) => r.creator_id)))];
    },
    build: (userId, w) => buildWrapUp(admin as unknown as Parameters<typeof buildWrapUp>[0], userId, w),
    async current(userId, kind) {
      const { data, error } = await admin.from("wrap_ups").select("period_start")
        .eq("user_id", userId).eq("kind", kind).maybeSingle();
      if (error) throw error;
      return data;
    },
    async upsert(userId, p, samePeriod) {
      if (samePeriod) {
        // Reintento del mismo periodo: no reencender el anillo ni romper la publicación.
        const { data, error } = await admin.from("wrap_ups")
          .update({ intensity: p.intensity, payload: p as never, generated_at: new Date().toISOString() })
          .eq("user_id", userId).eq("kind", p.kind).eq("period_start", p.periodStart)
          .is("published_post_id", null).is("refreshed_at", null).select("kind");
        if (error) throw error;
        return Boolean(data?.length);
      }
      // Sustitución monotónica y atómica: sólo un barrido gana y reclama el push.
      const values = {
        user_id: userId, kind: p.kind, period_start: p.periodStart, period_end: p.periodEnd,
        intensity: p.intensity, payload: p as never, generated_at: new Date().toISOString(),
        seen_at: null, refreshed_at: null, published_post_id: null,
      };
      const { data, error } = await admin.from("wrap_ups").update(values)
        .eq("user_id", userId).eq("kind", p.kind).lt("period_start", p.periodStart).select("kind");
      if (error) throw error;
      if (data?.length) return true;
      const inserted = await admin.from("wrap_ups").insert(values).select("kind");
      if (inserted.error?.code === "23505") return false; // otra generación ya ganó, o existe un periodo más nuevo
      if (inserted.error) throw inserted.error;
      return Boolean(inserted.data?.length);
    },
    async remove(userId, kind, periodStart) {
      const { data, error } = await admin.from("wrap_ups").delete().eq("user_id", userId).eq("kind", kind).lte("period_start", periodStart)
        .or(`period_start.lt.${periodStart},published_post_id.is.null`).select("kind");
      if (error) throw error;
      return Boolean(data?.length);
    },
    async push(userId, p) {
      const t = await getTranslations("wrapUps.push");
      await sendPushToUser(userId, {
        category: "progress", type: "wrap_up_ready",
        title: t(`title.${p.kind}`), body: t(`body.${p.narrator}`), path: `/wrap/${p.kind}`,
      });
    },
  };
}
