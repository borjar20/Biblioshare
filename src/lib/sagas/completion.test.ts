import { describe, expect, it } from "vitest";
import { countCompleted, isMemberCompleted } from "./completion";
import type { DetailMember } from "./types";

const member = (over: Partial<DetailMember>): DetailMember => ({
  itemType: "book",
  itemId: "x",
  title: "Título",
  coverUrl: null,
  href: "/libro/x",
  position: null,
  role: null,
  placement: null,
  optional: false,
  status: null,
  groupSagaId: null,
  ownerSagaId: "owner",
  year: null,
  skipped: false,
  ...over,
});

describe("isMemberCompleted", () => {
  it("solo 'completed' cuenta", () => {
    expect(isMemberCompleted(member({ status: "completed" }))).toBe(true);
    expect(isMemberCompleted(member({ status: "in_progress" }))).toBe(false);
    expect(isMemberCompleted(member({ status: null }))).toBe(false);
  });

  it("un miembro ausente no está completado", () => {
    expect(isMemberCompleted(undefined)).toBe(false);
  });
});

describe("countCompleted", () => {
  it("cuenta solo las claves del orden que estén completadas", () => {
    const byKey = new Map<string, DetailMember>([
      ["book:a", member({ itemId: "a", status: "completed" })],
      ["book:b", member({ itemId: "b", status: "in_progress" })],
    ]);
    expect(countCompleted(["book:a", "book:b"], byKey)).toBe(1);
  });

  it("una clave sin miembro no suma", () => {
    expect(countCompleted(["book:fantasma"], new Map())).toBe(0);
  });
});
