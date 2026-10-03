// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { ReactionsByEmoji } from "@/lib/social/interactions";
import { ReactionBar } from "./reaction-bar";

beforeEach(() => {
  // jsdom has no glyph rasterizer: use the real support detector's no-canvas
  // fallback. ReactionBar, EmojiPicker, the catalog and their handlers stay real.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderBar(reactions: ReactionsByEmoji = {}) {
  const onToggle = vi.fn<(emoji: string) => void>();
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ReactionBar reactions={reactions} onToggle={onToggle} />
    </NextIntlClientProvider>,
  );
  return onToggle;
}

function openBar() {
  const trigger = screen.getByRole("button", { name: "Reaccionar" });
  fireEvent.click(trigger);
  return trigger;
}

async function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Más emojis" }));
  return screen.findByRole("searchbox", { name: "Buscar emoji" });
}

describe("ReactionBar", () => {
  it("colapsada muestra los tres emojis más votados y el total de todas las reacciones", () => {
    renderBar({
      "🦊": { count: 2, viewerReacted: false },
      "🔥": { count: 4, viewerReacted: true },
      "❤️": { count: 9, viewerReacted: false },
      "📖": { count: 6, viewerReacted: false },
    });

    const trigger = screen.getByRole("button", { name: "Reaccionar" });
    expect(trigger.textContent).toContain("❤️ 📖 🔥");
    expect(trigger.textContent).not.toContain("🦊");
    expect(within(trigger).getByText("21")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  const emojiRoutes: {
    source: string;
    name: string | RegExp;
    emoji: string;
    reactions: ReactionsByEmoji;
  }[] = [
    { source: "fila rápida", name: "corazón rojo", emoji: "❤️", reactions: {} },
    { source: "reacción existente", name: /^🦊\s*2$/, emoji: "🦊", reactions: { "🦊": { count: 2, viewerReacted: false } } },
  ];

  it.each(emojiRoutes)("al pulsar un emoji de $source entrega su carácter exacto a onToggle", ({ name, emoji, reactions }) => {
    const onToggle = renderBar(reactions);
    openBar();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(emoji);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("al pulsar un emoji del catálogo real entrega su carácter exacto a onToggle", async () => {
    const onToggle = renderBar();
    openBar();
    const search = await openPicker();
    fireEvent.change(search, { target: { value: "pulpo" } });

    fireEvent.click(await screen.findByRole("button", { name: "pulpo" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("🐙");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(["fila rápida", "catálogo"])("con seis propias bloquea emojis nuevos y permite quitar propios desde %s", async (source) => {
    const onToggle = renderBar({
      "❤️": { count: 4, viewerReacted: true },
      "📖": { count: 1, viewerReacted: true },
      "😱": { count: 1, viewerReacted: true },
      "🔥": { count: 2, viewerReacted: true },
      "😂": { count: 1, viewerReacted: true },
      "🐙": { count: 3, viewerReacted: true },
      "🦊": { count: 50, viewerReacted: false },
    });
    openBar();

    let ownButton: HTMLButtonElement;
    if (source === "fila rápida") {
      const dialog = within(screen.getByRole("dialog"));
      const newButton = dialog.getByRole<HTMLButtonElement>("button", { name: "manos aplaudiendo" });
      const otherReaction = dialog.getByRole<HTMLButtonElement>("button", { name: /^🦊\s*50$/ });
      const ownReaction = dialog.getByRole<HTMLButtonElement>("button", { name: /^🐙\s*3$/ });
      expect(newButton.disabled).toBe(true);
      expect(otherReaction.disabled).toBe(true);
      expect(ownReaction.disabled).toBe(false);
      fireEvent.click(newButton);
      fireEvent.click(otherReaction);
      ownButton = dialog.getByRole("button", { name: "corazón rojo" });
    } else {
      const search = await openPicker();
      fireEvent.change(search, { target: { value: "zorro" } });
      const newButton = await screen.findByRole<HTMLButtonElement>("button", { name: "zorro" });
      expect(newButton.disabled).toBe(true);
      fireEvent.click(newButton);
      fireEvent.change(search, { target: { value: "pulpo" } });
      ownButton = await screen.findByRole("button", { name: "pulpo" });
    }

    expect(onToggle).not.toHaveBeenCalled();
    expect(ownButton.disabled).toBe(false);
    fireEvent.click(ownButton);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(source === "fila rápida" ? "❤️" : "🐙");
  });

  it("con cinco propias permite un emoji nuevo aunque otros usuarios hayan reaccionado muchas veces", () => {
    const onToggle = renderBar({
      "❤️": { count: 1, viewerReacted: true },
      "📖": { count: 1, viewerReacted: true },
      "😱": { count: 1, viewerReacted: true },
      "🔥": { count: 1, viewerReacted: true },
      "🐙": { count: 1, viewerReacted: true },
      "👏": { count: 50, viewerReacted: false },
    });
    openBar();

    const newButton = screen.getByRole<HTMLButtonElement>("button", { name: "manos aplaudiendo" });
    expect(newButton.disabled).toBe(false);
    fireEvent.click(newButton);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("👏");
  });

  it.each(["fila rápida", "catálogo"])("Escape cierra desde %s y devuelve el foco al botón que abrió la barra", async (source) => {
    const onToggle = renderBar();
    const trigger = openBar();
    const focusTarget = source === "catálogo"
      ? await openPicker()
      : screen.getByRole("button", { name: "fuego" });
    focusTarget.focus();
    expect(document.activeElement).toBe(focusTarget);

    fireEvent.keyDown(focusTarget, { key: "Escape", code: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
