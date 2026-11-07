// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

// El cronómetro real lee localStorage y un reloj: aquí solo importa que, al
// pasar a «A mano», entregue sus minutos (37, que no es ningún chip).
vi.mock("./session-timer", () => ({
  SessionTimer: ({ onMinutes }: { onMinutes: (m: number) => void }) => (
    <button type="button" onClick={() => onMinutes(37)}>
      usar los minutos
    </button>
  ),
}));

import { BookProgressField } from "./book-progress-field";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function field(initialMinutes?: number | null) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <form>
        <BookProgressField passId="pass-1" fromPage={180} total={412} initialMinutes={initialMinutes} sessionDate="2026-11-07" />
      </form>
    </NextIntlClientProvider>,
  );
}

const details = (c: HTMLElement) => c.querySelector("details") as HTMLDetailsElement;
const minutesInput = () => screen.getByLabelText("Duración") as HTMLInputElement;

describe("BookProgressField · minutos que no son de ningún chip", () => {
  it("?minutos=37: el bloque «Más precisión» abre con el valor y el resumen lo dice", () => {
    const { container } = field(37);
    expect(details(container).open).toBe(true);
    expect(minutesInput().value).toBe("37");
    expect(container.querySelector("summary")?.textContent).toBe("Más precisión · 37 min");
    for (const b of screen.getAllByRole("button", { pressed: true })) {
      expect(b.textContent).not.toMatch(/min|hora/i);
    }
  });

  it("un valor de chip deja el bloque plegado con su chip pulsado", () => {
    const { container } = field(30);
    expect(details(container).open).toBe(false);
    expect(screen.getByRole("button", { name: "30 min" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("summary")?.textContent).toBe("Más precisión");
  });

  it("los minutos del cronómetro al pasar a «A mano» se ven", () => {
    const { container } = field();
    fireEvent.click(screen.getByRole("button", { name: "Cronómetro" }));
    fireEvent.click(screen.getByRole("button", { name: "usar los minutos" }));
    expect(minutesInput().value).toBe("37");
    expect(details(container).open).toBe(true);
    expect(container.querySelector("summary")?.textContent).toBe("Más precisión · 37 min");
  });
});
