import type { createClient } from "@/lib/supabase/server";

type QuotaOperation = "catalog_request" | "import_parse" | "import_rows" | "push_devices";

export class RequestQuotaExceededError extends Error {
  constructor(readonly operation: QuotaOperation) {
    super("Request quota exceeded");
    this.name = "RequestQuotaExceededError";
  }
}

/** Charge before doing expensive work. Database failure must not admit work. */
export async function requireRequestQuota(
  supabase: Awaited<ReturnType<typeof createClient>>,
  operation: QuotaOperation,
  cost = 1,
): Promise<void> {
  const { data, error } = await supabase.rpc("consume_request_quota", {
    p_operation: operation,
    p_cost: cost,
  });
  if (error) throw new Error("Could not check request quota", { cause: error });
  if (data !== true) throw new RequestQuotaExceededError(operation);
}
