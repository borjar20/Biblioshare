import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { adminSweepDeps, sweepWrapUps } from "@/lib/wrap-ups/generate";
import { isWrapUpKind } from "@/lib/wrap-ups/windows";

// Crónicas (wrap-ups) semanal/mensual/anual (spec 2026-10-06). Lo llama pg_cron
// vía pg_net con {"kind": "week"|"month"|"year"}; nunca un navegador. El
// barrido anual recorre a todos los usuarios, así que se pide más tiempo.
export const maxDuration = 300;

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("/api/cron/wrap-ups: falta CRON_SECRET; no se atiende");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as { kind?: unknown } | null;
    if (!isWrapUpKind(body?.kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
    const report = await sweepWrapUps(body.kind, new Date(), adminSweepDeps(createServiceRoleClient()));
    console.log("wrap-ups", body.kind, report); // solo recuentos, nunca ids
    return NextResponse.json(report);
  } catch (error) {
    console.error("/api/cron/wrap-ups: barrido fallido", error);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
