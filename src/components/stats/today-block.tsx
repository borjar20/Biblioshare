import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTodayFocus, getNextEpisode, type TodayPass } from "@/lib/stats/get-today-focus";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { getProgress } from "@/lib/library/progress";
import { ChevronRightIcon } from "@/components/ui/icons";
import { TodayCard } from "./today-card";
import { TodayPicker } from "./today-picker";

// El bloque "¿Qué has disfrutado hoy?" (frame G). Encabeza el Inicio, sobre el
// feed: primero lo tuyo a medias, después lo de los demás.
//
// Si no tienes nada en curso NO se pinta: un bloque que pregunta qué has
// disfrutado hoy y no ofrece nada que tocar sería un hueco, no una invitación.
// Del frame G entra solo este bloque (decisión del usuario): "Registrar algo
// nuevo" y "Para más tarde" quedan anotados en el plan como tarea aparte.
export async function TodayBlock({ userId }: { userId: string }) {
  const supabase = await createClient();
  // Sin getStreaks: la racha de estas tarjetas es la del PASE y sale de las
  // filas que getTodayFocus ya trae. `weekly` se queda solo por la meta de hoy,
  // que sí es tuya y no de la obra.
  const [focus, weekly, profile] = await Promise.all([
    getTodayFocus(supabase, userId),
    getWeeklyActivity(supabase, userId),
    getOwnProfile(supabase, userId),
  ]);

  if (!focus.featured) return null;

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
  // "Viernes · 17 jul". El español pone el día en minúscula y el frame lo
  // escribe capitalizado; como el texto ya va en `uppercase` por CSS, la
  // capitalización solo importa si algún día se quita.
  const dateLabel = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  })
    .format(new Date())
    .replace(",", " ·")
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
          {dateLabel}
        </p>
        <h2 className="mt-1.5 font-serif text-[26px] leading-[1.02] font-semibold tracking-[-0.01em]">
          {t("title")}
        </h2>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-muted-foreground">
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

      {/* En móvil el bloque se apila (frame G). En escritorio NO se estira: una
          tarjeta de 1024px deja la portada en 58px y convierte la barra de
          progreso en una línea de 800px — el "móvil estirado" que prohíbe P-T7.
          Así que el ancho se usa de verdad: destacado y carrusel en paralelo
          (el reparto lo hace TodayPicker). */}
      <TodayPicker
        keepGoingLabel={t("keepGoing")}
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
        <span className="truncate">{progress ? progress.label : t("noProgress")}</span>
        {pass.streakDays > 0 && (
          <span className="shrink-0 text-gold-ink">{t("streakShort", { count: pass.streakDays })}</span>
        )}
      </div>
    </div>
  );
}
