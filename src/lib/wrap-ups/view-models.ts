// Modelos de póster (spec 2026-10-06): puros, sin React ni i18n global. Cada story
// del payload se convierte en un PosterModel con el texto YA escrito (el lector de
// pantalla lee lo mismo que se ve). Reglas de texto: principios 4, 6 y 7 de
// docs/design/paneles-estadisticos.md — sin dato no hay línea, y toda variación
// lleva valor, dirección, unidad y periodo.
import type { ItemType } from "@/lib/catalog/types";
import { formatDots } from "@/lib/rating/dots";
import { formatHours, timeKind } from "./format";
import { summaryForPayload } from "./share-summary";
import { narratorLine } from "./narrator-copy";
import type { ItemRef, Story, WrapUpPayload } from "./types";

export type PosterModel = {
  layout: "hero" | "figure" | "covers" | "strip" | "ranking" | "quote" | "closing";
  eyebrow: string;
  figure?: { value: string; unit: string };
  lines: string[];
  covers?: ItemRef[];
  strip?: { label: string; value: string; active: boolean }[];
  stripValues?: boolean;
  ranking?: { label: string; value: string }[];
  quote?: { body: string; attribution: string | null };
  narratorLine: string;
};

export type T = (key: string, values?: Record<string, string | number>) => string;


const TYPES: ItemType[] = ["book", "movie", "series"];
const K = "wrapUps.stories";
const LOCALE = "es-ES";

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const monthLong = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(utc(iso));
const day = (iso: string) => Number(iso.slice(8, 10));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «29 sep»: las tres primeras letras del mes largo (el «sept.» de Intl no es lo que se escribe). */
function shortDate(iso: string, locale: string): string {
  return `${day(iso)} ${monthLong(iso, locale).slice(0, 3)}`;
}

export function periodLabel(
  p: Pick<WrapUpPayload, "kind" | "periodStart" | "periodEnd">,
  locale = LOCALE,
): string {
  if (p.kind === "week") return `Semana del ${shortDate(p.periodStart, locale)} al ${shortDate(p.periodEnd, locale)}`;
  if (p.kind === "month") return `${cap(monthLong(p.periodStart, locale))} ${p.periodStart.slice(0, 4)}`;
  const year = p.periodStart.slice(0, 4);
  if (p.periodEnd.slice(5) === "12-31") return `Tu ${year}`;
  return `Tu ${year} · hasta el ${day(p.periodEnd)} de ${monthLong(p.periodEnd, locale)}`;
}

/**
 * Rótulo del periodo para quien NO es el dueño (tarjeta del feed): el del año
 * se dirige al lector («Tu 2026»), así que ahí se queda en «2026». Semana y mes
 * ya son neutros.
 */
export function sharedPeriodLabel(
  p: Pick<WrapUpPayload, "kind" | "periodStart" | "periodEnd">,
  locale = LOCALE,
): string {
  const label = periodLabel(p, locale);
  return p.kind === "year" ? label.replace(/^Tu /, "") : label;
}

export { formatHours };

const dur = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), rest = m % 60;
  return h ? `${h} h${rest ? ` ${rest} min` : ""}` : `${rest} min`;
};
const longDate = (iso: string) => `${day(iso)} de ${monthLong(iso, LOCALE)} de ${iso.slice(0, 4)}`;
const sum = (m: Record<ItemType, number>) => m.book + m.movie + m.series;

function noRuntimeLine(n: number, t: T): string[] {
  return n > 0 ? [t(`${K}.time.episodesWithoutRuntime`, { count: n })] : [];
}

/** Cifra y líneas del tiempo: un cero solo se enseña como cifra si de verdad se midió. */
function timeFigure(minutes: number, episodes: number, t: T): { figure?: { value: string; unit: string }; lines: string[] } {
  switch (timeKind(minutes, episodes)) {
    case "measured": return { figure: formatHours(minutes), lines: [] };
    case "episodesOnly":
      return {
        figure: { value: String(episodes), unit: t(`${K}.time.episodesUnit`, { count: episodes }) },
        lines: [t(`${K}.time.unknownDuration`)],
      };
    case "none": return { lines: [t(`${K}.time.noData`)] };
  }
}

function deltaLine(total: number, previous: number | null, kind: WrapUpPayload["kind"], t: T): string[] {
  if (previous == null || !(total > 0)) return [];
  const diff = total - previous;
  if (diff === 0) return [t(`${K}.time.deltaSame`, { period: kind })];
  const { value, unit } = formatHours(Math.abs(diff));
  return diff > 0
    ? [t(`${K}.time.delta`, { sign: "+", value, unit, period: kind })]
    : [t(`${K}.time.deltaDown`, { value, unit, period: kind })];
}

