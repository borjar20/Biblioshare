// Scope owns each account as soon as Auth returns its ID, before profile setup.
// Cleanup uses fetch, independently of Playwright's disposed request context.
export async function withBattleUsers<T>(
  url: string,
  serviceKey: string,
  body: (create: (username: string) => Promise<{ id: string; email: string; password: string }>) => Promise<T>,
  transport: typeof fetch = fetch,
): Promise<T> {
  const ids: string[] = [];
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const errors: unknown[] = [];
  let value: T | undefined;
  try {
    value = await body(async (username) => {
      const email = `${username}@example.com`;
      const password = "TestPassword123!";
      const auth = await transport(`${url}/auth/v1/admin/users`, {
        method: "POST", headers, body: JSON.stringify({ email, password, email_confirm: true }),
      });
      if (!auth.ok) throw new Error(`Create battle user: HTTP ${auth.status}`);
      const user = await auth.json() as { id: string };
      ids.push(user.id);
      const profile = await transport(`${url}/rest/v1/profiles`, {
        method: "POST", headers, body: JSON.stringify({ user_id: user.id, username, is_public: true }),
      });
      if (!profile.ok) throw new Error(`Create battle profile: HTTP ${profile.status}`);
      return { id: user.id, email, password };
    });
  } catch (error) {
    errors.push(error);
  } finally {
    const cleanup = await Promise.allSettled(ids.map(async (id) => {
      const response = await transport(`${url}/auth/v1/admin/users/${id}`, {
        method: "DELETE", headers, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Delete battle user ${id}: HTTP ${response.status}`);
    }));
    for (const result of cleanup) if (result.status === "rejected") errors.push(result.reason);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length) throw new AggregateError(errors, "Battle setup/test and cleanup failures");
  return value as T;
}
