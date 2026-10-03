// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/es.json";
import { makeEvent } from "@/lib/play/core/events";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ResourcesEvent } from "@/lib/play/resources/events";
import { resourcesReducer } from "@/lib/play/resources/reducer";
import { initialResourcesState, type ResourceDef, type ResourcesState } from "@/lib/play/resources/types";
import { ResourcesConfig } from "./resources-config";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function configured(defs: ResourceDef[] = []): ResourcesState {
  const players = resourcesReducer(
    initialResourcesState(),
    makeEvent("players_set", { players: ["Ana", "Beto"] }, 0, "players"),
  );
  return defs.reduce(
    (state, def) => resourcesReducer(state, makeEvent("resource_added", def, 0, def.name)),
    players,
  );
}

function renderConfig(defs?: ResourceDef[]) {
  const emit = vi.fn<CompanionEmit<ResourcesEvent>>(() => true);
  let currentState = configured(defs);
  function Session() {
    const [state, setState] = useState(currentState);
    currentState = state;
    const apply: CompanionEmit<ResourcesEvent> = (type, payload) => {
      emit(type, payload);
      setState((previous) => resourcesReducer(
        previous,
        makeEvent(type, payload, 0, "gesture") as ResourcesEvent,
      ));
      return true;
    };
    return <ResourcesConfig identity="anon" state={state} emit={apply} />;
  }
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <Session />
    </NextIntlClientProvider>,
  );
  return { emit, state: () => currentState };
}

function initialShown(value: number) {
  const panel = document.getElementById("resources-def");
  expect(panel).not.toBeNull();
  expect(within(panel!).getByText(String(value))).toBeDefined();
}

function createCustom(name: string, iconLabel?: string) {
  fireEvent.click(screen.getByRole("button", { name: "Recurso a medida" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre del recurso" }), {
    target: { value: name },
  });
  if (iconLabel) fireEvent.click(screen.getByRole("button", { name: iconLabel }));
  fireEvent.click(screen.getByRole("button", { name: "Crear ficha" }));
}

describe("ResourcesConfig — unicidad del nombre", () => {
  it("un recurso Oro a medida ocupa el nombre; quitarlo recupera el atajo Oro", () => {
    const session = renderConfig();
    createCustom(" Oro ");

    expect(session.state().defs).toEqual([{ name: "Oro", emoji: "", initial: 0, shared: false }]);
    expect(screen.queryByRole("button", { name: "Crear Oro" })).toBeNull();
    expect(screen.getByRole("button", { name: "Crear Madera" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Recurso a medida" }));
    const input = screen.getByRole("textbox", { name: "Nombre del recurso" });
    fireEvent.change(input, { target: { value: " Oro " } });
    expect((screen.getByRole("button", { name: "Crear ficha" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(session.emit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Editar Oro" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar Oro" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear Oro" }));

    expect(session.state().defs).toEqual([{ name: "Oro", emoji: "gold", initial: 0, shared: false }]);
    expect(session.state().values).toHaveLength(2);
  });

  it("usar el glifo Oro en un recurso a medida no consume el preset Oro", () => {
    const session = renderConfig();
    createCustom("Reserva", "Icono Oro");
    fireEvent.click(screen.getByRole("button", { name: "Crear Oro" }));

    expect(session.state().defs).toEqual([
      { name: "Reserva", emoji: "gold", initial: 0, shared: false },
      { name: "Oro", emoji: "gold", initial: 0, shared: false },
    ]);
    expect(session.state().values.map((value) => value.resource)).toEqual(["Reserva", "Reserva", "Oro", "Oro"]);
  });
});

describe("ResourcesConfig — gesto aislado por definición", () => {
  it.each([
    { initial: 10, label: "Uno más de inicio", elapsed: 0, preview: 10, caseName: "inicio pendiente" },
    { initial: 10, label: "Uno más de inicio", elapsed: 640, preview: 13, caseName: "vista previa" },
    { initial: 9_998, label: "Uno más de inicio", elapsed: 640, preview: 9_999, caseName: "límite superior" },
    { initial: -9_998, label: "Uno menos de inicio", elapsed: 640, preview: -9_999, caseName: "límite inferior" },
  ])("cancela $caseName al cambiar de ficha", ({ initial, label, elapsed, preview }) => {
    vi.useFakeTimers();
    const session = renderConfig([
      { name: "Madera", emoji: "wood", initial, shared: false },
      { name: "Oro", emoji: "gold", initial: 20, shared: true },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Editar Madera" }));
    const step = screen.getByRole("button", { name: label });
    fireEvent.pointerDown(step);
    act(() => vi.advanceTimersByTime(elapsed));
    initialShown(preview);

    // Otra interacción (p. ej. teclado o segundo contacto) cambia la ficha
    // mientras el primer puntero sigue pulsado. Se usa el hook real.
    fireEvent.click(screen.getByRole("button", { name: "Editar Oro" }));
    initialShown(20);
    act(() => vi.advanceTimersByTime(600));
    initialShown(20);
    fireEvent.pointerUp(step);
    expect(session.emit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Uno más de inicio" }));
    expect(session.emit).toHaveBeenCalledExactlyOnceWith("resource_updated", {
      name: "Oro", initial: 21, shared: true,
    });
    expect(session.state().defs.map((def) => def.initial)).toEqual([initial, 21]);
    expect(session.state().values.map((value) => value.value)).toEqual([initial, initial, 21]);
  });

  it("soltar el puntero de la ficha anterior no confirma su delta en la nueva", () => {
    vi.useFakeTimers();
    const session = renderConfig([
      { name: "Madera", emoji: "wood", initial: 10, shared: false },
      { name: "Oro", emoji: "gold", initial: 20, shared: false },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Editar Madera" }));
    const step = screen.getByRole("button", { name: "Uno más de inicio" });
    fireEvent.pointerDown(step);
    act(() => vi.advanceTimersByTime(640));
    fireEvent.click(screen.getByRole("button", { name: "Editar Oro" }));
    fireEvent.pointerUp(step);

    expect(session.emit).not.toHaveBeenCalled();
    expect(session.state().defs.map((def) => def.initial)).toEqual([10, 20]);
    expect(session.state().values.map((value) => value.value)).toEqual([10, 10, 20, 20]);
  });
});