/**
 * Cifra y líneas del cierre a partir del resumen PÚBLICO: las comparten la story
 * de cierre, la imagen 9:16 y la tarjeta del feed (mismas reglas de cero honesto).
 */
export function closingCopy(
  share: Pick<WrapUpPayload["share"], "minutes" | "episodesWithoutRuntime" | "finished" | "seriesProgress">,
  t: T,
): { figure?: { value: string; unit: string }; lines: string[] } {
  const { minutes, episodesWithoutRuntime } = share;
  const tf = timeFigure(minutes, episodesWithoutRuntime, t);
  return {
    figure: tf.figure,
    lines: [
      ...tf.lines,
      t(`${K}.closing.finished`, { count: share.finished }),
      ...(share.seriesProgress ? [share.seriesProgress.episodes == null
        ? t(`${K}.closing.seriesCount`, {count: share.seriesProgress.count})
        : t(`${K}.closing.seriesProgress`, {count: share.seriesProgress.count, episodes: share.seriesProgress.episodes})] : []),
      ...(minutes > 0 ? noRuntimeLine(episodesWithoutRuntime, t) : []),
    ],
  };
}

export function posterFor(story: Story, payload: WrapUpPayload, t: T): PosterModel {
  const period = periodLabel(payload);
  const nl = narratorLine(story, payload, t);
  const make = (
    id: string,
    m: Omit<PosterModel, "eyebrow" | "narratorLine" | "lines"> & { lines?: string[]; eyebrow?: string },
  ): PosterModel => ({
    lines: [], narratorLine: nl, ...m,
    // Solo se formatea si la story no trae su rótulo: el título ICU de la portada
    // pide `kind` y el traductor real del servidor informa del error aunque luego
    // se sobrescriba.
    eyebrow: m.eyebrow ?? `${period} · ${t(`${K}.${id}.title`)}`,
  });

  switch (story.id) {
    case "cover":
      return make("cover", { layout: "hero", eyebrow: period, lines: [t(`${K}.cover.title`, { kind: payload.kind })] });

    case "time": {
      const total = sum(story.minutes);
      const breakdown = TYPES.filter((ty) => story.minutes[ty] > 0)
        .map((ty) => `${t(`${K}.time.types.${ty}`)} · ${dur(story.minutes[ty])}`);
      const tf = timeFigure(total, story.episodesWithoutRuntime, t);
      return make("time", {
        layout: "figure",
        figure: tf.figure,
        lines: [
          ...breakdown,
          ...tf.lines,
          ...deltaLine(total, story.previousMinutes, payload.kind, t),
          // Con solo episodios, la línea de duración desconocida ya lo dice.
          ...(total > 0 ? noRuntimeLine(story.episodesWithoutRuntime, t) : []),
        ],
      });
    }

    case "finished":
      return make("finished", {
        layout: "covers",
        figure: { value: String(story.total), unit: t(`${K}.finished.unit`, { count: story.total }) },
        covers: story.items.slice(0, 4),
        lines: story.total > Math.min(4, story.items.length)
          ? [t(`${K}.finished.more`, { count: story.total - Math.min(4, story.items.length) })] : [],
      });

    case "series_progress":
      return make("series_progress", {
        layout: "covers",
        covers: story.items,
        lines: [
          ...story.items.map(i => t(`${K}.series_progress.item`, {title: i.title, count: i.episodes})),
          ...(story.total > story.items.length ? [t(`${K}.series_progress.more`, {count: story.total - story.items.length})] : []),
        ],
      });

    case "in_progress":
      return make("in_progress", {
        layout: "covers",
        covers: story.items,
        lines: story.items.map((i) => i.percent == null
          ? t(`${K}.in_progress.item`, { title: i.title })
          : t(`${K}.in_progress.itemPercent`, { title: i.title, percent: Math.round(i.percent) })),
      });

    case "rhythm": {
      const lines: string[] = [];
      if (story.bestStreak >= 2) lines.push(t(`${K}.rhythm.streak`, { count: story.bestStreak }));
      if (story.favoriteWeekday != null) {
        lines.push(t(`${K}.rhythm.favoriteDay`, { day: t(`${K}.rhythm.weekday.${story.favoriteWeekday}`) }));
      }
      if (story.favoriteBandStartHour != null) {
        const pad = (h: number) => String(h % 24).padStart(2, "0");
        lines.push(t(`${K}.rhythm.favoriteBand`, { from: pad(story.favoriteBandStartHour), to: pad(story.favoriteBandStartHour + 2) }));
      }
      return make("rhythm", {
        layout: "strip",
        figure: { value: String(story.activeDays), unit: t(`${K}.rhythm.unit`, { count: story.activeDays }) },
        // El anual no trae tira diaria: sin días, sin tira (solo cifras y líneas).
        strip: story.days.length === 0 ? undefined : story.days.map((d) => ({
          label: "LMXJVSD"[(utc(d.date).getUTCDay() + 6) % 7],
          value: shortDate(d.date, LOCALE),
          active: d.active,
        })),
        lines,
      });
    }

    case "genres":
      return make("genres", {
        layout: "ranking",
        ranking: story.top.map((g) => ({ label: g.name, value: t(`${K}.genres.works`, { count: g.works }) })),
      });

    case "best_rated":
      return make("best_rated", {
        layout: "quote",
        figure: { value: formatDots(story.rating) ?? "", unit: "/5" },
        covers: [story.item],
        lines: [story.item.title],
        quote: story.review ? { body: story.review, attribution: story.item.title } : undefined,
      });

    case "phrase":
      return make("phrase", {
        layout: "quote",
        lines: [t(`${K}.phrase.source.${story.source}`)],
        quote: { body: story.body, attribution: story.item?.title ?? null },
      });

    case "experience":
      return make("experience", {
        layout: "hero",
        lines: [story.title, ...(story.date ? [longDate(story.date)] : [])],
      });

    case "together": {
      const lines: string[] = [];
      if (story.jointViewings > 0) lines.push(t(`${K}.together.jointViewings`, { count: story.jointViewings }));
      if (story.clubDays > 0) lines.push(t(`${K}.together.clubDays`, { count: story.clubDays }));
      const total = story.jointViewings + story.clubDays;
      return make("together", {
        layout: "figure",
        figure: { value: String(total), unit: t(`${K}.together.unit`, { count: total }) },
        lines,
      });
    }

    case "months": {
      const lines = [t(`${K}.months.timeSource`)];
      if (payload.periodEnd.slice(5) !== "12-31") lines.push(
        t(`${K}.months.cutoff`, { date: `${day(payload.periodEnd)} de ${monthLong(payload.periodEnd, LOCALE)}` }),
      );
      return make("months", {
        layout: "strip",
        stripValues: true,
        strip: story.months.map((m) => ({
          label: monthLong(`${m.month}-01`, LOCALE),
          value: `${dur(m.minutes)} · ${t(`${K}.months.works`, { count: m.works })}`,
          active: m.minutes > 0,
        })),
        lines,
      });
    }

    case "records": {
      const ranking: { label: string; value: string }[] = [];
      if (story.busiestMonth) {
        ranking.push({
          label: t(`${K}.records.busiestMonth`),
          value: `${cap(monthLong(`${story.busiestMonth.month}-01`, LOCALE))} · ${dur(story.busiestMonth.minutes)}`,
        });
      }
      if (story.fastest) {
        ranking.push({
          label: t(`${K}.records.fastest`),
          value: `${story.fastest.item.title} · ${t(`${K}.records.days`, { count: story.fastest.days })}`,
        });
      }
      if (story.longestSessionMinutes != null) {
        ranking.push({ label: t(`${K}.records.longestSession`), value: dur(story.longestSessionMinutes) });
      }
      return make("records", { layout: "ranking", ranking });
    }

    case "creators":
      return make("creators", {
        layout: "ranking",
        ranking: story.top.map((c) => ({ label: c.name, value: t(`${K}.creators.works`, { count: c.works }) })),
      });

    case "pile":
      return make("pile", {
        layout: "figure",
        figure: story.added > 0 ? { value: `+${story.added}`, unit: t(`${K}.pile.unit`, { count: story.added }) } : undefined,
        lines: story.removed > 0 ? [t(`${K}.pile.removed`, { count: story.removed })]
          : story.added > 0 ? [] : [t(`${K}.pile.none`)],
      });

    case "pet":
      return make("pet", {
        layout: "hero",
        lines: [
          t(`${K}.pet.stage`, { stage: t(`${K}.pet.stages.${story.stage}`) }),
          t(`${K}.pet.adventures`, { count: story.adventuresWon }),
          t(`${K}.pet.loot`, { count: story.loot }),
        ],
      });

    case "closing": {
      const summary = summaryForPayload(payload);
      return make("closing", { layout: "closing", ...closingCopy(summary, t), covers: summary.covers });
    }

    default: {
      const _never: never = story;
      return _never;
    }
  }
}
