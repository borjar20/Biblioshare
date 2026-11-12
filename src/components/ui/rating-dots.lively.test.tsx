// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RatingDots } from "./rating-dots";

afterEach(cleanup);

/** Los cinco puntos, en orden: cada uno es el padre de sus dos mitades pulsables. */
const dots = () => [1, 3, 5, 7, 9].map((v) => screen.getByLabelText(`${v}/10`).parentElement!);

describe("RatingDots con lively", () => {
  it("levanta los puntos hasta el que está bajo el cursor", () => {
    render(<RatingDots value={null} onChange={() => {}} lively />);
    fireEvent.mouseEnter(screen.getByLabelText("5/10"));
    expect(dots().map((d) => d.hasAttribute("data-lift"))).toEqual([true, true, true, false, false]);
  });
  it("al fijar una nota saltan solo los puntos rellenos", () => {
    const onChange = vi.fn();
    render(<RatingDots value={null} onChange={onChange} lively />);
    fireEvent.click(screen.getByLabelText("8/10"));
    expect(onChange).toHaveBeenCalledWith(8);
    expect(dots().map((d) => d.getAttribute("data-pop"))).toEqual(["a", "a", "a", "a", null]);
  });
  it("una segunda nota relanza el salto sin remontar los botones", () => {
    render(<RatingDots value={null} onChange={() => {}} lively />);
    const half = screen.getByLabelText("3/10");
    fireEvent.click(screen.getByLabelText("8/10"));
    fireEvent.click(half);
    expect(dots().map((d) => d.getAttribute("data-pop"))).toEqual(["b", "b", null, null, null]);
    expect(screen.getByLabelText("3/10")).toBe(half);
  });
  it("no salta al montar con una nota ya puesta", () => {
    render(<RatingDots value={8} onChange={() => {}} lively />);
    expect(dots().some((d) => d.hasAttribute("data-pop"))).toBe(false);
  });
});

describe("RatingDots sin lively", () => {
  it("no añade marcas de gesto, ni interactivo ni de lectura", () => {
    render(<RatingDots value={null} onChange={() => {}} />);
    fireEvent.mouseEnter(screen.getByLabelText("5/10"));
    fireEvent.click(screen.getByLabelText("8/10"));
    expect(dots().some((d) => d.hasAttribute("data-lift") || d.hasAttribute("data-pop"))).toBe(false);
    expect(renderToStaticMarkup(<RatingDots value={7} lively />)).not.toMatch(/data-(lift|pop)/);
  });
});
