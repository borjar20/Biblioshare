import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getMonthCalendar } from "@/lib/stats/get-month-calendar";
import { getAnnualCompleted } from "@/lib/stats/get-annual-completed";
import { WeeklyStrip } from "@/components/stats/weekly-strip";
import { StreakCard } from "@/components/stats/streak-card";
import { MonthCalendar } from "@/components/stats/month-calendar";
import { AnnualStats } from "@/components/stats/annual-stats";
import { GoalsForm } from "@/components/stats/goals-form";

export const metadata: Metadata = {
  title: "Estadísticas — Biblioshare",
};

const MONTH_RE = /^\d{4}-\d{2}$/;

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const t = await getTranslations("stats");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonth;
  const year = now.getFullYear();

  const [profile, weekly, streaks, calendar, annual] = await Promise.all([
    getOwnProfile(supabase, user.id),
    getWeeklyActivity(supabase, user.id),
    getStreaks(supabase, user.id),
    getMonthCalendar(supabase, user.id, month),
    getAnnualCompleted(supabase, user.id, year),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <WeeklyStrip days={weekly} dailyGoalMinutes={profile?.dailyGoalMinutes ?? null} />
      <StreakCard streaks={streaks} />
      <MonthCalendar calendar={calendar} basePath="/estadisticas" />
      <AnnualStats annual={annual} annualGoalItems={profile?.annualGoalItems ?? null} />
      <GoalsForm
        dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
        annualGoalItems={profile?.annualGoalItems ?? null}
      />
    </div>
  );
}
