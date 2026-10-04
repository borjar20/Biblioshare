// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { ExperienceDetail as Detail, ExperiencePerson } from "@/lib/experiences/types";
import { ExperienceDetail } from "./experience-detail";
import { ExperienceCard } from "./experience-card";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/experiencia/shared-memory",
}));
// No request or database is needed to render a supplied experience.
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => { throw new Error("Unexpected database access during render"); },
}));

afterEach(cleanup);

function person(userId: string, displayName: string): ExperiencePerson {
  return { id: `participant-${userId}`, userId, displayName, username: userId,
    guestName: null, invitationState: "accepted", shareIdentity: true, avatarUrl: null };
}

const organizer = person("alba", "Alba"), invitee = person("beatriz", "Beatriz"), companion = person("carmen", "Carmen");
const experience: Detail = {
  id: "shared-memory", creatorId: organizer.userId!, viewerId: invitee.userId, title: "Salida a Sevilla",
  shape: "single", state: "lived", audience: "participants", startsOn: null, endsOn: null,
  coverPhotoId: null, createdAt: "2026-10-04T10:00:00Z", revision: 1, moments: [],
  participants: [organizer, invitee, companion], canEdit: false, canContribute: true,
  attendance: [], favorites: [], photos: [], publicationId: null, interactionTargetId: null,
  reviews: [], rating: null, momentRatings: {},
};

describe("acompañantes de la cabecera de Experiencias", () => {
  it("incluye al organizador y omite a la invitada que mira", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <ExperienceDetail experience={experience} />
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Alba, Carmen");
  });
});

describe("acompañantes de las tarjetas del álbum", () => {
  it("incluye al organizador y omite a la invitada que mira", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <ExperienceCard experience={experience} viewerId={invitee.userId} />
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Alba, Carmen");
  });
});

const guest: ExperiencePerson = {
  id: "guest-luis", userId: null, guestName: "Luis", displayName: null, username: null,
  invitationState: "accepted", shareIdentity: false, avatarUrl: null,
};
const protectedIdentity: ExperiencePerson = { ...guest, id: "protected-person", guestName: null };

describe.each([
  { view: "cabecera", content: (detail: Detail) => <ExperienceDetail experience={detail} /> },
  { view: "tarjeta de álbum", content: (detail: Detail) => <ExperienceCard experience={detail} viewerId={detail.viewerId} /> },
])("$view: identidad y aceptación", ({ content }) => {
  it("muestra a Beatriz y Carmen cuando mira la organizadora", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      {content({ ...experience, viewerId: organizer.userId })}
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Beatriz, Carmen");
  });

  it("excluye invitaciones pendientes y rechazadas", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      {content({ ...experience, participants: [organizer, invitee, companion,
        { ...person("diana", "Diana"), invitationState: "invited" },
        { ...person("elena", "Elena"), invitationState: "declined" },
      ] })}
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Alba, Carmen");
  });

  it("conserva al invitado sin cuenta y a la identidad protegida", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      {content({ ...experience, participants: [organizer, invitee, guest, protectedIdentity] })}
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Alba, Luis, Acompañante");
  });

  it("un visitante anónimo conserva organizadora, invitado e identidad protegida", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      {content({ ...experience, viewerId: null, participants: [organizer, guest, protectedIdentity] })}
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Alba, Luis, Acompañante");
  });

  it("un visitante que no participó ve a todas las personas aceptadas", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      {content({ ...experience, viewerId: "visitor" })}
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Alba, Beatriz, Carmen");
  });

  it("un recuerdo sin acompañantes propios mantiene su etiqueta personal", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      {content({ ...experience, viewerId: organizer.userId, participants: [organizer] })}
    </NextIntlClientProvider>);

    expect(screen.getByText("Recuerdo personal")).toBeTruthy();
    expect(screen.queryByText(/^Con /)).toBeNull();
  });
});

describe("acompañantes de la tarjeta del feed", () => {
  it("describe a los acompañantes de la organizadora presentada como actor", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <ExperienceCard experience={experience} variant="feed" />
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Beatriz, Carmen");
  });

  it("conserva la etiqueta traducida de un acompañante sin identidad visible", () => {
    render(<NextIntlClientProvider locale="es" messages={messages}>
      <ExperienceCard experience={{ ...experience, participants: [organizer, protectedIdentity] }} variant="feed" />
    </NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe("Con Acompañante");
  });
});
