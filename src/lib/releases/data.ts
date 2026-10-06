import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ReleaseClient = Awaited<ReturnType<typeof createClient>>;
type Result<T> = { data: T[] | null; error: unknown };
type RangeQuery<T> = { range(from: number, to: number): PromiseLike<Result<T>> };

/** PostgREST caps a response; every private selection uses deterministic pagination. */
export async function readAllRows<T>(query: () => RangeQuery<T>): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query().range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    result.push(...rows);
    if (rows.length < pageSize) return result;
  }
}

export function chunks<T>(rows: T[], size = 200): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) result.push(rows.slice(offset, offset + size));
  return result;
}

export async function authenticatedReleaseClient(userId: string): Promise<ReleaseClient> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || user.id !== userId) throw new Error("auth");
  return supabase;
}

export async function requireReleaseAdmin(supabase: ReleaseClient, userId: string): Promise<void> {
  const { data, error } = await supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data?.role !== "admin") throw new Error("forbidden");
}
