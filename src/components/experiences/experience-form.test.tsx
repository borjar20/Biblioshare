// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { ExperienceDetail, MomentKind } from "@/lib/experiences/types";
import { ExperienceForm } from "./experience-form";

const h = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, refresh: h.refresh }) }));
vi.mock("@/lib/experiences/actions", () => ({ createExperience: h.create, updateExperience: h.update }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({ ok: true, data: { id: "new-memory" } });
  h.update.mockResolvedValue({ ok: true, data: {} });
});

const experience: ExperienceDetail = {
  id: "memory", creatorId: "owner", viewerId: "owner", title: "Madrid con Ana", revision: 7,
  shape: "trip", state: "lived", audience: "participants", startsOn: "2026-10-03", endsOn: "2026-10-04",
  coverPhotoId: null, createdAt: "2026-10-03T12:00:00Z", canEdit: true, canContribute: true,
  moments: [{ id: "moment", title: "Museo", kind: "museum", placeLabel: null, startsOn: null, endsOn: null, position: 0 }],
  participants: [], attendance: [], favorites: [], photos: [], publicationId: null, interactionTargetId: null, rating: null, momentRatings: {}, reviews: [],
};

function show(value?: ExperienceDetail, initialKind?: MomentKind) {
  return render(<NextIntlClientProvider locale="es" messages={messages}><ExperienceForm experience={value} {...{initialKind}}/></NextIntlClientProvider>);
}

describe("captura breve de experiencias", () => {
  it("arranca con la actividad elegida desde el álbum", async () => {
    show(undefined, "museum");
    expect((screen.getByRole("radio", { name: "Museo" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Museo con Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar experiencia" }));
    await waitFor(() => expect(h.create).toHaveBeenCalled());
    expect(h.create.mock.calls[0][0].kind).toBe("museum");
  });

  it("permite elegir actividad y guardar sin abrir los detalles opcionales", async () => {
    const { container } = show();
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByRole("radio", { name: "Concierto" }));
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Nuestra noche" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar experiencia" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/experiencia/new-memory"));
    expect(h.create).toHaveBeenCalledWith({ title: "Nuestra noche", state: "planned", kind: "concert", placeLabel: null, startsOn: null, endsOn: null });
  });

  it("Vivida cambia el recuerdo sin inventar asistencia ni permisos", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Un paseo" } });
    fireEvent.click(screen.getByRole("radio", { name: "Paseo" }));
    fireEvent.click(screen.getByRole("radio", { name: "Vivida" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar experiencia" }));
    await waitFor(() => expect(h.create).toHaveBeenCalled());
    expect(h.create.mock.calls[0][0]).toEqual({ title: "Un paseo", state: "lived", kind: "walk", placeLabel: null, startsOn: null, endsOn: null });
  });

  it("conserva nombre, actividad y detalles al volver a plegarlos y recibir un error", async () => {
    h.create.mockResolvedValue({ ok: false, error: "invalid" });
    const { container } = show();
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "El concierto" } });
    fireEvent.click(screen.getByRole("radio", { name: "Concierto" }));
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.change(screen.getByLabelText("Lugar"), { target: { value: "Madrid" } });
    fireEvent.change(screen.getByLabelText("Fecha de inicio"), { target: { value: "2026-10-03" } });
    details.open = false;
    fireEvent.click(screen.getByRole("button", { name: "Guardar experiencia" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Revisa el nombre"));
    expect((screen.getByLabelText("Nombre *") as HTMLInputElement).value).toBe("El concierto");
    expect((screen.getByRole("radio", { name: "Concierto" }) as HTMLInputElement).checked).toBe(true);
    expect(h.push).not.toHaveBeenCalled();
    expect(h.create.mock.calls[0][0]).toEqual({ title: "El concierto", state: "planned", kind: "concert", placeLabel: "Madrid", startsOn: "2026-10-03", endsOn: null });
    details.open = true;
    expect((screen.getByLabelText("Lugar") as HTMLInputElement).value).toBe("Madrid");
  });

  it("editar solo el nombre conserva el payload completo con la configuración plegada", async () => {
    const { container } = show(experience);
    expect(container.querySelector("details")!.open).toBe(false);
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Madrid con Ana y Luis" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(h.update).toHaveBeenCalled());
    expect(h.update).toHaveBeenCalledWith("memory", 7, { title: "Madrid con Ana y Luis", state: "lived", shape: "trip", audience: "participants", startsOn: "2026-10-03", endsOn: "2026-10-04" });
  });

  it("mantiene una salida accesible al historial antes de guardar", () => {
    show();
    expect(screen.getByRole("link", { name: "Cancelar" }).getAttribute("href")).toBe("/experiencias");
  });

  it("protege los valores mientras se está guardando", async () => {
    let finish: (value: unknown) => void = () => {};
    h.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    show();
    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Nuestra noche" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar experiencia" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardando…" })).toBeTruthy());
    expect(screen.getByLabelText("Nombre *").matches(":disabled")).toBe(true);
    finish({ ok: true, data: { id: "new-memory" } });
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/experiencia/new-memory"));
  });
});
