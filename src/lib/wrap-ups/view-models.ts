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

export type Companion = { userId: string; username: string; displayName: string | null; avatarUrl: string | null };
export type People = Record<string, Companion>;
export type HeatCell = { label: string; level: 0 | 1 | 2 | 3; peak: boolean };
export type PosterModel = {
  layout: "hero" | "figure" | "covers" | "strip" | "ranking" | "quote" | "closing" | "progress" | "calendar" | "together";
  eyebrow: string;
  figure?: { value: string; unit: string };
  lines: string[];
  covers?: ItemRef[];
  coverGrid?: "static" | "scroll";
  reducedMoreLine?: string;
  /** «y N más» de la rejilla con scroll: solo con movimiento (con movimiento reducido manda reducedMoreLine). */
  moreLine?: string;
  strip?: { label: string; value: string; active: boolean }[];
  stripValues?: boolean;
  ranking?: { label: string; value: string }[];
  quote?: { body: string; attribution: string | null };
  progress?: { item: ItemRef; percent: number | null; touched: boolean; label: string; idleLabel?: string }[];
  calendar?: { offset: number; days: { day: number; active: boolean }[]; summary: string };
  heatmaps?: { title: string; cells: HeatCell[]; summary: string }[];
  together?: {
    viewingsTitle: string; clubsTitle: string;
    viewings: { item: ItemRef; watchedOn: string; companions: Companion[]; extra: number; peopleLine?: string }[];
    clubs: { clubId: string; name: string; value: string }[];
  };
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

export const STEP_MS = 6000;
const COLS = 3, STATIC_MAX = 9, PROGRESS_MAX = 6;

/** Duración de una story en el reproductor: la rejilla con scroll necesita tiempo para pasar entera. */
export function storyDurationMs(m: PosterModel): number {
  if (m.coverGrid !== "scroll" || !m.covers) return STEP_MS;
  const rows = Math.ceil(m.covers.length / COLS);
  return Math.min(15000, STEP_MS + Math.max(0, rows - 3) * 1000);
}

export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 {
  if (value <= 0 || max <= 0) return 0;
  const r = value / max;
  return r <= 1 / 3 ? 1 : r <= 2 / 3 ? 2 : 3;
}

const pad2 = (h: number) => String(h % 24).padStart(2, "0");

function heatmap(values: number[] | undefined, labels: string[], title: string, summaryOf: (peak: number) => string) {
  if (!values || values.every((v) => v === 0)) return null;
  const max = Math.max(...values);
  const peak = values.indexOf(max);
  return {
    title,
    cells: values.map((v, i) => ({ label: labels[i], level: heatLevel(v, max), peak: i === peak })),
    summary: summaryOf(peak),
  };
}

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
      ...(minutes > 0 && episodesWithoutRuntime > 0 ? [t(share.seriesProgress?.episodes != null
        ? `${K}.closing.episodesWithoutRuntime` : `${K}.time.episodesWithoutRuntime`, {count: episodesWithoutRuntime})] : []),
    ],
  };
}

