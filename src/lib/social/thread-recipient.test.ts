import { describe, expect, it } from "vitest";
import { threadRecipients } from "./thread-recipient";

const margin = { kind: "margin_encounter", owner_id: "author", audience_id: "reader" };

describe("threadRecipients", () => {
  it("en un hilo de margen, el lector avisa al autor", () => {
    expect(threadRecipients(margin, "reader")).toEqual(["author"]);
  });
  it("en un hilo de margen, el autor avisa al lector", () => {
    expect(threadRecipients(margin, "author")).toEqual(["reader"]);
  });
  it("fuera de los hilos de margen solo avisa al dueño", () => {
    expect(threadRecipients({ kind: "post", owner_id: "a", audience_id: "a" }, "b")).toEqual(["a"]);
    expect(threadRecipients({ kind: "post", owner_id: "a", audience_id: "a" }, "a")).toEqual([]);
  });
});
