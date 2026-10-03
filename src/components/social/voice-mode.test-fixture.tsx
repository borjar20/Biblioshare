import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { expect, vi } from "vitest";
import messages from "../../../messages/es.json";
import type { InteractionComment } from "@/lib/social/interactions";

// Only framework navigation and server-action transports are replaced. The
// consumers, composers, Recorder, Engine, submit hook and translations are real.
const actions = vi.hoisted(() => ({
  addVoiceComment: vi.fn<(target: string, data: FormData, options: { parentId?: string; isSpoiler?: boolean }) => Promise<{ ok: true }>>(),
  addComment: vi.fn().mockResolvedValue({ ok: true }),
}));
export const transport = actions;

vi.mock("next/navigation", () => ({ usePathname: () => "/post/voice-mode-fixture" }));
vi.mock("@/lib/social/voice-note-actions", () => ({ addVoiceComment: actions.addVoiceComment }));
vi.mock("@/lib/social/interaction-actions", () => ({
  addComment: actions.addComment,
  toggleReaction: vi.fn().mockResolvedValue({ ok: true }),
  editComment: vi.fn().mockResolvedValue({ ok: true }),
  pinComment: vi.fn().mockResolvedValue({ ok: true }),
  deleteComment: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/social/moderation-actions", () => ({ reportComment: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/social/mention-search", () => ({ searchMentionCandidates: vi.fn().mockResolvedValue([]) }));

function comment(id: string, username: string, parentId: string | null = null): InteractionComment {
  const isOwn = username === "owner";
  return {
    id, parentId, interactionTargetId: "target-" + id, authorId: "user-" + username,
    author: username, authorUsername: username, authorAvatarUrl: null, initials: username.slice(0, 2),
    body: "Comentario de " + id, createdAt: "2026-10-03T08:00:00Z", isOwn,
    canDelete: isOwn, canEdit: isOwn, canPin: false, isSpoiler: false, pinned: false,
    edited: false, audio: null, reactionCount: 0, viewerReacted: false, reactions: {},
  };
}

export const comments = [comment("ana", "ana"), comment("beto", "beto"), comment("own", "owner"), comment("ana-child", "carla", "ana")];
export const threadProps = {
  interactionTargetId: "voice-mode-target", reactionCount: 0, viewerReacted: false,
  commentCount: comments.length, comments, reactions: {}, viewerLoggedIn: true,
};
export const copy = messages.social;

export function renderComposer(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="es" timeZone="Europe/Madrid" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  );
}

// Synthetic browser media boundary: no microphone, permission UI, encoding or
// playback. Real Engine ticks produce duration/peaks; it receives a small Blob
// when the fake browser MediaRecorder emits its normal dataavailable/stop events.
export function installMediaBoundary() {
  const tracks: { stop: ReturnType<typeof vi.fn> }[] = [];
  const getUserMedia = vi.fn(async () => {
    const track = Object.assign(new EventTarget(), { stop: vi.fn() });
    tracks.push(track);
    return { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  });
  const previousMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });

  class BrowserMediaRecorder {
    static isTypeSupported(type: string) { return type.startsWith("audio/webm"); }
    state: RecordingState = "inactive";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    readonly mimeType: string;
    constructor(stream: MediaStream, options: MediaRecorderOptions) {
      expect(stream.getAudioTracks()).toHaveLength(1);
      this.mimeType = options.mimeType ?? "audio/webm";
    }
    start() { this.state = "recording"; }
    pause() { this.state = "paused"; }
    resume() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(["synthetic-audio"], { type: this.mimeType }) });
        this.onstop?.();
      });
    }
  }
  class BrowserAudioContext {
    createAnalyser() { return { fftSize: 2048, getByteTimeDomainData: (data: Uint8Array) => data.fill(128) }; }
    createMediaStreamSource() { return { connect() {} }; }
    close() { return Promise.resolve(); }
  }
  class BrowserResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  const NativeURL = URL;
  class BrowserURL extends NativeURL {
    static createObjectURL() { return "blob:voice-mode-fixture"; }
    static revokeObjectURL() {}
  }
  vi.stubGlobal("MediaRecorder", BrowserMediaRecorder);
  vi.stubGlobal("AudioContext", BrowserAudioContext);
  vi.stubGlobal("ResizeObserver", BrowserResizeObserver);
  vi.stubGlobal("URL", BrowserURL);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
  vi.setSystemTime(new Date("2026-10-03T09:00:00Z"));
  window.localStorage.clear();
  vi.spyOn(console, "debug").mockImplementation(() => {});
  transport.addVoiceComment.mockReset().mockResolvedValue({ ok: true });
  transport.addComment.mockClear();

  return {
    getUserMedia, tracks,
    restore() {
      if (previousMediaDevices) Object.defineProperty(navigator, "mediaDevices", previousMediaDevices);
      else Reflect.deleteProperty(navigator, "mediaDevices");
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    },
  };
}

