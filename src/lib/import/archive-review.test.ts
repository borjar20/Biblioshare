import { expect, it } from "vitest";
import { equivalentArchiveReview, archiveFieldEffect } from "./archive-review";

it("recognizes safe equivalent formatting without collapsing different emphasis, links or content", () => {
  expect(equivalentArchiveReview("<b>A film</b>", "<strong>A film</strong>")).toBe(true);
  expect(equivalentArchiveReview("<p>A film</p>", "A film")).toBe(true);
  expect(equivalentArchiveReview("<b>A film</b>", "A film")).toBe(false);
  expect(equivalentArchiveReview('<a href="https://a.test">film</a>', '<a href="https://b.test">film</a>')).toBe(false);
  expect(equivalentArchiveReview("Good film", "Bad film")).toBe(false);
});

it("shows exact fill and overwrite effects, never deleting local data for absent archive values", () => {
  expect(archiveFieldEffect("My review", null, true, true)).toBe("keep");
  expect(archiveFieldEffect(null, "Imported review", false, true)).toBe("add");
  expect(archiveFieldEffect("My review", "Imported review", false, true)).toBe("keepDifferent");
  expect(archiveFieldEffect(8, 6, true)).toBe("replace");
});
