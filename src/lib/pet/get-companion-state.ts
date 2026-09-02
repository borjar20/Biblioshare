import type { createClient } from "@/lib/supabase/server";
import { todayISO, toISODate } from "@/lib/stats/dates";
import { isPetClass, type PetClass, type PetMood, type PetStage } from "./classes";
import { daysBetweenISO } from "./counts";
import { moodFor, stageFor } from "./derive";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface CompanionState {
  name: string;
  petClass: PetClass;
  stage: PetStage;
  mood: PetMood;
  hidden: boolean;
}

/** Forma del jsonb que devuelve `get_companion_state()` (20260905). */
type CompanionRow = {
  name: string;
  class: string;
  hatched_at: string;
  companion_hidden: boolean;
  last_level: number;
  /** "YYYY-MM-DD" (Europe/Madrid) del último día con actividad VIVIDA, o null. */
  last_activity: string | null;
};

function isCompanionRow(v: unknown): v is CompanionRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.name === "string" &&
    typeof r.class === "string" &&
    typeof r.hatched_at === "string" &&
    typeof r.companion_hidden === "boolean" &&
    typeof r.last_level === "number" &&
    (r.last_activity == null || typeof r.last_activity === "string")
  );
}

// Lectura LIGERA (spec §8): corre en cada página del shell, así que no deriva
// atributos. UNA consulta (issue #1023): el RPC devuelve pet_state y el último
// día con actividad VIVIDA (misma regla que lastActivityISO en
// get-pet-counts.ts, issue #1041). La etapa sale de `last_level` (lo último
// que calculó /mascota) vía `stageFor`, y el humor de la última actividad.
// Siempre la mascota del que llama (auth.uid()): no recibe userId a propósito,
// para que nadie crea que puede pedir la de otro.
export async function getCompanionState(supabase: SupabaseServerClient): Promise<CompanionState | null> {
  // El RPC agrupa los días en la zona que le pasamos: la MISMA en la que
  // toISODate()/todayISO() agrupan aquí (la del proceso de Node). Si fuera una
  // zona fija (Europe/Madrid, como get_widget_snapshot), un pase cerrado a las
  // 23:52 UTC caería en días distintos en SQL y en TS y la compañera saldría
  // triste o en bellota mientras /mascota la ve contenta.
  const { data, error } = await supabase.rpc("get_companion_state", { p_tz: serverTimeZone() });
  if (error) throw error;
  if (data == null) return null;
  if (!isCompanionRow(data) || !isPetClass(data.class)) {
    // No es alcanzable con el esquema actual (todas las columnas son NOT
    // NULL): si pasa, es que el RPC cambió de forma. Que se vea en los logs y
    // no solo como "la compañera ha desaparecido".
    console.error("getCompanionState: payload inesperado", data);
    return null;
  }

  const last = data.last_activity;
  // timestamptz → día LOCAL, la misma convención que session_date y todayISO()
  const hatchedISO = toISODate(new Date(data.hatched_at));
  const hasActivitySinceHatch = last != null && last >= hatchedISO;
  const today = todayISO();

  return {
    name: data.name,
    petClass: data.class,
    stage: stageFor(data.last_level, hasActivitySinceHatch),
    mood: moodFor(last ? daysBetweenISO(last, today) : null),
    hidden: data.companion_hidden,
  };
}

/** Zona IANA del proceso de Node, la que usan toISODate()/todayISO(). */
function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
