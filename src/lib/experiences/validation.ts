import { EXPERIENCE_LIMITS, MOMENT_KINDS, type CreateExperienceInput, type SaveMomentInput, type SaveReviewInput, type UpdateExperienceInput } from "./types";

type RecordInput = Record<string, unknown>;
function record(input: unknown): RecordInput | null {
  return input !== null && typeof input === "object" && !Array.isArray(input) ? input as RecordInput : null;
}
function text(input: unknown, maximum: number, required = false): string | null | undefined {
  if (input === undefined || input === null) return required ? undefined : null;
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (trimmed.length > maximum || (required && !trimmed)) return undefined;
  return trimmed || null;
}
export function isExperienceId(input: unknown): input is string {
  return typeof input === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input);
}
function date(input: unknown): string | null | undefined {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input) || input.startsWith("0000")) return undefined;
  const parsed = new Date(`${input}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input ? input : undefined;
}
function common(input: RecordInput) {
  const title = text(input.title, EXPERIENCE_LIMITS.title, true);
  const startsOn = date(input.startsOn), endsOn = date(input.endsOn);
  if (!title || startsOn === undefined || endsOn === undefined || (startsOn && endsOn && startsOn > endsOn)) return null;
  return { title, startsOn, endsOn };
}
function allowed(input: RecordInput, keys: string[]): boolean {
  return Object.keys(input).every((key) => keys.includes(key));
}
export function validateCreateExperience(input: unknown): Required<CreateExperienceInput> | null {
  const value = record(input);
  if (!value || !allowed(value, ["title", "state", "kind", "placeLabel", "startsOn", "endsOn"])) return null;
  const fields = common(value), placeLabel = text(value.placeLabel, EXPERIENCE_LIMITS.place);
  if (!fields || placeLabel === undefined || !MOMENT_KINDS.includes(value.kind as never) || !["planned", "lived"].includes(value.state as string)) return null;
  return { ...fields, placeLabel, kind: value.kind as CreateExperienceInput["kind"], state: value.state as CreateExperienceInput["state"] };
}
export function validateUpdateExperience(input: unknown): UpdateExperienceInput | null {
  const value = record(input);
  if (!value || !allowed(value, ["title", "shape", "state", "audience", "startsOn", "endsOn"])) return null;
  const fields = common(value);
  if (!fields || !["single", "trip"].includes(value.shape as string) || !["planned", "lived", "cancelled"].includes(value.state as string) || !["private", "participants", "profile"].includes(value.audience as string)) return null;
  return { ...fields, shape: value.shape as UpdateExperienceInput["shape"], state: value.state as UpdateExperienceInput["state"], audience: value.audience as UpdateExperienceInput["audience"] };
}
export function validateMoment(input: unknown): SaveMomentInput | null {
  const value = record(input);
  if (!value || !allowed(value, ["id", "title", "kind", "placeLabel", "startsOn", "endsOn"])) return null;
  const fields = common(value), placeLabel = text(value.placeLabel, EXPERIENCE_LIMITS.place);
  if (!fields || placeLabel === undefined || !MOMENT_KINDS.includes(value.kind as never) || (value.id !== undefined && !isExperienceId(value.id))) return null;
  return { ...fields, placeLabel, kind: value.kind as SaveMomentInput["kind"], ...(value.id ? { id: value.id as string } : {}) };
}
export function validateGuestName(input: unknown): string | null {
  return text(input, EXPERIENCE_LIMITS.guest, true) ?? null;
}

export function validateReview(input: unknown): SaveReviewInput | null {
  const value = record(input);
  if (!value || !allowed(value, ["rating", "body"])) return null;
  const rating = value.rating === null || value.rating === undefined ? null : value.rating;
  if (rating !== null && (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 10)) return null;
  const body = text(value.body, EXPERIENCE_LIMITS.reviewBody);
  if (body === undefined) return null;
  return { rating: rating as number | null, body };
}
