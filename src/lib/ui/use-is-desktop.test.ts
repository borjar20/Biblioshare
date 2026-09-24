// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsDesktop } from "./use-is-desktop";

afterEach(() => vi.unstubAllGlobals());

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe("useIsDesktop", () => {
  it("true a partir de lg (1024px)", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
  });

  it("false por debajo", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("sin matchMedia (jsdom a secas, tests viejos) cuenta como móvil y no revienta", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });
});
