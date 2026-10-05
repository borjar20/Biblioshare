type FixtureOptions = {
  supabaseUrl: string;
  headers: Record<string, string>;
  ownerId: string;
  timestamp: number;
};

type Fixture = { clubId: string; slug: string };
type Operation = "POST clubs" | "POST club_members" | "DELETE clubs";

class FixtureHttpError extends Error {
  constructor(operation: Operation, status: number) {
    // Only method, resource and status: no headers or untrusted response body.
    super(`${operation}: HTTP ${status}`);
    this.name = "ClubRoundFixtureHttpError";
  }
}

function checkResponse(response: Response, operation: Operation) {
  if (!response.ok) throw new FixtureHttpError(operation, response.status);
}

/** Owns only a disposable club; the existing QA account is never modified. */
export async function withClubRoundFixture<T>(
  options: FixtureOptions,
  run: (fixture: Fixture) => Promise<T>,
  transport: typeof fetch = fetch,
): Promise<T> {
  const { supabaseUrl, headers, ownerId, timestamp } = options;
  const slug = `e2e-ronda-${timestamp}`;
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };
  let clubId: string | null = null;
  let primaryFailed = false;
  let primaryError: unknown;
  try {
    const created = await transport(`${supabaseUrl}/rest/v1/clubs`, {
      method: "POST",
      headers: { ...jsonHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ slug, name: `E2E Ronda ${timestamp}`, visibility: "private", owner_id: ownerId }),
    });
    checkResponse(created, "POST clubs");
    const clubs = await created.json() as { id?: unknown }[];
    const id = Array.isArray(clubs) ? clubs[0]?.id : undefined;
    if (typeof id !== "string" || !id) throw new Error("POST clubs: respuesta sin id del club desechable");
    clubId = id;

    // Direct REST creation bypasses create_club() and its atomic membership.
    // Without this owner row, the round roster is empty and login/UI would
    // produce a misleading composer timeout instead of a setup failure.
    const membership = await transport(`${supabaseUrl}/rest/v1/club_members`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ club_id: clubId, user_id: ownerId, role: "owner", status: "active" }),
    });
    checkResponse(membership, "POST club_members");
    return await run({ clubId, slug });
  } catch (error) {
    primaryFailed = true;
    primaryError = error;
    throw error;
  } finally {
    // Native fetch outlives the browser context. Exact id only; cascades remove
    // this club's memberships and rounds, never the persistent owner account.
    if (clubId) {
      try {
        const cleanup = await transport(`${supabaseUrl}/rest/v1/clubs?id=eq.${encodeURIComponent(clubId)}`, {
          method: "DELETE",
          headers,
        });
        checkResponse(cleanup, "DELETE clubs");
      } catch (cleanupError) {
        if (primaryFailed) {
          const first = primaryError instanceof FixtureHttpError ? primaryError.message : "error de preparación/prueba";
          const second = cleanupError instanceof FixtureHttpError ? cleanupError.message : "error de limpieza";
          throw new AggregateError([primaryError, cleanupError], `${first}; además, ${second}`, { cause: primaryError });
        }
        throw cleanupError;
      }
    }
  }
}
