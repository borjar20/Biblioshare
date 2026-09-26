// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { PendingJointInvite } from "@/lib/social/joint-viewings";
import { PendingJointInvites } from "./pending-joint-invites";

const respond = vi.fn<(viewingId: string, accept: boolean, choice: string) => Promise<{ ok: true; viewingId: string }>>(
  async (viewingId) => ({ ok: true, viewingId }),
);
vi.mock("@/lib/social/joint-viewing-actions", () => ({
  respondJointViewing: (...args: [string, boolean, string]) => respond(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  respond.mockClear();
});

const base: PendingJointInvite = {
  viewingId: "jv-1",
  itemType: "movie",
  itemId: "m1",
  itemTitle: "Dune",
  itemCoverUrl: null,
  watchedOn: "2026-09-25",
  inviter: { userId: "u1", username: "ana", displayName: "Ana", avatarUrl: null },
  quickChoice: "new",
};

function renderInvites(invites: PendingJointInvite[], variant: "home" | "item" = "home") {
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <PendingJointInvites invites={invites} variant={variant} />
    </NextIntlClientProvider>,
  );
}

describe("PendingJointInvites (#1224)", () => {
  it("en Inicio dice quién te etiquetó y en qué obra", () => {
    renderInvites([base]);
    expect(screen.getByText("Te han etiquetado")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dune" }).getAttribute("href")).toBe("/pelicula/m1");
    expect(screen.getByText(/Ana dice que visteis/)).toBeTruthy();
  });

  it("aceptar sin nada que elegir contesta aquí mismo con la opción precalculada", async () => {
    renderInvites([{ ...base, quickChoice: "pass-7" }]);
    fireEvent.click(screen.getByRole("button", { name: "Sí, estaba" }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("jv-1", true, "pass-7"));
    await waitFor(() => expect(screen.queryByText("Te han etiquetado")).toBeNull());
  });

  it("«No fui yo» rechaza", async () => {
    renderInvites([base]);
    fireEvent.click(screen.getByRole("button", { name: "No fui yo" }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("jv-1", false, "new"));
  });

  it("si hay que elegir cuál de tus visionados es, lleva a /juntos en vez de aceptar a ciegas", () => {
    renderInvites([{ ...base, quickChoice: null }]);
    expect(screen.queryByRole("button", { name: "Sí, estaba" })).toBeNull();
    expect(screen.getByRole("link", { name: "Confirmar" }).getAttribute("href")).toBe("/juntos/jv-1");
  });

  it("sin invitaciones no pinta nada", () => {
    const { container } = renderInvites([]);
    expect(container.textContent).toBe("");
  });

  it("en la ficha no repite la obra: solo quién y el verbo", () => {
    renderInvites([base], "item");
    expect(screen.queryByText("Te han etiquetado")).toBeNull();
    expect(screen.getByText("Ana dice que la visteis juntos")).toBeTruthy();
  });
});
