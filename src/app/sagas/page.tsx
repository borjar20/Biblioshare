import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { hasMinRole } from "@/lib/auth/roles";
import { getSagaIndexData } from "@/lib/sagas/get-saga-index";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { SagaFollowButton } from "@/components/saga/saga-follow-button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Sagas — Biblioshare" };

export default async function SagasIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const t = await getTranslations("sagaIndex");
  const tSaga = await getTranslations("saga");
  const supabase = await createClient();
  const data = await getSagaIndexData(supabase, query);
  const canCurate = hasMinRole(data.viewerRole, "collaborator");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {canCurate && (
          <Link
            href="/sagas/nueva"
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
          >
            ＋ {t("new")}
          </Link>
        )}
      </div>

      {/* Búsqueda server por query param (GET), patrón /buscar. */}
      <form action="/sagas">
        <Input type="search" name="q" defaultValue={query} placeholder={t("searchPlaceholder")} />
      </form>

      {data.cards.length === 0 ? (
        <EmptyState
          glyph={<SearchIcon className="h-7 w-7" />}
          title={t("emptyTitle")}
          message={t("emptyDescription")}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.cards.map((card) => (
            <article
              key={card.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                {/* Portada o placeholder con el acento de la saga. El Link va
                    en portada+nombre, no en la tarjeta entera: el botón
                    Seguir no puede anidarse dentro de un enlace. CoverCard no
                    encaja aquí (envuelve la tarjeta entera en su propio Link
                    y fija aspect-[2/3] a ancho completo); portada cruda. */}
                <Link href={`/saga/${card.id}`} className="shrink-0">
                  {card.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={card.coverUrl}
                      alt=""
                      className="h-[84px] w-[56px] rounded-md object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className={`block h-[84px] w-[56px] rounded-md opacity-80 ${SAGA_ACCENT[card.accent].bg}`}
                    />
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link href={`/saga/${card.id}`} className="truncate font-semibold hover:underline">
                    {card.name}
                  </Link>
                  <span className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
                    {tSaga("count", { count: card.titleCount })}
                    {card.children.length > 0 &&
                      ` · ${tSaga("subsagas", { count: card.children.length })}`}
                  </span>
                  {card.children.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {card.children.map((child) => (
                        <Link
                          key={child.id}
                          href={`/saga/${child.id}`}
                          className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <span aria-hidden className={`h-2 w-2 rounded-full ${SAGA_ACCENT[child.accent].bg}`} />
                          {child.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {data.isAuthenticated && (
                <SagaFollowButton sagaId={card.id} isFollowing={data.followedIds.has(card.id)} />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
