"use client";

// Un solo audio sonando a la vez, global (spec §2): el módulo tiene UN
// HTMLAudioElement y todos los chips mandan sobre él. Los componentes leen
// por useSyncExternalStore. La factoría existe para poder testear la máquina
// con un AudioLike falso; la app usa el singleton de abajo.

import { useSyncExternalStore } from "react";
import { logVoiceNote } from "./voice-note-analytics";
import { markListened, readVoiceRate } from "./voice-preferences";

export type AudioLike = {
  src: string;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  play: () => Promise<void> | void;
  pause: () => void;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
};

export type PlaybackSnapshot = {
  commentId: string | null;
  author: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  chipVisible: boolean;
};

const EMPTY: PlaybackSnapshot = {
  commentId: null,
  author: "",
  playing: false,
  positionMs: 0,
  durationMs: 0,
  chipVisible: true,
};

type PlayInput = { commentId: string; url: string; durationMs: number; author: string };

export function createPlaybackStore(
  createAudio: () => AudioLike,
  opts?: { initialRate?: number },
) {
  let audio: AudioLike | null = null;
  let snapshot: PlaybackSnapshot = EMPTY;
  let onEndedCb: ((commentId: string) => void) | null = null;
  const subscribers = new Set<() => void>();

  function notify() {
    for (const cb of subscribers) cb();
  }
  function set(next: Partial<PlaybackSnapshot>) {
    snapshot = { ...snapshot, ...next };
    notify();
  }

  function ensureAudio(): AudioLike {
    if (audio) return audio;
    audio = createAudio();
    audio.addEventListener("timeupdate", () => {
      set({ positionMs: Math.round((audio?.currentTime ?? 0) * 1000) });
    });
    audio.addEventListener("ended", () => {
      const ended = snapshot.commentId;
      snapshot = EMPTY;
      notify();
      if (ended) onEndedCb?.(ended);
    });
    audio.addEventListener("pause", () => set({ playing: false }));
    audio.addEventListener("play", () => set({ playing: true }));
    return audio;
  }

  return {
    playVoiceNote(input: PlayInput, hooks?: { onEnded?: (commentId: string) => void }) {
      const el = ensureAudio();
      if (hooks?.onEnded) onEndedCb = hooks.onEnded;
      if (snapshot.commentId !== input.commentId) {
        el.src = input.url;
        el.currentTime = 0;
      }
      el.playbackRate = opts?.initialRate ?? readVoiceRate();
      snapshot = {
        commentId: input.commentId,
        author: input.author,
        playing: true,
        positionMs: snapshot.commentId === input.commentId ? snapshot.positionMs : 0,
        durationMs: input.durationMs,
        chipVisible: true,
      };
      notify();
      void el.play();
    },
    togglePlayback() {
      // playing lo escriben SOLO los listeners "play"/"pause" (ver ensureAudio):
      // no fijamos aquí un valor optimista para no pisar un evento en curso
      // (los eventos del audio son FIFO, así que el último refleja la realidad).
      if (!audio || !snapshot.commentId) return;
      if (snapshot.playing) audio.pause();
      else void audio.play();
    },
    stopPlayback() {
      if (audio) audio.pause();
      snapshot = EMPTY;
      notify();
    },
    seekToFraction(f: number) {
      if (!audio || !snapshot.commentId) return;
      const clamped = Math.max(0, Math.min(1, f));
      audio.currentTime = (snapshot.durationMs / 1000) * clamped;
      set({ positionMs: Math.round(snapshot.durationMs * clamped) });
    },
    applyRate(rate: number) {
      if (audio) audio.playbackRate = rate;
    },
    setChipVisible(commentId: string, visible: boolean) {
      if (snapshot.commentId !== commentId) return;
      set({ chipVisible: visible });
    },
    subscribePlayback(cb: () => void): () => void {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    getPlaybackSnapshot(): PlaybackSnapshot {
      return snapshot;
    },
  };
}

// ---- Singleton de la app -----------------------------------------------

const appStore = createPlaybackStore(() => new Audio());

/** Play (o re-play) de una nota: emite analítica y marca escuchado al acabar. */
export function playVoiceNote(input: PlayInput): void {
  logVoiceNote("playback_started", { durationMs: input.durationMs });
  appStore.playVoiceNote(input, {
    onEnded: (commentId) => {
      markListened(commentId);
      logVoiceNote("playback_completed", { durationMs: input.durationMs });
    },
  });
}

export const togglePlayback = appStore.togglePlayback;
export const stopPlayback = appStore.stopPlayback;
export const seekToFraction = appStore.seekToFraction;
export const applyPlaybackRate = appStore.applyRate;
export const setChipVisible = appStore.setChipVisible;
export const subscribePlayback = appStore.subscribePlayback;
export const getPlaybackSnapshot = appStore.getPlaybackSnapshot;

export function usePlaybackSnapshot(): PlaybackSnapshot {
  return useSyncExternalStore(subscribePlayback, getPlaybackSnapshot, () => EMPTY);
}
