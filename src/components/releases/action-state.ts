export type ReleaseActionError = "auth" | "forbidden" | "notFound" | "invalid" | "conflict" | "unknown";
export type ReleaseActionResult = { ok: true; id?: string } | { ok: false; error: ReleaseActionError };

export function releaseActionFailure(error: unknown): ReleaseActionResult {
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  if (/forbidden|permission|admin_required/i.test(message)) return { ok: false, error: "forbidden" };
  if (/auth|unauthorized|session/i.test(message)) return { ok: false, error: "auth" };
  if (/not.?found|missing/i.test(message)) return { ok: false, error: "notFound" };
  if (/conflict|revision|changed/i.test(message)) return { ok: false, error: "conflict" };
  if (/invalid|constraint|validation/i.test(message)) return { ok: false, error: "invalid" };
  return { ok: false, error: "unknown" };
}

export function isReleaseId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** A transport failure still leaves the control available for a deliberate retry. */
export async function invokeReleaseAction(action: () => Promise<ReleaseActionResult>): Promise<ReleaseActionResult> {
  try { return await action(); }
  catch { return { ok: false, error: "unknown" }; }
}
