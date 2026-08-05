import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverDueEventReminders } from "@/lib/clubs/activities/event-reminders";

// El extremo del trabajo programado. Lo llama pg_cron cada 5 minutos vía pg_net
// (supabase/migrations/20260824_club_event_reminder_scheduler.sql), nunca un
// navegador.
//
// Nunca se cachea: es una escritura, y una respuesta cacheada dejaría de entregar
// recordatorios sin que nada fallara visiblemente. Con Cache Components (#448) el
// segmento `dynamic = "force-dynamic"` es incompatible y sobra: un POST que lee
// `request.headers` y escribe es dinámico por defecto —nunca entra en el shell.
//
// POST, no GET: entrega notificaciones y sella filas. Un GET invitaría a que
// cualquier precargador o rastreador lo disparase.
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Sin secreto configurado la ruta queda CERRADA, no abierta. Un despliegue al
    // que se le olvidó la variable no debe acabar con un extremo público que
    // cualquiera puede usar para vaciar la cola de recordatorios.
    console.error("/api/cron/event-reminders: falta CRON_SECRET; no se atiende");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-cron-secret") ?? "";
  if (!secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const report = await deliverDueEventReminders();
    // Observabilidad (§22): solo recuentos técnicos. Ni un id de usuario, ni el
    // contenido del aviso. Se registra únicamente cuando hubo algo que hacer, para
    // que los 288 barridos diarios en vacío no ahoguen el log.
    if (report.claimed > 0) {
      console.log("event-reminders", report);
    }
    return NextResponse.json(report);
  } catch (error) {
    console.error("/api/cron/event-reminders: barrido fallido", error);
    // 500 a propósito: así el barrido cuenta como fallido en cualquier
    // monitorización, en vez de aparentar éxito con cero entregas.
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}

// Comparación en tiempo constante: con `===` el tiempo de respuesta filtra cuántos
// caracteres iniciales coinciden. timingSafeEqual exige la misma longitud, así que
// se compara sobre búferes y se descarta antes si difieren.
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
