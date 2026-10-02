// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { makeEvent } from "@/lib/play/core/events";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import { clockReducer } from "@/lib/play/clock/reducer";
import { initialClockState } from "@/lib/play/clock/types";
import { ChessSetup } from "./chess-setup";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function resetState(initialMs: number) {
  const configured = clockReducer(
    initialClockState(),
    makeEvent(
      "chess_configured",
      { players: ["Ana", "Beto"], initialMs, incrementMs: 5_000 },
      1_000,
      "configured",
    ),
  );
  return clockReducer(configured, makeEvent("clock_reset", {}, 2_000, "reset"));
}

function renderSetup(initialMs = 90_000) {
  const emit = vi.fn<CompanionEmit<ClockEvent>>(() => true);
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ChessSetup identity="anon" state={resetState(initialMs)} emit={emit} />
    </NextIntlClientProvider>,
  );
  return emit;
}

describe("ChessSetup — tiempo inicial exacto", () => {
  it.each([10_000, 90_000, 10_001])(
    "conserva %i ms al volver a empezar después de reiniciar",
    (initialMs) => {
      const emit = renderSetup(initialMs);

      fireEvent.click(screen.getByRole("button", { name: /^Empezar / }));

      expect(emit).toHaveBeenCalledWith("chess_configured", {
        players: ["Ana", "Beto"],
        initialMs,
        incrementMs: 5_000,
      });
    },
  );

  it.each([
    ["10", 10_000],
    ["7200", 7_200_000],
    ["10.001", 10_001],
  ])("permite configurar %s segundos sin redondear", (seconds, initialMs) => {
    const emit = renderSetup();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Tiempo inicial (segundos)" }), {
      target: { value: seconds },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Empezar / }));

    expect(emit).toHaveBeenCalledWith("chess_configured", {
      players: ["Ana", "Beto"],
      initialMs,
      incrementMs: 5_000,
    });
  });

  it.each(["", "9.999", "7200.001", "10.0001"])(
    "explica y bloquea el tiempo inválido %j, y permite corregirlo",
    (seconds) => {
      const emit = renderSetup();
      const input = screen.getByRole("spinbutton", { name: "Tiempo inicial (segundos)" });

      fireEvent.change(input, { target: { value: seconds } });
      const start = screen.getByRole("button", { name: "Empezar" });
      expect((start as HTMLButtonElement).disabled).toBe(true);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("status").textContent).toBe(
        "Elige un tiempo entre 10 y 7200 segundos, con hasta 3 decimales.",
      );
      fireEvent.click(start);
      expect(emit).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: "90" } });
      expect(screen.queryByRole("status")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /^Empezar / }));
      expect(emit).toHaveBeenCalledWith("chess_configured", {
        players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 5_000,
      });
    },
  );

  it("los pasos de un minuto conservan la fracción de segundo", () => {
    const emit = renderSetup(10_001);

    fireEvent.click(screen.getByRole("button", { name: "Un minuto más" }));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("70.001");
    fireEvent.click(screen.getByRole("button", { name: "Un minuto menos" }));
    fireEvent.click(screen.getByRole("button", { name: /^Empezar / }));

    expect(emit).toHaveBeenCalledWith("chess_configured", {
      players: ["Ana", "Beto"], initialMs: 10_001, incrementMs: 5_000,
    });
  });

  it.each([
    [10_001, "Un minuto menos", "10", 10_000],
    [7_199_999, "Un minuto más", "7200", 7_200_000],
  ])("los pasos respetan los límites del motor desde %i ms", (initialMs, step, shown, expectedMs) => {
    const emit = renderSetup(initialMs);

    fireEvent.click(screen.getByRole("button", { name: step }));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(shown);
    expect((screen.getByRole("button", { name: step }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Empezar / }));

    expect(emit).toHaveBeenCalledWith("chess_configured", {
      players: ["Ana", "Beto"], initialMs: expectedMs, incrementMs: 5_000,
    });
  });

  it("un preset recupera una edición inválida y mantiene su duración exacta", () => {
    const emit = renderSetup();
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: "3 min" }));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("180");
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Empezar / }));

    expect(emit).toHaveBeenCalledWith("chess_configured", {
      players: ["Ana", "Beto"], initialMs: 180_000, incrementMs: 5_000,
    });
  });

  it("mantener un paso limita la vista previa y confirma el tiempo al soltar", () => {
    vi.useFakeTimers();
    const emit = renderSetup(7_199_999);
    const step = screen.getByRole("button", { name: "Un minuto más" });

    fireEvent.pointerDown(step);
    act(() => vi.advanceTimersByTime(640));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("7200");
    expect(emit).not.toHaveBeenCalled();
    fireEvent.pointerUp(step);
    fireEvent.click(step);
    fireEvent.click(screen.getByRole("button", { name: /^Empezar / }));

    expect(emit).toHaveBeenCalledWith("chess_configured", {
      players: ["Ana", "Beto"], initialMs: 7_200_000, incrementMs: 5_000,
    });
  });
});
