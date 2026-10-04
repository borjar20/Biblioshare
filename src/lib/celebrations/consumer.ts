import { CELEBRATION_LEASE_MARGIN_MS, SUPPORTED_CELEBRATIONS, parseCelebrationPayload, type CelebrationActions, type DisplayReceipt, type QueueEntry, type ReceiptInput, type Reservation } from "./protocol";
import type { CelebrationPayload, CelebrationPreference } from "./types";
import type { CelebrationAnalyticsContext, CelebrationAnalyticsEvent } from "./analytics";

interface ConsumerBoundary {
  actions: CelebrationActions;
  preference(): CelebrationPreference;
  visible(): boolean;
  now(): number;
  log(name: CelebrationAnalyticsEvent, context: CelebrationAnalyticsContext): void;
  emitShown(items: CelebrationPayload[]): void;
}
interface PendingAck extends ReceiptInput {
  attempt: number;
  retryAt: number;
}
export interface CelebrationSnapshot {
  current: QueueEntry | null;
  generation: number;
}
const ACK_RETRIES_MS = [1000, 2000, 5000, 15000];

/** One pump per mounted consumer. Only presentation creates an ACK receipt. */
export class CelebrationConsumer {
  private active = false;
  private generation = 0;
  private actor: string | null | undefined;
  private lastActor: string | null | undefined;
  private binding = 0;
  private refreshIdentity: (() => void) | undefined;
  private queue: QueueEntry[] = [];
  private pendingAck: PendingAck | null = null;
  private inFlight: object | null = null;
  private requested = false;
  private notBefore = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private localSequence = 0;
  private listeners = new Set<() => void>();
  private snapshot: CelebrationSnapshot = { current: null, generation: 0 };

  constructor(private readonly boundary: ConsumerBoundary) {}

