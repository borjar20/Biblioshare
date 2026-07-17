import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTodayFocus, type TodayPass } from "@/lib/stats/get-today-focus";
import { getWeeklyActivity } from "@/lib/stats/get-weekly-activity";
import { getStreaks } from "@/lib/stats/get-streaks";
import { getOwnProfile } from "@/lib/profile/get-profile-by-username";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { getProgress } from "@/lib/library/progress";
import { itemHref } from "@/lib/catalog/item-href";
import { ChevronRightIcon } from "@/components/ui/icons";
import { TodayCard } from "./today-card";

// El bloque "¿Qué has disfrutado hoy?" (frame G). Encabeza el Inicio, sobre el
// feed: primero lo tuyo a medias, después lo de los demás.
//
// Si no tienes nada en curso NO se pinta: un bloque que pregunta qué has
// disfrutado hoy y no ofrece nada que tocar sería un hueco, no una invitación.
// Del frame G entra solo este bloque (decisión del usuario): "Registrar algo
// nuevo" y "Para más tarde" quedan anotados en el plan como tarea aparte.
export async function TodayBlock({ userId }: { userId: string }) {
  const supabase = await createClient();
  const [focus, weekly, streaks, profile] = await Promise.all([
    getTodayFocus(supabase, userId),
    getWeeklyActivity(supabase, userId),
    getStreaks(supabase, userId),
    getOwnProfile(supabase, userId),
  ]);

  if (!focus.featured) return null;

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
          Así que el ancho se usa de verdad: destacado y carrusel en paralelo. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <TodayCard
          pass={focus.featured}
          weekly={weekly}
          streaks={streaks}
          dailyGoalMinutes={profile?.dailyGoalMinutes ?? null}
        />

        {focus.rest.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">
              {t("keepGoing")}
            </span>
            {/* Carrusel, no lista: con 5 en curso una lista vertical empujaría
                el feed fuera de la pantalla. El frame G lo dice explícitamente.
                En escritorio sigue siendo una tira, pero ya cabe entera. */}
            <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              {focus.rest.map((pass) => (
                <MiniCard key={pass.item.entryId} pass={pass} />
              ))}
            </div>
          </div>
        )}
      </div>
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

  return (
    <Link
      href={itemHref(item.itemType, item.itemId)}
      className="relative w-40 shrink-0 overflow-hidden rounded-[12px] border border-border bg-surface p-[11px] shadow-card"
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
      {/* El frame pone aquí un "◆ 4 d" que es una racha POR ÍTEM. La nuestra es
          global (getStreaks), así que ese rombo sería un dato inventado: se
          queda solo el progreso hasta que la racha se derive por pase. */}
      <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-muted-foreground">
        <span>{progress ? progress.label : t("noProgress")}</span>
      </div>
    </Link>
  );
}
