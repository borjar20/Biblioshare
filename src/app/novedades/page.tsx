import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getPersonalReleases, getPublicReleases, getReleaseById, getReleaseSourceStatus, getReleaseUserState, type ReleaseFilters } from "@/lib/releases/queries";
import { ReleaseWorkCard } from "@/components/releases/release-work-card";
import { ReleaseSources } from "@/components/releases/release-sources";
import { ReleaseRetry } from "@/components/releases/release-retry";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { CalendarIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { SHELL_GRID } from "@/lib/ui/layout";
import type { CulturalRelease } from "@/lib/releases/types";
import type { ReleaseUserState } from "@/components/releases/release-view";
import { isReleaseId } from "@/components/releases/action-state";

export const metadata: Metadata = { title: "Novedades — Biblioshare" };

type ReleasesSearchParams = { tipo?: string; mercado?: string; seleccion?: string; lanzamiento?: string };
type Selection = "explore" | "personal";

export default async function ReleasesPage({ searchParams }: { searchParams: Promise<ReleasesSearchParams> }) {
  const t = await getTranslations("releases");
  return <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
    <PageHeader title={t("title")} />
    <p className="-mt-3 text-sm text-muted-foreground">{t("intro")}</p>
    <Suspense fallback={<ReleasesSkeleton />}><ReleasesContent searchParams={searchParams} /></Suspense>
  </div>;
}

function ReleasesSkeleton() {
  return <div aria-hidden className="flex flex-col gap-5">
    <Skeleton className="h-11 w-72 rounded-md" />
    <Skeleton className="h-16 w-full rounded-md" />
    <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72 rounded-card" /><Skeleton className="h-72 rounded-card" /></div>
  </div>;
}

function releasePath(selection: Selection, type: string, market: string, focused?: string) {
  const params = new URLSearchParams();
  if (selection === "personal") params.set("seleccion", "personal");
  if (type !== "all") params.set("tipo", type);
  if (market !== "ES") params.set("mercado", market);
  if (focused) params.set("lanzamiento", focused);
  return `/novedades${params.size ? `?${params}` : ""}`;
}

async function ReleasesContent({ searchParams }: { searchParams: Promise<ReleasesSearchParams> }) {
  await connection();
  const params = await searchParams;
  const t = await getTranslations("releases");
  const selection: Selection = params.seleccion === "personal" ? "personal" : "explore";
  const type = ["book", "movie", "series"].includes(params.tipo ?? "") ? params.tipo as "book" | "movie" | "series" : "all";
  const market = ["INT", "all"].includes(params.mercado ?? "") ? params.mercado as "INT" | "all" : "ES";
  const focusedId = isReleaseId(params.lanzamiento) ? params.lanzamiento : undefined;
  const returnPath = releasePath(selection, type, market, focusedId);
  const user = await getCurrentUser();
  if (selection === "personal" && !user) redirect(loginHref(returnPath));
  const filters: ReleaseFilters = { type, market, language: "es", includeUndated: true };
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
  const focusedReleases = focused ? focusedWork ? [focused, ...focusedWork.releases.filter((row) => row.id !== focused.id)] : [focused] : [];
  const visibleWorks = focused ? works.filter((work) => work.workKey !== focused.work_key) : works;
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
  const exact = visibleWorks.filter((work) => work.releases.some((row) => row.date_precision === "day"));
  const announcements = visibleWorks.filter((work) => !exact.includes(work));
  return <>
    <nav aria-label={t("navigation")} className="flex gap-6 overflow-x-auto border-b border-border">
      {(["explore", "personal"] as const).map((option) => <Link key={option} href={releasePath(option, type, market)} aria-current={selection === option ? "page" : undefined}
        className={`shrink-0 border-b-2 px-1 py-3 font-mono text-xs uppercase tracking-wider ${selection === option ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
        {t(option === "explore" ? "browse" : "personal")}
      </Link>)}
    </nav>
    <p className="-mt-3 text-sm text-muted-foreground">{selection === "personal" ? t("personalHint") : t("scope")}</p>
    <form key={`${selection}:${type}:${market}`} action="/novedades" aria-label={t("filters")} className="flex flex-wrap items-end gap-3">
      {selection === "personal" && <input type="hidden" name="seleccion" value="personal" />}
      <div className="flex min-w-0 flex-col gap-1 text-xs font-medium">
        <label htmlFor="novedades-tipo">{t("filters")}</label>
        <Select id="novedades-tipo" name="tipo" defaultValue={type} className="min-h-11">
          {(["all", "book", "movie", "series"] as const).map((value) => <option key={value} value={value}>{t(`types.${value}`)}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1 text-xs font-medium">
        <label htmlFor="novedades-mercado">{t("market")}</label>
        <Select id="novedades-mercado" name="mercado" defaultValue={market} className="min-h-11">
          {(["ES", "INT", "all"] as const).map((value) => <option key={value} value={value}>{t(`markets.${value}`)}</option>)}
        </Select>
      </div>
      <Button type="submit" variant="secondary" className="min-h-11">{t("apply")}</Button>
    </form>
    {!stateAvailable && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4 text-sm">
      <p>{t("stateUnavailable")}</p><ReleaseRetry />
    </div>}
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-8">
        {focusedId && (focusedResult.status === "rejected" ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />
          : focused ? <section aria-labelledby="novedades-aviso"><h2 id="novedades-aviso" className="mb-4 font-serif text-xl font-semibold">{t("selectedRelease")}</h2>
            <ReleaseWorkCard key={`${focused.work_key}:${user?.id ?? "anon"}`} releases={focusedReleases} authenticated={Boolean(user)} userState={userState} stateAvailable={stateAvailable} returnPath={returnPath} />
          </section> : <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("unavailableTitle")} message={t("unavailableBody")}
            action={!user ? <Link href={loginHref(returnPath)} className={buttonVariants("secondary")}>{t("login")}</Link> : undefined} />)}
        {workResult.status === "rejected" ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />} title={t("loadErrorTitle")} message={t("loadErrorBody")} action={<ReleaseRetry />} />
          : works.length === 0 && !focused ? <EmptyState variant="panel" glyph={<CalendarIcon className="h-5 w-5" />}
            title={internationalSeriesAvailable ? t("internationalSeriesTitle") : selection === "personal" ? t("personalEmptyTitle") : t("emptyTitle")}
            message={internationalSeriesAvailable ? t("internationalSeriesBody") : selection === "personal" ? t("personalEmptyBody") : t("emptyBody")}
            action={<Link href={internationalSeriesAvailable ? releasePath(selection, type, "INT") : "/novedades?mercado=all"} className={buttonVariants("secondary")}>
              {internationalSeriesAvailable ? t("internationalSeriesAction") : t("exploreAction")}
            </Link>} /> : <>
            {exact.length > 0 && <section aria-labelledby="novedades-exactas">
              <h2 id="novedades-exactas" className="mb-4 font-serif text-xl font-semibold">{t("exact")}</h2>
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                {exact.map((work) => <ReleaseWorkCard key={`${work.workKey}:${user?.id ?? "anon"}`} releases={work.releases} authenticated={Boolean(user)} userState={userState} stateAvailable={stateAvailable} returnPath={returnPath} />)}
              </div>
            </section>}
            {announcements.length > 0 && <section aria-labelledby="novedades-anuncios">
              <h2 id="novedades-anuncios" className="font-serif text-xl font-semibold">{t("announcements")}</h2>
              <p className="mb-4 mt-2 text-sm text-muted-foreground">{t("announcementsNote")}</p>
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                {announcements.map((work) => <ReleaseWorkCard key={`${work.workKey}:${user?.id ?? "anon"}`} releases={work.releases} authenticated={Boolean(user)} userState={userState} stateAvailable={stateAvailable} returnPath={returnPath} />)}
              </div>
            </section>}
          </>}
      </div>
      <ReleaseSources sources={sourcesResult.status === "fulfilled" ? sourcesResult.value : null} />
    </div>
  </>;
}
