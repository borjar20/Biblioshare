// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { SeatPicker } from "./seat-picker";

afterEach(cleanup);

function Table({ initialPlayers = ["Ana", "Beto"], max = 6 }: {
  initialPlayers?: string[];
  max?: number;
}) {
  const [players, setPlayers] = useState(initialPlayers);
  return <SeatPicker identity="anon" players={players} max={max} onChange={setPlayers} idPrefix="test" />;
}

function renderTable(initialPlayers?: string[], max?: number) {
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <Table initialPlayers={initialPlayers} max={max} />
    </NextIntlClientProvider>,
  );
}

describe("SeatPicker — feedback de alta", () => {
  it("explica el duplicado sin cerrar el input ni sentar otra copia", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    const input = screen.getByRole("textbox", { name: "Nombre del jugador" });

    fireEvent.change(input, { target: { value: " Ana " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("status").textContent).toBe("Ana ya está en la mesa.");
    expect((screen.getByRole("button", { name: "Añadir" }) as HTMLButtonElement).disabled).toBe(true);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("status").id);
    expect(screen.getAllByRole("button", { name: "Editar a Ana" })).toHaveLength(1);
    expect((input as HTMLInputElement).value).toBe(" Ana ");

    fireEvent.change(input, { target: { value: " Cora " } });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    expect(screen.getByRole("button", { name: "Editar a Cora" })).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("bloquea un nombre vacío y conserva el alta con Enter", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    const input = screen.getByRole("textbox", { name: "Nombre del jugador" });
    fireEvent.change(input, { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Añadir" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getAllByRole("button", { name: /^Editar a / })).toHaveLength(2);

    fireEvent.change(input, { target: { value: "Cora" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Editar a Cora" })).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("explica la mesa llena y vuelve a permitir el alta al retirar un asiento", () => {
    renderTable(["Ana", "Beto", "Cora", "Dani", "Elena"]);
    fireEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fede" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    expect(screen.getByRole("status").textContent).toBe("La mesa ya tiene 6 jugadores.");
    expect(screen.queryByRole("button", { name: "Añadir jugador" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Editar a / })).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Editar a Fede" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar a Fede de la mesa" }));
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Gema" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(screen.getByRole("button", { name: "Editar a Gema" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: /^Editar a / })).toHaveLength(6);
  });

  it("bloquea también el botón y Enter si otra interacción llena la mesa con el input abierto", () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <SeatPicker identity="anon" players={["Ana", "Beto"]} max={3} onChange={() => {
          throw new Error("Una mesa llena no debe aceptar jugadores");
        }} idPrefix="external" />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Dani" } });

    rerender(
      <NextIntlClientProvider locale="es" messages={messages}>
        <SeatPicker identity="anon" players={["Ana", "Beto", "Cora"]} max={3} onChange={() => {
          throw new Error("Una mesa llena no debe aceptar jugadores");
        }} idPrefix="external" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("La mesa ya tiene 3 jugadores.");
    expect((screen.getByRole("button", { name: "Añadir" }) as HTMLButtonElement).disabled).toBe(true);
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByRole("status").id);
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getAllByRole("button", { name: /^Editar a / })).toHaveLength(3);
  });
});
