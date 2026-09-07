// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import { ClubBurrowError } from "./club-burrow-error";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("permite reintentar la lectura sin confundir el fallo con vacío", () => {
  render(<NextIntlClientProvider locale="es" messages={messages}><ClubBurrowError /></NextIntlClientProvider>);
  expect(screen.getByRole("status").textContent).toContain("No hemos podido cargar la madriguera");
  expect(screen.queryByText(/Todavía no hay mascotas/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(refresh).toHaveBeenCalledOnce();
});
