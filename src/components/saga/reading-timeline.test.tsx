// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineSection } from "@/lib/sagas/derive-timeline";
import { ReadingTimeline } from "./reading-timeline";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key === "timelineContinuation" ? "(cont.)" : key,
}));
vi.mock("server-only", () => ({}));
vi.mock("./timeline/timeline-entry-row", () => ({ TimelineEntryRow: ({ row }: { row: { node: { label: string } } }) => <div>{row.node.label}</div> }));

afterEach(cleanup);

const sections: TimelineSection[] = [
  {
    groupSagaId: "era",
    groupName: "Era Uno",
    accent: "verde",
    continuation: true,
    rows: [
      {
        kind: "entry",
        no: 2,
        node: {
          id: "i:book:b",
          kind: "item",
          x: 0,
          y: 0,
          level: "principal",
          orderNo: 1,
          label: "Libro dos",
          accent: "verde",
          status: null,
          role: null,
          coverUrl: null,
          covers: [],
          href: "/libro/b",
          memberCount: null,
          groupSagaId: "era",
          groupName: "Era Uno",
          step: null,
          tandem: null,
          windowReason: null,
          optional: false,
          skipped: false,
          ownerSagaId: "owner",
        },
        branches: [],
      },
    ],
  },
];

describe("ReadingTimeline · bloque partido", () => {
  it("muestra el rótulo (cont.) en la cabecera del segmento reanudado", async () => {
    render(
      await ReadingTimeline({
        sections,
        sagaId: null,
        showOptional: true,
        optionalCount: 0,
        roleCounts: [],
        activeRole: null,
        baseHref: "/saga/owner",
      }),
    );

    expect(screen.getByRole("heading", { name: "Era Uno (cont.)" })).toBeTruthy();
  });
});
