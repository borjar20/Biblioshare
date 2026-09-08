import { timingSafeEqual } from "node:crypto";
import { runArchiveWorker } from "@/lib/import/archive-worker";

export const maxDuration = 60;

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return Response.json({ error: "not_configured" }, { status: 503 });
  const supplied = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const secret = Buffer.from(expected);
  if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await runArchiveWorker());
  } catch {
    return Response.json({ error: "worker_failed" }, { status: 500 });
  }
}
