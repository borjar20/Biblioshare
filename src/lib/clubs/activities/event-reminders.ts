import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyMany } from "@/lib/social/notifications";
import type { createClient } from "@/lib/supabase/server";

// Entrega de los recordatorios de evento. UN solo camino, con dos disparadores:
// el trabajo programado (/api/cron/event-reminders, cada 5 min) y la propia
// acción de seguir, cuando el recordatorio elegido ya venció y §9.1 pide avisar
// de inmediato en vez de esperar al barrido siguiente.
//
// No escribe en `notifications` por su cuenta: llama a notifyMany, el mismo que
// usan el muro y las actividades. Así hereda el filtro de bloqueos, la inserción
// multi-fila y el push en lote, y no hay un segundo sistema de notificaciones que
// mantener (§25).
//
// Vive en un módulo PLANO (sin "use server") a propósito, igual que
// notify-club.ts: lo usan una ruta de API y una server action, y recibe el
// cliente por parámetro.

type ClaimedReminder = {
  activity_id: string;
  user_id: string;
  club_slug: string;
  club_name: string;
  title: string;
  starts_at: string | null;
  event_timezone: string;
  location: string | null;
  modality: "presencial" | "online" | "hibrida" | null;
  organizer_id: string;
  minutes_before: number | null;
};

export type DeliveryReport = {
  claimed: number;
  delivered: number;
  released: number;
  events: number;
};

/**
 * Cuerpo del aviso (§9.3): evento, club, cuándo y dónde, con el tiempo restante
 * calculado en el momento de entregar. El `online_url` NO entra JAMÁS -- una
 * notificación se lee en una pantalla bloqueada.
 *
 * El tiempo restante sale de `starts_at` contra ahora, no del offset elegido: dos
 * personas con offsets distintos que se entregan en el mismo barrido leen lo
 * mismo, y es un solo payload por evento en vez de uno por persona.
 */
