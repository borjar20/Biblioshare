// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import messages from "../../../messages/es.json";

const planned = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock("@/lib/library/get-planned-items", () => ({ getPlannedItems: async () => planned.items }));
vi.mock("next-intl/server", () => ({ getTranslations: async (namespace: "homePanels") => createTranslator({ locale: "es", messages, namespace }) }));

import { HomeDrawTile } from "./home-draw-tile";

afterEach(cleanup);

describe("HomeDrawTile", () => {
  it("lleva al Sorteo con la cola contada", async () => {
    planned.items = [{}, {}, {}];
    render((await HomeDrawTile({ userId: "u1" }))!);
    const link = screen.getByRole("link", { name: /sacar un lomo/i });
    expect(link.getAttribute("href")).toBe("/coleccion/rincon?sorteo=1");
    expect(link.textContent).toContain("3 pendientes");
  });

  it("no se pinta sin pendientes", async () => {
    planned.items = [];
    expect(await HomeDrawTile({ userId: "u1" })).toBeNull();
  });
});
