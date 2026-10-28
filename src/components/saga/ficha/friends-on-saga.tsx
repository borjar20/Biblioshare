import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { Skeleton } from "@/components/ui/skeleton";
import type { FriendOnSaga } from "@/lib/sagas/friends";

const VISIBLE = 4;

// «Entre amigos» (spec 2026-10-27, fase 3). Recibe la promesa para que la
// página no la espere: va detrás de <Suspense> y sin lista no pinta nada.
export async function FriendsOnSaga({ friends }: { friends: Promise<FriendOnSaga[]> }) {
  const all = await friends;
  if (all.length === 0) return null;

  const t = await getTranslations("saga");
  const shown = all.slice(0, VISIBLE);
  const more = all.length - shown.length;
  const bold = { b: (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b> };

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4" data-testid="friends-on-saga">
      <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("friendsEyebrow")}</p>
      <p className="mt-0.5 text-sm text-foreground-soft">{t("friendsSummary", { count: all.length })}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {shown.map((f) => {
          const name = f.displayName ?? f.username;
          const pct = f.counted > 0 ? Math.min(100, Math.round((f.completed / f.counted) * 100)) : 0;
          return (
            <li key={f.userId}>
              <div className="flex items-center gap-2.5">
                <UserAvatar name={name} avatarUrl={f.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/u/${f.username}`}
                    className="block truncate text-sm font-semibold underline-offset-2 hover:underline"
                  >
                    {name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.status.kind === "reading" && (
                      <Link href={f.status.href} className="underline-offset-2 hover:underline">
                        {t.rich("friendsReading", { title: f.status.title, ...bold })}
                      </Link>
                    )}
                    {f.status.kind === "last" && (
                      <Link href={f.status.href} className="underline-offset-2 hover:underline">
                        {t.rich("friendsLast", { title: f.status.title, ...bold })}
                      </Link>
                    )}
                    {f.status.kind === "finished" && <span className="text-green">{t("friendsFinished")}</span>}
                    {f.status.kind === "started" && t("friendsStarted")}
                    {f.status.kind === "dropped" && t("friendsDropped")}
                  </p>
                </div>
                {f.average !== null && <RatingDots value={f.average} size="sm" />}
              </div>
              <div
                role="img"
                aria-label={t("friendsProgress", { completed: f.completed, counted: f.counted })}
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-muted"
              >
                <div className="h-full rounded-full bg-green" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {more > 0 && <p className="mt-3 text-xs text-muted-foreground">{t("friendsMore", { count: more })}</p>}
    </section>
  );
}

export function FriendsOnSagaSkeleton() {
  return (
    <div className="hidden h-[180px] lg:block" data-testid="friends-on-saga-skeleton">
      <Skeleton className="size-full rounded-[14px]" />
    </div>
  );
}
