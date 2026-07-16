"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { EpisodeRow, OwnWatch } from "@/lib/series/get-episode-data";
import { setEpisodeWatched, rateEpisode } from "@/lib/series/episode-actions";
import { EpisodeGrid, type SeasonGroup, type GridSource } from "./episode-grid";
import { EpisodeList } from "./episode-list";
import { EpisodeDetailCard } from "./episode-detail";

type View = "grid" | "list";

export function episodeKey(ep: { season: number; episode: number }): string {
  return `${ep.season}:${ep.episode}`;
}

// Contenedor de la pestaña Episodios (frames 4 y 11): contador de vistos,
// conmutadores de vista (lista/rejilla) y de fuente (mis notas/comunidad),
// temporadas colapsables y el detalle del episodio seleccionado.
//
// El estado "mío" de cada episodio (visto/nota/reseña) vive AQUÍ y no en cada
// fila: el frame 11 ancla el detalle en una tarjeta fija a la derecha mientras
// el 4 lo despliega inline bajo la fila, y son el mismo dato — con copias
// locales por fila (como antes), puntuar desde la tarjeta y desde la fila
// habrían divergido. La capa es de parches optimistas sobre los props del
// servidor, mismo criterio que el resto de la app (verdad del servidor +
// optimismo encima).
export function EpisodePanel({
  seriesId,
  seasons,
  isLoggedIn,
}: {
  seriesId: string;
  seasons: SeasonGroup[];
  isLoggedIn: boolean;
}) {
  const t = useTranslations("episode");
  const [view, setView] = useState<View>("list");
  const [source, setSource] = useState<GridSource>(
    isLoggedIn ? "mine" : "community",
  );
  const [isPending, startTransition] = useTransition();

  const [ownPatches, setOwnPatches] = useState<
    Record<string, Partial<OwnWatch>>
  >({});
  const ownOf = (ep: EpisodeRow): OwnWatch => ({
    ...ep.own,
    ...ownPatches[episodeKey(ep)],
  });

  // Selección única (acordeón): en móvil abre el desplegable inline, en PC
  // enciende la tarjeta de la derecha. El borrador de reseña acompaña a la
  // selección — es EL texto del episodio seleccionado, venga del desplegable
  // o de la tarjeta.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const select = (ep: EpisodeRow) => {
    const k = episodeKey(ep);
    if (selectedKey === k) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(k);
    setDraft(ownOf(ep).review ?? "");
  };

  const patch = (ep: EpisodeRow, p: Partial<OwnWatch>) =>
    setOwnPatches((prev) => ({
      ...prev,
      [episodeKey(ep)]: { ...prev[episodeKey(ep)], ...p },
    }));

  const toggleWatched = (ep: EpisodeRow) => {
    const next = !ownOf(ep).watched;
    patch(
      ep,
      next
        ? { watched: true }
        : { watched: false, rating: null, review: null },
    );
    startTransition(() =>
      setEpisodeWatched(seriesId, ep.season, ep.episode, next),
    );
  };

  const rate = (ep: EpisodeRow, rating: number) => {
    // Si el episodio está seleccionado, la nota arrastra el borrador escrito
    // (comportamiento de siempre: puntuar guardaba lo que hubiera en el
    // textarea); si no, conserva la reseña ya guardada.
    const review =
      selectedKey === episodeKey(ep) ? draft : (ownOf(ep).review ?? "");
    patch(ep, { watched: true, rating, review: review || null });
    startTransition(() =>
      rateEpisode(seriesId, ep.season, ep.episode, rating, review || null),
    );
  };

  const saveReview = (ep: EpisodeRow) => {
    patch(ep, { watched: true, review: draft || null });
    startTransition(() =>
      rateEpisode(seriesId, ep.season, ep.episode, ownOf(ep).rating, draft || null),
    );
  };

  // El contador vive sobre la capa optimista: marcar un episodio lo mueve al
  // instante, sin esperar la revalidación.
  const { total, watched } = useMemo(() => {
    const all = seasons.flatMap((s) => s.episodes);
    return {
      total: all.length,
      watched: all.filter(
        (e) => ({ ...e.own, ...ownPatches[episodeKey(e)] }).watched,
      ).length,
    };
  }, [seasons, ownPatches]);

  // La lista pinta las temporadas de la más reciente a la más antigua (frame
  // 4: T2 abierta arriba, T1 plegada debajo) — el presente primero. La
  // rejilla conserva el orden cronológico: es un mapa, no una lista de
  // actualidad.
  const listSeasons = useMemo(
    () => [...seasons].sort((a, b) => b.season - a.season),
    [seasons],
  );

  const selectedEpisode = useMemo(() => {
    if (!selectedKey) return null;
    for (const s of seasons)
      for (const ep of s.episodes)
        if (episodeKey(ep) === selectedKey) return ep;
    return null;
  }, [seasons, selectedKey]);

  const interactive = source === "mine" && isLoggedIn;

  const sourceToggle = isLoggedIn && (
    <Segmented
      value={source}
      onChange={(v) => setSource(v as GridSource)}
      options={[
        { value: "mine", label: t("sourceMine") },
        { value: "community", label: t("sourceCommunity") },
      ]}
    />
  );

  return (
    // Mismo `.desk-cols` que Registro y Comunidad (1fr 340px, hueco 44) — pero
    // solo en la vista de lista: la rejilla no tiene tarjeta lateral y usa el
    // ancho entero.
    <div
      className={
        view === "list"
          ? "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-x-11"
          : ""
      }
    >
      <div className="flex flex-col">
        {/* `.ep-top` del frame: contador con la cifra en serif, conmutadores a
            la derecha. En móvil el de fuente baja a su propia fila (frame 4);
            en PC caben todos arriba (frame 11). */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-foreground">
            {isLoggedIn
              ? t.rich("watchedProgress", {
                  watched,
                  total,
                  b: (chunks) => (
                    <b className="font-serif text-lg font-semibold">{chunks}</b>
                  ),
                })
              : t("episodeCount", { count: total })}
          </p>
          <div className="flex items-center gap-2">
            <div className="hidden lg:block">{sourceToggle}</div>
            <Segmented
              value={view}
              onChange={(v) => setView(v as View)}
              options={[
                { value: "list", label: t("viewList") },
                { value: "grid", label: t("viewGrid") },
              ]}
            />
          </div>
        </div>
        {isLoggedIn && <div className="mb-4 lg:hidden">{sourceToggle}</div>}

        {view === "grid" ? (
          <EpisodeGrid seasons={seasons} source={source} />
        ) : (
          <EpisodeList
            seasons={listSeasons}
            source={source}
            isLoggedIn={isLoggedIn}
            interactive={interactive}
            isPending={isPending}
            ownOf={ownOf}
            selectedKey={selectedKey}
            onSelect={select}
            onToggleWatched={toggleWatched}
            onRate={rate}
            draft={draft}
            onDraftChange={setDraft}
            onSaveReview={saveReview}
          />
        )}
      </div>

      {view === "list" && (
        <aside className="hidden lg:sticky lg:top-[calc(var(--topbar-h)+34px)] lg:block">
          <EpisodeDetailCard
            episode={selectedEpisode}
            own={selectedEpisode ? ownOf(selectedEpisode) : null}
            source={source}
            interactive={interactive}
            isPending={isPending}
            draft={draft}
            onDraftChange={setDraft}
            onSave={selectedEpisode ? () => saveReview(selectedEpisode) : undefined}
          />
        </aside>
      )}
    </div>
  );
}

// `.ep-tg` del frame: píldora sobre --surface-2 con la opción activa en
// --surface y una sombra corta — el mismo lenguaje que las subtabs de
// Colección.
function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-[8px] bg-surface-muted p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-[6px] px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
            value === o.value
              ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(60,35,15,.1)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
