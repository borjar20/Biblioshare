// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wrapUps = vi.hoisted(() => ({ list: [] as unknown[], fail: false }));
vi.mock("@/lib/wrap-ups/get-own-wrap-ups", () => ({
  getOwnWrapUps: async () => {
    if (wrapUps.fail) throw new Error("boom");
    return wrapUps.list;
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, v?: { kind?: string }) => (v?.kind ? `${key}:${v.kind}` : key),
}));
vi.mock("./pixel-font", () => ({ pixelFont: { variable: "pixel" } }));

const month = { kind: "month", seenAt: null, payload: { kind: "month", periodStart: "2026-09-01", periodEnd: "2026-09-30", intensity: "quiet", narrator: "quiet", palette: "mixed" } };
const year = { kind: "year", seenAt: null, payload: { kind: "year", periodStart: "2026-01-01", periodEnd: "2026-09-25", intensity: "full", narrator: "festive", palette: "mixed" } };
const week = { kind: "week", seenAt: null, payload: { kind: "week", periodStart: "2026-09-28", periodEnd: "2026-10-04", intensity: "full", narrator: "reader", palette: "book" } };

afterEach(cleanup);
beforeEach(() => {
  wrapUps.list = [month, week];
  wrapUps.fail = false;
});

describe("WrapUpsRow", () => {
  it("lista los quiet también, con enlace a su ruta", async () => {
    const { WrapUpsRow } = await import("./wrap-ups-row");
    render((await WrapUpsRow())!);
    expect(screen.getByRole("link", { name: /Septiembre 2026/ }).getAttribute("href")).toBe("/wrap/month");
    expect(screen.getByRole("link", { name: /Semana del 28 sep/ }).getAttribute("href")).toBe("/wrap/week");
  });
  it("sin wrap-ups no pinta nada", async () => {
    wrapUps.list = [];
    const { WrapUpsRow } = await import("./wrap-ups-row");
    expect(await WrapUpsRow()).toBeNull();
  });
});

describe("HomeWrapUpCover", () => {
  it.each([
    ["ya vista", { ...week, seenAt: "2026-10-05T10:00:00Z" }],
    ["tranquila", month],
  ])("%s: conserva una acción explícita para abrir la crónica", async (_, wrap) => {
    wrapUps.list = [wrap];
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    render((await HomeWrapUpCover())!);
    expect(screen.getByRole("link", { name: /view/ }).getAttribute("href")).toBe(`/wrap/${wrap.kind}`);
    expect(screen.getByText("view")).toBeTruthy();
  });
  it("prefiere el full sin ver y lo marca como Nueva", async () => {
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    render((await HomeWrapUpCover())!);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/wrap/week");
    expect(link.getAttribute("data-unseen")).toBe("true");
  });
  it("ya visto: tarjeta al más reciente, sin marca Nueva", async () => {
    wrapUps.list = [month, { ...week, seenAt: "2026-10-05T10:00:00Z" }];
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    render((await HomeWrapUpCover())!);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/wrap/week");
    expect(link.getAttribute("data-unseen")).toBe("false");
  });
  it("un quiet sin ver no se marca como Nueva", async () => {
    wrapUps.list = [month];
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    render((await HomeWrapUpCover())!);
    expect(screen.getByRole("link").getAttribute("data-unseen")).toBe("false");
  });
  it("sin wrap-ups devuelve null", async () => {
    wrapUps.list = [];
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    expect(await HomeWrapUpCover()).toBeNull();
  });
  it("entre varios full sin ver gana el de periodEnd más reciente", async () => {
    wrapUps.list = [year, week];
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    render((await HomeWrapUpCover())!);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/wrap/week");
  });
  it("la tarjeta nueva incluye el periodo en su nombre accesible", async () => {
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    render((await HomeWrapUpCover())!);
    expect(screen.getByRole("link", { name: /Semana del 28 sep al 4 oct/ })).toBeTruthy();
  });
  it("la tarjeta ya vista incluye el periodo", async () => {
    wrapUps.list = [{ ...week, seenAt: "2026-10-05T10:00:00Z" }];
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    render((await HomeWrapUpCover())!);
    expect(screen.getByRole("link", { name: /Semana del 28 sep al 4 oct/ })).toBeTruthy();
  });
  it("si getOwnWrapUps falla, loguea una vez y devuelve null", async () => {
    wrapUps.fail = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { HomeWrapUpCover } = await import("./wrap-up-entry");
    expect(await HomeWrapUpCover()).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});

describe("WrapUpsRow (fallo)", () => {
  it("si getOwnWrapUps falla, loguea una vez y devuelve null", async () => {
    wrapUps.fail = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { WrapUpsRow } = await import("./wrap-ups-row");
    expect(await WrapUpsRow()).toBeNull();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
