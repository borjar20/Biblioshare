// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  armVoice, click, commentView, copy, editOwnComment, expectDisarmed, expectVoiceUpload,
  holdVoiceUpload, installMediaBoundary, renderComposer, replyTo, stopToPreview, threadProps,
} from "./voice-mode.test-fixture";
import { PostThread } from "./post-thread";

let media: ReturnType<typeof installMediaBoundary>;
beforeEach(() => {
  media = installMediaBoundary();
  renderComposer(<PostThread {...threadProps} />);
});
afterEach(() => { cleanup(); media.restore(); });

describe("PostThread: cambiar el contexto de voz desde sus controles", () => {
  it("desarma voz raíz al responder a un comentario sin pedir de nuevo el micrófono", async () => {
    await armVoice(copy.writeComment);
    await replyTo("ana");
    expectDisarmed(media);
    expect((screen.getByPlaceholderText(copy.writeReply) as HTMLTextAreaElement).value).toBe("@ana ");
  });

  it("desarma al responder a otro comentario y sigue desarmado al volver al anterior", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await replyTo("beto");
    expectDisarmed(media);
    expect((screen.getByPlaceholderText(copy.writeReply) as HTMLTextAreaElement).value).toBe("@beto ");
    await replyTo("ana");
    expectDisarmed(media);
    expect((screen.getByPlaceholderText(copy.writeReply) as HTMLTextAreaElement).value).toBe("@ana ");
  });

  it("desarma incluso al volver a pulsar Responder en la misma raíz", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await replyTo("ana");
    expectDisarmed(media);
    expect(screen.getByPlaceholderText(copy.writeReply)).toBeTruthy();
  });

  it("entrar a editar desarma y cancelar la edición conserva el composer raíz de texto", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await editOwnComment();
    expectDisarmed(media);
    expect(commentView("own").getByDisplayValue("Comentario de own")).toBeTruthy();
    await click(commentView("own").getByRole("button", { name: copy.cancel }));
    expectDisarmed(media);
    expect(screen.getByPlaceholderText(copy.writeComment)).toBeTruthy();
  });

  it("cancelar la respuesta con voz activa vuelve a texto raíz sin grabación implícita", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await click(screen.getByRole("button", { name: copy.cancel }));
    expectDisarmed(media);
    expect(screen.queryByPlaceholderText(copy.writeReply)).toBeNull();
    expect((screen.getByPlaceholderText(copy.writeComment) as HTMLTextAreaElement).value).toBe("");
  });

  it("descartar la grabación conserva la respuesta de texto y después permite cancelarla", async () => {
    await replyTo("ana");
    await armVoice(copy.writeReply);
    await click(screen.getByRole("button", { name: copy.voice.cancel }));
    expectDisarmed(media);
    expect(screen.getByPlaceholderText(copy.writeReply)).toBeTruthy();
    await click(screen.getByRole("button", { name: copy.cancel }));
    expectDisarmed(media);
    expect(screen.queryByPlaceholderText(copy.writeReply)).toBeNull();
    expect(screen.getByPlaceholderText(copy.writeComment)).toBeTruthy();
  });

  it("publicar voz cierra la respuesta antes de resolver el envío y mantiene su destino", async () => {
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
