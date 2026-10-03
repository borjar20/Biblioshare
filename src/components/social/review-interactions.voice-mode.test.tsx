// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  armVoice, click, commentView, controlsFor, copy, editOwnComment, expectDisarmed, expectVoiceUpload,
  holdVoiceUpload, installMediaBoundary, renderComposer, replyTo, stopToPreview, threadProps,
} from "./voice-mode.test-fixture";
import { ReviewInteractions } from "./review-interactions";

let media: ReturnType<typeof installMediaBoundary>;
beforeEach(async () => {
  media = installMediaBoundary();
  renderComposer(<ReviewInteractions {...threadProps} voiceEnabled />);
  await click(screen.getByRole("button", { name: "4 comentarios" }));
});
afterEach(() => { cleanup(); media.restore(); });

describe("ReviewInteractions: cambiar el contexto de voz desde sus controles", () => {
  it("desarma voz raíz al responder y no vuelve a pedir audio en el nuevo contexto", async () => {
    await armVoice(copy.writeComment);
    await replyTo("ana");
    expectDisarmed(media);
    expect((screen.getByPlaceholderText(copy.writeReply) as HTMLTextAreaElement).value).toBe("@ana ");
    expect(screen.getByPlaceholderText(copy.writeComment)).toBeTruthy();
  });

  it("cambiar a otro hilo y volver al primero mantiene la grabadora desarmada", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await replyTo("beto");
    expectDisarmed(media);
    expect((screen.getByPlaceholderText(copy.writeReply) as HTMLTextAreaElement).value).toBe("@beto ");
    await replyTo("ana");
    expectDisarmed(media);
    expect((screen.getByPlaceholderText(copy.writeReply) as HTMLTextAreaElement).value).toBe("@ana ");
  });

  it("pulsar Responder de nuevo en la misma raíz también desarma", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await replyTo("ana");
    expectDisarmed(media);
    expect(screen.getByPlaceholderText(copy.writeReply)).toBeTruthy();
  });

  it("responder a otro comentario dentro de la misma raíz desarma y cambia la mención", async () => {
    const root = document.getElementById("c-ana")!;
    await click(within(root.parentElement!).getByRole("button", { name: /Ver respuestas/ }));
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await replyTo("ana-child");
    expectDisarmed(media);
    expect((screen.getByPlaceholderText(copy.writeReply) as HTMLTextAreaElement).value).toBe("@carla ");
  });

  it("entrar a editar desde voz raíz desarma y deja la edición de texto", async () => {
    await armVoice(copy.writeComment);
    await editOwnComment();
    expectDisarmed(media);
    expect(commentView("own").getByDisplayValue("Comentario de own")).toBeTruthy();
    await click(commentView("own").getByRole("button", { name: copy.cancel }));
    expectDisarmed(media);
    expect(screen.getByPlaceholderText(copy.writeComment)).toBeTruthy();
  });

  it("editar desde voz de respuesta no deja armado el hilo al volver a responder", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await editOwnComment();
    expectDisarmed(media);
    expect(commentView("own").getByDisplayValue("Comentario de own")).toBeTruthy();
    await click(commentView("own").getByRole("button", { name: copy.cancel }));
    await replyTo("ana");
    expectDisarmed(media);
    expect(screen.getByPlaceholderText(copy.writeReply)).toBeTruthy();
  });

  it("descartar voz y cancelar su respuesta vuelve a texto y exige otro clic en el micrófono", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await click(screen.getByRole("button", { name: copy.voice.cancel }));
    expectDisarmed(media);
    await click(controlsFor(screen.getByPlaceholderText(copy.writeReply)).getByRole("button", { name: copy.cancel }));
    expect(screen.queryByPlaceholderText(copy.writeReply)).toBeNull();
    await replyTo("ana");
    expectDisarmed(media);
    await armVoice(copy.writeReply);
    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("cancelar una respuesta también desarma la voz raíz activa a la vez", async () => {
    await replyTo("ana");
    await armVoice(copy.writeComment);
    await click(controlsFor(screen.getByPlaceholderText(copy.writeReply)).getByRole("button", { name: copy.cancel }));
    expect(screen.queryByPlaceholderText(copy.writeReply)).toBeNull();
    expectDisarmed(media);
    expect(screen.getByPlaceholderText(copy.writeComment)).toBeTruthy();
  });

  it("publicar voz cierra la respuesta antes del ACK y conserva la fila pendiente en el hilo", async () => {
    const release = holdVoiceUpload();
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await stopToPreview();
    await click(screen.getByTestId("voice-publish"));
    expectVoiceUpload("ana");
    expectDisarmed(media);
    expect(screen.getByTestId("voice-pending").textContent).toContain(copy.voice.publishing);
    expect(screen.queryByPlaceholderText(copy.writeReply)).toBeNull();
    expect(screen.queryByRole("button", { name: copy.cancel })).toBeNull();
    expect(screen.getByPlaceholderText(copy.writeComment)).toBeTruthy();
    await release();
    expect(screen.queryByTestId("voice-pending")).toBeNull();
    expect(screen.getByPlaceholderText(copy.writeComment)).toBeTruthy();
  });
});
