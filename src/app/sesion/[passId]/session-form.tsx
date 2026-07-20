"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { MediaStatus } from "@/lib/library/types";
import type { Position } from "@/lib/library/position";
import { addSession, type AddSessionState } from "@/lib/sessions/actions";
import { itemHref } from "@/lib/catalog/item-href";
import { timerStorageKey } from "@/lib/sessions/timer";
import { ClosePassSheet } from "@/components/detail/close-pass-sheet";
import { useModalClose } from "@/components/session/session-modal";
import { SessionTimer } from "./session-timer";

const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

const initialState: AddSessionState = {};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Temporada del catálogo con sus episodios (número + si ya está visto por el
// usuario). Sale de series_episodes + episode_watches (Tarea 15): las
// temporadas y episodios nunca se inventan en el cliente.
type SeriesSeasonEpisodes = {
  season: number;
  episodes: { episode: number; watched: boolean }[];
};

export function SessionForm({
  passId,
  itemType,
  itemId,
  position,
  status,
  total,
  seriesEpisodes,
  initialMinutes,
  mode,
}: {
  passId: string;
  itemType: "book" | "series";
  itemId: string;
  position: Position;
  status: MediaStatus;
  total: number | null;
  seriesEpisodes?: SeriesSeasonEpisodes[];
  /** Minutos que trae el cronómetro de la tarjeta de hoy (?minutos=). */
  initialMinutes?: number | null;
  /** Dónde vive el formulario: decide a dónde ir tras guardar. */
  mode: "modal" | "page";
}) {
  const t = useTranslations("session");
  const tLibrary = useTranslations("library");
  const tEpisode = useTranslations("episode");
  const router = useRouter();
  // null en modo "page" (no hay SessionModal por encima). En modo "modal" es
  // el único punto de salida del <dialog> exterior (ver session-modal.tsx):
  // llamarlo aquí en vez de router.back() directamente evita que este
  // componente y el <dialog> exterior disparen cada uno su propio salto de
  // historial para el mismo cierre.
  const modalClose = useModalClose();

  const boundAddSession = addSession.bind(null, passId, itemType, itemId);
  const [state, formAction, pending] = useActionState(
    boundAddSession,
    initialState,
  );

  // Ajuste de estado durante el render (patrón de close-pass-sheet.tsx:51-56):
  // un useEffect con setState dispararía react-hooks/set-state-in-effect.
  const [closingPass, setClosingPass] = useState(false);
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state.passClosed) setClosingPass(true);
  }

  // Navegar NO es setState: un efecto aquí no choca con
  // react-hooks/set-state-in-effect. En modal volvemos atrás (te quedas donde
  // estabas) a través de modalClose (ver arriba), NUNCA con router.back()
  // directo — así este camino comparte el mismo guardián de "un solo salto"
  // que Escape/backdrop y que el cierre de ClosePassSheet más abajo. En la
  // ruta directa no hay a dónde volver, así que vamos a la ficha, que es lo
  // que hacía el redirect del servidor hasta ahora. Si el pase se cerró con
  // esta sesión, la navegación espera: primero se ve la hoja de cierre (más
  // abajo) y es su onClose quien navega.
  useEffect(() => {
    if (!state.ok || state.passClosed) return;
    if (mode === "modal") {
      modalClose?.();
    } else {
      router.push(itemHref(itemType, itemId));
    }
  }, [state, mode, modalClose, router, itemType, itemId]);

  // Opening a session on a "planned" item means you're starting it now.
  const defaultStatus = status === "planned" ? "in_progress" : status;

  const currentPage =
    "page" in position && position.page !== undefined ? position.page : null;

  // Tramo desde → hasta (§Tarea 13): `fromPage` es solo ayuda visual para el
  // delta en vivo, nunca se envía al servidor — la sesión ya registra la
  // posición alcanzada, y el tramo se deduce comparando con la sesión
  // anterior. Por eso este input no lleva `name`.
  const [fromPage, setFromPage] = useState(
    currentPage !== null ? String(currentPage) : "",
  );
  const [toPage, setToPage] = useState("");

  const fromPageNum = fromPage.trim() === "" ? null : Number(fromPage);
  const toPageNum = toPage.trim() === "" ? null : Number(toPage);
  const delta =
    fromPageNum !== null &&
    toPageNum !== null &&
    Number.isFinite(fromPageNum) &&
    Number.isFinite(toPageNum)
      ? toPageNum - fromPageNum
      : null;
  const remaining =
    toPageNum !== null && total !== null ? total - toPageNum : null;

  // Duración: "a mano" (input libre) o "cronómetro" (SessionTimer, que trae
  // su propio input oculto name="durationMinutes"). Solo libro tiene
  // duración — una sesión de serie se mide en episodios (§7.14).
  // Si vienes del cronómetro de la tarjeta de hoy, el tiempo ya está contado:
  // llega "a mano" con el número puesto y editable, no en modo cronómetro — ese
  // reloj ya se paró y se limpió al traerte aquí.
  const [durationMode, setDurationMode] = useState<"manual" | "timer">(
    "manual",
  );
  const [manualMinutes, setManualMinutes] = useState(
    initialMinutes ? String(initialMinutes) : "",
  );

  // El aviso de cronómetro olvidado ofrece "escribir a mano": trae los
  // minutos ya acumulados al campo manual y cambia el conmutador por ti.
  function handleTimerMinutes(minutes: number) {
    setManualMinutes(String(minutes));
    setDurationMode("manual");
  }

  // Serie (§Tarea 15): temporadas + episodios pulsables. `watchedSetFor`
  // busca los ya vistos de una temporada dentro de `seriesEpisodes` (prop
  // del servidor, nunca inventado en el cliente).
  function watchedSetFor(season: number): Set<number> {
    const group = seriesEpisodes?.find((s) => s.season === season);
    return new Set(
      (group?.episodes ?? []).filter((e) => e.watched).map((e) => e.episode),
    );
  }

  const defaultSeason = (() => {
    if (!seriesEpisodes || seriesEpisodes.length === 0) return 1;
    if (
      "season" in position &&
      seriesEpisodes.some((s) => s.season === position.season)
    ) {
      return position.season;
    }
    return seriesEpisodes[seriesEpisodes.length - 1].season;
  })();

  const [season, setSeason] = useState(defaultSeason);
  // `initialWatched` es la foto de "ya visto" al cargar el formulario (no
  // cambia con los clics): sirve de referencia para que el delta cuente solo
  // lo marcado EN esta sesión, no lo ya visto antes.
  const [initialWatched, setInitialWatched] = useState<Set<number>>(() =>
    watchedSetFor(defaultSeason),
  );
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<number>>(() =>
    watchedSetFor(defaultSeason),
  );

  // Cambiar de temporada resetea la selección a lo ya visto de la NUEVA
  // temporada — no arrastra chips marcados de la temporada anterior. Es un
  // manejador de evento (onChange), no un efecto: nada de setState en useEffect.
  function handleSeasonChange(nextSeason: number) {
    setSeason(nextSeason);
    const watched = watchedSetFor(nextSeason);
    setInitialWatched(watched);
    setSelectedEpisodes(watched);
  }

  function toggleEpisode(episode: number) {
    setSelectedEpisodes((prev) => {
      const next = new Set(prev);
      if (next.has(episode)) next.delete(episode);
      else next.add(episode);
      return next;
    });
  }

  const currentSeasonEpisodes =
    seriesEpisodes?.find((s) => s.season === season)?.episodes ?? [];
  const newlyMarked = [...selectedEpisodes].filter(
    (e) => !initialWatched.has(e),
  );
  const maxSelectedEpisode =
    selectedEpisodes.size > 0 ? Math.max(...selectedEpisodes) : null;

  // Al guardar con el cronómetro activo, limpia su localStorage: el valor ya
  // viaja en el FormData a través del input oculto de SessionTimer, así que
  // no hace falta conservarlo para la próxima sesión.
  function handleSubmit() {
    if (itemType === "book" && durationMode === "timer") {
      try {
        window.localStorage.removeItem(timerStorageKey(passId));
      } catch {
        // Almacenamiento inaccesible: nada que limpiar.
      }
    }
  }

  return (
    <>
      <form
        action={formAction}
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <Field label={t("date")} htmlFor="session-date">
          <Input
            id="session-date"
            name="sessionDate"
            type="date"
            required
            defaultValue={todayISO()}
          />
        </Field>

        {/* Solo lectura registra minutos (§7.14): una serie se mide por
          episodios alcanzados, y su duración sale del catálogo. */}
        {itemType === "book" && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("duration")}</span>
            <div className="flex gap-1.5 rounded-[10px] bg-surface-muted p-1">
              {(["manual", "timer"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={durationMode === mode}
                  onClick={() => setDurationMode(mode)}
                  className={`flex-1 rounded-[7px] px-3 py-2 text-center text-[12px] font-semibold transition-colors ${
                    durationMode === mode
                      ? "bg-surface text-foreground shadow-card"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "manual" ? t("durationManual") : t("durationTimer")}
                </button>
              ))}
            </div>

            {durationMode === "manual" ? (
              <div className="mt-2 flex flex-col gap-1">
                <Input
                  id="session-duration"
                  name="durationMinutes"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={t("duration")}
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("durationHint")}
                </p>
              </div>
            ) : (
              <div className="mt-2">
                <SessionTimer passId={passId} onMinutes={handleTimerMinutes} />
              </div>
            )}
          </div>
        )}

        {itemType === "book" ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("pagesRange")}</span>
            <div className="flex items-end gap-2.5">
              <div className="flex-1">
                <Input
                  id="session-from-page"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label={t("pageFrom")}
                  value={fromPage}
                  onChange={(e) => setFromPage(e.target.value)}
                  className="text-center"
                />
                <p className="mt-1.5 text-center text-xs text-muted-foreground">
                  {t("pageFrom")}
                </p>
              </div>
              <span className="pb-4 text-muted-foreground">→</span>
              <div className="flex-1">
                <Input
                  id="session-page"
                  name="page"
                  type="number"
                  min={0}
                  max={total ?? undefined}
                  inputMode="numeric"
                  aria-label={t("pageTo")}
                  value={toPage}
                  onChange={(e) => setToPage(e.target.value)}
                  className="text-center"
                />
                <p className="mt-1.5 text-center text-xs text-muted-foreground">
                  {t("pageTo")}
                </p>
              </div>
            </div>

            {delta !== null && delta > 0 && (
              <span className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-md border border-green/25 bg-green/10 px-2.5 py-1.5 font-mono text-[11px] text-green">
                {t("delta", { delta })}
                {remaining !== null && ` · ${t("remaining", { remaining })}`}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label={t("season")} htmlFor="session-season">
              <Select
                id="session-season"
                name="season"
                value={String(season)}
                onChange={(e) => handleSeasonChange(Number(e.target.value))}
              >
                {(seriesEpisodes ?? []).map((s) => (
                  <option key={s.season} value={s.season}>
                    {tEpisode("season", { n: s.season })}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("episodesLabel")}</span>
              {currentSeasonEpisodes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {currentSeasonEpisodes.map(({ episode }) => {
                    const on = selectedEpisodes.has(episode);
                    return (
                      <button
                        key={episode}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleEpisode(episode)}
                        className={`rounded-md border px-2.5 py-2 font-mono text-[11px] font-semibold transition-colors ${
                          on
                            ? "border-type-series bg-type-series/10 text-type-series"
                            : "border-border bg-surface text-muted-foreground hover:border-type-series/50"
                        }`}
                      >
                        {tEpisode("episodeShort", { n: episode })}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("episodesEmpty")}
                </p>
              )}

              {/* Los hidden inputs viajan como valores repetidos de "episodes";
                addSession los lee con formData.getAll y marca cada uno
                reutilizando la misma escritura que la pestaña Episodios. */}
              {[...selectedEpisodes].map((ep) => (
                <input key={ep} type="hidden" name="episodes" value={ep} />
              ))}

              {newlyMarked.length > 0 && maxSelectedEpisode !== null && (
                <span className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-md border border-green/25 bg-green/10 px-2.5 py-1.5 font-mono text-[11px] text-green">
                  {t("episodesDelta", {
                    count: newlyMarked.length,
                    season,
                    episode: maxSelectedEpisode,
                  })}
                </span>
              )}
            </div>
          </div>
        )}

        <Field label={t("note")} htmlFor="session-note" hint={t("noteHint")}>
          <textarea
            id="session-note"
            name="note"
            rows={3}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {/* Si escribes algo, entra en Memorizar con este tipo y su página
            (P7). El selector solo importa cuando hay texto. */}
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <div className="flex gap-1 rounded-[9px] bg-surface-muted p-1">
              {(["note", "quote"] as const).map((k) => (
                <label
                  key={k}
                  className="cursor-pointer rounded-[6px] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground has-[:checked]:bg-surface has-[:checked]:text-foreground has-[:checked]:shadow-card"
                >
                  <input
                    type="radio"
                    name="noteKind"
                    value={k}
                    defaultChecked={k === "note"}
                    className="sr-only"
                  />
                  {k === "note" ? t("noteKindNote") : t("noteKindQuote")}
                </label>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="noteFavorite"
                className="h-4 w-4 rounded border-border accent-accent"
              />
              {t("noteFavorite")}
            </label>
          </div>
        </Field>

        <Field label={t("status")} htmlFor="session-status">
          <Select
            id="session-status"
            name="status"
            defaultValue={defaultStatus}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {tLibrary(`status.${s}`)}
              </option>
            ))}
          </Select>
        </Field>

        {state.error && (
          <p className="text-sm text-status-dropped">
            {t(`errors.${state.error}`)}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>

      {/* El pase se completó con esta sesión: en vez de navegar a la ficha con
          ?cerrar (lo que hacía el servidor hasta ahora), la hoja de cierre sube
          aquí mismo. Al cerrarla, entonces sí salimos. */}
      <ClosePassSheet
        passId={passId}
        itemType={itemType}
        itemId={itemId}
        open={closingPass}
        onClose={() => {
          setClosingPass(false);
          // Igual que arriba: en modal pasa por modalClose (guardado, un solo
          // salto), no por router.back() directo — "Ahora no" y "Guardar" de
          // ClosePassSheet acaban aquí, y este es el mismo punto de salida
          // que usa el <dialog> exterior para Escape/backdrop.
          if (mode === "modal") modalClose?.();
          else router.push(itemHref(itemType, itemId));
        }}
      />
    </>
  );
}
