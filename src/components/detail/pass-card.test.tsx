// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { MediaStatus } from "@/lib/library/types";
import { ItemStatusProvider } from "./item-status-context";
import { PassCard, type PassCardProps } from "./pass-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/serie/s1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/library/add-existing-item", () => ({ addExistingItemToLibrary: vi.fn() }));

afterEach(cleanup);

const base: PassCardProps = {
  itemType: "series",
  itemId: "s1",
  isLoggedIn: true,
  labels: { planned: "Pendiente", in_progress: "Viendo", completed: "Vista", dropped: "Abandonada" },
  progress: { percent: 41, left: "16 / 39 vistos", right: "41%" },
  rating: 8,
  ctaHref: "/serie/s1?tab=episodes",
  ctaLabel: "Marcar episodio",
  ratingLabel: "Tu nota",
  goToLogLabel: "Ver y cambiar en Mi registro",
};

function renderCard(props: Partial<PassCardProps>, status: MediaStatus | null) {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <ItemStatusProvider initialStatus={status}>
        <PassCard {...base} {...props} />
      </ItemStatusProvider>
    </NextIntlClientProvider>,
  );
}

describe("PassCard", () => {
  it("sin pase: un único botón «Seguir» y nada más", () => {
    renderCard({}, null);
    expect(screen.getByRole("button", { name: "Seguir" })).toBeTruthy();
    expect(screen.queryByTestId("status-badge")).toBeNull();
    expect(screen.queryByRole("link", { name: /Marcar episodio/ })).toBeNull();
  });

  it("con pase: estado enlazado a Mi registro, progreso, CTA y nota", () => {
    renderCard({}, "in_progress");
    const badge = screen.getByTestId("status-badge");
    expect(badge.textContent).toContain("Viendo");
    expect(badge.getAttribute("href")).toBe("/serie/s1?tab=log");
    expect(screen.getByText("16 / 39 vistos")).toBeTruthy();
    expect(
      screen.getByRole("progressbar", { name: "16 / 39 vistos" }),
    ).toBeTruthy();
    const cta = screen.getByRole("link", { name: /Marcar episodio/ });
    expect(cta.getAttribute("href")).toBe("/serie/s1?tab=episodes");
    expect(screen.getByText("Tu nota")).toBeTruthy();
  });

  it("la película no pinta barra de progreso", () => {
    renderCard({ itemType: "movie", progress: null, ctaHref: "/pelicula/m1?tab=log", ctaLabel: "Registrar visionado" }, "completed");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("link", { name: /Registrar visionado/ })).toBeTruthy();
  });

  it("con pase pero sin CTA (el tipo no ofrece acción), no hay enlace de acción", () => {
    renderCard({ ctaHref: null }, "planned");
    expect(screen.getByTestId("status-badge")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Marcar episodio/ })).toBeNull();
  });
});
