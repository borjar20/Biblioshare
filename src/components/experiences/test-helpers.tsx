import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { AttendanceState, ExperienceAudience, ExperienceDetail, ExperienceReview, ExperienceState } from "@/lib/experiences/types";

// Arranque compartido de los tests de componentes de Experiencias: copy real de
// `messages/es.json` (los tests afirman sobre el texto que ve la persona) y un
// `ExperienceDetail` mínimo con un momento y el visor como participante aceptado.
export function withIntl(node: ReactNode) {
  return <NextIntlClientProvider locale="es" messages={messages}>{node}</NextIntlClientProvider>;
}

export const VIEWER_ID = "viewer";

export interface ReviewFixture {
  author: string;
  mine?: boolean;
  rating?: number | null;
  body?: string | null;
  shared?: boolean;
  publicationId?: string | null;
}

export function detailFixture(opts: {
  state?: ExperienceState;
  ownAttendance?: AttendanceState;
  audience?: ExperienceAudience;
  reviews?: ReviewFixture[];
  canEdit?: boolean;
  moments?: number;
} = {}): ExperienceDetail {
  const titles = ["Museo", "Cena", "Concierto", "Paseo"];
  const moments = Array.from({ length: Math.max(1, opts.moments ?? 1) }, (_, index) => ({
    id: `moment-${index + 1}`, title: titles[index] ?? `Momento ${index + 1}`, kind: "museum" as const, placeLabel: null, startsOn: null, endsOn: null, position: index,
  }));
  const moment = moments[0];
  const me = { id: "participant-1", userId: VIEWER_ID, guestName: null, invitationState: "accepted" as const, shareIdentity: true, username: "yo", displayName: "Yo", avatarUrl: null };
  const reviews: ExperienceReview[] = (opts.reviews ?? []).map((r, index) => ({
    id: `review-${index + 1}`, momentId: moment.id, authorId: r.mine ? VIEWER_ID : `author-${index + 1}`,
    authorName: r.author, authorUsername: r.author.toLowerCase(), authorAvatarUrl: null,
    rating: r.rating ?? null, body: r.body ?? null, shareWithProfile: r.shared ?? false, isAuthor: Boolean(r.mine),
    publicationId: r.publicationId ?? null, createdAt: "2026-10-04T10:00:00Z", updatedAt: "2026-10-04T10:00:00Z",
  }));
  return {
    id: "experience-1", creatorId: VIEWER_ID, title: "Madrid", shape: "single", state: opts.state ?? "lived", audience: opts.audience ?? "profile",
    startsOn: null, endsOn: null, coverPhotoId: null, createdAt: "2026-10-03T10:00:00Z", revision: 1,
    moments, participants: [me], viewerId: VIEWER_ID, canEdit: opts.canEdit ?? true, canContribute: true,
    attendance: [{ momentId: moment.id, participantId: me.id, state: opts.ownAttendance ?? "planned" }],
    favorites: [], photos: [], publicationId: null, interactionTargetId: "target-1", rating: null, momentRatings: {}, reviews,
  };
}
