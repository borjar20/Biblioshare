// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperienceDetail, ExperiencePhoto } from "@/lib/experiences/types";
import { MomentAttendance } from "./moment-attendance";
import { ExperienceFiltersBar } from "./experience-filters";
import { ExperienceGallery } from "./experience-gallery";
import { ExperiencePublication } from "./experience-publication";

const actions = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), attendance: vi.fn(), guestAttendance: vi.fn(),
  photoSharing: vi.fn(), cover: vi.fn(), deletePhoto: vi.fn(), publish: vi.fn(), unpublish: vi.fn(), updateExperience: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: actions.push, refresh: actions.refresh }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, string | number>) =>
  key + (values ? ` ${Object.values(values).join(" ")}` : "") }));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => <span role="img" aria-label={alt} data-src={src} /> }));
vi.mock("@/components/saga/sheet-shell", () => ({ SheetShell: ({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) =>
  <div role="dialog" aria-label={title}>{children}<button onClick={onClose}>close</button></div> }));
vi.mock("./experience-photo-upload", () => ({ ExperiencePhotoUpload: () => <button>upload</button> }));
vi.mock("@/lib/experiences/participant-actions", () => ({ setMomentAttendance: actions.attendance, setGuestAttendance: actions.guestAttendance }));
vi.mock("@/lib/experiences/photo-actions", () => ({ setPhotoSharing: actions.photoSharing, setCoverPhoto: actions.cover, deletePhoto: actions.deletePhoto }));
vi.mock("@/lib/experiences/publish-actions", () => ({ publishExperience: actions.publish, unpublishExperience: actions.unpublish }));
vi.mock("@/lib/experiences/actions", () => ({ updateExperience: actions.updateExperience }));

const moment = { id: "moment-1", title: "Museo", kind: "museum" as const, placeLabel: null, startsOn: null, endsOn: null, position: 0 };
const own = { id: "participant-1", userId: "viewer", guestName: null, invitationState: "accepted" as const, shareIdentity: false, username: "viewer", displayName: "Mar", avatarUrl: null };
const photo: ExperiencePhoto = { id: "photo-1", momentId: moment.id, mimeType: "image/png", createdAt: "2026-10-03T10:00:00Z", shareWithProfile: false, authorId: "viewer", authorName: "Mar", canManage: true, isAuthor: true };
const detail: ExperienceDetail = {
  id: "experience-1", creatorId: "viewer", title: "Madrid", shape: "single", state: "planned", audience: "private",
  startsOn: null, endsOn: null, coverPhotoId: null, createdAt: "2026-10-03T10:00:00Z", revision: 7,
  moments: [moment], participants: [own], viewerId: "viewer", canEdit: true, canContribute: true,
  attendance: [{ momentId: moment.id, participantId: own.id, state: "planned" }], favorites: [], photos: [photo], publicationId: null, interactionTargetId: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  for (const action of [actions.attendance, actions.guestAttendance, actions.photoSharing, actions.cover, actions.deletePhoto, actions.publish, actions.unpublish, actions.updateExperience]) action.mockResolvedValue({ ok: true, data: {} });
});
afterEach(cleanup);

describe("presencia de un toque", () => {
  it("confirma solo la presencia propia y conserva el estado Por vivir del recuerdo", async () => {
    render(<MomentAttendance experience={detail} moment={moment} />);
    const group = screen.getByRole("radiogroup", { name: "ownAttendance Museo" });
    expect((within(group).getByRole("radio", { name: "attendance.planned" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(group).getByRole("radio", { name: "attendance.attended" }));
    await waitFor(() => expect(actions.attendance).toHaveBeenCalledWith(moment.id, "attended"));
    expect(actions.guestAttendance).not.toHaveBeenCalled();
    expect(detail.state).toBe("planned");
  });
  it("no permite confirmar a una cuenta ajena, pero sí a una etiqueta privada si eres quien edita", async () => {
    const guest = { ...own, id: "guest-1", userId: null, guestName: "Ana", username: null };
    const other = { ...own, id: "other-1", userId: "other", displayName: "Eva" };
    render(<MomentAttendance experience={{ ...detail, participants: [own, guest, other], attendance: [
      ...detail.attendance, { momentId: moment.id, participantId: guest.id, state: "planned" }, { momentId: moment.id, participantId: other.id, state: "planned" },
    ] }} moment={moment} />);
    expect(screen.queryByRole("radiogroup", { name: "guestAttendance Eva Museo" })).toBeNull();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "guestAttendance Ana Museo" })).getByRole("radio", { name: "attendance.attended" }));
    await waitFor(() => expect(actions.guestAttendance).toHaveBeenCalledWith(moment.id, guest.id, "attended"));
  });
  it("retiene la selección confirmada ante un error y muestra la explicación", async () => {
    actions.attendance.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<MomentAttendance experience={detail} moment={moment} />);
    fireEvent.click(screen.getByRole("radio", { name: "attendance.attended" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("errors.forbidden"));
    expect((screen.getByRole("radio", { name: "attendance.planned" }) as HTMLInputElement).checked).toBe(true);
    expect(actions.refresh).not.toHaveBeenCalled();
  });
});

