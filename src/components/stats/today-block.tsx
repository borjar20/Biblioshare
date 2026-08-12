import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTodayFocus, getNextEpisode, type TodayPass } from "@/lib/stats/get-today-focus";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { getLibraryItems } from "@/lib/library/get-library-items";
import { getSorteoPool } from "@/lib/rincon/get-sorteo-pool";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { getProgress } from "@/lib/library/progress";
import { ChevronRightIcon } from "@/components/ui/icons";
import { TodayCard } from "./today-card";
import { TodayPicker } from "./today-picker";
import { LaterShelf } from "./later-shelf";
import { TodayHeader } from "./today-header";
import { ProximaLectura } from "./proxima-lectura";
import { CollectionSuggestions } from "./collection-suggestions";
import { EmptyDiscovery } from "./empty-discovery";

// Cuántas portadas de la cola se enseñan. En móvil el resto queda tras el
// scroll; en escritorio caben seis por fila, así que doce son dos filas, la
// altura de la columna de al lado. Para ver la cola entera está "Ver todos".
const LATER_SHOWN = 12;

// El bloque "¿Qué has disfrutado hoy?" (frame G). Encabeza el Inicio, sobre el
// feed: primero lo tuyo a medias, después lo de los demás.
//
// Escalera de estados de la columna personal (nunca un hueco): en curso →
// próxima lectura → sugerencias de colección → descubrimiento. Ver
// docs/superpowers/specs/2026-08-11-inicio-estado-vacio-columna-personal-design.md.
//
// De "Registrar algo nuevo" (el tercer bloque del frame G) no queda nada:
// descartado por el usuario, 2026-07-17.
export async function TodayBlock({ userId }: { userId: string }) {
  const supabase = await createClient();
  // Sin getStreaks: la racha de estas tarjetas es la del PASE y sale de las
  // filas que getTodayFocus ya trae. `weekly` se queda solo por la meta de hoy,
  // que sí es tuya y no de la obra.
  const [focus, weekly, profile, planned] = await Promise.all([
    getTodayFocus(supabase, userId),
    getWeeklyActivity(supabase, userId),
    getOwnProfile(userId),
    getLibraryItems(supabase, userId, { status: "planned" }),
  ]);

  const later =
    planned.length > 0 ? (
      <LaterShelf items={planned.slice(0, LATER_SHOWN)} total={planned.length} />
    ) : null;

  // Escalera de estados: si no hay nada en curso, la columna no queda vacía —
  // ofrece la próxima lectura, luego sugerencias de colección, luego
  // descubrimiento. El estado "En curso" (focus.featured) sigue debajo intacto.
  if (!focus.featured) {
    if (planned.length > 0) {
      // La próxima lectura la decide el SORTEO (mismo pool que "Sacar un lomo"
      // del Rincón: pases planned activos con su estimación). Perezoso: solo se
      // pide cuando de verdad estamos en el estado 2.
      const pool = await getSorteoPool(supabase, userId);
      return (
        <div className="pb-1">
          <ProximaLectura pool={pool.items} collections={pool.collections} later={later} />
        </div>
      );
    }
    // Solo se pide la colección cuando de verdad hace falta (sin en curso y sin
    // cola): un query menos en el camino feliz. Solo completados — releer es
    // limpio; los abandonados caerían en la hoja de retomar y por eso van al
    // estado 4 (ver spec).
    const collection = await getLibraryItems(supabase, userId, {
      status: "completed",
      limit: 3,
    });
    if (collection.length > 0) {
      return (
        <div className="pb-1">
          <CollectionSuggestions items={collection} />
        </div>
      );
    }
    return (
      <div className="pb-1">
        <EmptyDiscovery />
      </div>
    );
  }

  const passes = [focus.featured, ...focus.rest];

  // El próximo episodio de CADA serie, no solo de la destacada: desde que las
  // mini suben al destacado con un clic, cualquiera puede acabar arriba, y
  // resolverlo entonces costaría un viaje al servidor por clic. Solo las series
  // lo piden (un libro no tiene episodio que marcar) y son las que tengas a
  // medias, así que el paralelo es corto.
  const nextEpisodes = new Map(
    await Promise.all(
      passes
        .filter((p) => p.item.itemType === "series")
        .map(
          async (p) =>
            [
              p.item.entryId,
              await getNextEpisode(supabase, p.item.itemId, userId, p.item.activePassId),
            ] as const,
        ),
    ),
  );

  const t = await getTranslations("today");

  return (
    // `today-block`: la sección personal del Inicio. Va SIEMPRE en una columna
    // (destacado arriba, tiras debajo); la fila de tablet a dos columnas se
    // retiró, así que ya no hay container query.
    <section className="today-block flex flex-col gap-3">
      <TodayHeader title={t("title")} />

      {/* Apilado por TodayPicker (`.today-split`, hoy solo flex-col): en curso →
          continúa → para más tarde. */}
      <TodayPicker
        keepGoingLabel={t("keepGoing")}
        later={later}
        heading={
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
              {t("inProgress")}
            </span>
            <Link
              href="/coleccion?status=in_progress"
              className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.06em] uppercase text-accent hover:underline"
            >
              {t("seeAll", { count: focus.total })}
              <ChevronRightIcon className="h-3 w-3" />
            </Link>
          </div>
        }
        entries={passes.map((pass) => ({
          id: pass.item.entryId,
          focusLabel: t("focusMini", { title: pass.item.title }),
          card: (
            <TodayCard
              pass={pass}
              weekly={weekly}
              dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
              nextEpisode={nextEpisodes.get(pass.item.entryId) ?? null}
            />
          ),
          mini: <MiniCard pass={pass} />,
          thumb: <MiniThumb pass={pass} />,
        }))}
      />
    </section>
  );
}

