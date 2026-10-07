import type { ItemType } from "@/lib/catalog/types";
import type { PetClass, PetStage } from "@/lib/pet/classes";
import type { WrapUpKind } from "./windows";

export type Intensity = "full" | "quiet";
export type NarratorVariant = "reader" | "cinephile" | "binger" | "explorer" | "social" | "quiet" | "festive";
export type Palette = ItemType | "mixed";

export type ItemRef = { type: ItemType; id: string; title: string; coverUrl: string | null; times: number };
export type SeriesProgress = ItemRef & { episodes: number };
export type MinutesByType = Record<ItemType, number>;

export type TimeFacts = {
  minutes: MinutesByType;
  /** Episodios cuya serie no tiene episode_runtime_minutes: se cuentan, no se convierten. */
  episodesWithoutRuntime: number;
  previousMinutes: number | null;
};

export type Story =
  | { id: "cover" }
  | ({ id: "time" } & TimeFacts)
  | { id: "finished"; items: ItemRef[]; total: number }
  | { id: "in_progress"; items: (ItemRef & { percent: number | null })[] }
  | { id: "series_progress"; items: SeriesProgress[]; total: number }
  | { id: "rhythm"; days: { date: string; active: boolean }[]; activeDays: number; bestStreak: number;
      favoriteWeekday: number | null; favoriteBandStartHour: number | null }
  | { id: "genres"; top: { name: string; works: number }[] }
  | { id: "best_rated"; item: ItemRef; rating: number; review: string | null }
  | { id: "phrase"; source: "note" | "quote" | "margin"; body: string; item: ItemRef | null }
  | { id: "experience"; experienceId: string; title: string; date: string | null }
  | { id: "together"; jointViewings: number; clubDays: number }
  | { id: "months"; months: { month: string; minutes: number; works: number }[] }
  | { id: "records"; busiestMonth: { month: string; minutes: number } | null;
      fastest: { item: ItemRef; days: number } | null; longestSessionMinutes: number | null }
  | { id: "creators"; top: { name: string; works: number }[] }
  | { id: "pile"; added: number; removed: number }
  | { id: "pet"; stage: PetStage; adventuresWon: number; loot: number }
  | { id: "closing" };

export type StoryId = Story["id"];

export type OwnPet = { name: string; petClass: PetClass; stage: PetStage };

/** Resumen PÚBLICO: lo único que sale del dueño (post e imagen publicada). */
export type ShareSummary = {
  kind: WrapUpKind; periodStart: string; periodEnd: string;
  narrator: NarratorVariant; palette: Palette;
  minutes: number; episodesWithoutRuntime: number; finished: number;
  seriesProgress?: { count: number; episodes: number | null }; // null: story antigua truncada
  covers: ItemRef[];               // máx. 4, terminadas y avances
  pet: OwnPet | null;
};

export type WrapUpPayload = {
  v: 1;
  kind: WrapUpKind; periodStart: string; periodEnd: string;
  intensity: Intensity; narrator: NarratorVariant; palette: Palette;
  pet: OwnPet | null;
  stories: Story[];
  share: ShareSummary;
};

/** Hechos crudos que producen los loaders (Tasks 5-7). `null` = no aplica a este kind. */
export type WrapUpInputs = {
  time: TimeFacts;
  activeDays: string[];            // fechas YYYY-MM-DD distintas con actividad (sesiones + días de serie + terminados)
  finished: ItemRef[];             // obras terminadas en la ventana, una por obra, `times` = pases
  inProgress: (ItemRef & { percent: number | null })[];
  seriesProgress?: SeriesProgress[]; // episodios vistos por serie en la ventana; compatible con fixtures antiguos
  bestStreak: number;              // racha máxima DENTRO de la ventana
  favoriteWeekday: number | null;
  favoriteBandStartHour: number | null;
  genres: { name: string; works: number }[];      // desc por works
  bestRated: { item: ItemRef; rating: number; review: string | null } | null;
  phrase: { source: "note" | "quote" | "margin"; body: string; item: ItemRef | null } | null;
  experience: { experienceId: string; title: string; date: string | null } | null;
  together: { jointViewings: number; clubDays: number };
  socialDays?: number;            // unión de fechas de visionados y club, sin duplicados
  experienceDays: number;          // días de la ventana con alguna experiencia vivida (para narradora)
  annual: {
    months: { month: string; minutes: number; works: number }[];
    records: { busiestMonth: { month: string; minutes: number } | null;
               fastest: { item: ItemRef; days: number } | null; longestSessionMinutes: number | null };
    creators: { name: string; works: number }[];
    pile: { added: number; removed: number };
    petYear: { adventuresWon: number; loot: number };
  } | null;
  pet: OwnPet | null;
};
