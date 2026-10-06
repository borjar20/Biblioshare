// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { StoryPlayer } from "./story-player";

vi.mock("@/lib/wrap-ups/actions", () => ({ markWrapUpSeen: vi.fn(async () => {}), publishWrapUp: vi.fn(), unpublishWrapUp: vi.fn(), refreshWrapUp: vi.fn() }));
// next/font/google solo existe dentro del compilador de Next.
vi.mock("./pixel-font", () => ({ pixelFont: { variable: "font-pixel" } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

// La cifra (eyebrow) y la línea son textos distintos para que getByText no vea dos.
const model = (eyebrow: string) => ({ layout: "figure" as const, eyebrow, lines: [`línea ${eyebrow}`], narratorLine: "hola" });
const wrapUp = { kind: "week", seenAt: null, refreshedAt: null, generatedAt: "2026-10-05T07:00:00Z", publishedPostId: null,
  payload: { kind: "week", palette: "book", narrator: "reader", pet: null, stories: [{ id: "cover" }, { id: "time" }, { id: "closing" }] } } as never;

const wrap = (ui: ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>);

beforeEach(() => {
  // jsdom no implementa showModal: basta con abrirlo para que los roles sean accesibles.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }) as never;
});

describe("StoryPlayer", () => {
  it("avanza con la flecha y marca visto", async () => {
    const { markWrapUpSeen } = await import("@/lib/wrap-ups/actions");
    wrap(<StoryPlayer wrapUp={wrapUp} models={[model("A"), model("B"), model("C")]} onClose={() => {}} />);
    expect(screen.getByText("A")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("B")).toBeTruthy();
    expect(markWrapUpSeen).toHaveBeenCalledWith("week");
    expect(markWrapUpSeen).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("A")).toBeTruthy();
  });
  it("avanza solo a los 6 s", () => {
    vi.useFakeTimers();
    wrap(<StoryPlayer wrapUp={wrapUp} models={[model("A"), model("B")]} onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.getByText("B")).toBeTruthy();
    vi.useRealTimers();
  });
  it("la pausa conserva el tiempo que quedaba", () => {
    vi.useFakeTimers();
    wrap(<StoryPlayer wrapUp={wrapUp} models={[model("A"), model("B")]} onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(4000); });
    act(() => { fireEvent.keyDown(window, { key: " " }); });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByText("A")).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: " " }); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText("B")).toBeTruthy();
    vi.useRealTimers();
  });
  it("con reduced motion no avanza solo", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }) as never;
    vi.useFakeTimers();
    wrap(<StoryPlayer wrapUp={wrapUp} models={[model("A"), model("B")]} onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.getByText("A")).toBeTruthy();
    vi.useRealTimers();
  });
  it("tocar el 30 % izquierdo retrocede y el resto avanza", () => {
    wrap(<StoryPlayer wrapUp={wrapUp} models={[model("A"), model("B"), model("C")]} onClose={() => {}} />);
    const zone = screen.getByTestId("story-tap-zone");
    zone.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON() {} });
    fireEvent.pointerDown(zone, { clientX: 80 });
    fireEvent.pointerUp(zone, { clientX: 80 });
    expect(screen.getByText("B")).toBeTruthy();
    fireEvent.pointerDown(zone, { clientX: 10 });
    fireEvent.pointerUp(zone, { clientX: 10 });
    expect(screen.getByText("A")).toBeTruthy();
  });
  it("la story de cierre enseña las acciones del dueño", () => {
    wrap(<StoryPlayer wrapUp={wrapUp} models={[model("A"), model("B"), model("C")]} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Publicar en el feed" })).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Publicar en el feed" })).toBeTruthy();
  });
  it("al desmontar no deja temporizadores vivos (mantener pulsado incluido)", () => {
    vi.useFakeTimers();
    const player = () => wrap(<StoryPlayer wrapUp={wrapUp} models={[model("A"), model("B")]} onClose={() => {}} />);
    // Línea base: lo que deja React/next-intl por montaje, sin tocar nada.
    let before = vi.getTimerCount();
    player().unmount();
    const baseline = vi.getTimerCount() - before;
    before = vi.getTimerCount();
    const { unmount } = player();
    fireEvent.pointerDown(screen.getByTestId("story-tap-zone"), { clientX: 80 });
    unmount();
    expect(vi.getTimerCount() - before).toBe(baseline);
    vi.useRealTimers();
  });
});
