"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "@/lib/editions/types";
import type { Pass } from "@/lib/passes/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { formatEditionDetails } from "@/lib/editions/edition-label";
import { createEdition, type CreateEditionState } from "@/lib/editions/actions";
import {
  chooseEditionCandidate,
  fetchEditionCandidates,
  type EditionCandidate,
} from "@/lib/editions/fetch-candidates";
import { EditionFields } from "./edition-fields";
import { ChevronDownIcon, SearchIcon } from "@/components/ui/icons";

const initialCreateState: CreateEditionState = {};

// Clases de hover por tipo, escritas ENTERAS (media-accent.ts no puede dar
// variantes hover: interpolarlas dejaría a Tailwind sin verlas).
const HOVER_BORDER: Record<ItemType, string> = {
  book: "hover:border-type-book",
  movie: "hover:border-type-movie",
  series: "hover:border-type-series",
};

const dateFmt = new Intl.DateTimeFormat("es", {
  day: "numeric",
  month: "short",
});

// "28 jun" si es de este año, "2019" si no — como el `.pgn` del frame.
function shortWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.getFullYear() === new Date().getFullYear()
    ? dateFmt.format(d)
    : String(d.getFullYear());
}

type Usage = { count: number; latest: Pass };

// El selector de edición del frame 7 (`.edpick`): tarjetas-radio con el
// formato como pastilla, la editorial como nombre y los metadatos en mono;
// las ediciones YA USADAS en otros pases destacadas arriba con su recuento y
// su último uso, el resto en una lista scrolleable con buscador cuando son
// muchas, y "+ Es una edición nueva" (colaborador+) que crea y elige en el
// mismo gesto. Elegir es un clic — no hay radio + confirmar: cada tarjeta
// dispara onPick directamente, igual que hacían las listas planas a las que
// esta pieza sustituye.
export function EditionPicker({
  itemType,
  itemId,
  editions,
  passes,
  title,
  disabled = false,
  canContribute = false,
  passId,
  onPick,
  onUnknown,
  onCandidatePicked,
}: {
  itemType: ItemType;
  itemId: string;
  editions: Edition[];
  /** Para el grupo "Ya las has usado"; [] si no hay historial (primer seguir). */
  passes: Pass[];
  title: string;
  disabled?: boolean;
  canContribute?: boolean;
  /**
   * Pase que se está identificando. Solo con él (y en libros) se ofrecen los
   * bloques 2 y 3 — escanear el ISBN y las candidatas de OpenLibrary — porque
   * ambos terminan escribiendo en un pase concreto. Sin pase, el selector es
   * el de siempre: elegir entre lo que ya está en la ficha.
   */
  passId?: string;
  onPick: (editionId: string) => void;
  /** Si se pasa, se ofrece la salida "No lo sé" (no fija edición). */
  onUnknown?: () => void;
  /**
   * Elegir una candidata de OpenLibrary YA la persistió y la asoció al pase en
   * el servidor (`chooseEditionCandidate`), así que esto no es un `onPick`: no
   * hay que volver a guardar nada, solo cerrar la pregunta.
   */
  onCandidatePicked?: () => void;
}) {
  const t = useTranslations("editions");
  const tStatus = useTranslations("library.status");
  const tSegments = useTranslations("detail.statusSegments");
  const accent = MEDIA_ACCENT[itemType];
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // Bloque 3, «Más ediciones (OpenLibrary)». `null` = todavía no se ha pedido:
  // es lo que distingue "aún no se ha desplegado" de "se desplegó y no hay
  // ninguna", que se pintan distinto.
  const [candidates, setCandidates] = useState<EditionCandidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [choosingIsbn, setChoosingIsbn] = useState<string | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const createAction = createEdition.bind(null, itemType, itemId);
  const [createState, createFormAction, createPending] = useActionState(
    createAction,
    initialCreateState,
  );

  // Crear con éxito ELIGE la edición nueva: mismo patrón prevState-durante-
  // el-render que el resto de la app (nada de useEffect).
  const [prevCreateState, setPrevCreateState] = useState(createState);
  if (createState !== prevCreateState) {
    setPrevCreateState(createState);
    if (createState.ok && createState.editionId) {
      onPick(createState.editionId);
    }
  }

  // Uso por edición: los pases llegan del más reciente al más antiguo
  // (getPasses), así que el primero que se ve de cada edición es su último
  // uso.
  const usage = useMemo(() => {
    const map = new Map<string, Usage>();
    for (const pass of passes) {
      if (!pass.editionId) continue;
      const prev = map.get(pass.editionId);
      if (prev) prev.count += 1;
      else map.set(pass.editionId, { count: 1, latest: pass });
    }
    return map;
  }, [passes]);

  const normalized = query.trim().toLowerCase();
  const matches = (e: Edition) =>
    normalized.length === 0 ||
    [e.label, e.publisher, e.isbn, e.language, e.year?.toString()]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(normalized));

  const used = editions.filter((e) => usage.has(e.id) && matches(e));
  const rest = editions.filter((e) => !usage.has(e.id) && matches(e));

  const showOpenLibraryBlocks = itemType === "book" && Boolean(passId);

  // El verbo por tipo, como en la píldora del hero ("Leyendo"/"Leído" — el
  // genérico "En curso" no existe en la ficha, decisión del plan 06 §6).
  function statusWord(status: Pass["status"]): string {
    if (status === "in_progress") return tSegments(`inProgress.${itemType}`);
    if (status === "completed") return tSegments(`completed.${itemType}`);
    return tStatus(status);
  }

  function pgnLabel(e: Edition): React.ReactNode {
    const u = usage.get(e.id);
    if (!u) return t("noPasses");
    const when = u.latest.finishedOn ?? u.latest.startedOn;
    return (
      <>
        {statusWord(u.latest.status)}
        {when && (
          <>
            <br />
            {shortWhen(when)}
          </>
        )}
      </>
    );
  }

  // Perezoso A PROPÓSITO: se dispara al DESPLEGAR, no al abrir el selector.
  // Cargarlo siempre convertiría cada apertura del panel de progreso en una
  // llamada a OpenLibrary, y la inmensa mayoría de las veces el usuario elige
  // en el bloque 1 sin bajar hasta aquí. Una sola vez por montaje: si ya hay
  // lista (aunque esté vacía) no se vuelve a pedir al plegar y desplegar.
  async function loadCandidates() {
    if (candidates !== null || loadingCandidates) return;
    setLoadingCandidates(true);
    setCandidateError(null);
    try {
      setCandidates(await fetchEditionCandidates(itemId));
    } catch {
      // fetchEditionCandidates ya se traga sus fallos y devuelve []; esto cubre
      // que se caiga la propia llamada a la server action (red del cliente).
      setCandidateError("generic");
      setCandidates([]);
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function pickCandidate(candidate: EditionCandidate) {
    if (!passId) return;
    setChoosingIsbn(candidate.isbn);
    setCandidateError(null);
    const result = await chooseEditionCandidate(passId, itemId, candidate);
    setChoosingIsbn(null);
    if (result.ok) {
      onCandidatePicked?.();
      return;
    }
    setCandidateError(result.reason);
  }

  function candidateCard(c: EditionCandidate) {
    const busy = choosingIsbn === c.isbn;
    const meta = [c.year, c.language?.toUpperCase(), c.pages ? `${c.pages} p` : null]
      .filter(Boolean)
      .join(" · ");
    return (
      <button
        key={c.isbn}
        type="button"
        disabled={disabled || choosingIsbn !== null}
        onClick={() => void pickCandidate(c)}
        className={`flex w-full items-center gap-3 rounded-[10px] border border-border bg-surface px-[13px] py-3 text-left transition-colors disabled:opacity-60 ${HOVER_BORDER[itemType]}`}
      >
        {c.coverUrl ? (
          // Portada de una edición que aún NO tiene fila propia: viene de
          // covers.openlibrary.org, mismo criterio que las otras tarjetas de
          // catálogo (item-picker.tsx).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.coverUrl}
            alt=""
            loading="lazy"
            className="h-10 w-7 shrink-0 rounded object-cover"
          />
        ) : (
          <span aria-hidden className="h-10 w-7 shrink-0 rounded bg-surface-muted" />
        )}
        <span className="min-w-0 flex-1">
          <span className="inline-block rounded-[4px] bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] tracking-[0.05em] text-muted-foreground uppercase">
            {c.label}
          </span>
          {c.publisher && (
            <span className="mt-[5px] block truncate text-[12.5px] leading-[1.25] font-semibold text-foreground">
              {c.publisher}
            </span>
          )}
          <span className="mt-1 block font-mono text-[9.5px] leading-[1.5] text-muted-foreground">
            {meta ? `${meta} · ISBN ${c.isbn}` : `ISBN ${c.isbn}`}
          </span>
        </span>
        {busy && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
            {t("choosingCandidate")}
          </span>
        )}
      </button>
    );
  }

  function card(e: Edition) {
    const u = usage.get(e.id);
    return (
      <button
        key={e.id}
        type="button"
        disabled={disabled}
        onClick={() => onPick(e.id)}
        className={`flex w-full items-center gap-3 rounded-[10px] border border-border bg-surface px-[13px] py-3 text-left transition-colors disabled:opacity-60 ${HOVER_BORDER[itemType]}`}
      >
        {/* El radio del frame es visual: elegir es el propio clic. */}
        <span
          aria-hidden
          className="h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-border"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="inline-block rounded-[4px] bg-surface-muted px-1.5 py-0.5 font-mono text-[9px] tracking-[0.05em] text-muted-foreground uppercase">
              {e.label}
            </span>
            {u && (
              <span
                className={`inline-block rounded-[4px] border px-[5px] py-px font-mono text-[8.5px] tracking-[0.05em] uppercase ${accent.text} ${accent.borderSoft}`}
              >
                {t("passCount", { count: u.count })}
              </span>
            )}
          </span>
          {e.publisher && (
            <span className="mt-[5px] block truncate text-[12.5px] leading-[1.25] font-semibold text-foreground">
              {e.publisher}
            </span>
          )}
          <span className="mt-1 block font-mono text-[9.5px] leading-[1.5] text-muted-foreground">
            {formatEditionDetails(e, itemType, { withPublisher: false })}
          </span>
        </span>
        <span className="shrink-0 text-right font-mono text-[10px] leading-[1.4] text-muted-foreground/70">
          {pgnLabel(e)}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-semibold text-foreground">{title}</span>

      {/* `.pfhint`: por qué importa la edición, en la caja dorada del frame. */}
      <div className="flex items-start gap-2 rounded-[9px] border border-[color:color-mix(in_oklab,var(--gold)_30%,transparent)] bg-[color:color-mix(in_oklab,var(--gold)_12%,var(--surface))] px-3 py-2.5 text-[11.5px] leading-[1.5] text-foreground-soft">
        <span aria-hidden className="shrink-0 text-gold">
          ◆
        </span>
        <span>{itemType === "movie" ? t("hintMovie") : t("hintBook")}</span>
      </div>

      {/* Con pocas ediciones el buscador es ruido; el frame lo dibuja para
          una ficha con 12. */}
      {editions.length > 5 && (
        <label className="flex items-center gap-2 rounded-[9px] border border-border bg-surface px-[11px] py-[9px]">
          <SearchIcon
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </label>
      )}

      {used.length > 0 && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] tracking-[0.05em] text-muted-foreground/70 uppercase">
              {t("usedBefore")}
            </span>
            <span
              className={`inline-block rounded-[4px] border px-[5px] py-px font-mono text-[8.5px] tracking-[0.05em] uppercase ${accent.text} ${accent.borderSoft}`}
            >
              {t("recommendedTag")}
            </span>
          </div>
          <div className="flex flex-col gap-2">{used.map(card)}</div>
        </>
      )}

      {rest.length > 0 && (
        <>
          <div className="flex items-baseline">
            {/* «Ediciones de la ficha», no «Todas las ediciones»: ese título
                era de cuando la ficha sincronizaba todo el catálogo de
                OpenLibrary. Con el bloque «Más ediciones (OpenLibrary)» justo
                debajo, prometer «todas» aquí se contradice en la misma
                pantalla. El número de al lado es el total de la ficha, que es
                exactamente lo que el título nombra. */}
            <span className="font-mono text-[10px] tracking-[0.05em] text-muted-foreground/70 uppercase">
              {t("allEditions")}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
              {editions.length}
            </span>
          </div>
          <div className="flex max-h-[240px] flex-col gap-2 overflow-y-auto pr-[3px]">
            {rest.map(card)}
          </div>
        </>
      )}

      {/* Bloques 2 y 3, solo al identificar el pase de un LIBRO: los dos
          escriben contra un pase, y una película no tiene ISBN que escanear
          ni obra en OpenLibrary de la que sacar candidatas. */}
      {showOpenLibraryBlocks && (
        <>
          {/* Bloque 2 — la vía RECOMENDADA, y por eso va antes que la lista de
              candidatas y con el peso visual del acento: el código de barras
              identifica el ejemplar EXACTO que el usuario tiene en la mano.
              Todo lo de abajo es aproximar a ojo entre tiradas parecidas. */}
          <Link
            href="/buscar?type=book"
            className={`flex w-full items-center justify-center gap-[7px] rounded-[10px] border px-[13px] py-3 text-[12.5px] font-semibold ${accent.border} ${accent.text}`}
          >
            <SearchIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {t("scanCta")}
          </Link>
          <p className="text-[11px] leading-[1.5] text-muted-foreground">
            {t("scanCtaHint")}
          </p>

          {/* Bloque 3 — `<details>` nativo (mismo patrón que el panel de
              progreso): el navegador ya trae el estado, el teclado y la
              semántica. Nace CERRADO, y ese es el punto: la llamada a
              OpenLibrary solo ocurre si alguien lo abre. */}
          <details
            className="rounded-[10px] border border-dashed border-border"
            onToggle={(event) => {
              if (event.currentTarget.open) void loadCandidates();
            }}
          >
            <summary className="group flex cursor-pointer list-none items-center justify-between px-[13px] py-3 text-[12.5px] font-semibold text-foreground">
              {t("moreFromOpenLibrary")}
              <ChevronDownIcon
                aria-hidden
                className="h-3 w-3 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0"
              />
            </summary>
            <div className="flex flex-col gap-2 border-t border-border px-[13px] pt-3 pb-3">
              <p className="text-[11px] leading-[1.5] text-muted-foreground">
                {t("candidateHint")}
              </p>

              {loadingCandidates && (
                <p className="font-mono text-[10px] text-muted-foreground/70">
                  {t("candidatesLoading")}
                </p>
              )}

              {!loadingCandidates && candidates?.length === 0 && (
                <p className="text-[11.5px] text-muted-foreground">
                  {t("candidatesEmpty")}
                </p>
              )}

              {candidates && candidates.length > 0 && (
                <div className="flex max-h-[240px] flex-col gap-2 overflow-y-auto pr-[3px]">
                  {candidates.map(candidateCard)}
                </div>
              )}

              {candidateError && (
                <p className="text-sm text-status-dropped">
                  {t(`candidateErrors.${candidateError}`)}
                </p>
              )}
            </div>
          </details>
        </>
      )}

      {canContribute &&
        (creating ? (
          <form
            action={createFormAction}
            className="flex flex-col gap-3 rounded-[10px] border border-dashed border-border bg-surface-muted p-3"
          >
            <span className="label-section">
              {itemType === "movie" ? t("addMovie") : t("add")}
            </span>
            <EditionFields isMovie={itemType === "movie"} />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={createPending}
                className={`inline-flex items-center gap-[5px] rounded-[8px] border border-dashed px-[13px] py-2 text-[11.5px] font-semibold disabled:opacity-60 ${accent.border} ${accent.text}`}
              >
                {createPending ? t("submitting") : t("submit")}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="text-[11.5px] text-muted-foreground hover:text-foreground"
              >
                {t("cancelNew")}
              </button>
            </div>
            {createState.error && (
              <p className="text-sm text-status-dropped">
                {t(`errors.${createState.error}`)}
              </p>
            )}
          </form>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCreating(true)}
            className={`flex w-full items-center justify-center rounded-[10px] border border-dashed px-[13px] py-3 text-[12.5px] font-semibold disabled:opacity-60 ${accent.border} ${accent.text}`}
          >
            {t("newEdition")}
          </button>
        ))}

      {onUnknown && (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={onUnknown}
            className="flex w-full items-center rounded-[10px] border border-dashed border-border px-[13px] py-3 text-left text-[12.5px] text-muted-foreground hover:bg-surface-muted disabled:opacity-60"
          >
            {t("unknownEdition")}
          </button>
          <p className="text-[11px] text-muted-foreground">
            {t("unknownEditionHint")}
          </p>
        </>
      )}
    </div>
  );
}