async function MiniCard({ pass }: { pass: TodayPass }) {
  const t = await getTranslations("today");
  const tMedia = await getTranslations("detail.mediaLabel");
  const { item } = pass;
  const accent = MEDIA_ACCENT[item.itemType];
  const progress = getProgress(item);
  const percent = progress
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : 0;

  // Ya no es un enlace: el botón que la envuelve (TodayPicker) la sube al
  // destacado. A la ficha se va desde el destacado.
  return (
    <div
      className="relative w-40 overflow-hidden rounded-[12px] border border-border bg-surface p-[11px] shadow-card"
      style={{ ["--acc" as string]: `var(${accent.varName})` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-[var(--acc)]" />
      <div className="flex items-start gap-[9px]">
        <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded-sm bg-surface-muted shadow-cover">
          {item.coverUrl && (
            <Image src={item.coverUrl} alt="" fill sizes="32px" className="object-cover" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[8px] tracking-[0.08em] uppercase text-[var(--acc)]">
            {tMedia(item.itemType)}
          </p>
          <p className="mt-0.5 line-clamp-2 font-serif text-[12.5px] leading-[1.12] font-semibold text-foreground">
            {item.title}
          </p>
        </div>
      </div>
      <div className="mt-[9px] h-1 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-[var(--acc)]" style={{ width: `${percent}%` }} />
      </div>
      {/* El "◆ 4 d" del frame ya se puede pintar: la racha es DE ESTE PASE, no
          la global del perfil, así que el rombo dice la verdad. */}
      <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[9px] text-muted-foreground">
        <span className="truncate">
          {progress ? progress.label : item.itemType === "movie" ? t("pickToWatch") : t("noProgress")}
        </span>
        {pass.streakDays > 0 && (
          <span className="shrink-0 text-gold-ink">{t("streakShort", { count: pass.streakDays })}</span>
        )}
      </div>
    </div>
  );
}

// La mini-portada de "Continúa" en modo compacto (tablet estrecho / móvil): solo
// la carátula GRANDE (2×2), SIN título (el usuario lo quitó, 2026-08-10) — lo que
// distingue "Continúa" de "Para más tarde" es el separador vertical, no un texto.
// El título solo vive en la tarjeta mini rica de ≥1100. El botón que la envuelve
// (TodayPicker) la sube al destacado, y su aria-label ya lleva el título.
function MiniThumb({ pass }: { pass: TodayPass }) {
  const { item } = pass;
  const accent = MEDIA_ACCENT[item.itemType];
  return (
    <div
      className="relative aspect-[2/3] w-11 overflow-hidden rounded-md bg-surface-muted shadow-cover"
      style={{ ["--acc" as string]: `var(${accent.varName})` }}
    >
      {item.coverUrl ? (
        <Image
          src={item.coverUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 90px, 150px"
          className="object-cover"
        />
      ) : (
        <span aria-hidden className="absolute inset-0 bg-[var(--acc)]/15" />
      )}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-[var(--acc)]" />
    </div>
  );
}
