// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/lib/pet/actions", () => ({ hatchPet: vi.fn() }));

import { HatchForm } from "./hatch-form";

afterEach(cleanup);
const sprite = () => screen.getByRole("img", { name: "stages.acorn" });

describe("HatchForm", () => {
  it("bellota en idle sin nombre aunque haya clase sugerida", () => {
    render(<HatchForm suggested="wizard" />);
    expect(sprite().getAttribute("data-anim")).toBe("idle");
  });

  it("bellota lista con nombre válido y clase", () => {
    render(<HatchForm suggested="wizard" />);
    fireEvent.change(screen.getByPlaceholderText("hatch.namePlaceholder"), { target: { value: "  Nuez " } });
    expect(sprite().getAttribute("data-anim")).toBe("ready");
  });

  it("sin clase elegida no está lista", () => {
    render(<HatchForm suggested={null} />);
    fireEvent.change(screen.getByPlaceholderText("hatch.namePlaceholder"), { target: { value: "Nuez" } });
    expect(sprite().getAttribute("data-anim")).toBe("idle");
  });
});
