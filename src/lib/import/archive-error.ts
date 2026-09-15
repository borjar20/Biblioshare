import { CatalogProviderError } from "@/lib/catalog/provider-error";

export function archiveErrorCode(error: unknown): string {
  if (error instanceof CatalogProviderError) return error.message;
  if (error instanceof TypeError) return "provider_temporary";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["40001", "40P01", "57014", "PT429"].includes(code)) return "temporary";
  if (error instanceof Error && error.message === "provider_unavailable") return "provider_temporary";
  if (error instanceof Error && error.message === "invalid_metadata") return "invalid_metadata";
  return "unknown";
}
