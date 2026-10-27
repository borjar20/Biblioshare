import { describe, expect, it } from "vitest";
import type { MemberGroup } from "./group-members";
import { deriveSubsagaDoors } from "./subsaga-doors";
import type { DetailMember, MemberStatus } from "./types";

function m(n: number, over: Partial<DetailMember> = {}): DetailMember {
  return {
    itemType: "book", itemId: `b${n}`, title: `Libro ${n}`, coverUrl: `c${n}.jpg`, href: `/libro/b${n}`,
    position: n, role: null, placement: "fijo", optional: false,
    status: null as MemberStatus, groupSagaId: "s", ownerSagaId: "s", year: null, skipped: false,
    ...over,
  };
}
function g(sagaId: string | null, members: DetailMember[], name: string | null = sagaId): MemberGroup {
  return { sagaId, name, accent: "verde", members, positionInParent: null, placementInParent: null };
}

describe("deriveSubsagaDoors", () => {
  it("excluye el grupo directo y el grupo vacío, y conserva el orden", () => {
    const doors = deriveSubsagaDoors([g("b", [m(1)]), g(null, [m(2)]), g("e", []), g("a", [m(3)])]);
    expect(doors.map((d) => d.sagaId)).toEqual(["b", "a"]);
  });
  it("counted excluye las opcionales y completed cuenta las terminadas", () => {
    const [d] = deriveSubsagaDoors([
      g("a", [m(1, { status: "completed" }), m(2, { optional: true, status: "completed" }), m(3)]),
    ]);
    expect(d.counted).toBe(2);
    expect(d.completed).toBe(1);
  });
  it("estados done, started (in_progress) y todo", () => {
    const doors = deriveSubsagaDoors([
      g("d", [m(1, { status: "completed" })]),
      g("s", [m(1, { status: "in_progress" }), m(2)]),
      g("t", [m(1), m(2)]),
    ]);
    expect(doors.map((d) => d.state)).toEqual(["done", "started", "todo"]);
  });
  it("covers: hasta 3 y salta las nulas", () => {
    const [d] = deriveSubsagaDoors([
      g("a", [m(1, { coverUrl: null }), m(2), m(3), m(4), m(5)]),
    ]);
    expect(d.covers).toEqual(["c2.jpg", "c3.jpg", "c4.jpg"]);
  });
  it("href = sagaHref y lleva nombre y acento", () => {
    const [d] = deriveSubsagaDoors([g("abc", [m(1)], "Hijas")]);
    expect(d).toMatchObject({ href: "/saga/abc", name: "Hijas", accent: "verde" });
  });
});
