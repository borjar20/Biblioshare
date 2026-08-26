// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addVoiceComment = vi.hoisted(() => vi.fn());
vi.mock("@/lib/social/voice-note-actions", () => ({ addVoiceComment }));

import { useVoiceNoteSubmit } from "./use-voice-note-submit";

const rec = {
  blob: new Blob(["x"], { type: "audio/webm" }),
  mimeType: "audio/webm",
  durationMs: 5000,
  peaks: [10, 20],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useVoiceNoteSubmit", () => {
  it("publica: entra en pending y desaparece al ok", async () => {
    addVoiceComment.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    expect(result.current.pending).toHaveLength(1);
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
    const fd = addVoiceComment.mock.calls[0]![1] as FormData;
    expect((fd.get("file") as File).type).toBe("audio/webm");
    expect(fd.get("durationMs")).toBe("5000");
    expect(JSON.parse(fd.get("peaks") as string)).toEqual([10, 20]);
  });

  it("fallo → 2 reintentos silenciosos → estado failed", async () => {
    vi.useFakeTimers();
    addVoiceComment.mockResolvedValue({ ok: false, error: "unknown" });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(addVoiceComment).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos
    expect(result.current.pending[0]!.status).toBe("failed");
  });

  it("los errores de freno NO se reintentan (el reintento no los va a arreglar)", async () => {
    vi.useFakeTimers();
    addVoiceComment.mockResolvedValue({ ok: false, error: "voice_thread_limit" });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(addVoiceComment).toHaveBeenCalledTimes(1);
    expect(result.current.pending[0]!.status).toBe("failed");
  });

  it("retry relanza y discard elimina", async () => {
    addVoiceComment.mockResolvedValue({ ok: false, error: "voice_daily_limit" });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    await waitFor(() => expect(result.current.pending[0]!.status).toBe("failed"));
    addVoiceComment.mockResolvedValue({ ok: true });
    act(() => result.current.retry(result.current.pending[0]!.localId));
    await waitFor(() => expect(result.current.pending).toHaveLength(0));
  });

  it("discard cancela el reintento programado: no vuelve a llamar tras el timeout", async () => {
    vi.useFakeTimers();
    addVoiceComment.mockResolvedValue({ ok: false, error: "unknown" });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    // Deja que el primer intento falle y programe el reintento (800ms), pero
    // descarta ANTES de que dispare.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(addVoiceComment).toHaveBeenCalledTimes(1);
    act(() => result.current.discard(result.current.pending[0]!.localId));
    expect(result.current.pending).toHaveLength(0);
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    // Sin el timer cancelado, el setTimeout de 800ms habría disparado un
    // segundo intento pese al discard.
    expect(addVoiceComment).toHaveBeenCalledTimes(1);
  });

  it("retry() sobre una nota ya descartada en el mismo lote no revienta (guard de attempt)", async () => {
    // `retry` cierra sobre el `pending` de SU último render; `discard` muta
    // optsRef de forma síncrona pero `setPending` es async/por lotes, así
    // que llamar discard()+retry() dentro del mismo act() reproduce la
    // ventana real: retry ve la nota (closure vieja) mientras optsRef ya no
    // la tiene. Sin el guard, `attempt()` leía `optsRef.current.get(id)!`
    // sobre `undefined` y tiraba un TypeError silencioso.
    addVoiceComment.mockResolvedValue({ ok: false, error: "voice_daily_limit" });
    const { result } = renderHook(() => useVoiceNoteSubmit("target-1"));
    act(() => result.current.publish(rec, { parentId: null, isSpoiler: false }));
    await waitFor(() => expect(result.current.pending[0]!.status).toBe("failed"));
    const localId = result.current.pending[0]!.localId;
    const callsBefore = addVoiceComment.mock.calls.length;

    act(() => {
      result.current.discard(localId);
      result.current.retry(localId);
    });

    // El guard corta ANTES de leer `opts` -- addVoiceComment no se vuelve a
    // llamar, y la nota ya descartada sigue fuera de `pending` (el `.map()`
    // de retry sobre el array post-discard es un no-op).
    expect(addVoiceComment).toHaveBeenCalledTimes(callsBefore);
    expect(result.current.pending).toHaveLength(0);
  });
});
