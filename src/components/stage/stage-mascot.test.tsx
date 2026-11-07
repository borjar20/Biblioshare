// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageMascot } from "./stage-mascot";
import { PET_CLASSES } from "@/lib/pet/classes";

vi.mock("@/components/pet/pet-sprite", () => ({ PetSprite: () => <span data-testid="sprite" /> }));
afterEach(cleanup);

describe("StageMascot", () => {
  it("el bocadillo (role=status) es el mismo nodo con narrador y con mascota", () => {
    const speech = { text: "Hola", mood: "idle" } as const;
    const { rerender } = render(<StageMascot pet={null} speech={speech} entered={false} />);
    const before = screen.getByRole("status");
    expect(before.className).toMatch(/narrated/);
    rerender(<StageMascot pet={{ name: "Bellota", petClass: PET_CLASSES[0], stage: "young" }} speech={speech} entered />);
    const after = screen.getByRole("status");
    expect(after).toBe(before);
    expect(after.className).not.toMatch(/narrated/);
    expect(screen.getByTestId("sprite")).toBeTruthy();
  });
  it("la bellota también sale (no cae al narrador); sin mascota, narrador", () => {
    const speech = { text: "Hola", mood: "idle" } as const;
    const { rerender } = render(<StageMascot pet={{ name: "Nuez", petClass: PET_CLASSES[0], stage: "acorn" }} speech={speech} entered />);
    expect(screen.getByTestId("sprite")).toBeTruthy();
    expect(screen.getByRole("status").className).not.toMatch(/narrated/);
    rerender(<StageMascot pet={null} speech={speech} entered />);
    expect(screen.queryByTestId("sprite")).toBeNull();
    expect(screen.getByRole("status").className).toMatch(/narrated/);
  });
  it("size sm aplica la escala pequeña", () => {
    const { container } = render(<StageMascot pet={null} speech={null} entered size="sm" />);
    expect(container.firstElementChild!.className).toMatch(/sm/);
  });
});
