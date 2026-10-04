export const MOMENT_KINDS = ["concert", "show", "exhibition", "museum", "walk", "food", "festival", "sport", "nature", "other"] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];
export type ExperienceShape = "single" | "trip";
export type ExperienceState = "planned" | "lived" | "cancelled";
export type ExperienceAudience = "private" | "participants" | "profile";
export type InvitationState = "invited" | "accepted" | "declined";
export type AttendanceState = "planned" | "attended" | "skipped";
export type ExperienceError = "unauthenticated" | "forbidden" | "not_found" | "invalid" | "conflict" | "limit" | "too_large" | "unsupported_image" | "unknown";
export type ExperienceResult<T> = { ok: true; data: T } | { ok: false; error: ExperienceError };
export const EXPERIENCE_LIMITS = { title: 160, place: 240, guest: 80, moments: 50, participants: 30, photos: 40, photoBytes: 2 * 1024 * 1024, reviewBody: 4000 } as const;
export interface CreateExperienceInput {
  title: string;
  state: "planned" | "lived";
  kind: MomentKind;
  placeLabel?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}
export interface UpdateExperienceInput {
  title: string;
  shape: ExperienceShape;
  state: ExperienceState;
  audience: ExperienceAudience;
  startsOn: string | null;
  endsOn: string | null;
}
export interface SaveMomentInput {
  id?: string;
  title: string;
  kind: MomentKind;
  placeLabel?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface ExperiencePerson {
  id: string;
  userId: string | null;
  guestName: string | null;
  invitationState: InvitationState;
  shareIdentity: boolean;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}
export interface ExperienceMoment {
  id: string;
  title: string;
  kind: MomentKind;
  placeLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  position: number;
}
export interface ExperiencePreview {
  id: string;
  creatorId: string;
  title: string;
  shape: ExperienceShape;
  state: ExperienceState;
  audience: ExperienceAudience;
  startsOn: string | null;
  endsOn: string | null;
  coverPhotoId: string | null;
  createdAt: string;
  revision: number;
  moments: ExperienceMoment[];
  participants: ExperiencePerson[];
  rating: ExperienceRating | null;
  momentRatings: Record<string, ExperienceRating>;
}
export interface ExperienceDetail extends ExperiencePreview {
  viewerId: string | null;
  canEdit: boolean;
  canContribute: boolean;
  attendance: { momentId: string; participantId: string; state: AttendanceState }[];
  favorites: { userId: string; momentId: string }[];
  photos:ExperiencePhoto[];
  publicationId:string|null;
  interactionTargetId:string|null;
  reviews: ExperienceReview[];
}
export interface ExperienceFilters {
  state?: ExperienceState | "all";
  kind?: MomentKind;
  companion?: string;
  cursor?: string;
  sort?: "recent" | "rating";
  offset?: number;
}
export interface ExperiencePage { items: ExperiencePreview[]; nextCursor: string | null }
export interface ExperienceInvitation {
  participantId:string;experienceId:string;title:string;startsOn:string|null;endsOn:string|null;
  organizer:{id:string;username:string;name:string;avatarUrl:string|null};
}
export interface ExperiencePhoto {
  id:string;momentId:string|null;mimeType:string;createdAt:string;shareWithProfile:boolean;
  authorId:string|null;authorName:string|null;canManage:boolean;isAuthor:boolean;
}
export interface ExperienceOwnPhotoPage {items:{id:string;createdAt:string}[];nextCursor:string|null}
export type ExperienceCompanion=Pick<ExperiencePerson,"id"|"userId"|"guestName"|"username"|"displayName"|"avatarUrl">;
export interface ExperienceOwnMembership {participantId:string;experienceId:string;title:string;createdAt:string;shareIdentity:boolean}
export interface ExperienceRating { avg: number; count: number }
export interface ExperienceReview { id:string; momentId:string; authorId:string; authorName:string|null; authorUsername:string|null; authorAvatarUrl:string|null; rating:number|null; body:string|null; shareWithProfile:boolean; isAuthor:boolean; publicationId:string|null; createdAt:string; updatedAt:string }
export interface SaveReviewInput { rating:number|null; body:string|null }
