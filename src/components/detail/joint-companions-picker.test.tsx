// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { JointCompanionsPicker } from "./joint-companions-picker";

afterEach(cleanup);

const people = [
  { userId: "u1", username: "ana", displayName: "Ana", avatarUrl: null },
  { userId: "u2", username: "luis", displayName: null, avatarUrl: null },
];

function renderPicker(props: Partial<Parameters<typeof JointCompanionsPicker>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <JointCompanionsPicker people={people} selected={new Set(["u1"])} onToggle={onToggle} {...props} />
    </NextIntlClientProvider>,
  );
  return onToggle;
}

describe("JointCompanionsPicker (#1220)", () => {
  it("una ficha por seguido mutuo, marcada según la selección", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /Ana/ }).getAttribute("aria-pressed")).toBe("true");
    // Sin nombre visible cae al username.
    expect(screen.getByRole("button", { name: /luis/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("tocar una ficha avisa con su id", () => {
    const onToggle = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /luis/ }));
    expect(onToggle).toHaveBeenCalledWith("u2");
  });

  it("sin seguidos mutuos lo explica en vez de pintar una lista vacía", () => {
    renderPicker({ people: [] });
    expect(screen.getByText("No tienes seguidos mutuos a los que etiquetar.")).toBeTruthy();
  });

  it("mientras carga no ofrece fichas", () => {
    renderPicker({ loading: true });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Cargando…")).toBeTruthy();
  });
});
