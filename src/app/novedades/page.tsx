import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getPersonalReleases, getPublicReleases, getReleaseById, getReleaseSourceStatus, getReleaseUserState, type ReleaseFilters } from "@/lib/releases/queries";
import { ReleaseSources } from "@/components/releases/release-sources";
import { ReleaseRetry } from "@/components/releases/release-retry";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { CalendarIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { SHELL_GRID } from "@/lib/ui/layout";
import { madridDay } from "@/lib/releases/precision";
import { releaseCalendarState } from "@/lib/releases/calendar";
import { ReleaseCalendarAgenda, ReleaseFocusedWorkCard } from "@/components/releases/release-calendar-agenda";
import { ReleaseFilterControls } from "@/components/releases/release-filters";
import { ReleaseCalendarViews } from "@/components/releases/release-calendar-views";
import { ReleaseBackToTop } from "@/components/releases/release-back-to-top";
import { releaseInformationGaps } from "@/lib/releases/quality";
import type { CulturalRelease } from "@/lib/releases/types";
import type { ReleaseUserState } from "@/components/releases/release-view";
import { isReleaseId } from "@/components/releases/action-state";

export const metadata: Metadata = { title: "Novedades — Biblioshare" };

type ReleasesSearchParams = { tipo?: string; mercado?: string; seleccion?: string; lanzamiento?: string; mes?: string; dia?: string; vista?: string };
type Selection = "explore" | "personal";

export default async function ReleasesPage({ searchParams }: { searchParams: Promise<ReleasesSearchParams> }) {
  const t = await getTranslations("releases");
  return <div id="novedades-inicio" className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
    <PageHeader title={t("title")} />
    <p className="-mt-3 text-sm text-muted-foreground">{t("intro")}</p>
    <Suspense fallback={<ReleasesSkeleton />}><ReleasesContent searchParams={searchParams} /></Suspense>
    <ReleaseBackToTop />
  </div>;
}

function ReleasesSkeleton() {
  return <div aria-hidden className="flex flex-col gap-5">
    <Skeleton className="h-11 w-72 rounded-md" />
    <Skeleton className="h-16 w-full rounded-md" />
    <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72 rounded-card" /><Skeleton className="h-72 rounded-card" /></div>
  </div>;
}

function releasePath(selection: Selection, type: string, market: string, focused?: string, presentation?: ReleasesSearchParams) {
  const params = new URLSearchParams();
  if (selection === "personal") params.set("seleccion", "personal");
  if (type !== "all") params.set("tipo", type);
  if (market !== "ES") params.set("mercado", market);
  if (focused) params.set("lanzamiento", focused);
  for (const key of ["mes", "dia", "vista"] as const) if (presentation?.[key]) params.set(key, presentation[key]!);
  return `/novedades${params.size ? `?${params}` : ""}`;
}

async function ReleasesContent({ searchParams }: { searchParams: Promise<ReleasesSearchParams> }) {
  await connection();
  const params = await searchParams;
  const today = madridDay(new Date());
  const t = await getTranslations("releases");
  const selection: Selection = params.seleccion === "personal" ? "personal" : "explore";
  const type = ["book", "movie", "series"].includes(params.tipo ?? "") ? params.tipo as "book" | "movie" | "series" : "all";
  const market = ["INT", "all"].includes(params.mercado ?? "") ? params.mercado as "INT" | "all" : "ES";
  const focusedId = isReleaseId(params.lanzamiento) ? params.lanzamiento : undefined;
  const presentation = releaseCalendarState(new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined) as [string, string][]).toString(), today);
  const returnPath = releasePath(selection, type, market, focusedId, { mes: params.mes ? presentation.month : undefined, dia: presentation.day ?? undefined,
    vista: presentation.view === "limited" ? "limitadas" : presentation.view === "undated" ? "sin-mes" : undefined });
  const user = await getCurrentUser();
  if (selection === "personal" && !user) redirect(loginHref(returnPath));
  const filters: ReleaseFilters = { type, market, language: "es", includeUndated: true, from: today };
  const [workResult, sourcesResult, focusedResult] = await Promise.allSettled([
    selection === "personal" && user ? getPersonalReleases(user.id, filters) : getPublicReleases(filters),
    getReleaseSourceStatus(),
    focusedId ? getReleaseById(focusedId) : Promise.resolve(null),
  ]);
  const focused: CulturalRelease | null = focusedResult.status === "fulfilled" && focusedResult.value?.status !== "draft" ? focusedResult.value : null;
  const works = workResult.status === "fulfilled" ? workResult.value : [];
  // A notification can point outside the selected market/date window. Display
  // that work once, with its actual market, rather than silently changing filters.
  const focusedWork = focused ? works.find((work) => work.workKey === focused.work_key) : undefined;
  const fallbackMonth = focused && (focused.date_precision === "day" || focused.date_precision === "month") ? focused.date_value?.slice(0, 7) : undefined;
  const focusedReleases = focused ? focusedWork ? [focused, ...focusedWork.releases.filter((row) => row.id !== focused.id)] : [focused] : [];
  let userState: ReleaseUserState = {};
  let stateAvailable = true;
  if (user && (workResult.status === "fulfilled" || focused)) {
    try { userState = await getReleaseUserState(user.id, [...works.flatMap((work) => work.releases.map((row) => row.id)), ...focusedReleases.map((row) => row.id)]); }
    catch { stateAvailable = false; }
  }
  let internationalSeriesAvailable = false;
  if (workResult.status === "fulfilled" && works.length === 0 && type === "series" && market === "ES") {
    try {
      const international = selection === "personal" && user
        ? await getPersonalReleases(user.id, { ...filters, market: "INT", limit: 1 })
        : await getPublicReleases({ ...filters, market: "INT", limit: 1 });
      internationalSeriesAvailable = international.length > 0;
    } catch { /* A failed optional hint does not turn the verified empty result into an error. */ }
  }
  const limitedWorks = selection === "explore" ? works.filter((work) => releaseInformationGaps(work.releases).length > 0) : [];
  const mainWorks = selection === "explore" ? works.filter((work) => releaseInformationGaps(work.releases).length === 0) : works;
  return <>
    <ReleaseFilterControls selection={selection} type={type} market={market} fallbackMonth={fallbackMonth}>
      {workResult.status === "fulfilled" && (works.length > 0 || focused) && <ReleaseCalendarViews main={mainWorks} limited={limitedWorks} today={today} fallbackMonth={fallbackMonth} />}
    </ReleaseFilterControls>
    {!stateAvailable && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4 text-sm">
      <p>{t("stateUnavailable")}</p><ReleaseRetry />
    </div>}
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-8">
        {focusedId && (focusedResult.status === "rejected" ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />
          : focused ? <section aria-labelledby="novedades-aviso"><h2 id="novedades-aviso" className="mb-4 font-serif text-xl font-semibold">{t("selectedRelease")}</h2>
            <ReleaseFocusedWorkCard key={`${focused.work_key}:${user?.id ?? "anon"}`} releases={focusedReleases} showSynopsis authenticated={Boolean(user)} userState={userState} stateAvailable={stateAvailable} />
          </section> : <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("unavailableTitle")} message={t("unavailableBody")}
            action={!user ? <Link href={loginHref(returnPath)} className={buttonVariants("secondary")}>{t("login")}</Link> : undefined} />)}
        {workResult.status === "rejected" ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />
          : works.length === 0 && !focused ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />}
            title={internationalSeriesAvailable ? t("internationalSeriesTitle") : selection === "personal" ? t("personalEmptyTitle") : t("emptyTitle")}
            message={internationalSeriesAvailable ? t("internationalSeriesBody") : selection === "personal" ? t("personalEmptyBody") : t("emptyBody")}
            action={<Link href={internationalSeriesAvailable ? releasePath(selection, type, "INT") : "/novedades?mercado=all"} className={buttonVariants("secondary")}>
              {internationalSeriesAvailable ? t("internationalSeriesAction") : t("exploreAction")}
            </Link>} /> : <>
            <ReleaseCalendarAgenda key={selection + ":" + (user?.id ?? "anon")} main={mainWorks} limited={limitedWorks} today={today} focusedWorkKey={focused?.work_key}
              fallbackMonth={fallbackMonth}
              authenticated={Boolean(user)} userState={userState} stateAvailable={stateAvailable} />
          </>}
      </div>
      <ReleaseSources sources={sourcesResult.status === "fulfilled" ? sourcesResult.value : null} />
    </div>
  </>;
}
