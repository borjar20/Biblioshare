// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/es.json";
import type { ProgressSession } from "@/lib/sessions/types";
import { SessionList } from "./session-list";

// Server action: fuera de Next no se puede importar tal cual.
vi.mock("@/lib/sessions/actions", () => ({ deleteSession: vi.fn() }));

afterEach(cleanup);

const session: ProgressSession = {
  id: "s1",
  sessionDate: "2026-08-14",
  createdAt: "2026-08-14T10:00:00Z",
  durationMinutes: 30,
  position: { page: 120 },
  hasPost: false,
};

function list(currentYear: number) {
  return (
    <NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={{ item: messages.item }}>
      <SessionList passId="p1" itemType="book" itemId="b1" sessions={[session]} currentYear={currentYear} />
    </NextIntlClientProvider>
  );
}

describe("SessionList — fecha de la sesión", () => {
  it("pinta la fecha absoluta, igual en servidor y cliente", () => {
    expect(renderToString(list(2026))).toMatch(/14 ago/);
    render(list(2026));
    expect(screen.getByText("14 ago")).toBeTruthy();
  });
  it("lleva el año si no es el actual", () => {
    render(list(2027));
    expect(screen.getByText("14 ago 2026")).toBeTruthy();
  });
  it("nunca escribe una fecha relativa", () => {
    expect(renderToString(list(2026))).not.toMatch(/hace /);
  });
});
