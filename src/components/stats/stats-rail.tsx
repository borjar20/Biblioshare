import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getAnnualGoals } from "@/lib/challenges/annual-goals";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getAnnualCompleted } from "@/lib/stats/get-annual-completed";
import { getWhoToFollow } from "@/lib/social/get-who-to-follow";
import { WeeklyStrip } from "./weekly-strip";
import { StreakCard } from "./streak-card";
import { BookGoalCard } from "./book-goal-card";
import { GoalRows } from "./goal-rows";
import { WhoToFollowCard } from "./who-to-follow-card";

// La barra lateral del frame B: en escritorio el feed manda, pero sobra ancho,
// así que tus stats viven al lado en vez de obligarte a ir a Perfil.
//
// Es un RESUMEN, no el Panel: sin calendario, sin retos y sin el formulario de
// objetivos — eso sigue siendo de Perfil › Panel, que es la vista completa. No
// se ve por debajo de lg, donde el feed se queda solo (frame A).
//
// SIN "Ahora mismo" (decisión del usuario, 2026-07-17): el bloque de hoy, justo
// encima, ya enseña lo que tienes a medias — y mejor, con progreso y acciones y
// no solo portadas. Era el duplicado literal de juntar dos maquetas de distinta
// época (el frame B es de la IA vieja; el G, posterior).
//
// "Racha" SÍ se queda: la de aquí es la GLOBAL —tus días seguidos, leas lo que
// leas— y la de las tarjetas de hoy es la de CADA PASE. Desde que dejaron de ser
// el mismo número, dicen cosas distintas y las dos aportan.
//
// Móvil Y TABLET (<1100): un RESUMEN de tres cifras (semana · año · racha) en
// vez del detalle. El detalle completo —barras, aros, "a quién seguir"— solo
// sale cuando las estadísticas tienen COLUMNA PROPIA, y eso es de 1100 para
// arriba (las tres áreas). Por debajo, en el tablet a dos columnas las stats
// comparten la fila de arriba con lo personal, y una barra lateral entera ahí
// empujaría el feed —que va debajo— demasiado abajo: el resumen las deja bajas.
// Es UN solo componente y UNA sola tanda de consultas: el resumen sale de los
// mismos datos que el detalle, con visibilidad por CSS (nada se pinta dos veces
// en el servidor).
export async function StatsRail({ userId }: { userId: string }) {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const tRail = await getTranslations("statsRail");
  const tStats = await getTranslations("stats");
  const [profile, weekly, streaks, annual, annualGoals, whoToFollow] = await Promise.all([
    getOwnProfile(userId),
    getWeeklyActivity(supabase, userId),
    getStreaks(supabase, userId),
    getAnnualCompleted(supabase, userId, year),
    getAnnualGoals(supabase, userId, year),
    getWhoToFollow(supabase, userId),
  ]);

  // Total semanal, con el mismo formato que WeeklyStrip ("2 h 15 m" / "40 min").
  const weekMinutes = weekly.reduce((sum, d) => sum + d.minutes, 0);
  const weekLabel =
    weekMinutes >= 60
      ? tStats("weekTotal", { hours: Math.floor(weekMinutes / 60), minutes: weekMinutes % 60 })
      : tStats("minutesCount", { count: weekMinutes });

  return (
    <div className="grid gap-4">
      {/* Resumen compacto: móvil y tablet (<1100). Lista de tres filas
          (rótulo · cifra) en una tarjeta: cabe en la columna estrecha de 260px
          del tablet sin apretar y ocupa poco alto. Sin encabezados (h1–h6) a
          propósito: el detalle de ≥1100 ya trae el <h3> "Lectura esta semana", y
          dos encabezados con el mismo nombre accesible chocarían con los tests
          que buscan ese heading dentro del <aside>. */}
      <div className="rounded-card border border-border bg-surface shadow-card p-3.5 min-[1100px]:hidden">
        <div className="flex flex-col gap-2.5">
          <SummaryRow label={tRail("summaryWeek")} value={weekLabel} />
          <SummaryRow
            label={tRail("summaryYear")}
            value={`${annual.byType.book} ${tRail("summaryBooks", { count: annual.byType.book })}`}
          />
          <SummaryRow
            label={tRail("summaryStreak")}
            value={`${streaks.current} ${tRail("summaryDays", { count: streaks.current })}`}
          />
        </div>
      </div>

      {/* Detalle: de 1100 para arriba, donde el Inicio da COLUMNA propia a las
          estadísticas (las tres áreas). En tablet manda el resumen de arriba. */}
      <div className="hidden gap-4 min-[1100px]:grid">
        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <WeeklyStrip
            days={weekly}
            dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
            showDailyGoal={false}
          />
        </div>

        <div className="rounded-card border border-border bg-surface shadow-card p-4">
          <p className="mb-3 font-serif text-[15px] font-semibold">{tRail("year2026")}</p>
          <div className="flex flex-col gap-3">
            <BookGoalCard completed={annual.byType.book} goal={annualGoals.book} />
            <GoalRows annual={annual} annualGoals={annualGoals} />
            <div className="border-t border-border pt-3">
              <StreakCard streaks={streaks} />
            </div>
          </div>
        </div>

        <WhoToFollowCard suggestions={whoToFollow} />
      </div>
    </div>
  );
}

// Una fila del resumen: rótulo mono a la izquierda, cifra serif a la derecha.
// En fila (no apilado) para que las tres quepan en poco alto — es justo lo que
// pide el tablet, donde el resumen convive con lo personal sobre el feed.
// `whitespace-nowrap` en la cifra: "12 h 30 m" no debe partirse en la columna
// estrecha de 260px.
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="label-section">{label}</span>
      <span className="font-serif text-[15px] leading-none font-semibold whitespace-nowrap text-foreground">
        {value}
      </span>
    </div>
  );
}
