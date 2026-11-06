// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import messages from "../../../messages/es.json";

const planned = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@/lib/library/get-planned-items", () => ({ getPlannedItems: async () => planned.items }));
vi.mock("next-intl/server", () => ({ getTranslations: async (namespace: "homePanels") => createTranslator({ locale: "es", messages, namespace }) }));
// El provider real lee el locale de la petición; aquí solo importa el hijo.
vi.mock("@/components/route-messages", () => ({ RouteMessages: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { HomeDrawTile } from "./home-draw-tile";

afterEach(cleanup);

describe("HomeDrawTile", () => {
  it("es un botón que abre la partida en el sitio, con la cola contada", async () => {
    planned.items = [{}, {}, {}];
    render((await HomeDrawTile({ userId: "u1" }))!);
    const button = screen.getByRole("button", { name: /sacar un lomo/i });
    expect(button.getAttribute("href")).toBeNull();
    expect(button.textContent).toContain("3 pendientes");
  });

  it("no se pinta sin pendientes", async () => {
    planned.items = [];
    expect(await HomeDrawTile({ userId: "u1" })).toBeNull();
  });
});
