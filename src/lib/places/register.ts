import "server-only";

const MIN_SECRET = 32;
/** null disables suggestions (soft dependency, like GOOGLE_BOOKS_API_KEY). */
export function placesSecret(): string | null {
  const secret = process.env.PLACES_SIGNING_SECRET;
  return secret && secret.length >= MIN_SECRET ? secret : null;
}
