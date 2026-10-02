// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MentionCandidate } from "@/lib/social/mention-candidates";

const searchMentionCandidates = vi.hoisted(() => vi.fn());
vi.mock("@/lib/social/mention-search", () => ({ searchMentionCandidates }));

import { useMentionAutocomplete } from "./use-mention-autocomplete";

const scope = { scope: "profile" } as const;
const candidates: MentionCandidate[] = [
  { username: "diana", displayName: "Diana", avatarUrl: null, isInGraph: true },
  { username: "diego", displayName: "Diego", avatarUrl: null, isInGraph: false },
];

function Composer() {
  const [value, setValue] = useState("");
  const mentions = useMentionAutocomplete({ value, onChange: setValue, scope });
  return (
    <div data-testid="scroll-container">
      <div className="relative">
        <textarea aria-label="Comentario" value={value} onChange={e => setValue(e.target.value)}
          onInput={mentions.onInput} onKeyDown={mentions.onKeyDown} />
        {mentions.dropdown}
      </div>
    </div>
  );
}

function rect(top: number, bottom: number): DOMRect {
  return { x: 0, y: top, top, bottom, left: 0, right: 320, width: 320, height: bottom - top,
    toJSON: () => ({}) };
}

function visualViewport(height = 740, offsetTop = 0) {
  const viewport = Object.assign(new EventTarget(), { height, offsetTop });
  vi.stubGlobal("visualViewport", viewport);
  return viewport;
}

async function open(top = 120, bottom = 160) {
  const view = render(<Composer />);
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  const measure = vi.spyOn(input, "getBoundingClientRect").mockReturnValue(rect(top, bottom));
  fireEvent.input(input, { target: { value: "@d", selectionStart: 2 } });
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  const list = screen.getByRole("list");
  expect(searchMentionCandidates).toHaveBeenCalledExactlyOnceWith("d", scope);
  return { ...view, input, list, measure };
}

