"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { UserAvatar } from "@/components/social/user-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BellIcon, XIcon } from "@/components/ui/icons";
import type { FollowerRow } from "@/lib/clubs/activities/event-follow-optimistic";
import { fetchEventFollowers } from "@/lib/clubs/activities/event-followers-actions";

// Quién sigue el evento (§8): unos cuantos avatares + total, y la lista completa
// tras «Ver todos». La lista larga se pide al abrir, paginada, en vez de traer
// cientos de filas para pintar ocho.

export function EventFollowers({
  activityId,
  viewerId,
  organizerId,
  preview,
  total,
  canFollow,
}: {
  activityId: string;
  viewerId: string;
  organizerId: string;
  preview: FollowerRow[];
  total: number;
  /** Si quien mira puede seguirlo, el estado vacío le invita a ser el primero. */
  canFollow: boolean;
}) {
  const t = useTranslations("activity");
  const [abierto, setAbierto] = useState(false);

  if (total === 0) {
    return (
      <div className="rounded-card border border-border bg-surface">
        {/* No se repite aquí el botón de seguir: el CTA ya está justo encima en
            el rail, y dos controles con el MISMO nombre accesible en una pantalla
            son un problema (para el teclado y para los locators), no una
            comodidad. La invitación de §8 la cumple el mensaje. Se detectó
            mirándolo en el navegador. */}
        <EmptyState
          glyph={<BellIcon className="h-6 w-6" />}
          title={t("eventFollowersEmptyTitle")}
          message={canFollow ? t("eventFollowersEmptyHint") : undefined}
        />
      </div>
    );
  }

  const restantes = total - preview.length;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="label-section">{t("eventFollowersTitle")}</h2>

      <div className="flex items-center">
        {preview.map((f) => (
          <div
            key={f.userId}
            className="-ml-2 first:ml-0"
            // El nombre va en el title Y en el sr-only de la lista de abajo: un
            // title suelto no lo anuncia ningún lector de pantalla.
            title={f.displayName}
          >
            <span className="block rounded-full ring-2 ring-surface">
              <UserAvatar name={f.displayName} avatarUrl={f.avatarUrl} size={32} />
            </span>
          </div>
        ))}
        {restantes > 0 && (
          <span className="-ml-2 grid h-8 w-8 place-items-center rounded-full bg-surface-3 font-mono text-[10px] text-foreground-soft ring-2 ring-surface">
            +{restantes}
          </span>
        )}
      </div>

      {/* El recuento es texto, no solo la fila de avatares: es lo que lee un
          lector de pantalla y lo que hace verificable que contador y lista
          coinciden. */}
      <p className="text-sm text-foreground-soft">
        {t("eventFollowersCount", { count: total })}
      </p>

      <div>
        <Button
          type="button"
          variant="secondary"
          className="px-3 py-1.5 text-xs"
          onClick={() => setAbierto(true)}
        >
          {t("eventFollowersSeeAll")}
        </Button>
      </div>

      {abierto && (
        <FollowersDialog
          activityId={activityId}
          viewerId={viewerId}
          organizerId={organizerId}
          total={total}
          onClose={() => setAbierto(false)}
        />
      )}
    </div>
  );
}

function FollowersDialog({
  activityId,
  viewerId,
  organizerId,
  total,
  onClose,
}: {
  activityId: string;
  viewerId: string;
  organizerId: string;
  total: number;
  onClose: () => void;
}) {
  const t = useTranslations("activity");
  const [followers, setFollowers] = useState<FollowerRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  // «Cargando» se DERIVA de qué página se ha traído ya, en vez de guardarse en su
  // propio estado: poner setCargando(true) en el cuerpo del efecto provoca un
  // render en cascada (y lo caza react-hooks/set-state-in-effect). -1 = aún nada.
  const [paginaCargada, setPaginaCargada] = useState(-1);
  const cargando = paginaCargada !== page;
  const cerrarRef = useRef<HTMLButtonElement>(null);
  // Devolver el foco a donde estaba al cerrar: sin esto, cerrar el panel manda el
  // foco al principio del documento y hay que volver a tabular toda la página.
  const focoPrevio = useRef<Element | null>(null);

  useEffect(() => {
    focoPrevio.current = document.activeElement;
    cerrarRef.current?.focus();
    return () => {
      (focoPrevio.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let vivo = true;
    fetchEventFollowers(activityId, page)
      .then((res) => {
        if (!vivo) return;
        setFollowers((prev) => (page === 0 ? res.followers : [...prev, ...res.followers]));
        setHasMore(res.hasMore);
      })
      .finally(() => {
        // Se marca la página como cargada incluso si falló: si no, «Cargando…»
        // se quedaría para siempre en pantalla ante un corte de red.
        if (vivo) setPaginaCargada(page);
      });
    return () => {
      vivo = false;
    };
  }, [activityId, page]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("eventFollowersDialog")}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-card border border-border bg-surface sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="font-serif text-base font-semibold text-foreground">
            {t("eventFollowersCount", { count: total })}
          </h3>
          <button
            ref={cerrarRef}
            type="button"
            onClick={onClose}
            aria-label={t("cancel")}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <ul className="flex flex-col overflow-y-auto px-4">
          {followers.map((f) => {
            const fila = (
              <>
                <UserAvatar name={f.displayName} avatarUrl={f.avatarUrl} size={34} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {f.displayName}
                  </span>
                  {f.username && (
                    <span className="font-mono text-[10.5px] text-muted-foreground">
                      @{f.username}
                    </span>
                  )}
                </span>
              </>
            );
            return (
              <li
                key={f.userId}
                className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-b-0"
              >
                {/* Solo enlaza si ese perfil es alcanzable: un enlace a un perfil
                    privado sería un 404 con nombre y apellidos. */}
                {f.username ? (
                  <Link
                    href={`/u/${f.username}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                  >
                    {fila}
                  </Link>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">{fila}</span>
                )}
                {f.userId === viewerId ? (
                  <span className="shrink-0 rounded-chip border border-accent/40 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-accent uppercase">
                    {t("eventFollowersYou")}
                  </span>
                ) : f.userId === organizerId ? (
                  <span className="shrink-0 font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
                    {t("eventOrganizerTag")}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border px-4 py-3">
          {cargando ? (
            <p className="text-xs text-muted-foreground">{t("eventFollowersLoading")}</p>
          ) : hasMore ? (
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => setPage((p) => p + 1)}
            >
              {t("eventFollowersMore", { count: total - followers.length })}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
