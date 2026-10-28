// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FriendOnSaga } from "@/lib/sagas/friends";
import { FriendsOnSaga } from "./friends-on-saga";

const fmt = (k: string, v?: Record<string, unknown>) => (v ? `${k}:${Object.values(v).join("/")}` : k);
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign(fmt, { rich: (k: string, v?: Record<string, unknown>) => `${k}:${String(v?.title ?? "")}` }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));
afterEach(cleanup);

const friend = (n: number, over: Partial<FriendOnSaga> = {}): FriendOnSaga => ({
  userId: `u${n}`,
  username: `user${n}`,
  displayName: `Amigo ${n}`,
  avatarUrl: null,
  completed: 1,
  counted: 4,
  status: { kind: "started" },
  average: null,
  lastActivity: "2026-10-01",
  ...over,
});
const run = async (list: FriendOnSaga[]) => render(await FriendsOnSaga({ friends: Promise.resolve(list) }));

describe("FriendsOnSaga", () => {
  it("sin amigos no pinta nada", async () => {
    expect(await FriendsOnSaga({ friends: Promise.resolve([]) })).toBeNull();
  });
  it("enlaza cada nombre a su perfil", async () => {
    await run([friend(1), friend(2, { displayName: null })]);
    expect(screen.getByRole("link", { name: "Amigo 1" }).getAttribute("href")).toBe("/u/user1");
    expect(screen.getByRole("link", { name: "user2" }).getAttribute("href")).toBe("/u/user2");
  });
  it("pinta los cuatro estados", async () => {
    await run([
      friend(1, { status: { kind: "reading", title: "Dune", href: "/libro/a" } }),
      friend(2, { status: { kind: "finished" } }),
      friend(3, { status: { kind: "last", title: "Mesías", href: "/libro/b" } }),
      friend(4, { status: { kind: "started" } }),
    ]);
    expect(screen.getByRole("link", { name: "friendsReading:Dune" }).getAttribute("href")).toBe("/libro/a");
    expect(screen.getByText("friendsFinished")).toBeTruthy();
    expect(screen.getByRole("link", { name: "friendsLast:Mesías" }).getAttribute("href")).toBe("/libro/b");
    expect(screen.getByText("friendsStarted")).toBeTruthy();
  });
  it("dropped sale como texto atenuado", async () => {
    await run([friend(1, { status: { kind: "dropped" } })]);
    expect(screen.getByText("friendsDropped").className).toContain("text-muted-foreground");
  });
  it("sin avatar salen las iniciales", async () => {
    await run([friend(1, { displayName: "Ana Pérez" })]);
    expect(screen.getByText("AP")).toBeTruthy();
  });
  it("la media solo aparece si existe", async () => {
    await run([friend(1)]);
    expect(screen.queryByLabelText(/ de 5$/)).toBeNull();
    cleanup();
    await run([friend(1, { average: 8 })]);
    expect(screen.getByLabelText("4 de 5")).toBeTruthy();
  });
  it("la barra de progreso lleva aria-label con completadas y contadas", async () => {
    await run([friend(1, { completed: 2, counted: 5 })]);
    expect(screen.getByLabelText("friendsProgress:2/5")).toBeTruthy();
  });
  it("con 6 amigos se ven 4 filas y «y 2 más»", async () => {
    await run([1, 2, 3, 4, 5, 6].map((n) => friend(n)));
    expect(document.querySelectorAll("li").length).toBe(4);
    expect(screen.getByText("friendsMore:2")).toBeTruthy();
  });
});
