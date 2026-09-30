// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/play/core/use-active-game", () => ({
  useActiveGame: () => ({
    snapshot: { status: "ready", game: null },
    store: { discard: vi.fn(), start: vi.fn() },
  }),
}));
vi.mock("@/lib/play/core/use-players", () => ({
  usePlayers: () => ({ players: [], loaded: true }),
}));
vi.mock("./use-remembered-table", () => ({ useRememberedTable: () => undefined }));
vi.mock("./regular-picker", () => ({ RegularPicker: () => null }));
vi.mock("./ui/hold-repeat-button", () => ({ HoldRepeatButton: () => null }));
vi.mock("./ui/seat-token", () => ({
  SeatToken: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  initials: (name: string) => name.slice(0, 1),
}));
vi.mock("./ui/seat-row", () => ({
  SeatRow: ({ seats, onSeatTap }: { seats: { id: string; caption: string }[]; onSeatTap: (id: string) => void }) => (
    <button type="button" onClick={() => onSeatTap(seats[0].id)}>
      {seats[0].caption}
    </button>
  ),
}));

import { SetupForm } from "./setup-form";

afterEach(cleanup);

describe("SetupForm", () => {
  it("nombra cada fondo de tarjeta por su color", () => {
    render(
      <NextIntlClientProvider locale="es" messages={messages}>
        <SetupForm identity="anon" />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Jugador 1" }));

    const labels = [
      "Fondo teja",
      "Fondo azul verdoso",
      "Fondo verde oliva",
      "Fondo ciruela",
      "Fondo ocre",
      "Fondo índigo",
    ];
    expect(labels.map((name) => screen.getByRole("button", { name }))).toHaveLength(6);
  });
});
