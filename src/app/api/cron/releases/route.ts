import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runReleaseSweep } from "@/lib/releases/sweep";

/** POST only: pg_cron/pg_net supplies the existing cron secret, never a browser. */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const provided = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const secret = Buffer.from(expected);
  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const report = await runReleaseSweep();
    if (report.sync.attempted || report.deliveries.claimed) console.log("releases", report);
    // Source failures remain observable while due notices can still be processed.
    const failed = report.sync.failed || report.deliveries.failed > 0;
    return NextResponse.json(report, { status: failed ? 502 : 200 });
  } catch {
    console.error("/api/cron/releases: sweep_failed");
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}
