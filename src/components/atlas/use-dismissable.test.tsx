// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { useDismissable } from "./use-dismissable";

afterEach(cleanup);

function Sheet({ close, onInputKey }: { close: (refocus: boolean) => void; onInputKey?: (e: React.KeyboardEvent) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onBlur = useDismissable({ open: true, ref, close });
  return (
    <>
      <input aria-label="fuera" onKeyDown={onInputKey} />
      <div ref={ref} onBlur={onBlur}><button type="button">dentro</button></div>
    </>
  );
}

describe("useDismissable", () => {
  it("Escape cierra y pide devolver el foco", () => {
    const close = vi.fn();
    const { getByRole } = render(<Sheet close={close} />);
    fireEvent.keyDown(getByRole("button"), { key: "Escape" });
    expect(close).toHaveBeenCalledWith(true);
  });
  it("un Escape que otro control ya consumió (preventDefault) no cierra", () => {
    const close = vi.fn();
    const { getByRole } = render(<Sheet close={close} onInputKey={(e) => e.preventDefault()} />);
    fireEvent.keyDown(getByRole("textbox"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });
});
