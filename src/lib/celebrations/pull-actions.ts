"use server";

import type { CelebrationPayload } from "./types";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  isUuid, parseClaimResult, rejectedReservationReceipt, supportedCelebrations,
  type AckResult, type BoundaryFailure, type ClaimInput, type ClaimResult,
  type ReceiptInput, type ReleaseResult,
} from "./protocol";

function diagnostic(operation: string): void {
  // Never serialize an exception, payload, identity or claim token. A broken
  // logger must not turn a completed operation into a failure.
  try { console.error("celebrations", { operation, kind: "unavailable" }); } catch {}
}

async function authenticated(expectedActorId: string) {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error) return { failure: { kind: isAuthSessionMissingError(error) ? "no_session" : "unavailable" } as BoundaryFailure };
  if (!data.user) return { failure: { kind: "no_session" } as BoundaryFailure };
  if (data.user.id !== expectedActorId) return { failure: { kind: "identity_changed" } as BoundaryFailure };
  return { client };
}

export async function claimNextCelebration(input: ClaimInput): Promise<ClaimResult> {
  try {
    if (!input || !isUuid(input.expectedActorId)) return { kind: "unavailable" };
    const session = await authenticated(input.expectedActorId);
    if (session.failure) return session.failure;
    const supported = supportedCelebrations(input.supportedEvents);
    if (!supported) return { kind: "unavailable" };
    const { data, error } = await session.client.rpc("claim_next_celebration", { p_supported_types: supported });
    if (error) { diagnostic("claim"); return { kind: "unavailable" }; }
    const result = parseClaimResult(data, input.expectedActorId, supported);
    if (result.kind === "unavailable") {
      diagnostic("claim_contract");
      const receipt = rejectedReservationReceipt(data, input.expectedActorId);
      if (receipt) {
        try {
          const released = await session.client.rpc("release_celebration", { p_id: receipt.id, p_claim_token: receipt.token });
          if (released.error) diagnostic("release_invalid");
        } catch { diagnostic("release_invalid"); }
      }
    }
    return result;
  } catch { diagnostic("claim"); return { kind: "unavailable" }; }
}

export async function ackCelebration(input: ReceiptInput): Promise<AckResult> {
  try {
    if (!input || !isUuid(input.expectedActorId) || !isUuid(input.id) || !isUuid(input.token)) return { kind: "unavailable" };
    const session = await authenticated(input.expectedActorId);
    if (session.failure) return session.failure;
    const { data, error } = await session.client.rpc("ack_celebration", { p_id: input.id, p_claim_token: input.token });
    if (!error && (data === "acked" || data === "already_acked" || data === "stale")) return { kind: data };
  } catch {}
  diagnostic("ack");
  return { kind: "unavailable" };
}

export async function releaseCelebration(input: ReceiptInput): Promise<ReleaseResult> {
  try {
    if (!input || !isUuid(input.expectedActorId) || !isUuid(input.id) || !isUuid(input.token)) return { kind: "unavailable" };
    const session = await authenticated(input.expectedActorId);
    if (session.failure) return session.failure;
    const { data, error } = await session.client.rpc("release_celebration", { p_id: input.id, p_claim_token: input.token });
    if (!error && (data === "released" || data === "already_acked" || data === "stale")) return { kind: data };
  } catch {}
  diagnostic("release");
  return { kind: "unavailable" };
}

// Compatibilidad de export para versiones anteriores. Nunca vuelve a consumir
// filas: las celebraciones nuevas usan claim recuperable y ACK tras presentar.
export async function pullPendingCelebrations(): Promise<CelebrationPayload[]> {
  return [];
}