export function posterFor(story: Story, payload: WrapUpPayload, t: T, people: People = {}): PosterModel {
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

    case "finished": {
      const covers = story.items;
      const scroll = covers.length > STATIC_MAX;
      const more = (n: number) => t(`${K}.finished.more`, { count: n });
      return make("finished", {
        layout: "covers",
        figure: { value: String(story.total), unit: t(`${K}.finished.unit`, { count: story.total }) },
        covers,
        coverGrid: scroll ? "scroll" : "static",
        lines: !scroll && story.total > covers.length ? [more(story.total - covers.length)] : [],
        moreLine: scroll && story.total > covers.length ? more(story.total - covers.length) : undefined,
        // Con movimiento reducido la rejilla se queda en las 9 primeras: el resto se cuenta.
        reducedMoreLine: scroll ? more(story.total - STATIC_MAX) : undefined,
      });
    }

    case "series_progress":
      return make("series_progress", {
        layout: "covers",
        covers: story.items,
        lines: [
          ...story.items.map(i => t(`${K}.series_progress.item`, {title: i.title, count: i.episodes})),
          ...(story.total > story.items.length ? [t(`${K}.series_progress.more`, {count: story.total - story.items.length})] : []),
        ],
      });

    case "in_progress": {
      const open = story.openTotal ?? story.items.length;
      const shown = story.items.slice(0, PROGRESS_MAX);
      return make("in_progress", {
        layout: "progress",
        figure: { value: String(open), unit: t(`${K}.in_progress.unit`, { count: open }) },
        progress: shown.map((i) => ({
          item: i,
          percent: i.percent == null ? null : Math.round(i.percent),
          touched: i.touched !== false,
          idleLabel: i.touched === false ? t(`${K}.in_progress.idle`) : undefined,
          label: i.percent == null
            ? t(`${K}.in_progress.item`, { title: i.title })
            : t(`${K}.in_progress.itemPercent`, { title: i.title, percent: Math.round(i.percent) }),
        })),
        lines: [
          ...(story.touchedTotal != null ? [t(`${K}.in_progress.touched`, { count: story.touchedTotal })] : []),
          ...(open > shown.length ? [t(`${K}.in_progress.more`, { count: open - shown.length })] : []),
        ],
      });
    }

    case "rhythm": {
      const weekdayName = (i: number) => t(`${K}.rhythm.weekday.${i}`);
      const week = heatmap(story.byWeekday, [..."LMXJVSD"], t(`${K}.rhythm.weekTitle`),
        (p) => t(`${K}.rhythm.weekPeak`, { day: weekdayName(p) }));
      const hours = heatmap(story.byBand, Array.from({ length: 12 }, (_, i) => pad2(i * 2)), t(`${K}.rhythm.hoursTitle`),
        (p) => t(`${K}.rhythm.hoursPeak`, { from: pad2(p * 2), to: pad2(p * 2 + 2) }));
      const lines: string[] = [];
      if (story.bestStreak >= 2) lines.push(t(`${K}.rhythm.streak`, { count: story.bestStreak }));
      // Sin mapa (payload v1 o sin datos), el favorito vuelve como línea.
      if (!week && story.favoriteWeekday != null) lines.push(t(`${K}.rhythm.favoriteDay`, { day: weekdayName(story.favoriteWeekday) }));
      if (!hours && story.favoriteBandStartHour != null) {
        lines.push(t(`${K}.rhythm.favoriteBand`, { from: pad2(story.favoriteBandStartHour), to: pad2(story.favoriteBandStartHour + 2) }));
      }
      const active = story.days.filter((d) => d.active).map((d) => day(d.date));
      return make("rhythm", {
        layout: "calendar",
        figure: { value: String(story.activeDays), unit: t(`${K}.rhythm.unit`, { count: story.activeDays }) },
        // El anual no trae días: sin calendario, solo los mapas.
        calendar: story.days.length === 0 ? undefined : {
          offset: (utc(story.days[0].date).getUTCDay() + 6) % 7,
          days: story.days.map((d) => ({ day: day(d.date), active: d.active })),
          summary: t(`${K}.rhythm.calendarLabel`, { days: active.join(", ") }),
        },
        heatmaps: [week, hours].filter((h): h is NonNullable<typeof h> => h !== null),
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
      if (!story.viewings?.length && !story.clubs?.length) {
        // Payload v1: solo las líneas, sin la cifra sumada (mezclaba unidades).
        if (story.jointViewings > 0) lines.push(t(`${K}.together.jointViewings`, { count: story.jointViewings }));
        if (story.clubDays > 0) lines.push(t(`${K}.together.clubDays`, { count: story.clubDays }));
        return make("together", { layout: "figure", lines });
      }
      const viewings = story.viewings ?? [];
      if (viewings.length > 4) lines.push(t(`${K}.together.more`, { count: viewings.length - 4 }));
      return make("together", {
        layout: "together",
        together: {
          viewingsTitle: t(`${K}.together.viewingsTitle`),
          clubsTitle: t(`${K}.together.clubsTitle`),
          viewings: viewings.slice(0, 4).map((v) => {
            // Los ids sin resolver (bloqueados, cuentas borradas) no se pintan.
            const resolved = v.companionIds.map((id) => people[id]).filter((c): c is Companion => !!c);
            const shown = resolved.slice(0, 3);
            return {
              item: v.item,
              watchedOn: v.watchedOn,
              companions: shown,
              extra: Math.max(0, resolved.length - 3),
              peopleLine: shown.length > 0
                ? t(`${K}.together.withPeople`, { names: shown.map((c) => c.displayName ?? c.username).join(", ") })
                : undefined,
            };
          }),
          clubs: (story.clubs ?? []).slice(0, 3).map((c) => ({ clubId: c.clubId, name: c.name, value: t(`${K}.together.clubDaysValue`, { count: c.days }) })),
        },
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
