"use server";

import { createClient } from "@/lib/supabase/server";
import { isReportReason, type ReportReason } from "@/lib/social/moderation";

export type ReportMarginError = "unauthenticated" | "invalid" | "duplicate" | "generic";
type Result = { ok: true } | { ok: false; error: ReportMarginError };

// Denuncia la nota de un hilo del margen (target 'margin_encounter'). La RLS de
// content_reports decide quién puede (lector con acceso, nunca el autor) y el
// trigger rellena autor denunciado y snapshot; aquí solo se valida y se mapea el error.
export async function reportMarginNote(
  encounterId: string,
  reason: ReportReason,
  details?: string | null,
): Promise<Result> {
  if (!isReportReason(reason)) return { ok: false, error: "invalid" };
  const clean = details?.trim() || null;
  if (clean && clean.length > 2000) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { error } = await supabase.from("content_reports").insert({
    reporter_id: user.id,
    target_type: "margin_encounter",
    target_id: encounterId,
    snapshot: {}, // el trigger lo sobrescribe con la nota real
    reason,
    ...(clean ? { details: clean } : {}),
  });
  if (error) return { ok: false, error: error.code === "23505" ? "duplicate" : "generic" };
  return { ok: true };
}
