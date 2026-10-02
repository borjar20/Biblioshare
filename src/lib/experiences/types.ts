export const MOMENT_KINDS = ["concert", "show", "exhibition", "museum", "walk", "other"] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];
export type ExperienceShape = "single" | "trip";
export type ExperienceState = "planned" | "lived" | "cancelled";
export type ExperienceAudience = "private" | "participants" | "profile";
export type InvitationState = "invited" | "accepted" | "declined";
export type AttendanceState = "planned" | "attended" | "skipped";
export type ExperienceError = "unauthenticated" | "forbidden" | "not_found" | "invalid" | "conflict" | "limit" | "too_large" | "unsupported_image" | "unknown";
export type ExperienceResult<T> = { ok: true; data: T } | { ok: false; error: ExperienceError };
export const EXPERIENCE_LIMITS = { title: 160, place: 240, guest: 80, moments: 50, participants: 30, photos: 40, photoBytes: 2 * 1024 * 1024 } as const;
export interface CreateExperienceInput {
  title: string;
  state: "planned" | "lived";
  kind: MomentKind;
  placeLabel?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}
export interface UpdateExperienceInput {
  title: string;
  shape: ExperienceShape;
  state: ExperienceState;
  audience: ExperienceAudience;
  startsOn: string | null;
  endsOn: string | null;
}
export interface SaveMomentInput {
  id?: string;
  title: string;
  kind: MomentKind;
  placeLabel?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}
