import { describe, expect, it } from "vitest";
import { formatVoiceDuration } from "./format";

describe("formatVoiceDuration", () => {
  it("formatea m:ss", () => {
    expect(formatVoiceDuration(0)).toBe("0:00");
    expect(formatVoiceDuration(23_000)).toBe("0:23");
    expect(formatVoiceDuration(61_499)).toBe("1:01");
  });
  it("nunca negativo", () => {
    expect(formatVoiceDuration(-500)).toBe("0:00");
  });
});
