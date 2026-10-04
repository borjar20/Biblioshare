// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExperienceReviewRating, experienceReviewRating } from "./experience-review-rating";

describe("ExperienceReviewRating", () => {
  it("lee la nota solo si es un entero 1-10", () => {
    expect(experienceReviewRating({ rating: 9 })).toBe(9);
    expect(experienceReviewRating({ rating: 0 })).toBeNull();
    expect(experienceReviewRating({ rating: 11 })).toBeNull();
    expect(experienceReviewRating({ rating: "9" })).toBeNull();
    expect(experienceReviewRating({ rating: null })).toBeNull();
    expect(experienceReviewRating(undefined)).toBeNull();
  });
  it("pinta dots de solo lectura y la nota", () => {
    render(<ExperienceReviewRating snapshot={{ rating: 7, body: "x" }} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("3,5 de 5");
    expect(screen.getByText("7/10")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("sin nota no pinta nada", () => {
    const { container } = render(<ExperienceReviewRating snapshot={{ rating: null, body: "solo texto" }} />);
    expect(container.innerHTML).toBe("");
  });
});
