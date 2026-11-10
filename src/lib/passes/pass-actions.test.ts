// src/lib/passes/pass-actions.test.ts
import { describe, expect, it } from "vitest";
import messages from "../../../messages/es.json";
import { intentStatus, intentsFor, primaryAction } from "./pass-actions";

describe("intentsFor", () => {
  it("libro y serie ofrecen tres; película, dos (no tiene «en curso»)", () => {
    expect(intentsFor("book")).toEqual(["want", "started", "done"]);
    expect(intentsFor("series")).toEqual(["want", "started", "done"]);
    expect(intentsFor("movie")).toEqual(["want", "done"]);
  });
  it("cada intención deja un estado", () => {
    expect(intentStatus("want")).toBe("planned");
    expect(intentStatus("started")).toBe("in_progress");
    expect(intentStatus("done")).toBe("completed");
  });
});

describe("primaryAction", () => {
  it.each([
    ["book", "planned", "start"], ["book", "in_progress", "session"], ["book", "completed", "again"], ["book", "dropped", "resume"],
    ["series", "planned", "episode"], ["series", "in_progress", "episode"], ["series", "completed", "again"], ["series", "dropped", "resume"],
    ["movie", "planned", "watched"], ["movie", "in_progress", "watched"], ["movie", "completed", "again"], ["movie", "dropped", "resume"],
  ] as const)("%s %s → %s", (type, status, action) => {
    expect(primaryAction(type, status)).toBe(action);
  });
});

describe("textos", () => {
  const item = messages.item as unknown as {
    intent: Record<string, Record<string, string>>;
    action: Record<string, Record<string, string>>;
  };
  it("hay texto para cada intención y tipo que se ofrece", () => {
    for (const type of ["book", "movie", "series"] as const) {
      for (const intent of intentsFor(type)) expect(item.intent[intent][type], `${intent}.${type}`).toBeTruthy();
    }
  });
  it("hay texto para cada acción principal alcanzable", () => {
    for (const type of ["book", "movie", "series"] as const) {
      for (const status of ["planned", "in_progress", "completed", "dropped"] as const) {
        const action = primaryAction(type, status);
        expect(item.action[action][type], `${action}.${type}`).toBeTruthy();
      }
    }
  });
  it("los textos acordados", () => {
    expect(item.intent.want.book).toBe("Quiero leerlo");
    expect(item.intent.done.movie).toBe("Ya la vi");
    expect(item.action.watched.movie).toBe("Marcar vista");
    expect(item.action.again.movie).toBe("Registrar otro visionado");
  });
});
