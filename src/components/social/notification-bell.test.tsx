// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notification } from "@/lib/social/notification-types";

// Acciones de servidor y permisos push son fronteras externas; el componente
// real conserva la apertura, el cierre y la devolución de foco.
vi.mock("@/lib/social/notification-actions", () => ({
  fetchNotifications: vi.fn(async (): Promise<Notification[]> => []),
  markAllNotificationsRead: vi.fn(async () => undefined),
}));
vi.mock("@/components/push/push-toggle", () => ({ PushToggle: () => null }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { NotificationBell } from "./notification-bell";
import { fetchNotifications } from "@/lib/social/notification-actions";

afterEach(cleanup);

describe("panel de notificaciones", () => {
  it("anuncia el panel abierto y Escape devuelve el foco a la campana", async () => {
    render(<NotificationBell initialUnreadCount={0} />);
    const bell = screen.getByRole("button", { name: "title" });
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(bell);
    await screen.findByText("empty");
    const panel = screen.getByRole("region", { name: "title" });
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(bell.getAttribute("aria-controls")).toBe(panel.id);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(bell);
  });

  it("cierra al tocar fuera del panel", async () => {
    render(<NotificationBell initialUnreadCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: "title" }));
    await screen.findByText("empty");
    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("empty")).toBeNull();
  });

  it("cierra cuando el teclado lleva el foco a otro control de la cabecera", async () => {
    render(<><NotificationBell initialUnreadCount={0} /><button>Más</button></>);
    const bell = screen.getByRole("button", { name: "title" });
    bell.focus();
    fireEvent.click(bell);
    await screen.findByText("empty");
    screen.getByRole("button", { name: "Más" }).focus();
    await waitFor(() => expect(screen.queryByText("empty")).toBeNull());
  });

  it("permite tocar y enfocar un aviso sin cerrarlo y Escape devuelve el foco", async () => {
    vi.mocked(fetchNotifications).mockResolvedValueOnce([{
      id: "notification-inside",
      type: "new_follower",
      actorId: "actor-inside",
      actorUsername: "lector",
      actorDisplayName: "Lector",
      actorAvatarUrl: null,
      href: "/perfil/lector",
      readAt: null,
      createdAt: "2026-10-04T00:00:00.000Z",
    }]);
    render(<NotificationBell initialUnreadCount={0} />);
    const bell = screen.getByRole("button", { name: "title" });
    fireEvent.click(bell);
    const notification = await screen.findByRole("link");
    expect(notification.getAttribute("href")).toBe("/perfil/lector");

    fireEvent.pointerDown(notification);
    expect(screen.getByRole("region", { name: "title" })).toBeDefined();
    notification.focus();
    expect(document.activeElement).toBe(notification);
    expect(screen.getByRole("region", { name: "title" })).toBeDefined();
    fireEvent.keyDown(notification, { key: "Tab" });
    expect(screen.getByRole("region", { name: "title" })).toBeDefined();

    fireEvent.keyDown(notification, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(document.activeElement).toBe(bell);
  });
});
