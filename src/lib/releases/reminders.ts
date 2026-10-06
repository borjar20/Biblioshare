import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyMany } from "@/lib/social/notifications";
import { buildSubject } from "@/lib/social/notification-context";
import type { NotificationType } from "@/lib/social/notification-types";
import type { ReleaseDeliveryClaim, ReleaseDeliveryReason } from "./types";
import { formatReleaseDate } from "./precision";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
export type ReleaseDeliveryReport = { claimed: number; accepted: number; suppressed: number; retried: number; failed: number };

const notificationType: Record<ReleaseDeliveryReason, NotificationType> = {
  reminder: "release_reminder", confirmed: "release_updated", changed: "release_updated", cancelled: "release_cancelled",
};

export function releaseNoticeBody(claim: ReleaseDeliveryClaim): string {
  const row = claim.release_payload;
  const subject = buildSubject(row.title);
  const modality = { cinema: "cine", digital: "estreno digital", series: "nueva serie", season: `temporada ${row.season_number}`, book: "libro", book_translation: "traducción al castellano" }[row.modality];
  const market = row.market === "INT" ? " Fecha internacional." : " En España.";
  if (claim.reason === "cancelled") return `Se ha cancelado el lanzamiento de ${subject} (${modality}).${market}`;
  const event = { reminder: "Próximo lanzamiento", confirmed: "Fecha confirmada", changed: "Fecha actualizada" }[claim.reason];
  return `${event}: ${subject} (${modality}), ${formatReleaseDate(row)}.${market}`;
}

/** accepted counts persisted in-app notifications, never provider ACKs or device receipts. */
export async function deliverReleaseNotices(admin: ServiceClient, limit = 50, now = new Date()): Promise<ReleaseDeliveryReport> {
  const { data, error } = await admin.rpc("claim_release_deliveries", { p_limit: limit, p_now: now.toISOString() });
  if (error) throw error;
  const claims = (data ?? []) as unknown as ReleaseDeliveryClaim[];
  const report: ReleaseDeliveryReport = { claimed: claims.length, accepted: 0, suppressed: 0, retried: 0, failed: 0 };
  for (const claim of claims) {
    try {
      const { data: current, error: guardError } = await admin.rpc("release_delivery_is_current", { p_delivery_id: claim.id, p_claim_token: claim.claim_token });
      if (guardError) throw guardError;
      if (!current) {
        // Atomic acceptance observes the invalid generation/revision and seals the stale claim as suppressed.
        const { error } = await admin.rpc("accept_release_delivery", { p_delivery_id: claim.id, p_claim_token: claim.claim_token });
        if (error) throw error;
        const { data: ledger, error: ledgerError } = await admin.from("release_deliveries").select("accepted_at, state").eq("id", claim.id).maybeSingle();
        if (ledgerError) throw ledgerError;
        if (ledger?.state === "suppressed") { report.suppressed++; continue; }
        if (ledger?.accepted_at) { report.accepted++; continue; }
        throw new Error("claim_expired");
      }
      const accepted = await notifyMany(admin as never, {
        userIds: [claim.user_id], actorId: null, type: notificationType[claim.reason],
        targetType: "release", targetId: claim.release_id, systemDelivery: true,
        releaseDelivery: { id: claim.id, claimToken: claim.claim_token },
        dedupeKey: claim.notification_dedupe_key.slice(0, -(claim.user_id.length + 1)),
        context: { subject: buildSubject(claim.release_payload.title) }, pushBody: releaseNoticeBody(claim),
      });
      if (accepted.includes(claim.user_id)) { report.accepted++; continue; }
      // notifyMany is best-effort. Observe the ledger to distinguish concurrent withdrawal from a failed insert.
      const { data: ledger, error } = await admin.from("release_deliveries").select("accepted_at, state")
        .eq("id", claim.id).maybeSingle();
      if (error) throw error;
      if (ledger?.accepted_at) report.accepted++;
      else if (ledger?.state === "suppressed") report.suppressed++;
      else throw new Error("notification_not_accepted");
    } catch {
      report.failed++;
      const { data: retried, error } = await admin.rpc("retry_release_delivery", {
        p_delivery_id: claim.id, p_claim_token: claim.claim_token, p_error: "notification_delivery_failed",
      });
      if (error) throw error;
      if (retried) report.retried++;
    }
  }
  return report;
}
