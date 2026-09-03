import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverPetNudges } from "@/lib/pet/nudges/deliver";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Avisos push de la mascota (spec 2026-09-02-mascota-avisos-push). Lo llama
// pg_cron cada hora vía pg_net (supabase/migrations/20260906_pet_nudges.sql) y
// la función SQL solo despacha a las 20:00 de Europe/Madrid; nunca un navegador.
// POST y sin caché, por lo mismo que /api/cron/event-reminders.
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("/api/cron/pet-nudges: falta CRON_SECRET; no se atiende");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const report = await deliverPetNudges(createServiceRoleClient());
    // Solo recuentos, y solo cuando hubo algo: ni ids ni nombres de mascota.
    if (report.claimed > 0) console.log("pet-nudges", report);
    return NextResponse.json(report);
  } catch (error) {
    console.error("/api/cron/pet-nudges: barrido fallido", error);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
