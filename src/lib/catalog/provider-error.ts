/** Stable public classifications; never retains URLs, response bodies or credentials. */
export class CatalogProviderError extends Error {
  constructor(readonly kind: "temporary" | "missing" | "configuration") { super(`provider_${kind}`); }
}

export function requireProviderResponse(response: Response): void {
  if (response.ok) return;
  throw new CatalogProviderError(response.status === 429 || response.status >= 500
    ? "temporary" : response.status === 404 ? "missing" : "configuration");
}
