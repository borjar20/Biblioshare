"use server";

import "server-only";
import { redirect } from "next/navigation";
import { revalidateInteraction } from "@/lib/reactivity/revalidate";
import { createClient } from "@/lib/supabase/server";
import { isReportReason, type ReportReason } from "./moderation";

export async function reportComment(
  commentId: string,
  reason: ReportReason,
  details?: string | null,
): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!isReportReason(reason)) throw new Error("invalid_report_reason");
  const normalizedDetails = details?.trim() || null;
  if (normalizedDetails && normalizedDetails.length > 2000) {
    throw new Error("report_details_too_long");
  }

  const { data, error } = await supabase.rpc("report_comment", {
    p_comment_id: commentId,
    p_reason: reason,
    p_details: normalizedDetails,
  });
  if (error) throw error;
  if (!data) throw new Error("report_not_created");

  revalidateInteraction();
  return data as string;
}
