import { describe, expect, it } from "vitest";
import {
  VOICE_ALLOWED_TYPES,
  VOICE_MAX_PER_THREAD,
  baseMimeType,
  voiceGate,
  type VoiceGateComment,
} from "./voice-note-limits";

const texto = (isOwn = false): VoiceGateComment => ({ isOwn, hasAudio: false, createdAt: "2026-08-26T10:00:00Z" });
const audio = (isOwn: boolean, createdAt: string): VoiceGateComment => ({ isOwn, hasAudio: true, createdAt });

describe("baseMimeType", () => {
  it("recorta los codecs y normaliza", () => {
    expect(baseMimeType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseMimeType("AUDIO/MP4")).toBe("audio/mp4");
  });
  it("los dos mimes del MVP tienen extensión", () => {
    expect(VOICE_ALLOWED_TYPES.get("audio/webm")).toBe("webm");
    expect(VOICE_ALLOWED_TYPES.get("audio/mp4")).toBe("m4a");
  });
});

describe("voiceGate", () => {
  it("hilo vacío: permitido", () => {
    expect(voiceGate([])).toEqual({ allowed: true });
  });
  it("bloquea al llegar a 3 audios propios en el hilo", () => {
    const comments = [
      audio(true, "2026-08-26T10:00:00Z"),
      audio(true, "2026-08-26T10:01:00Z"),
      audio(true, "2026-08-26T10:02:00Z"),
      texto(), // otro ya respondió: el freno que actúa es el de 3, no el consecutivo
    ];
    expect(voiceGate(comments)).toEqual({ allowed: false, reason: "thread_limit" });
  });
  it("los audios de OTROS no cuentan para mi límite", () => {
    const comments = [audio(false, "1"), audio(false, "2"), audio(false, "3"), texto()];
    expect(voiceGate(comments)).toEqual({ allowed: true });
  });
  it("bloquea dos audios propios consecutivos (el último del hilo es mi audio)", () => {
    const comments = [texto(), audio(true, "2026-08-26T10:05:00Z")];
    expect(voiceGate(comments)).toEqual({ allowed: false, reason: "consecutive" });
  });
  it("cuando alguien interviene después de mi audio, se desbloquea", () => {
    const comments = [audio(true, "2026-08-26T10:00:00Z"), texto()];
    // texto() sin createdAt posterior no vale: el gate ordena por createdAt
    const despues: VoiceGateComment = { isOwn: false, hasAudio: false, createdAt: "2026-08-26T10:06:00Z" };
    expect(voiceGate([comments[0]!, despues])).toEqual({ allowed: true });
  });
  it("mi TEXTO posterior también desbloquea el freno consecutivo", () => {
    const comments = [audio(true, "2026-08-26T10:00:00Z"), { isOwn: true, hasAudio: false, createdAt: "2026-08-26T10:01:00Z" }];
    expect(voiceGate(comments)).toEqual({ allowed: true });
  });
});