async function dispatch(target: EventTarget, event: string) {
  await act(async () => {
    target.dispatchEvent(new Event(event));
    await vi.advanceTimersByTimeAsync(32);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("innerHeight", 740);
  vi.stubGlobal("visualViewport", null);
  searchMentionCandidates.mockResolvedValue(candidates);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// JSDOM no acredita la caja real: estos tests fijan el cambio de estado ante
// los eventos sin teclear ni buscar otra vez. La geometría la verifica el E2E.
describe("useMentionAutocomplete: recolocación con la lista abierta", () => {
  it("recalcula lado y alto al reducir el viewport sin volver a buscar", async () => {
    const { list, measure } = await open();
    expect(list.classList.contains("top-full")).toBe(true);
    expect(list.style.maxHeight).toBe("240px");

    vi.stubGlobal("innerHeight", 320);
    measure.mockReturnValue(rect(190, 230));
    await dispatch(window, "resize");

    expect(list.classList.contains("bottom-full")).toBe(true);
    expect(list.style.maxHeight).toBe("182px");
    expect(searchMentionCandidates).toHaveBeenCalledTimes(1);
  });

  it("sigue el campo al hacer scroll dentro de un contenedor sin volver a buscar", async () => {
    const { list, measure } = await open(550, 590);
    expect(list.classList.contains("bottom-full")).toBe(true);

    measure.mockReturnValue(rect(70, 110));
    await dispatch(screen.getByTestId("scroll-container"), "scroll");

    expect(list.classList.contains("top-full")).toBe(true);
    expect(list.style.maxHeight).toBe("240px");
    expect(searchMentionCandidates).toHaveBeenCalledTimes(1);
  });

  it("respeta el alto y desplazamiento del VisualViewport al abrir", async () => {
    visualViewport(320, 70);
    const { list } = await open(240, 280);
    expect(list.classList.contains("bottom-full")).toBe(true);
    expect(list.style.maxHeight).toBe("162px");
  });

  it("sigue resize y scroll del VisualViewport sin cambiar window.innerHeight", async () => {
    const viewport = visualViewport();
    const { list, measure } = await open();
    viewport.height = 320;
    viewport.offsetTop = 70;
    measure.mockReturnValue(rect(240, 280));
    await dispatch(viewport, "resize");
    expect(list.classList.contains("bottom-full")).toBe(true);
    expect(list.style.maxHeight).toBe("162px");

    viewport.offsetTop = 125;
    await dispatch(viewport, "scroll");
    expect(list.classList.contains("top-full")).toBe(true);
    expect(list.style.maxHeight).toBe("157px");
    expect(window.innerHeight).toBe(740);
    expect(searchMentionCandidates).toHaveBeenCalledTimes(1);
  });

  it("agrupa varios eventos en una sola medición por frame", async () => {
    const viewport = visualViewport();
    const { measure } = await open();
    measure.mockClear();
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("resize"));
      await vi.advanceTimersByTimeAsync(32);
    });
    expect(measure).toHaveBeenCalledTimes(1);
    expect(searchMentionCandidates).toHaveBeenCalledTimes(1);
  });

  it.each(["cerrar", "desmontar"])("retira escuchas y cancela la medición pendiente al %s", async (finish) => {
    const viewport = visualViewport();
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const viewportAdd = vi.spyOn(viewport, "addEventListener");
    const viewportRemove = vi.spyOn(viewport, "removeEventListener");
    const { input, measure, unmount } = await open();
    const windowCalls = windowAdd.mock.calls.filter(([type]) => type === "resize" || type === "scroll");
    const viewportCalls = viewportAdd.mock.calls;
    expect(windowCalls).toHaveLength(2);
    expect(viewportCalls).toHaveLength(2);
    measure.mockClear();

    act(() => {
      window.dispatchEvent(new Event("resize"));
      if (finish === "cerrar") fireEvent.keyDown(input, { key: "Escape" });
      else unmount();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(32); });
    expect(screen.queryByRole("list")).toBeNull();
    for (const [type, listener, options] of windowCalls) {
      expect(windowRemove).toHaveBeenCalledWith(type, listener, options);
    }
    for (const [type, listener, options] of viewportCalls) {
      expect(viewportRemove).toHaveBeenCalledWith(type, listener, options);
    }
    await dispatch(window, "resize");
    await dispatch(viewport, "scroll");
    expect(measure).not.toHaveBeenCalled();
    expect(searchMentionCandidates).toHaveBeenCalledTimes(1);
  });

  it("no instala escuchas de geometría sin candidatos", async () => {
    const viewport = visualViewport();
    const windowAdd = vi.spyOn(window, "addEventListener");
    const viewportAdd = vi.spyOn(viewport, "addEventListener");
    searchMentionCandidates.mockResolvedValue([]);
    render(<Composer />);
    const input = screen.getByRole("textbox");
    fireEvent.input(input, { target: { value: "@d", selectionStart: 2 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(screen.queryByRole("list")).toBeNull();
    expect(windowAdd.mock.calls.filter(([type]) => type === "resize" || type === "scroll")).toEqual([]);
    expect(viewportAdd).not.toHaveBeenCalled();
  });

  it.each(["Enter", "Tab"])("conserva selección por flechas y %s tras recolocar", async (key) => {
    const { input, measure } = await open();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    measure.mockReturnValue(rect(550, 590));
    await dispatch(window, "scroll");
    fireEvent.keyDown(input, { key });
    expect(input.value).toBe("@diego ");
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("conserva selección con el ratón tras recolocar", async () => {
    const { input, measure } = await open();
    input.focus();
    measure.mockReturnValue(rect(550, 590));
    await dispatch(window, "resize");
    fireEvent.mouseDown(screen.getByRole("button", { name: /@diana/ }));
    expect(input.value).toBe("@diana ");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("list")).toBeNull();
  });
});