describe("filtros secundarios", () => {
  it("revela los tipos y acompañantes globales al buscarlos y conserva el tab al resetear el cursor", () => {
    render(<ExperienceFiltersBar filters={{ state: "all", cursor: "old" }} people={[{ ...own, id: "outside-current-page", displayName: "Fuera de esta página" }]} basePath="/u/mar?tab=experiencias" />);
    expect(screen.queryByRole("combobox", { name: "kind" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "album.filterDetails" }));
    expect(screen.getByRole("option", { name: "Fuera de esta página" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "kind" }), { target: { value: "museum" } });
    expect(actions.push).toHaveBeenCalledWith("/u/mar?tab=experiencias&kind=museum");
  });
  it("mantiene un filtro activo visible incluso cuando su acompañante ya no está entre los resultados", () => {
    render(<ExperienceFiltersBar filters={{ companion: "withdrawn" }} people={[]} />);
    expect((screen.getByRole("combobox", { name: "companions" }) as HTMLSelectElement).value).toBe("withdrawn");
  });
});

describe("álbum y consentimiento fotográfico", () => {
  it("abre la foto antes de mostrar su permiso y comparte únicamente la fotografía propia elegida", async () => {
    render(<ExperienceGallery experience={detail} />);
    expect(screen.queryByRole("checkbox", { name: "sharePhoto" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "openPhoto" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "sharePhoto" }));
    await waitFor(() => expect(actions.photoSharing).toHaveBeenCalledWith(photo.id, true));
    expect(actions.publish).not.toHaveBeenCalled();
  });
  it("actualiza el permiso de una foto abierta cuando llega la revisión nueva del servidor", () => {
    const view = render(<ExperienceGallery experience={detail} />);
    fireEvent.click(screen.getByRole("button", { name: "openPhoto" }));
    view.rerender(<ExperienceGallery experience={{ ...detail, photos: [{ ...photo, shareWithProfile: true }] }} />);
    expect((within(screen.getByRole("dialog")).getByRole("checkbox", { name: "sharePhoto" }) as HTMLInputElement).checked).toBe(true);
  });
  it("no muestra el permiso ni las acciones de autor en una foto ajena sin permiso de gestión", () => {
    render(<ExperienceGallery experience={{ ...detail, photos: [{ ...photo, isAuthor: false, canManage: false, authorId: null }] }} />);
    fireEvent.click(screen.getByRole("button", { name: "openPhoto" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "photoActions" })).toBeNull();
  });
});

describe("publicación contextual", () => {
  it("guarda la audiencia en el propio recuerdo conservando todos los campos y su revisión", async () => {
    const trip = { ...detail, shape: "trip" as const, state: "cancelled" as const, startsOn: "2026-10-03", endsOn: "2026-10-05" };
    render(<ExperiencePublication experience={trip} />);
    fireEvent.click(screen.getByRole("button", { name: "publication" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "audience" })).getByRole("radio", { name: "participants" }));
    fireEvent.click(screen.getByRole("button", { name: "saveChanges" }));
    await waitFor(() => expect(actions.updateExperience).toHaveBeenCalledWith(trip.id, trip.revision, {
      title: trip.title, shape: trip.shape, state: trip.state, audience: "participants", startsOn: trip.startsOn, endsOn: trip.endsOn,
    }));
    expect(actions.publish).not.toHaveBeenCalled();
  });
  it("no publica al elegir perfil y espera la audiencia guardada antes de habilitar la publicación", async () => {
    const view = render(<ExperiencePublication experience={detail} />);
    fireEvent.click(screen.getByRole("button", { name: "publication" }));
    fireEvent.click(screen.getByRole("radio", { name: "profile" }));
    expect((screen.getByRole("button", { name: "publish" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "saveChanges" }));
    await waitFor(() => expect(actions.updateExperience).toHaveBeenCalledTimes(1));
    expect(actions.publish).not.toHaveBeenCalled();
    view.rerender(<ExperiencePublication experience={{ ...detail, audience: "profile", revision: 8 }} />);
    expect((screen.getByRole("button", { name: "publish" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "publish" }));
    await waitFor(() => expect(actions.publish).toHaveBeenCalledWith(detail.id));
  });
  it("abre las opciones de compartir y exige audiencia de perfil sin cambiarla automáticamente", () => {
    render(<ExperiencePublication experience={detail} />);
    fireEvent.click(screen.getByRole("button", { name: "publication" }));
    const publish = within(screen.getByRole("dialog")).getByRole("button", { name: "publish" }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    fireEvent.click(publish);
    expect(actions.publish).not.toHaveBeenCalled();
  });
  it("publica el recuerdo autorizado tras una acción explícita", async () => {
    render(<ExperiencePublication experience={{ ...detail, audience: "profile" }} />);
    expect(actions.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "publication" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "publish" }));
    await waitFor(() => expect(actions.publish).toHaveBeenCalledWith(detail.id));
  });
});
