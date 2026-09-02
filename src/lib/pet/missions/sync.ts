import type { createClient } from "@/lib/supabase/server";
import { earnCelebration } from "@/lib/celebrations/earn";
import { addDaysISO } from "@/lib/stats/dates";
import type { PetAttribute, PetAttributes } from "../classes";
import { pickDailyMissions, type MissionEligibility } from "./generate";
import { missionProgress, type PetDayCounts } from "./progress";
import { isMissionTemplate, type MissionTemplate } from "./templates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface MissionView {
  slot: number;
  template: MissionTemplate;
  target: number;
  xp: number;
  progress: number;
  completed: boolean;
  itemType: string | null;
  itemId: string | null;
  title: string | null;
}

export interface SyncInput {
  today: string;
  primary: PetAttribute;
  attributes: PetAttributes;
  eligibility: MissionEligibility;
  days: { today: PetDayCounts; yesterday: PetDayCounts };
}

export interface SyncResult {
  missions: MissionView[];
  /** true si ESTA lectura ha completado alguna (para pedir el drenado en cliente). */
  completedNow: boolean;
  /** Las que ESTA lectura acaba de completar (hoy o ayer). Su XP todavía no
   *  está en los contadores —se leyeron antes del sync—, así que quien llama
   *  tiene que sumarla antes de derivar el nivel (issue #1029). */
  justCompleted: { template: MissionTemplate; xp: number }[];
}

// Único punto de escritura de las misiones (spec fase 2 §4):
// 1) si hoy no tiene filas, genera e inserta (on conflict do nothing: dos
//    pestañas a la vez → la primera gana, la segunda relee);
// 2) evalúa hoy Y ayer sin completar (una cumplida a las 23:59 y vista mañana
//    sigue contando); más atrás caduca;
// 3) marca completed_at y gana pet_mission_done con key "<day>:<slot>".
export async function syncDailyMissions(
  supabase: SupabaseServerClient,
  userId: string,
  input: SyncInput,
): Promise<SyncResult> {
  const { today } = input;
  const yesterday = addDaysISO(today, -1);
  const select = "id, day, slot, template, target, xp, item_type, item_id, item_title, completed_at";

  // Next.js 16 memoiza los GET idénticos dentro de un mismo render, y las
  // consultas de Supabase son GET: releer con la MISMA consulta justo después
  // de insertar devolvía el resultado de ANTES del insert y el tablón salía
  // vacío la primera visita del día (issue #1028). Por eso el camino normal usa
  // las filas que devuelve el propio upsert (POST, no memoizado) y el camino de
  // carrera relee con `bustCache`, que añade un filtro que no filtra nada
  // (`slot >= 0`) solo para que la URL NO coincida con la del primer GET.
  const read = async (bustCache = false) => {
    const base = supabase
      .from("pet_daily_missions")
      .select(select)
      .eq("user_id", userId)
      .in("day", [yesterday, today]);
    const { data, error } = await (bustCache ? base.gte("slot", 0) : base).order("day").order("slot");
    if (error) throw error;
    return data ?? [];
  };

  let rows = await read();
  if (!rows.some((r) => r.day === today)) {
    const picks = pickDailyMissions(`${userId}:${today}`, input.primary, input.attributes, input.eligibility);
    const { data: inserted, error } = await supabase
      .from("pet_daily_missions")
      .upsert(
        picks.map((p, slot) => ({
          user_id: userId,
          day: today,
          slot,
          template: p.template,
          target: p.target,
          xp: p.xp,
          item_type: p.itemType ?? null,
          item_id: p.itemId ?? null,
          item_title: p.title ?? null,
        })),
        { onConflict: "user_id,day,slot", ignoreDuplicates: true },
      )
      .select(select);
    if (error) throw error;
    if ((inserted ?? []).length > 0) {
      rows = [...rows.filter((r) => r.day !== today), ...(inserted ?? [])].sort(
        (a, b) => a.day.localeCompare(b.day) || a.slot - b.slot,
      );
    } else {
      // Otra pestaña ganó la carrera: con `ignoreDuplicates` el upsert no
      // devuelve nada, así que hay que releer — y con la consulta distinta.
      rows = await read(true);
    }
  }

  const justCompleted: { template: MissionTemplate; xp: number }[] = [];
  const views: MissionView[] = [];
  for (const r of rows) {
    if (!isMissionTemplate(r.template)) continue; // plantilla retirada: se ignora
    const counts = r.day === today ? input.days.today : input.days.yesterday;
    const progress = missionProgress({ template: r.template, target: r.target, item_type: r.item_type, item_id: r.item_id }, counts);
    let completed = r.completed_at != null;
    if (!completed && progress >= r.target) {
      // `.select("id")`: el UPDATE es condicional (`completed_at is null`), así
      // que "sin error" NO significa "yo la he completado" — si otra pestaña se
      // adelantó, no toca ninguna fila y no devuelve ninguna. Solo la escritura
      // que de verdad marcó la fila gana la celebración.
      const { data: updated, error } = await supabase
        .from("pet_daily_missions")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", r.id)
        .is("completed_at", null)
        .select("id");
      if (error) console.error("syncDailyMissions update", error);
      else if ((updated ?? []).length > 0) {
        completed = true;
        justCompleted.push({ template: r.template, xp: r.xp });
        await earnCelebration(supabase, userId, {
          event: "pet_mission_done",
          key: `${r.day}:${r.slot}`,
          title: r.item_title ?? undefined,
          metadata: { template: r.template, xp: r.xp },
        });
      }
    }
    if (r.day === today) {
      views.push({
        slot: r.slot,
        template: r.template,
        target: r.target,
        xp: r.xp,
        progress: Math.min(progress, r.target),
        completed,
        itemType: r.item_type,
        itemId: r.item_id,
        title: r.item_title,
      });
    }
  }
  return { missions: views, completedNow: justCompleted.length > 0, justCompleted };
}
