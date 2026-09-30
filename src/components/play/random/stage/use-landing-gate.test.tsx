// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { AnimationEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

let reduced = false;
vi.mock("@/lib/ui/use-reduced-motion", () => ({ useReducedMotion: () => reduced }));
vi.mock("./stage-helpers", () => ({ buzz: vi.fn() }));
import { useLandingGate } from "./use-landing-gate";
import { buzz } from "./stage-helpers";

function animationEnd(target: EventTarget, currentTarget: EventTarget): AnimationEvent<HTMLElement> {
  return { target, currentTarget } as AnimationEvent<HTMLElement>;
}

afterEach(() => {
  reduced = false;
  vi.clearAllMocks();
});

describe("useLandingGate", () => {
  it("no re-revela A al volver desde B hasta completar otra animación", () => {
    const { result, rerender } = renderHook(({ id }) => useLandingGate(id, 2), { initialProps: { id: "A" } });
    const node = document.createElement("span");
    const event = animationEnd(node, node);
    act(() => { result.current.onOneEnd(event); result.current.onOneEnd(event); });
    expect(result.current.landed).toBe(true);
    rerender({ id: "B" }); rerender({ id: "A" }); rerender({ id: "A" });
    expect(result.current.landed).toBe(false);
    act(() => result.current.onOneEnd(event));
    expect(result.current.landed).toBe(false);
    act(() => result.current.onOneEnd(event));
    expect(result.current.landed).toBe(true);
  });

  it("ignora el animationend de un hijo y vibra una vez al aterrizar", () => {
    const { result } = renderHook(() => useLandingGate("A", 2));
    const parent = document.createElement("span");
    const child = document.createElement("svg");

    act(() => result.current.onOneEnd(animationEnd(child, parent)));
    expect(result.current.landed).toBe(false);
    expect(buzz).not.toHaveBeenCalled();

    act(() => {
      result.current.onOneEnd(animationEnd(parent, parent));
      result.current.onOneEnd(animationEnd(parent, parent));
      result.current.onOneEnd(animationEnd(parent, parent));
    });
    expect(result.current.landed).toBe(true);
    expect(buzz).toHaveBeenCalledTimes(1);
  });

  it("reduced motion aterriza inmediatamente incluso al volver de B a A", () => {
    reduced = true;
    const { result, rerender } = renderHook(({ id }) => useLandingGate(id, 2), { initialProps: { id: "A" } });
    expect(result.current.landed).toBe(true);
    rerender({ id: "B" });
    expect(result.current.landed).toBe(true);
    rerender({ id: "A" });
    expect(result.current.landed).toBe(true);
  });
});
