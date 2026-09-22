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

// Una sesión de hace unos días: su fecha relativa («hace N días») depende del
// reloj, la absoluta no.
const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
const session: ProgressSession = {
  id: "s1",
  sessionDate: threeDaysAgo,
  createdAt: `${threeDaysAgo}T10:00:00Z`,
  durationMinutes: 30,
  position: { page: 120 },
  hasPost: false,
};

function list() {
  return (
    <NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={{ item: messages.item }}>
      <SessionList passId="p1" itemType="book" itemId="b1" sessions={[session]} />
    </NextIntlClientProvider>
  );
}

describe("SessionList — fecha de la sesión (#475)", () => {
  it("en el servidor pinta la fecha ABSOLUTA: no depende del reloj ni del shell estático", () => {
    const html = renderToString(list());
    expect(html).not.toMatch(/hace \d+ días/);
    // La absoluta lleva el año; la relativa, no.
    expect(html).toMatch(new RegExp(threeDaysAgo.slice(0, 4)));
  });

  it("en el cliente pinta la fecha RELATIVA con el reloj del cliente", () => {
    render(list());
    // «hace 3 días» o «hace 4 días» según la hora: la fecha sin hora se lee
    // como medianoche UTC. Lo que se prueba es que sea relativa, no el número.
    expect(screen.getByText(/^hace \d+ días$/)).toBeTruthy();
  });
});
