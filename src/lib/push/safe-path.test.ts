import { describe, expect, it } from "vitest";
import { isSafeInternalPath, safeInternalPath } from "./safe-path";

describe("isSafeInternalPath", () => {
  it("accepts internal absolute paths", () => {
    expect(isSafeInternalPath("/")).toBe(true);
    expect(isSafeInternalPath("/club/mi-club")).toBe(true);
    expect(isSafeInternalPath("/u/ada?tab=community")).toBe(true);
    expect(isSafeInternalPath("/club/x/evento/123#top")).toBe(true);
  });

  it("rejects protocol-relative and external URLs", () => {
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("http://evil.com")).toBe(false);
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
  });

  it("rejects dangerous schemes", () => {
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false);
    expect(isSafeInternalPath("mailto:x@y.z")).toBe(false);
    expect(isSafeInternalPath("data:text/html,x")).toBe(false);
  });

  it("rejects relative paths and empties", () => {
    expect(isSafeInternalPath("foo")).toBe(false);
    expect(isSafeInternalPath("")).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath(42)).toBe(false);
  });

  it("rejects backslash tricks and control chars", () => {
    expect(isSafeInternalPath("/\\evil.com")).toBe(false);
    expect(isSafeInternalPath("/foo\nbar")).toBe(false);
    expect(isSafeInternalPath("/foo\tbar")).toBe(false);
  });
});

describe("safeInternalPath", () => {
  it("passes through safe paths", () => {
    expect(safeInternalPath("/club/x")).toBe("/club/x");
  });
  it("falls back to home for unsafe paths", () => {
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)", "/inicio")).toBe("/inicio");
  });
});
