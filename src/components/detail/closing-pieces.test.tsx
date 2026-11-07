// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { InkDateStamp } from "./ink-date-stamp";
import { WaxSeal } from "./wax-seal";
import { ClosingObject } from "./closing-object";
afterEach(cleanup);
const wrap = (n: React.ReactNode) => <NextIntlClientProvider locale="es" messages={messages}>{n}</NextIntlClientProvider>;

describe("InkDateStamp", () => {
  it("es un input de fecha con su nombre y muestra la fecha sellada", () => {
    render(wrap(<InkDateStamp name="finishedOn" defaultValue="2026-11-07" max="2026-11-07" label="Fecha de fin" />));
    const input = screen.getByLabelText("Fecha de fin") as HTMLInputElement;
    expect(input.name).toBe("finishedOn");
    expect(input.type).toBe("date");
    fireEvent.change(input, { target: { value: "2026-10-01" } });
    expect(screen.getByText(/1 oct 2026/i)).toBeTruthy();
  });
});

describe("WaxSeal", () => {
  it("usa RatingDots (botones N/10), graba la nota y la lleva en name=rating", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(wrap(<WaxSeal value={null} onChange={onChange} itemType="book" />));
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    expect(onChange).toHaveBeenCalledWith(8);
    rerender(wrap(<WaxSeal value={8} onChange={onChange} itemType="book" />));
    expect(container.querySelectorAll('input[name="rating"]')).toHaveLength(1);
    expect((container.querySelector('input[name="rating"]') as HTMLInputElement).value).toBe("8");
    expect(screen.getByText("8")).toBeTruthy();
  });
});

describe("ClosingObject", () => {
  it.each([["book", "lastPage"], ["movie", "ticket"], ["series", "disc"]] as const)("%s usa su objeto", (itemType, cls) => {
    const { container } = render(wrap(<ClosingObject itemType={itemType} variant="completed" closing={false} stamp={<i />}><textarea /></ClosingObject>));
    expect(container.firstElementChild!.className).toMatch(new RegExp(cls));
  });
  it("abandonar: marcapáginas dentro y sin lacre", () => {
    const { container } = render(wrap(<ClosingObject itemType="book" variant="dropped" closing={false} stamp={<i />} seal={<b data-seal />}><textarea /></ClosingObject>));
    expect(container.querySelector("[data-bookmark]")).toBeTruthy();
    expect(container.querySelector("[data-seal]")).toBeNull();
  });
  it("closing añade la clase de cierre", () => {
    const { container } = render(wrap(<ClosingObject itemType="movie" variant="completed" closing stamp={<i />}><textarea /></ClosingObject>));
    expect(container.firstElementChild!.className).toMatch(/closing/);
  });
});
