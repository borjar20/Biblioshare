"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { MediaStatus } from "@/lib/library/types";
import { addSession, type AddSessionState } from "@/lib/sessions/actions";
import { checkCelebrations } from "@/lib/celebrations/preference";
import { itemHref } from "@/lib/catalog/item-href";
import { timerStorageKey } from "@/lib/sessions/timer";
import { ClosePassSheet } from "@/components/detail/close-pass-sheet";
import type { SessionContext } from "@/lib/sessions/load-context";
import { useModalClose } from "./session-modal";
import { BookProgressField } from "./book-progress-field";
import { SeriesEpisodeGrid } from "./series-episode-grid";
import { SessionHero } from "./session-hero";
import type { NoteAnchor } from "@/components/notes/note-composer";
import { SessionNotebook } from "./session-notebook";

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

// Hoja de registrar sesión: dueña de su propio chrome (cabecera y footer
// pegajosos + SessionHero) — la ruta directa y la interceptada solo cargan
// `ctx` (Tarea 1) y la montan. El cuaderno de notas (SessionNotebook) vive
// aquí anclado al campo VIVO de progreso, no a `position`. El estado sigue
// disponible pero plegado en un <details> — el caso normal de "registrar y
// seguir" no lo necesita.
export function SessionSheet({
  ctx,
  initialMinutes,
  initialStartedAt,
  mode,
}: {
  ctx: SessionContext;
  /** Minutos que trae el cronómetro de la tarjeta de hoy (?minutos=). */
  initialMinutes?: number | null;
  /** Hora de inicio (ISO) que trae el mismo cronómetro (?inicio=): sin ella,
   *  "Cuándo lees" no vería la sesión. La hoja la envía tal cual en un input
   *  oculto salvo que el usuario ponga una hora a mano. */
  initialStartedAt?: string | null;
  /** Dónde vive la hoja: decide a dónde ir tras guardar/cerrar. */
  mode: "modal" | "page";
}) {
  const { passId, itemType, itemId, position, status, total, seriesEpisodes } = ctx;

  const t = useTranslations("session");
  const tLibrary = useTranslations("library");
  const router = useRouter();
  // null en modo "page" (no hay SessionModal por encima). En modo "modal" es
  // el único punto de salida del <dialog> exterior (ver session-modal.tsx):
  // llamarlo aquí en vez de navegar por nuestra cuenta evita que este
  // componente y el <dialog> exterior disparen cada uno su propia salida para
  // el mismo cierre.
  const modalClose = useModalClose();

  // Única salida de la hoja. En modal emboca al closeOnce() de SessionModal
  // (una sola navegación pase lo que pase, y a la ficha por href fijo: el
  // historial no es fiable aquí, ver issue #117 en session-modal.tsx); en la
  // ruta directa no hay a dónde volver, así que va a la ficha. useCallback le
  // da una identidad estable: la usa el useEffect de más abajo como
  // dependencia sin reejecutarse en cada render.
  const closeSheet = useCallback(() => {
    if (mode === "modal") modalClose?.();
    else router.push(itemHref(itemType, itemId));
  }, [mode, modalClose, router, itemType, itemId]);

  const boundAddSession = addSession.bind(null, passId, itemType, itemId);
  const [state, formAction, pending] = useActionState(
    boundAddSession,
    initialState,
  );

  // Ajuste de estado durante el render (patrón de close-pass-sheet.tsx:51-56):
  // un useEffect con setState dispararía react-hooks/set-state-in-effect.
  const [closingPass, setClosingPass] = useState(false);
  const [prevState, setPrevState] = useState(state);
  // Controlado (antes defaultValue-only) porque BookProgressField necesita el
  // valor EN VIVO para combinarlo con la hora opcional en combineStartedAt —
  // ver book-progress-field.tsx.
  const [sessionDate, setSessionDate] = useState(todayISO());
  if (state !== prevState) {
    setPrevState(state);
    if (state.passClosed) setClosingPass(true);
  }

  // Navegar NO es setState: un efecto aquí no choca con
  // react-hooks/set-state-in-effect. El cierre pasa siempre por closeSheet
  // (arriba), NUNCA navegando por su cuenta — así este camino comparte el
  // mismo guardián de "una sola salida" que Escape/backdrop y que el cierre de
  // ClosePassSheet más abajo. Si el pase se cerró con esta sesión, la
  // navegación espera: primero se ve la hoja de cierre (más abajo) y es su
  // onClose quien navega.
  useEffect(() => {
    if (!state.ok) return;
    // El guardado pudo ganar celebraciones en servidor (primera actividad,
    // objetivo diario, hito de racha): que el provider las drene y anime. Va
    // aquí y no en el bloque de derivación porque disparar un evento es un
    // efecto, no estado derivado. Se pide también cuando el pase se cierra.
    checkCelebrations();
    if (state.passClosed) return;
    closeSheet();
  }, [state, closeSheet]);

  // Opening a session on a "planned" item means you're starting it now.
  const defaultStatus = status === "planned" ? "in_progress" : status;

  const currentPage =
    "page" in position && position.page !== undefined ? position.page : null;

  // Serie: temporada de partida para SeriesEpisodeGrid (misma regla que
  // session-form.tsx antes de la Tarea 7 — la del `position` actual si sigue
  // en el catálogo, si no la última). El resto del estado de episodios
  // (temporada activa, seleccionados, foto de "ya visto") vive ahora dentro
  // de SeriesEpisodeGrid; aquí solo queda el contador que sube el footer.
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

  const [newlyMarkedCount, setNewlyMarkedCount] = useState(0);

  // El anclaje del compositor sigue al campo VIVO, no a `position` (la posición
  // GUARDADA del pase). Si leyera `position`, anotarías en la 240 y se
  // guardaría la 180: es el defecto más probable de esta pantalla y tiene e2e
  // propio (e2e/notas-captura.spec.ts).
  const [livePage, setLivePage] = useState<number | null>(currentPage);
  const [lastEpisode, setLastEpisode] = useState<{ season: number; episode: number } | null>(
    null,
  );
  const [noteCount, setNoteCount] = useState(0);
  const [notePending, setNotePending] = useState(false);
  // Compartir en el perfil (Spec 2): opt-in. Controla si se despliega el texto
  // social; sin marcar, la sesión queda privada (+ notas) como hasta ahora.
  const [share, setShare] = useState(false);

  const noteAnchor: NoteAnchor =
    itemType === "book"
      ? { kind: "page", page: livePage }
      : lastEpisode
        ? { kind: "episode", season: lastEpisode.season, episode: lastEpisode.episode }
        : { kind: "none" };

  // Al guardar, limpia siempre el localStorage del cronómetro de este pase:
  // si estaba activo, su valor ya viajó en el FormData a través del input
  // oculto de SessionTimer (dentro de BookProgressField), así que no hace
  // falta conservarlo; si no estaba activo, el remove es idempotente. Este
  // componente ya no sabe qué modo de duración eligió el usuario — vive
  // encapsulado en BookProgressField — así que no hay nada que consultar.
  function handleSubmit() {
    if (itemType !== "book") return;
    try {
      window.localStorage.removeItem(timerStorageKey(passId));
    } catch {
      // Almacenamiento inaccesible: nada que limpiar.
    }
  }

  return (
    <>
      {/* Región de scroll de la hoja (fix bug de Tarea 5→6): en modo modal,
          este <form> es el único hijo visible de un <dialog> con
          `overflow-hidden` y altura acotada (100dvh en móvil, ≤90dvh en pc,
          ver session-modal.tsx). Antes de este fix el <form> no tenía
          `overflow`, así que el contenido que no cabía simplemente se
          desbordaba de su caja y el `overflow-hidden` del <dialog> lo
          recortaba sin dar ninguna forma de llegar a él (medido: ~184px
          perdidos a 390×560, con `scrollTop` fijado en 0 pase lo que pase).
          `flex-1` + `min-h-0` + `overflow-y-auto` arreglan justo eso:
            - `flex-1` hace que el <dialog> (ahora `flex flex-col`) le ceda
              exactamente el hueco disponible, no más.
            - `min-h-0` es LO QUE HACE FALTA PARA QUE LO DE ARRIBA FUNCIONE:
              por defecto, un hijo flex no se encoge por debajo de la altura
              de su propio contenido (`min-height: auto`), así que sin esto
              el formulario seguiría "queriendo" sus ~744px y volveríamos al
              mismo recorte aunque el <dialog> ya fuera flex. Con
              `min-h-0` se le permite encogerse al hueco real y es entonces
              cuando `overflow-y-auto` tiene algo que recortar-y-scrollear en
              vez de no hacer nada en silencio. NO BORRAR min-h-0 aunque
              "no parezca hacer nada": es la pieza invisible.
          La cabecera y el footer siguen con `sticky top-0`/`sticky bottom-0`
          tal cual Tarea 5 los dejó — con el <form> como su contenedor de
          scroll, quedan fijos arriba/abajo mientras el hero y los campos del
          medio se desplazan por debajo.
          En modo página (sin <dialog> por encima) el <dialog> flex no existe:
          `flex-1` no hace nada fuera de un contenedor flex y `min-h-0` no
          cambia nada en un elemento cuya altura ya era `auto`, así que el
          <form> vuelve a su altura natural y es el documento quien scrollea,
          exactamente como antes de este fix. */}
      <form
        action={formAction}
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {/* `shrink-0`: cabecera, hero y footer son hermanos flex de este
            <form> flex-col — sin esto, cuando el contenido de en medio
            desborda el hueco disponible, flexbox reparte la compresión entre
            TODOS los hermanos por igual (flex-shrink:1 por defecto), no solo
            en el que tiene overflow real. Con `shrink-0` esta cabecera queda
            fuera de ese reparto y conserva su altura natural; solo el bloque
            de campos de más abajo (el que sí tiene `flex-1`, sin `shrink-0`)
            absorbe el hueco que falta o sobra, y si no le basta, es el
            <form> quien scrollea (overflow-y-auto, ver comentario de arriba). */}
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between bg-background/90 px-4 py-3.5 backdrop-blur">
          <span className="font-serif text-[17px] font-semibold">{t("sheetTitle")}</span>
          <button
            type="button"
            onClick={closeSheet}
            aria-label={t("close")}
            className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border bg-surface text-muted-foreground"
          >
            ✕
          </button>
        </div>

        <SessionHero
          itemType={itemType}
          title={ctx.title}
          author={ctx.author}
          coverUrl={ctx.coverUrl}
          statusLabel={tLibrary(`status.${ctx.status}`)}
        />

        {/* Este es el único hermano SIN `shrink-0`: es el que debe absorber el
            hueco que falte o sobre entre cabecera+hero+footer (arriba) y la
            altura real del <form>. No necesita `min-h-0` propio — no es él
            quien scrollea, es el <form> — así que su altura mínima natural
            (la de su contenido) es justo lo que queremos: si no cabe, el
            <form> se encarga con su overflow-y-auto. */}
        <div className="flex flex-1 flex-col gap-5 px-4 pb-4">
          <Field label={t("date")} htmlFor="session-date">
            <Input
              id="session-date"
              name="sessionDate"
              type="date"
              required
              max={todayISO()}
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </Field>

          {itemType === "book" ? (
            <BookProgressField
              passId={passId}
              fromPage={currentPage}
              total={total}
              initialMinutes={initialMinutes}
              initialStartedAt={initialStartedAt}
              onPageChange={setLivePage}
              sessionDate={sessionDate}
            />
          ) : (
            <SeriesEpisodeGrid
              seasons={seriesEpisodes ?? []}
              initialSeason={defaultSeason}
              onNewlyMarkedChange={(count, last) => {
                setNewlyMarkedCount(count);
                setLastEpisode(last);
              }}
            />
          )}

          <SessionNotebook
            itemType={itemType}
            itemId={itemId}
            anchor={noteAnchor}
            anchorHint={t("noteAnchorHint")}
            onPendingChange={setNotePending}
            onCountChange={setNoteCount}
          />

          {/* Compartir en el perfil (Spec 2): opt-in explícito dentro del propio
              formulario — la decisión de compartir vive aquí, no en un compositor
              aparte. Marcado, addSession publica un post 'progressed' con el
              texto opcional como cuerpo social; las notas del cuaderno siguen
              siendo privadas. */}
          <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                name="share"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-accent"
              />
              {t("shareLabel")}
            </label>
            {share && (
              <>
                <textarea
                  name="shareBody"
                  maxLength={2000}
                  rows={2}
                  placeholder={t("sharePlaceholder")}
                  className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="shareSpoiler"
                    className="h-4 w-4 rounded border-border accent-accent"
                  />
                  {t("shareSpoiler")}
                </label>
              </>
            )}
          </div>

          {/* Estado plegado (D8): el caso normal —registrar y seguir— no lo ve.
              Sigue disponible para abandonar o completar a mano sin ir a la ficha. */}
          <details className="rounded-lg border border-border bg-surface">
            <summary className="cursor-pointer px-3 py-2.5 text-[12.5px] font-semibold text-muted-foreground">
              {t("statusToggle")}
            </summary>
            <div className="border-t border-border px-3 py-3">
              <Select id="session-status" name="status" defaultValue={defaultStatus}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tLibrary(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </div>
          </details>
        </div>

        {/* `shrink-0` por el mismo motivo que la cabecera de arriba: este
            footer no debe encogerse cuando el contenido de en medio no cabe.
            El aviso de error vive AQUÍ, no en la columna de campos que
            scrollea de más arriba: si el usuario ya hizo scroll hasta el
            fondo para llegar al botón, un aviso pintado arriba queda fuera
            de vista y ve un botón deshabilitado sin explicación. */}
        <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-background/92 px-4 pt-3.5 pb-4 backdrop-blur">
          {state.error && (
            <p className="mb-2.5 text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
          )}
          {notePending && (
            <p className="mb-2.5 text-sm text-status-dropped">{t("notePendingHint")}</p>
          )}
          <Button type="submit" disabled={pending || notePending} className="w-full">
            {pending
              ? t("submitting")
              : noteCount > 0
                ? t("submitWithNote")
                : itemType === "series" && newlyMarkedCount > 0
                  ? t("submitEpisodes", { count: newlyMarkedCount })
                  : t("submit")}
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {itemType === "book" ? t("footerHintBook") : t("footerHintSeries")}
          </p>
        </div>
      </form>

      {/* El pase se completó con esta sesión: en vez de navegar a la ficha con
          ?cerrar (lo que hacía el servidor hasta ahora), la hoja de cierre sube
          aquí mismo. Al cerrarla, entonces sí salimos — por el mismo closeSheet
          que usa el ✕ y el guardado normal. */}
      <ClosePassSheet
        passId={passId}
        itemType={itemType}
        itemId={itemId}
        status="completed"
        open={closingPass}
        onClose={() => {
          setClosingPass(false);
          closeSheet();
        }}
      />
    </>
  );
}
