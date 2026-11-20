// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { StatusSegments } from "./status-segments";

afterEach(cleanup);

function Harness({
  itemType,
  initial,
  onChange,
  disabled,
}: {
  itemType: ItemType;
  initial: MediaStatus;
  onChange?: (s: MediaStatus) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState(initial);
  return (
    <NextIntlClientProvider locale="es" messages={messages}>
      <StatusSegments
        status={status}
        itemType={itemType}
        disabled={disabled}
        onChange={(next) => {
          onChange?.(next);
          setStatus(next);
        }}
      />
    </NextIntlClientProvider>
  );
}
const group = () => screen.getByRole("group");
const beating = () => group().querySelectorAll("[data-beat]").length;

describe("pastilla deslizante", () => {
  it("libro en curso: cuatro opciones, pastilla en la segunda", () => {
    render(<Harness itemType="book" initial="in_progress" />);
    expect(group().dataset.count).toBe("4");
    expect(group().dataset.activeIndex).toBe("1");
    expect(screen.getByTestId("status-thumb").getAttribute("aria-hidden")).toBe("true");
  });
  it("película vista: tres opciones, pastilla en la segunda", () => {
    render(<Harness itemType="movie" initial="completed" />);
    expect(group().dataset.count).toBe("3");
    expect(group().dataset.activeIndex).toBe("1");
  });
  it("película con «en curso» heredado: cuarta opción al final, con la pastilla", () => {
    render(<Harness itemType="movie" initial="in_progress" />);
    expect(group().dataset.count).toBe("4");
    expect(group().dataset.activeIndex).toBe("3");
  });
  it("conserva el grupo de botones con aria-pressed", () => {
    render(<Harness itemType="book" initial="planned" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"]);
  });
});

describe("estado deshabilitado", () => {
  it("la pastilla se atenúa con el control deshabilitado", () => {
    const { rerender } = render(<Harness itemType="book" initial="planned" />);
    expect(screen.getByTestId("status-thumb").hasAttribute("data-disabled")).toBe(false);
    rerender(<Harness itemType="book" initial="planned" disabled />);
    expect(screen.getByTestId("status-thumb").hasAttribute("data-disabled")).toBe(true);
  });
});

describe("latido del punto", () => {
  it("no late al montar", () => {
    render(<Harness itemType="book" initial="in_progress" />);
    expect(beating()).toBe(0);
  });
  it("late el punto de la opción que el usuario acaba de elegir, y la pastilla la sigue", () => {
    const onChange = vi.fn();
    render(<Harness itemType="book" initial="planned" onChange={onChange} />);
    const target = screen.getAllByRole("button")[2];
    fireEvent.click(target);
    expect(onChange).toHaveBeenCalledWith("completed");
    expect(group().dataset.activeIndex).toBe("2");
    expect(beating()).toBe(1);
    expect(target.querySelector("[data-beat]")).not.toBeNull();
  });
  it("un cambio de estado que llega de fuera no late", () => {
    const ui = (status: MediaStatus) => (
      <NextIntlClientProvider locale="es" messages={messages}>
        <StatusSegments status={status} itemType="book" onChange={() => {}} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui("planned"));
    rerender(ui("completed"));
    expect(beating()).toBe(0);
    expect(group().dataset.activeIndex).toBe("2");
  });
  it("pulsar la opción ya activa ni avisa ni late", () => {
    const onChange = vi.fn();
    render(<Harness itemType="book" initial="planned" onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onChange).not.toHaveBeenCalled();
    expect(beating()).toBe(0);
  });
});
