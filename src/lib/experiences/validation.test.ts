import { describe, expect, it } from "vitest";
import { validateCreateExperience, validateUpdateExperience, validateMoment, isExperienceId, validateGuestName, validateReview } from "./validation";

const minimum = { title: "  Una noche en el teatro  ", state: "planned", kind: "show" };
const update = { title: "Escapada", shape: "trip", state: "lived", audience: "participants", startsOn: null, endsOn: null };

describe("experience inputs", () => {
  it("captures a plan with no dates, companions, images or description", () => {
    expect(validateCreateExperience(minimum)).toEqual({ title: "Una noche en el teatro", state: "planned", kind: "show", placeLabel: null, startsOn: null, endsOn: null });
  });
  it("accepts lived memories and unknown dates", () => {
    expect(validateCreateExperience({ ...minimum, state: "lived", startsOn: null })).not.toBeNull();
    expect(validateUpdateExperience(update)).toEqual(update);
  });
  it.each([{}, null, { ...minimum, title: "  " }, { ...minimum, title: "x".repeat(161) }, { ...minimum, state: "cancelled" }, { ...minimum, kind: "book" }, { ...minimum, placeLabel: "x".repeat(241) }])("rejects invalid capture %#", (input) => {
    expect(validateCreateExperience(input)).toBeNull();
  });
  it("enforces real calendar dates and ordered intervals", () => {
    for (const dates of [{ startsOn: "2026-02-29" }, { startsOn: "2026-13-01" }, { startsOn: "01/10/2026" }, { startsOn: "2026-10-02", endsOn: "2026-10-01" }]) {
      expect(validateCreateExperience({ ...minimum, ...dates })).toBeNull();
      expect(validateMoment({ ...minimum, ...dates })).toBeNull();
    }
    expect(validateCreateExperience({ ...minimum, startsOn: "2024-02-29", endsOn: "2024-03-01" })).not.toBeNull();
    expect(validateCreateExperience({ ...minimum, endsOn: "2026-10-02" })).not.toBeNull();
  });
  it("accepts exact boundaries and rejects non-string optionals", () => {
    expect(validateCreateExperience({ ...minimum, title: "x".repeat(160), placeLabel: "x".repeat(240) })).not.toBeNull();
    expect(validateCreateExperience({ ...minimum, placeLabel: 7 })).toBeNull();
    expect(validateCreateExperience({ ...minimum, startsOn: false })).toBeNull();
  });
  it("does not accept immutable identity fields", () => {
    expect(validateCreateExperience({ ...minimum, creator_id: "someone" })).toBeNull();
    expect(validateUpdateExperience({ ...update, creatorId: "someone" })).toBeNull();
  });
  it("validates moment IDs, shapes, state and audience", () => {
    expect(validateMoment({ title: "Paseo", kind: "walk" })).toEqual({ title: "Paseo", kind: "walk", placeLabel: null, startsOn: null, endsOn: null });
    expect(validateMoment({ title: "Paseo", kind: "walk", id: "not-a-uuid" })).toBeNull();
    expect(validateUpdateExperience({ ...update, state: "cancelled" })).not.toBeNull();
    expect(validateUpdateExperience({ ...update, shape: "collection" })).toBeNull();
    expect(validateUpdateExperience({ ...update, audience: "everyone" })).toBeNull();
    expect(isExperienceId("78f7377a-73c6-40c4-8c86-a395518d4bb0")).toBe(true);
    expect(isExperienceId("../photo")).toBe(false);
  });
  it("trims private guest names without exceeding 80 characters", () => {
    expect(validateGuestName("  Ana  ")).toBe("Ana");
    expect(validateGuestName("x".repeat(80))).not.toBeNull();
    expect(validateGuestName("x".repeat(81))).toBeNull();
    expect(validateGuestName("  ")).toBeNull();
  });
});

describe("validateReview", () => {
  it("accepts rating, body or both, trimming body", () => {
    expect(validateReview({ rating: 8, body: null })).toEqual({ rating: 8, body: null });
    expect(validateReview({ rating: null, body: "  Bien  " })).toEqual({ rating: null, body: "Bien" });
    expect(validateReview({ rating: 10, body: "x" })).toEqual({ rating: 10, body: "x" });
  });
  it("treats empty as clear and rejects out-of-range or malformed", () => {
    expect(validateReview({ rating: null, body: "   " })).toEqual({ rating: null, body: null });
    expect(validateReview({ rating: 0, body: null })).toBeNull();
    expect(validateReview({ rating: 11, body: null })).toBeNull();
    expect(validateReview({ rating: 7.5, body: null })).toBeNull();
    expect(validateReview({ rating: null, body: "a".repeat(4001) })).toBeNull();
    expect(validateReview({ rating: 5, body: null, author: "x" })).toBeNull();
  });
});