export async function click(element: HTMLElement) {
  await act(async () => { fireEvent.click(element); });
}

export function commentView(id: string) {
  const element = document.getElementById("c-" + id);
  if (!element) throw new Error("Comment anchor absent: " + id);
  return within(element);
}

export async function replyTo(id: string) {
  await click(commentView(id).getAllByRole("button", { name: copy.reply })[0]);
}

export async function editOwnComment() {
  const view = commentView("own");
  await click(view.getByRole("button", { name: copy.moreActions }));
  await click(view.getByRole("button", { name: copy.editComment }));
}

export function controlsFor(textarea: HTMLElement) {
  // The existing composer has no form/region role. Scope by its textarea row
  // so ReviewInteractions' independent root and reply controls stay distinct.
  const row = textarea.parentElement?.parentElement;
  if (!row) throw new Error("Composer controls absent");
  return within(row);
}

export async function armVoice(placeholder: string) {
  const textarea = screen.getByPlaceholderText(placeholder);
  await act(async () => { fireEvent.change(textarea, { target: { value: "" } }); });
  await click(controlsFor(textarea).getByRole("button", { name: copy.voice.record }));
  expect(screen.getByTestId("voice-recorder")).toBeTruthy();
}

export async function stopToPreview() {
  await act(async () => { vi.advanceTimersByTime(2_100); });
  await click(screen.getByRole("button", { name: copy.voice.stop }));
  expect(screen.getByTestId("voice-preview")).toBeTruthy();
  expect((screen.getByTestId("voice-publish") as HTMLButtonElement).disabled).toBe(false);
}

export function holdVoiceUpload() {
  let release!: (result: { ok: true }) => void;
  const request = new Promise<{ ok: true }>(resolve => { release = resolve; });
  transport.addVoiceComment.mockReturnValueOnce(request);
  return async () => { await act(async () => { release({ ok: true }); }); };
}

export function expectVoiceUpload(parentId: string) {
  expect(transport.addVoiceComment).toHaveBeenCalledTimes(1);
  const [target, form, options] = transport.addVoiceComment.mock.calls[0];
  expect(target).toBe(threadProps.interactionTargetId);
  expect(options).toEqual({ parentId, isSpoiler: false });
  expect(Number(form.get("durationMs"))).toBeGreaterThanOrEqual(2_000);
  const peaks = JSON.parse(String(form.get("peaks"))) as number[];
  expect(peaks.length).toBeGreaterThan(0);
  expect(peaks.length).toBeLessThanOrEqual(64);
  const file = form.get("file") as File;
  expect(file.size).toBeGreaterThan(0);
  expect(file.type).toBe("audio/webm;codecs=opus");
}

export function expectDisarmed(media: ReturnType<typeof installMediaBoundary>, requests = 1) {
  expect(screen.queryByTestId("voice-recorder")).toBeNull();
  expect(screen.queryByTestId("voice-preview")).toBeNull();
  expect(media.getUserMedia).toHaveBeenCalledTimes(requests);
  expect(media.tracks[0].stop).toHaveBeenCalled();
}
