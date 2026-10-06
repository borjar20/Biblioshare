// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { WrapUpFeedEvent } from "@/lib/social/feed";
import { RouteMessages } from "@/components/route-messages";
import { WRAP_UP_FEED_MESSAGES } from "./wrap-up-feed-messages";
import { WrapUpFeedCard } from "./wrap-up-feed-card";

vi.mock("./pixel-font", () => ({ pixelFont: { variable: "font-pixel" } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/social/post-actions", () => ({ deletePost: vi.fn() }));
vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));

afterEach(cleanup);
beforeEach(() => {
  // jsdom no implementa showModal.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute("open"); });
});

const SHARE_ID = "5b0f3a52-8f0e-4b1f-9a3e-1c2d3e4f5a6b";
const event = (over: Partial<WrapUpFeedEvent["summary"]> = {}): WrapUpFeedEvent => ({
  id: "posts:wp", postId: "wp", kind: "wrap_up", shareId: SHARE_ID,
  actorId: "a1", actorUsername: "ana", actorDisplayName: "Ana", actorAvatarUrl: null,
  eventDate: "2026-10-05T08:00:00Z", orderDate: "2026-10-05T08:00:00Z", sortDate: "2026-10-05T08:00:00Z",
  interactionTarget: { targetType: "post", targetId: "wp", interactionTargetId: "it-wp" },
  reactionCount: 2, viewerReacted: false, commentCount: 1, comments: [], reactions: {} as never, viewerCanDelete: false,
  summary: {
    kind: "week", periodStart: "2026-09-28", periodEnd: "2026-10-04", narrator: "reader", palette: "book",
    minutes: 372, episodesWithoutRuntime: 0, finished: 2,
    covers: [
      { type: "book", id: "b1", title: "La sombra del viento", coverUrl: "https://covers.example/b1.jpg", times: 1 },
      { type: "movie", id: "m1", title: "Perfect Days", coverUrl: null, times: 1 },
    ],
    pet: { name: "Bellota", petClass: "wizard", stage: "young" },
    ...over,
  },
});

// El provider de la ruta, con el MISMO subconjunto que mandan Inicio, perfil y /post/[id]:
// si la tarjeta pidiera una clave fuera de él, el traductor estricto revienta.
const withRouteMessages = (ui: ReactNode) => {
  const picked = RouteMessages({ ns: ["feed", "social", ...WRAP_UP_FEED_MESSAGES], children: null }).props.messages;
  return render(
    <NextIntlClientProvider locale="es" messages={picked} onError={(e) => { throw e; }}>{ui}</NextIntlClientProvider>,
  );
};

describe("WrapUpFeedCard", () => {
  it("pinta el cierre compacto: periodo, cifra, obras, portadas y autor en tercera persona", () => {
    withRouteMessages(<WrapUpFeedCard event={event()} viewerLoggedIn />);
    const card = screen.getByTestId("wrap-up-feed-card");
    expect(within(card).getByText("Su semana en Biblioshare")).toBeTruthy();
    expect(within(card).getByText("Semana del 28 sep al 4 oct")).toBeTruthy();
    expect(within(card).getByText("6,2")).toBeTruthy();
    expect(within(card).getByText("h")).toBeTruthy();
    expect(within(card).getByText("2 obras terminadas")).toBeTruthy();
    expect(within(card).getByRole("img", { name: "La sombra del viento" })).toBeTruthy();
    // Sin portada: carta pixel con el título.
    expect(within(card).getByText("Perfect Days")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Ana" }).getAttribute("href")).toBe("/u/ana");
    // Pie de interacción como el resto de posts.
    expect(card.querySelector('a[href="/post/wp"]')).not.toBeNull();
  });

  it("no enlaza a las stories", () => {
    withRouteMessages(<WrapUpFeedCard event={event()} viewerLoggedIn />);
    const hrefs = [...screen.getByTestId("wrap-up-feed-card").querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.some((h) => h?.startsWith("/wrap"))).toBe(false);
  });

  it("al pulsarla abre la imagen grande en un <dialog> y no la pide antes", () => {
    withRouteMessages(<WrapUpFeedCard event={event()} viewerLoggedIn />);
    const card = screen.getByTestId("wrap-up-feed-card");
    expect(card.querySelector(`img[src="/api/og/wrap-up/share/${SHARE_ID}"]`)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver la imagen de la crónica" }));
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    const dialog = card.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    const img = within(dialog).getByRole("img", { name: "Crónica de Ana: Semana del 28 sep al 4 oct" });
    expect(img.getAttribute("src")).toBe(`/api/og/wrap-up/share/${SHARE_ID}`);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("año: no se dirige a quien lee («Tu 2026»)", () => {
    withRouteMessages(<WrapUpFeedCard event={event({ kind: "year", periodStart: "2026-01-01", periodEnd: "2026-10-04" })} viewerLoggedIn />);
    expect(screen.getByText("Su año en Biblioshare")).toBeTruthy();
    expect(screen.getByText("2026 · hasta el 4 de octubre")).toBeTruthy();
    expect(screen.queryByText(/^Tu /)).toBeNull();
  });

  it("cero honesto: sin tiempo medido no hay cifra", () => {
    withRouteMessages(<WrapUpFeedCard event={event({ minutes: 0, finished: 0, covers: [], pet: null })} viewerLoggedIn />);
    expect(screen.getByText("Sin datos de tiempo en este periodo")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("detalle (/post/[id]): la imagen grande en la tarjeta, sin diálogo", () => {
    withRouteMessages(<WrapUpFeedCard event={event()} viewerLoggedIn showInteractions={false} variant="detail" />);
    const card = screen.getByTestId("wrap-up-feed-card");
    expect(card.querySelector(`img[src="/api/og/wrap-up/share/${SHARE_ID}"]`)).not.toBeNull();
    expect(card.querySelector("dialog")).toBeNull();
    expect(card.querySelector('a[href="/post/wp"]')).toBeNull();
  });

  it("el dueño o moderación ven el menú de borrar", () => {
    const own = { ...event(), viewerCanDelete: true };
    const { unmount } = withRouteMessages(<WrapUpFeedCard event={event()} viewerLoggedIn />);
    expect(screen.queryByRole("button", { name: "Opciones" })).toBeNull();
    unmount();
    withRouteMessages(<WrapUpFeedCard event={own} viewerLoggedIn />);
    expect(screen.getByRole("button", { name: "Opciones" })).toBeTruthy();
  });
});

describe("RouteMessages con subárboles", () => {
  it("manda solo los subárboles pedidos, sin el namespace wrapUps entero", () => {
    const picked = RouteMessages({ ns: [...WRAP_UP_FEED_MESSAGES], children: null }).props.messages as Record<string, Record<string, unknown>>;
    expect(Object.keys(picked.wrapUps).sort()).toEqual(["feed", "stories"]);
    expect(Object.keys(picked.wrapUps.stories as object).sort()).toEqual(["closing", "time"]);
    expect(picked.wrapUps.feed).toBe(messages.wrapUps.feed);
  });
  it("si también se pide el namespace completo, gana el completo", () => {
    const picked = RouteMessages({ ns: ["wrapUps", ...WRAP_UP_FEED_MESSAGES], children: null }).props.messages as Record<string, unknown>;
    expect(picked.wrapUps).toBe(messages.wrapUps);
  });
});
