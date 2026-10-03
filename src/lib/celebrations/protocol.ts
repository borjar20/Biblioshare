import { CELEBRATIONS, getCelebrationKey } from "./registry";
import type { CelebrationEvent, CelebrationPayload } from "./types";

export const CELEBRATION_LEASE_MS = 30_000;
export const CELEBRATION_LEASE_MARGIN_MS = 3_000;
export const SUPPORTED_CELEBRATIONS = Object.keys(CELEBRATIONS) as CelebrationEvent[];

export interface Reservation {
  id: string;
  token: string;
  actorId: string;
  eventKey: string;
  payload: CelebrationPayload;
  leaseMs: 30000;
  expiresAt: string;
}
export type BoundaryFailure = { kind: "no_session" | "identity_changed" | "unavailable" };
export type ClaimResult =
  | { kind: "empty"; actorId: string }
  | { kind: "busy"; actorId: string; retryAfterMs: number }
  | { kind: "claimed"; reservation: Reservation }
  | BoundaryFailure;
export type AckResult = { kind: "acked" | "already_acked" | "stale" } | BoundaryFailure;
export type ReleaseResult = { kind: "released" | "already_acked" | "stale" } | BoundaryFailure;
export interface ClaimInput { expectedActorId: string; supportedEvents: CelebrationEvent[] }
export interface ReceiptInput { expectedActorId: string; id: string; token: string }
export interface CelebrationActions {
  claimNextCelebration(input: ClaimInput): Promise<ClaimResult>;
  ackCelebration(input: ReceiptInput): Promise<AckResult>;
  releaseCelebration(input: ReceiptInput): Promise<ReleaseResult>;
}
export type QueueEntry =
  | { source: "local"; key: string; payload: CelebrationPayload; shown: boolean }
  | { source: "remote"; key: string; reservation: Reservation; generation: number; safeDeadline: number; shown: boolean };
export interface DisplayReceipt { key: string; generation: number }

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The envelope owns the event; persistence fields never enter domain payloads. */
export function parseCelebrationPayload(event: unknown, value: unknown): CelebrationPayload | null {
  if (typeof event !== "string" || !Object.hasOwn(CELEBRATIONS, event) || !record(value)) return null;
  const payload: CelebrationPayload = { event: event as CelebrationEvent };
  for (const field of ["title", "message", "itemType", "itemId", "passId", "clubId", "clubActivityId", "date", "key"] as const) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== "string") return null;
    payload[field] = value[field];
  }
  if (value.milestone !== undefined) {
    if (typeof value.milestone !== "number" || !Number.isFinite(value.milestone)) return null;
    payload.milestone = value.milestone;
  }
  if (value.metadata !== undefined) {
    if (!record(value.metadata)) return null;
    payload.metadata = value.metadata;
  }
  try { getCelebrationKey(payload); } catch { return null; }
  return payload;
}

export function supportedCelebrations(value: unknown): CelebrationEvent[] | null {
  if (!Array.isArray(value) || value.length > 32 || value.some(item => typeof item !== "string" || item.length < 1 || item.length > 64)) return null;
  return [...new Set(value.filter(item => Object.hasOwn(CELEBRATIONS, item)))] as CelebrationEvent[];
}

/** Only a own, well-formed receipt can be released after rejecting a payload. */
export function rejectedReservationReceipt(value: unknown, actorId: string): ReceiptInput | null {
  if (!record(value) || value.kind !== "claimed" || value.actor_id !== actorId || !isUuid(value.id) || !isUuid(value.claim_token)) return null;
  return { expectedActorId: actorId, id: value.id, token: value.claim_token };
}

export function parseClaimResult(value: unknown, actorId: string, supported: CelebrationEvent[]): ClaimResult {
  if (!record(value) || value.actor_id !== actorId) return { kind: "unavailable" };
  if (value.kind === "empty") return { kind: "empty", actorId };
  if (value.kind === "busy" && typeof value.retry_after_ms === "number" && Number.isInteger(value.retry_after_ms) && value.retry_after_ms > 0 && value.retry_after_ms <= CELEBRATION_LEASE_MS) {
    return { kind: "busy", actorId, retryAfterMs: value.retry_after_ms };
  }
  if (value.kind !== "claimed" || !isUuid(value.id) || !isUuid(value.claim_token) || value.lease_ms !== CELEBRATION_LEASE_MS || typeof value.event_key !== "string" || typeof value.claim_expires_at !== "string" || !Number.isFinite(Date.parse(value.claim_expires_at))) return { kind: "unavailable" };
  const payload = parseCelebrationPayload(value.event_type, value.payload);
  if (!payload || !supported.includes(payload.event)) return { kind: "unavailable" };
  return { kind: "claimed", reservation: { id: value.id, token: value.claim_token, actorId, eventKey: value.event_key, payload, leaseMs: CELEBRATION_LEASE_MS, expiresAt: value.claim_expires_at } };
}
