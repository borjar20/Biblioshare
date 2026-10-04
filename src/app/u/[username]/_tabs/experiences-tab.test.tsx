// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import messages from "../../../../../messages/es.json";
import { ExperiencesTab } from "./experiences-tab";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// In Next's server graph the provider obtains locale from request configuration.
// jsdom resolves the client export, so supply only that external server context.
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return { ...actual, NextIntlClientProvider: (props: ComponentProps<typeof actual.NextIntlClientProvider>) =>
    <actual.NextIntlClientProvider locale="es" {...props} /> };
});
vi.mock("next-intl/server", () => ({
  getTranslations: async () => createTranslator({ locale: "es", messages: messages.experiences }),
}));
// The queries, route provider, and card stay real; only the database boundary is supplied.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => database }));

const organizerId = "11111111-1111-4111-8111-111111111111";
const inviteeId = "22222222-2222-4222-8222-222222222222";
const companionId = "33333333-3333-4333-8333-333333333333";
const experienceId = "44444444-4444-4444-8444-444444444444";
const identities = [
  { user_id: organizerId, username: "alba", display_name: "Alba", avatar_url: null },
  { user_id: inviteeId, username: "beatriz", display_name: "Beatriz", avatar_url: null },
  { user_id: companionId, username: "carmen", display_name: "Carmen", avatar_url: null },
];
const tables: Record<string, unknown[]> = {
  experience_moments: [],
  experience_participants: identities.map((identity, index) => ({
    id: `person-${index}`, experience_id: experienceId, user_id: identity.user_id,
    guest_name: null, invitation_state: "accepted", share_identity: true,
  })),
  profile_identities: identities,
  experience_moment_reviews: [],
};
type Query = Promise<{ data: unknown[]; error: null }> & { select: () => Query; in: () => Query; eq: () => Query; order: () => Query };
function query(data: unknown[]): Query {
  return Object.assign(Promise.resolve({ data, error: null }), {
    select: () => query(data), in: () => query(data), eq: () => query(data), order: () => query(data),
  });
}
const database = {
  from: (table: string) => {
    if (!(table in tables)) throw new Error(`Unexpected table: ${table}`);
    return query(tables[table]);
  },
  rpc: async (name: string) => {
    if (name === "get_experience_cover_photos" || name === "get_experience_rating_summaries") return { data: [], error: null };
    if (name !== "get_profile_experiences") throw new Error(`Unexpected RPC: ${name}`);
    return { data: [{ id: experienceId, creator_id: organizerId, title: "Salida a Sevilla",
      shape: "single", state: "lived", audience: "profile", starts_on: null, ends_on: null,
      created_at: "2026-10-04T10:00:00Z", revision: 1 }], error: null };
  },
  auth: { getUser: () => { throw new Error("The profile route already supplies its viewer"); } },
};

afterEach(cleanup);

describe("tarjetas de Experiencias del perfil", () => {
  it.each([
    { viewerId: organizerId, isOwner: true, expected: "Con Beatriz, Carmen" },
    { viewerId: inviteeId, isOwner: false, expected: "Con Alba, Carmen" },
    { viewerId: null, isOwner: false, expected: "Con Alba, Beatriz, Carmen" },
  ])("muestra $expected al mirar $viewerId", async ({ viewerId, isOwner, expected }) => {
    const content = await ExperiencesTab({ userId: organizerId, viewerId, isOwner,
      basePath: "/u/alba", params: {} });
    render(<NextIntlClientProvider locale="es" messages={messages}>{content}</NextIntlClientProvider>);

    expect(screen.getByText(/^Con /).textContent).toBe(expected);
  });
});
