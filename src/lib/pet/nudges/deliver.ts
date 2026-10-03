import { getTranslations } from "next-intl/server";
import { createPushSendReport, sendPushToUser } from "@/lib/push/send-push";
import type { PushContent, PushSendReport } from "@/lib/push/types";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import { petNudgeCopy, type NudgeT } from "./copy";
import { isPetNudgeKind, PET_NUDGE_TYPE } from "./types";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

/** Fila que devuelve claim_pet_nudges() (20260906). */
export type ClaimRow = { user_id: string; name: string; kind: string; streak: number | null };

// claimed/unknownKind cuentan FILAS; pushRequests suma una solicitud por fila
// válida (no promete usuarios distintos en el barrido). deviceResults cuenta
// un resultado por dispositivo y solicitud; accepted solo acredita un ACK.
export type NudgeReport = {
  claimed: number;
  unknownKind: number;
  pushRequests: PushSendReport["users"];
  deviceResults: PushSendReport["devices"];
};

type Deps = {
  send?: (userId: string, content: PushContent) => Promise<PushSendReport>;
  t?: NudgeT;
};

// Entrega de los avisos de la mascota (spec §3). Claim en SQL (decide el día,
// los candidatos y el tipo; inserta pet_nudges y devuelve SOLO lo nuevo) y un
// push por fila. Si un envío falla después del claim, la fila queda y NO se
// reintenta ese día: un «tu racha se acaba» a las 23:00 por reintento es peor
// que ninguno. Módulo plano (sin "use server"): lo llama la ruta del cron.
export async function deliverPetNudges(admin: AdminClient, deps: Deps = {}): Promise<NudgeReport> {
  const { data, error } = await admin.rpc("claim_pet_nudges");
  if (error) throw error;
  const rows = (data ?? []) as ClaimRow[];
  const empty = createPushSendReport();
  const report: NudgeReport = {
    claimed: rows.length, unknownKind: 0, pushRequests: empty.users, deviceResults: empty.devices,
  };
  if (rows.length === 0) return report;

  const send = deps.send ?? sendPushToUser;
  const t: NudgeT = deps.t ?? (await getTranslations("pet"));

  for (const row of rows) {
    if (!isPetNudgeKind(row.kind)) {
      report.unknownKind += 1;
      console.error("deliverPetNudges: kind desconocido", row.kind);
      continue;
    }
    const content: PushContent = {
      category: "pet",
      type: PET_NUDGE_TYPE[row.kind],
      title: row.name,
      ...petNudgeCopy(row.kind, row.streak, t),
      path: "/mascota",
    };
    try {
      const result = await send(row.user_id, content);
      for (const key of Object.keys(result.users) as (keyof PushSendReport["users"])[]) {
        report.pushRequests[key] += result.users[key];
      }
      for (const key of Object.keys(result.devices) as (keyof PushSendReport["devices"])[]) {
        report.deviceResults[key] += result.devices[key];
      }
    } catch (e) {
      // sendPushToUser no lanza; esto cubre un `send` inyectado o un fallo raro.
      report.pushRequests.requested += 1;
      report.pushRequests.failed += 1;
      console.error("deliverPetNudges: envío fallido", e);
    }
  }
  return report;
}
