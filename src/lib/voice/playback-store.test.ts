// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createPlaybackStore, type AudioLike } from "./playback-store";

function fakeAudio(): AudioLike & { listeners: Map<string, () => void> } {
  const listeners = new Map<string, () => void>();
  return {
    src: "",
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    listeners,
    play: vi.fn(async function (this: AudioLike) {
      (this as { paused: boolean }).paused = false;
      listeners.get("play")?.();
    }),
    pause: vi.fn(function (this: AudioLike) {
      (this as { paused: boolean }).paused = true;
      listeners.get("pause")?.();
    }),
    addEventListener(type: string, cb: () => void) {
      listeners.set(type, cb);
    },
    removeEventListener() {},
  };
}

const nota = { commentId: "c1", url: "https://x/a?t=1", durationMs: 10_000, author: "Ana" };

describe("playback-store", () => {
  it("play carga la URL, aplica la velocidad guardada y arranca", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio, { initialRate: 1.5 });
    store.playVoiceNote(nota);
    expect(audio.src).toBe(nota.url);
    expect(audio.playbackRate).toBe(1.5);
    expect(store.getPlaybackSnapshot()).toMatchObject({ commentId: "c1", playing: true, durationMs: 10_000 });
  });

  it("play de OTRO comentario sustituye al anterior (un solo audio a la vez)", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    store.playVoiceNote(nota);
    store.playVoiceNote({ ...nota, commentId: "c2", url: "https://x/b?t=1" });
    expect(audio.src).toBe("https://x/b?t=1");
    expect(store.getPlaybackSnapshot().commentId).toBe("c2");
  });

  it("toggle pausa y reanuda el activo", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    store.playVoiceNote(nota);
    store.togglePlayback();
    expect(store.getPlaybackSnapshot().playing).toBe(false);
    store.togglePlayback();
    expect(store.getPlaybackSnapshot().playing).toBe(true);
  });

  it("pausa→reanuda rápido (doble toggle) deja playing:true sin que un pause quede pendiente", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    store.playVoiceNote(nota);
    expect(store.getPlaybackSnapshot().playing).toBe(true);

    store.togglePlayback(); // pausa
    expect(store.getPlaybackSnapshot().playing).toBe(false);
    store.togglePlayback(); // reanuda
    expect(store.getPlaybackSnapshot().playing).toBe(true);
  });

  it("playing lo fijan solo los eventos: un pause tardío seguido del play real deja playing:true", () => {
    // Simula el orden FIFO real de HTMLMediaElement: un evento "pause" que
    // llegaba con retraso (de una pausa ya superada) se procesa, pero como
    // togglePlayback ya no escribe estado optimista, el "play" que llega
    // justo después (el evento real, más reciente) es quien manda al final.
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    store.playVoiceNote(nota);
    expect(store.getPlaybackSnapshot().playing).toBe(true);

    audio.listeners.get("pause")!(); // pause tardío/obsoleto
    expect(store.getPlaybackSnapshot().playing).toBe(false);
    audio.listeners.get("play")!(); // el play real, llega después
    expect(store.getPlaybackSnapshot().playing).toBe(true);
  });

  it("seek por fracción mueve currentTime", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    store.playVoiceNote(nota);
    store.seekToFraction(0.5);
    expect(audio.currentTime).toBeCloseTo(5);
  });

  it("ended limpia el activo y notifica", () => {
    const audio = fakeAudio();
    const store = createPlaybackStore(() => audio);
    const onEnded = vi.fn();
    store.playVoiceNote(nota, { onEnded });
    audio.listeners.get("ended")!();
    expect(onEnded).toHaveBeenCalledWith("c1");
    expect(store.getPlaybackSnapshot().commentId).toBeNull();
  });
});
