import { isValidElement, Suspense, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LibraryCornerPage from "./page";

const mocks = vi.hoisted(() => ({ user: { id: "session-owner" } as { id: string } | null, redirect: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { mocks.redirect(href); throw new Error("redirect"); } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/app/u/[username]/_tabs/rincon-tab", () => ({ RinconTab: () => null }));

function content(params: Record<string, string> = {}) {
  const shell = LibraryCornerPage({ searchParams: Promise.resolve(params) });
  expect(shell.type).toBe(Suspense);
  const island = shell.props.children as ReactElement<Record<string, unknown>>;
  return (island.type as (props: typeof island.props) => Promise<ReactElement>)(island.props);
}
function find(root: unknown, name: string): ReactElement<Record<string, unknown>> | undefined {
  if (!isValidElement<{ children?: unknown }>(root)) return undefined;
  if (typeof root.type === "function" && root.type.name === name) return root as ReactElement<Record<string, unknown>>;
  const children = Array.isArray(root.props.children) ? root.props.children : [root.props.children];
  return children.map((child) => find(child, name)).find(Boolean);
}
beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: "session-owner" }; });

describe("Rincón privado de Biblioteca", () => {
  it("usa la sesión bajo Suspense aunque la URL intente elegir otro usuario", async () => {
    const page = await content({ userId: "another-person", username: "another-person", archivados: "1" });
    expect(find(page, "RinconTab")?.props).toMatchObject({ userId: "session-owner", includeArchived: true, basePath: "/coleccion/rincon" });
    expect(find(page, "PageHeader")?.props.backHref).toBe("/coleccion");
  });
  it("no abre las herramientas sin sesión y permite volver tras login", async () => {
    mocks.user = null;
    await expect(content()).rejects.toThrow("redirect");
    const destination = new URL(mocks.redirect.mock.calls[0][0], "https://biblioshare.example");
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("next")).toBe("/coleccion/rincon");
  });
  it("el valor de archivados es explícito, sin convertir valores arbitrarios en true", async () => {
    expect(find(await content({ archivados: "true" }), "RinconTab")?.props.includeArchived).toBe(false);
  });
});
