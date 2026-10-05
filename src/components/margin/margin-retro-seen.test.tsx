// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const markMarginSeen = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/margin/actions", () => ({ markMarginSeen: (...a: unknown[]) => markMarginSeen(...a) }));

import { MarginRetroSeen } from "./margin-retro-seen";

afterEach(() => {
  cleanup();
  markMarginSeen.mockClear();
});

describe("MarginRetroSeen", () => {
  it("marca los ids una sola vez", () => {
    const { rerender } = render(<MarginRetroSeen ids={["e1", "e2"]} />);
    rerender(<MarginRetroSeen ids={["e1", "e2"]} />);
    expect(markMarginSeen).toHaveBeenCalledTimes(1);
    expect(markMarginSeen).toHaveBeenCalledWith(["e1", "e2"]);
  });
  it("no llama con una lista vacía", () => {
    render(<MarginRetroSeen ids={[]} />);
    expect(markMarginSeen).not.toHaveBeenCalled();
  });
  it("envía por tandas de 50", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `e${i}`);
    render(<MarginRetroSeen ids={ids} />);
    await vi.waitFor(() => expect(markMarginSeen).toHaveBeenCalledTimes(3));
    expect(markMarginSeen.mock.calls.map((c) => (c[0] as string[]).length)).toEqual([50, 50, 20]);
  });
});