export function reminderBody(
  reminder: Pick<
    ClaimedReminder,
    "title" | "club_name" | "starts_at" | "event_timezone" | "location" | "modality"
  >,
  now: Date = new Date(),
): string {
  const cuando = reminder.starts_at ? new Date(reminder.starts_at) : null;

  const hora = cuando
    ? new Intl.DateTimeFormat("es-ES", {
        timeZone: reminder.event_timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(cuando)
    : null;

  // El día se compara en la zona del EVENTO, no en UTC ni en la de quien lee: un
  // evento el 12 a las 00:30 de Madrid son las 22:30 UTC del día 11, y comparando
  // en UTC diría «hoy» cuando para el club es mañana. Formatear a "YYYY-MM-DD" en
  // esa zona y restar es lo que evita meter aritmética de calendario propia.
  const diaEnZona = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: reminder.event_timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);

  let cuandoTexto = "";
  if (cuando) {
    // Date.parse de "YYYY-MM-DD" es UTC medianoche para las dos fechas, así que la
    // resta da días enteros exactos y el horario de verano no la descuadra.
    const dias = Math.round(
      (Date.parse(diaEnZona(cuando)) - Date.parse(diaEnZona(now))) / 86_400_000,
    );
    if (dias <= 0) cuandoTexto = "hoy";
    else if (dias === 1) cuandoTexto = "mañana";
    else cuandoTexto = `en ${dias} días`;
  }

  // Nunca el online_url: esto se lee en una pantalla bloqueada.
  const donde =
    reminder.modality === "online"
      ? " Es online."
      : reminder.location
        ? ` En ${reminder.location}.`
        : "";

  const cabeza = cuandoTexto ? `Evento ${cuandoTexto}` : "Evento";
  const cola = hora ? `, comienza a las ${hora}.` : ".";
  return `${cabeza}: ${reminder.title}, de ${reminder.club_name}${cola}${donde}`;
}

/**
 * Reclama los recordatorios vencidos y los entrega. El reclamo es atómico (una
 * sentencia que sella y devuelve), así que dos barridos solapados no entregan lo
 * mismo dos veces.
 *
 * Si la entrega de un evento falla, sus filas se LIBERAN para que el barrido
 * siguiente vuelva a intentarlo: perder un aviso en silencio es peor que
 * repetirlo.
 */
export async function deliverDueEventReminders(
  limit = 200,
  /** Acota el reclamo a un solo evento: lo usa la entrega inmediata desde una
   *  server action, para que un clic no dispare el barrido de todos los clubes. */
  activityId?: string,
): Promise<DeliveryReport> {
  // service_role: claim_due_event_reminders está revocada para anon y
  // authenticated a propósito -- sella filas, y sellarlas sin entregarlas
  // impediría que se entreguen.
  const admin = createServiceRoleClient();

  const { data: claimed, error } = await admin.rpc("claim_due_event_reminders", {
    p_limit: limit,
    p_activity_id: activityId ?? undefined,
  });
  if (error) throw error;

  const rows = (claimed ?? []) as ClaimedReminder[];
  const report: DeliveryReport = {
    claimed: rows.length,
    delivered: 0,
    released: 0,
    events: 0,
  };
  if (rows.length === 0) return report;

  // Agrupar por evento: un payload y un notifyMany por evento, no por persona.
  const porEvento = new Map<string, ClaimedReminder[]>();
  for (const row of rows) {
    const lista = porEvento.get(row.activity_id);
    if (lista) lista.push(row);
    else porEvento.set(row.activity_id, [row]);
  }
  report.events = porEvento.size;

  const now = new Date();
  for (const [activityId, grupo] of porEvento) {
    const userIds = grupo.map((r) => r.user_id);
    try {
      const entregados = await notifyMany(admin as never, {
        userIds,
        // SIN actor: no hay persona detrás de un recordatorio. Ponerle el
        // organizador se probó y falló por dos sitios (el CHECK de la tabla dejaba
        // sin aviso justo a quien monta el evento, y la campana decía «Marta te
        // avisa» cuando Marta no había hecho nada). Ver migración 20260825.
        actorId: null,
        type: "club_event_reminder",
        targetType: "club_event",
        targetId: activityId,
        // Lo manda el sistema: el organizador que sigue su propio evento también
        // recibe su aviso, y no se aplica el filtro de bloqueos (que con
        // service_role vaciaría la lista entera). Ver notifyMany.
        systemDelivery: true,
        pushBody: reminderBody(grupo[0], now),
      });
      report.delivered += entregados.length;

      // notifyMany es best-effort y nunca lanza: si devolvió menos ids de los
      // reclamados, esos NO se entregaron (bloqueo mutuo, o un fallo de
      // escritura ya registrado). Se liberan para reintentarlos.
      const noEntregados = userIds.filter((id) => !entregados.includes(id));
      if (noEntregados.length > 0) {
        const { data: released } = await admin.rpc("release_event_reminders", {
          p_activity_id: activityId,
          p_user_ids: noEntregados,
        });
        report.released += released ?? 0;
      }
    } catch (deliveryError) {
      // Observabilidad (§22): solo datos técnicos, ningún contenido del aviso.
      console.error("deliverDueEventReminders: fallo entregando un evento", {
        activityId,
        recipients: userIds.length,
        error: deliveryError,
      });
      const { data: released } = await admin.rpc("release_event_reminders", {
        p_activity_id: activityId,
        p_user_ids: userIds,
      });
      report.released += released ?? 0;
    }
  }

  return report;
}

/**
 * Avisa a los seguidores de que el evento cambió de fecha o se canceló (§9.4).
 * Best-effort, como notifyClub: un aviso fallido no puede deshacer la edición que
 * ya se confirmó.
 *
 * No se avisa de cualquier edición -- corregir una errata del título no es
 * noticia, y así lo dejó decidido `updateClubEvent`. Solo de lo que obliga a
 * cambiar de planes.
 */
export async function notifyEventFollowers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    activityId: string;
    actorId: string;
    type: "club_event_updated" | "club_event_cancelled";
  },
): Promise<void> {
  try {
    const { data: followers } = await supabase
      .from("club_event_followers")
      .select("user_id")
      .eq("activity_id", params.activityId);

    const userIds = (followers ?? []).map((f) => f.user_id);
    if (userIds.length === 0) return;

    await notifyMany(supabase, {
      userIds,
      actorId: params.actorId,
      type: params.type,
      targetType: "club_event",
      targetId: params.activityId,
    });
  } catch (error) {
    console.error("notifyEventFollowers failed", error);
  }
}
