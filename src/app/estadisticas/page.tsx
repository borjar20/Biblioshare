import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { availableYears, resolvePeriod } from "@/lib/stats/period";
import { getRatingDistribution } from "@/lib/stats/get-rating-distribution";
import { getTypeDistribution } from "@/lib/stats/get-type-distribution";
import { getStatusDistribution } from "@/lib/stats/get-status-distribution";
import { getHoursByMonth } from "@/lib/stats/get-hours-by-month";
import { getCatalogBreakdown } from "@/lib/stats/get-catalog-breakdown";
import { getHabits } from "@/lib/stats/get-habits";
import { getRecords } from "@/lib/stats/get-records";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getTbrTrend } from "@/lib/stats/get-tbr-trend";
import { RatingCard } from "@/components/stats/rating-card";
import { TypeDistributionCard } from "@/components/stats/type-distribution-card";
import { StatusBarCard } from "@/components/stats/status-bar-card";
import { HoursByMonthCard } from "@/components/stats/hours-by-month-card";
import { GenresCard } from "@/components/stats/genres-card";
import { AuthorsCard } from "@/components/stats/authors-card";
import { DecadesCard } from "@/components/stats/decades-card";
import { HabitsCard } from "@/components/stats/habits-card";
import { RecordsCard } from "@/components/stats/records-card";
import { TbrCard } from "@/components/stats/tbr-card";
import { DesktopEditorialLayout } from "@/components/layout/desktop-editorial-layout";
import { StatsDesktopRail } from "@/components/stats/stats-desktop-rail";
import { PeriodPills } from "./period-pills";

export const metadata: Metadata = {
  title: "Estadísticas — Biblioshare",
};

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-border bg-surface shadow-card p-4 ${className}`}
    >
      {children}
    </div>
  );
}

// Estadísticas completas (frame J, P9): privada, solo del dueño. La misma página
// en ambos breakpoints — en escritorio las tarjetas fluyen a varias columnas con
// `columns`, no un árbol nuevo (la nota del mockup "se despliega dentro de G" se
// descartó, P9). El selector de período acota cada tarjeta por año.
export default async function FullStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("stats");
  const { periodo } = await searchParams;
  const period = resolvePeriod(periodo);

  const [profile, rating, type, status, hours, catalog, habits, records, streaks, tbr] =
    await Promise.all([
      getOwnProfile(supabase, user.id),
      getRatingDistribution(supabase, user.id, period),
      getTypeDistribution(supabase, user.id, period),
      getStatusDistribution(supabase, user.id),
      getHoursByMonth(supabase, user.id, period),
      getCatalogBreakdown(supabase, user.id, period),
      getHabits(supabase, user.id, period),
      getRecords(supabase, user.id, period),
      getStreaks(supabase, user.id),
      getTbrTrend(supabase, user.id),
    ]);

  const backHref = profile
    ? `/u/${profile.username}?tab=estadisticas`
    : "/";

  // Las tarjetas del frame J, en orden. En escritorio fluyen en columnas de
  // masonry (`columns`), evitando el break dentro de una tarjeta.
  const cards = [
    <Card key="rating">
      <RatingCard dist={rating} />
    </Card>,
    <Card key="type">
      <TypeDistributionCard dist={type} />
    </Card>,
    <Card key="status">
      <StatusBarCard dist={status} />
    </Card>,
    <Card key="hours">
      <HoursByMonthCard data={hours} />
    </Card>,
    <Card key="genres">
      <GenresCard genres={catalog.genres} />
    </Card>,
    <Card key="authors">
      <AuthorsCard
        authors={catalog.authors}
        newAuthors={catalog.newAuthors}
        totalAuthors={catalog.totalAuthors}
      />
    </Card>,
    <Card key="decades">
      <DecadesCard decades={catalog.decades} />
    </Card>,
    <Card key="habits">
      <HabitsCard habits={habits} />
    </Card>,
    <Card key="records">
      <RecordsCard records={records} bestStreakDays={streaks.best} />
    </Card>,
    <Card key="tbr">
      <TbrCard trend={tbr} />
    </Card>,
  ];

  const years = availableYears();

  return (
    <DesktopEditorialLayout
      className="pb-24"
      header={<>
      <header className="flex items-center gap-3">
        <Link
          href={backHref}
          aria-label={t("back")}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          ‹
        </Link>
        <h1 className="font-serif text-xl font-semibold tracking-tight text-foreground">
          {t("fullStatsTitle")}
        </h1>
      </header>

      <div className="mt-4 lg:hidden">
        <PeriodPills current={period} years={years} />
      </div>
      </>}
      main={<div className="columns-1 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
        {cards}
      </div>}
      rail={<StatsDesktopRail period={period} years={years} />}
    />
  );
}
