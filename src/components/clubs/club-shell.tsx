import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { getClub } from "@/lib/clubs/clubs";
import type { ClubTab } from "./club-tabs";
import { ClubCoverBand } from "./club-cover";
import { ChevronLeftIcon, LockIcon, CheckIcon } from "@/components/ui/icons";

type ClubDetail = NonNullable<Awaited<ReturnType<typeof getClub>>>;

// Shell del club en escritorio (frames 10–12, P6): a partir de `lg` el club se
// pinta como [sidebar | main] anidado bajo el topbar global; por debajo se
// mantiene el árbol móvil (cabecera + pestañas horizontales). El CONTENIDO se
// pinta una sola vez en `main`; solo el chrome de navegación se desdobla por
// breakpoint (la tabbar horizontal vs el sidebar), así que no hay duplicados
// que confundan a los locators de la suite (que corre a 1280 = lg).
export function ClubShell({
  sidebar,
  mobileHeader,
  desktopHeader,
  children,
}: {
  sidebar: ReactNode;
  mobileHeader: ReactNode;
  desktopHeader: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="lg:grid lg:grid-cols-[256px_1fr]">
      <div className="hidden lg:block">{sidebar}</div>

      <div className="min-w-0">
        {/* Chrome móvil: banner + pestañas, centrado como el resto de la app. */}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-8 lg:hidden">
          {mobileHeader}
        </div>

        {/* Cabecera de escritorio: sticky bajo el topbar global. */}
        <div className="sticky top-[var(--topbar-h)] z-10 hidden border-b border-border bg-background/85 backdrop-blur lg:block">
          {desktopHeader}
        </div>

        <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:mx-0 lg:max-w-none lg:px-8">
          {children}
        </div>
      </div>
    </div>
  );
}

// Cabecera del panel de escritorio (frame 10): título serif + acción primaria.
export function ClubMainHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-8 py-4">
      <h2 className="font-serif text-[23px] font-semibold text-foreground">
        {title}
      </h2>
      {action}
    </div>
  );
}

// Sidebar de navegación del club (`.cnav` del frame 10): banner + identidad +
// las cuatro entradas (Feed · Actividades · Miembros · Gestión) + pie con el
// estado de pertenencia. Es navegación DEL club, distinta de la nav global del
// topbar.
export async function ClubSidebar({
  club,
  active,
  canModerate,
  pendingProposals,
}: {
  club: ClubDetail;
  active: ClubTab | "miembros";
  canModerate: boolean;
  pendingProposals: number;
}) {
  const t = await getTranslations("club");
  const tt = await getTranslations("club.tabs");
  const base = `/club/${club.slug}`;

  const items: {
    key: ClubTab | "miembros";
    href: string;
    label: string;
    pip?: number;
    mark?: boolean;
    meta?: string;
  }[] = [
    { key: "feed", href: `${base}?tab=feed`, label: tt("feed") },
    {
      key: "actividades",
      href: `${base}?tab=actividades`,
      label: tt("actividades"),
      pip: canModerate ? pendingProposals : undefined,
    },
    {
      key: "miembros",
      href: `${base}/miembros`,
      label: t("directoryTitle"),
      meta: String(club.memberCount),
    },
  ];
  if (canModerate) {
    items.push({
      key: "gestion",
      href: `${base}?tab=gestion`,
      label: tt("gestion"),
      mark: true,
    });
  }

  return (
    <aside className="sticky top-[var(--topbar-h)] flex h-[calc(100vh-var(--topbar-h))] flex-col overflow-y-auto border-r border-border bg-surface">
      <div className="relative">
        <ClubCoverBand coverUrl={club.coverUrl} seed={club.id} className="h-[76px]" />
        <Link
          href="/clubes"
          aria-label={t("back")}
          className="absolute top-3 left-3 grid h-[30px] w-[30px] place-items-center rounded-lg border border-border bg-surface/80 text-foreground backdrop-blur-sm transition-colors hover:bg-surface"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Link>
      </div>

      <div className="px-4 pt-3.5 pb-1.5">
        <div className="font-serif text-[19px] leading-tight font-semibold text-foreground">
          {club.name}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
          {club.visibility === "private" && (
            <span className="inline-flex items-center gap-1">
              <LockIcon aria-hidden className="h-3 w-3" />
              {t("chipPrivate")}
            </span>
          )}
          <span>· {t("memberCount", { count: club.memberCount })}</span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 p-3">
        {items.map((item) => {
          const on = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[9px] px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
                on
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
              }`}
            >
              <span className="flex-1">{item.label}</span>
              {item.pip ? (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[9px] text-accent-foreground">
                  {item.pip}
                </span>
              ) : item.meta ? (
                <span className="font-mono text-[11px] text-foreground-faint">{item.meta}</span>
              ) : item.mark ? (
                <span aria-hidden className="text-[11px] text-foreground-faint">◈</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {club.viewerStatus === "active" && (
        <div className="mt-auto border-t border-border p-3.5">
          <span className="flex w-full items-center justify-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground">
            <CheckIcon className="h-3.5 w-3.5 text-green" />
            {t("memberChip")}
          </span>
        </div>
      )}
    </aside>
  );
}