  getSnapshot = (): CelebrationSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(): void {
    this.snapshot = { current: this.active ? this.queue[0] ?? null : null, generation: this.generation };
    for (const listener of this.listeners) listener();
  }
  private log(name: CelebrationAnalyticsEvent, payload: CelebrationPayload): void {
    try { this.boundary.log(name, { event: payload.event, reducedMotion: this.boundary.preference() === "reduced" }); } catch {}
  }
  private diagnostic(operation: string): void {
    try { console.error("celebrations", { operation, kind: "unavailable" }); } catch {}
  }
  private schedule(delay = 0): void {
    if (!this.active) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pump().catch(() => this.diagnostic("pump"));
    }, delay);
  }
  start(): void {
    this.active = true;
    this.generation++;
    this.publish();
    this.pull();
  }
  stop(): void {
    this.active = false;
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.clearPresentation(true);
    this.publish();
  }
  bindActor(actorId: string | null, refreshIdentity: () => void): () => void {
    const binding = ++this.binding;
    this.generation++;
    this.clearPresentation(this.lastActor !== actorId);
    if (this.lastActor !== undefined && this.lastActor !== actorId) this.pendingAck = null;
    this.actor = actorId;
    this.lastActor = actorId;
    this.refreshIdentity = refreshIdentity;
    this.publish();
    this.pull();
    return () => {
      if (this.binding !== binding) return;
      this.actor = undefined; // Unknown while a suspended binding is absent.
      this.refreshIdentity = undefined;
      this.generation++;
      this.clearPresentation(true);
      this.publish();
    };
  }
  private invalidateIdentity(): void {
    const refresh = this.refreshIdentity;
    this.actor = undefined;
    this.generation++;
    this.pendingAck = null;
    this.clearPresentation(true);
    this.publish();
    try { refresh?.(); } catch { this.diagnostic("identity_refresh"); }
  }
  private clearPresentation(clearLocals: boolean): void {
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    for (const entry of this.queue) if (entry.source === "remote" && !entry.shown) this.release(entry.reservation);
    this.queue = clearLocals ? [] : this.queue.filter(entry => entry.source === "local" && !entry.shown);
  }
  presentationChanged(): void {
    if (!this.boundary.visible() || this.boundary.preference() === "disabled") {
      this.generation++;
      this.clearPresentation(this.boundary.preference() === "disabled");
      this.publish();
    }
    this.pull();
  }
  pull = (): void => {
    this.requested = true;
    this.notBefore = 0;
    if (!this.inFlight && this.pendingAck && this.pendingAck.attempt > ACK_RETRIES_MS.length) {
      this.pendingAck.attempt = 0;
      this.pendingAck.retryAt = 0;
    }
    this.schedule();
  };
  trigger = (value: CelebrationPayload): void => {
    const payload = parseCelebrationPayload(value?.event, value);
    if (!payload) return;
    if (this.boundary.preference() === "disabled") { this.log("celebration_skipped_preference", payload); return; }
    this.log("celebration_triggered", payload);
    this.queue.push({ source: "local", key: "local:" + ++this.localSequence, payload, shown: false });
    this.publish();
  };
  shown = (receipt: DisplayReceipt): void => {
    const entry = this.queue[0];
    if (!this.active || !entry || entry.key !== receipt.key || entry.shown || receipt.generation !== this.generation || !this.boundary.visible() || this.boundary.preference() === "disabled") return;
    if (entry.source === "remote" && (entry.generation !== this.generation || this.actor !== entry.reservation.actorId || this.boundary.now() >= entry.safeDeadline)) return;
    this.queue[0] = { ...entry, shown: true };
    if (entry.source === "remote") this.pendingAck = { expectedActorId: entry.reservation.actorId, id: entry.reservation.id, token: entry.reservation.token, attempt: 0, retryAt: 0 };
    this.publish(); // Fact of presentation is recorded before fallible side effects.
    this.log("celebration_displayed", entry.source === "local" ? entry.payload : entry.reservation.payload);
    try { this.boundary.emitShown([entry.source === "local" ? entry.payload : entry.reservation.payload]); } catch { this.diagnostic("shown_event"); }
    this.schedule();
  };
  done = (key: string): void => {
    const entry = this.queue[0];
    if (!entry || entry.key !== key) return;
    this.queue.shift();
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
    if (entry.source === "remote" && !entry.shown) this.release(entry.reservation);
    this.log("celebration_dismissed", entry.source === "local" ? entry.payload : entry.reservation.payload);
    this.publish();
    this.requested = true;
    this.schedule();
  };
  private release(reservation: Reservation): void {
    const generation = this.generation;
    void this.boundary.actions.releaseCelebration({ expectedActorId: reservation.actorId, id: reservation.id, token: reservation.token }).then(result => {
      if ((result.kind === "identity_changed" || result.kind === "no_session") && this.active && this.generation === generation && this.actor === reservation.actorId) this.invalidateIdentity();
      else if (result.kind === "unavailable") this.diagnostic("release");
    }).catch(() => this.diagnostic("release")); // Otherwise the lease recovers it.
  }
  private async pump(): Promise<void> {
    if (!this.active || this.inFlight || typeof this.actor !== "string" || !this.boundary.visible()) return;
    const ack = this.pendingAck;
    if (ack) {
      if (ack.expectedActorId !== this.actor || ack.attempt > ACK_RETRIES_MS.length) return;
      if (ack.retryAt > this.boundary.now()) { this.schedule(ack.retryAt - this.boundary.now()); return; }
      const operation = {};
      const generation = this.generation;
      this.inFlight = operation;
      ack.attempt++;
      try {
        const result = await this.boundary.actions.ackCelebration({ expectedActorId: ack.expectedActorId, id: ack.id, token: ack.token });
        if (this.pendingAck !== ack) return;
        if (result.kind === "acked" || result.kind === "already_acked" || result.kind === "stale") this.pendingAck = null;
        else if ((result.kind === "identity_changed" || result.kind === "no_session") && this.generation === generation) this.invalidateIdentity();
        else this.retryAck(ack);
      } catch { if (this.pendingAck === ack) this.retryAck(ack); }
      finally {
        if (this.inFlight === operation) this.inFlight = null;
        if (this.pendingAck === ack && ack.attempt <= ACK_RETRIES_MS.length) this.schedule(Math.max(0, ack.retryAt - this.boundary.now()));
        else if (this.requested) this.schedule();
      }
      return;
    }
    if (!this.requested || this.queue.length || this.boundary.preference() === "disabled") return;
    if (this.notBefore > this.boundary.now()) { this.schedule(this.notBefore - this.boundary.now()); return; }
    this.requested = false;
    const actor = this.actor;
    const generation = this.generation;
    const startedAt = this.boundary.now(); // Includes transport/dispatcher queuing.
    const operation = {};
    this.inFlight = operation;
    try {
      const result = await this.boundary.actions.claimNextCelebration({ expectedActorId: actor, supportedEvents: SUPPORTED_CELEBRATIONS });
      const current = this.active && this.generation === generation && this.actor === actor;
      if (result.kind === "claimed") {
        const reservation = result.reservation;
        const safeDeadline = startedAt + reservation.leaseMs - CELEBRATION_LEASE_MARGIN_MS;
        if (!current || reservation.actorId !== actor || this.queue.length || !this.boundary.visible() || this.boundary.preference() === "disabled" || this.boundary.now() >= safeDeadline) { this.release(reservation); return; }
        this.log("celebration_triggered", reservation.payload);
        const key = reservation.id + ":" + reservation.token;
        this.queue.push({ source: "remote", key, reservation, safeDeadline, generation, shown: false });
        this.publish();
        this.deadlineTimer = setTimeout(() => {
          this.deadlineTimer = null;
          const head = this.queue[0];
          if (head?.key === key) this.done(key);
        }, Math.max(0, safeDeadline - this.boundary.now()));
      } else if (current && (result.kind === "identity_changed" || result.kind === "no_session")) this.invalidateIdentity();
      else if (current && result.kind === "busy") {
        this.requested = true;
        this.notBefore = this.boundary.now() + result.retryAfterMs + 100;
      } else if (result.kind === "unavailable") this.diagnostic("claim");
    } catch { this.diagnostic("claim"); }
    finally {
      if (this.inFlight === operation) this.inFlight = null;
      if (this.requested) this.schedule();
    }
  }
  private retryAck(ack: PendingAck): void {
    this.diagnostic("ack");
    const delay = ACK_RETRIES_MS[ack.attempt - 1];
    if (delay !== undefined) ack.retryAt = this.boundary.now() + delay;
  }
}
