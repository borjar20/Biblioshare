import { createClient } from "@/lib/supabase/server";
import { runArchiveWorker } from "@/lib/import/archive-worker";
import { expireArchiveBatch, revalidateArchiveImports } from "@/lib/reactivity/revalidate";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const requestUrl = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);
  return origin === `${protocol}://${host}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "invalid_job" }, { status: 400 });
  // Route Handlers do not inherit Server Actions' Origin/Host CSRF guard.
  if (!sameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });

  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: job, error } = await client.from("archive_imports").select("id")
    .eq("id", id).eq("user_id", user.id).eq("state", "running").maybeSingle();
  if (error || !job) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    const result = await runArchiveWorker(id, (itemIds) => {
      expireArchiveBatch(itemIds);
      revalidateArchiveImports();
    });
    return Response.json(result);
  } catch {
    return Response.json({ error: "worker_failed" }, { status: 500 });
  }
}
