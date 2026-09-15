"use server";

import { getCurrentUserRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { revalidateModeration } from "@/lib/reactivity/revalidate";
import { deleteVoiceNote } from "@/lib/storage/voice-notes";
import { isContentKind, isUuid, type ModerationInput, type ModerationResult } from "@/lib/moderation/contracts";

function validReason(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
}

function failure(message: string): ModerationResult {
  if (/forbidden|permission|admin_required/i.test(message)) return { ok: false, error: "forbidden" };
  if (/confirmation/i.test(message)) return { ok: false, error: "confirmation" };
  if (/missing|not_found/i.test(message)) return { ok: false, error: "missing" };
  if (/transition|already|conflict|not_pending|not_removed/i.test(message)) return { ok: false, error: "conflict" };
  return { ok: false, error: "unknown" };
}

export async function moderateContent(input: ModerationInput): Promise<ModerationResult> {
  try {
    if (await getCurrentUserRole() !== "admin") return { ok: false, error: "forbidden" };
    if (!input || !isContentKind(input.kind) || !isUuid(input.id) ||
      !["remove", "restore", "delete"].includes(input.action) || !validReason(input.reason) ||
      typeof input.confirmation !== "string" || input.confirmation.length > 500) {
      return { ok: false, error: "invalid" };
    }
    if (input.action === "delete" && (input.kind === "club"
      ? !input.confirmation.trim() : input.confirmation !== "ELIMINAR")) {
      return { ok: false, error: "confirmation" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_moderate_content", {
      p_kind: input.kind, p_id: input.id, p_action: input.action,
      p_reason: input.reason.trim(), p_confirmation: input.confirmation,
    });
    if (error) return failure(error.message);
    if (!data || typeof data !== "object" || Array.isArray(data) || data.ok !== true) {
      return { ok: false, error: "unknown" };
    }
    // The database returns paths only after a committed, authorized deletion.
    // Cleanup must not make a successful irreversible operation look failed.
    if (input.action === "delete" && Array.isArray(data.audio_paths)) {
      for (const path of data.audio_paths) {
        if (typeof path !== "string") continue;
        try { await deleteVoiceNote(path); } catch (error) { console.error("Moderation audio cleanup failed", error); }
      }
    }
    revalidateModeration();
    return { ok: true };
  } catch (error) {
    console.error("Moderation action failed", error);
    return { ok: false, error: "unknown" };
  }
}

export async function reviewReport(id: string, status: "actioned" | "dismissed", reason: string): Promise<ModerationResult> {
  try {
    if (await getCurrentUserRole() !== "admin") return { ok: false, error: "forbidden" };
    if (!isUuid(id) || !["actioned", "dismissed"].includes(status) || !validReason(reason)) {
      return { ok: false, error: "invalid" };
    }
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_review_report", {
      p_id: id, p_status: status, p_reason: reason.trim(),
    });
    if (error) return failure(error.message);
    if (!data || typeof data !== "object" || Array.isArray(data) || data.ok !== true) return { ok: false, error: "unknown" };
    revalidateModeration();
    return { ok: true };
  } catch (error) {
    console.error("Report review failed", error);
    return { ok: false, error: "unknown" };
  }
}
