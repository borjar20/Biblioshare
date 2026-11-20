import { describe, expect, it } from "vitest";
import { PAGE_CASES, pageFixture } from "@/lib/editions/edition-pages.test-fixture";
import { resolveReadingPages } from "./reading-strip";

// Antes vivía en log-panel.edition-pages.test.tsx (#901): la precedencia de
// páginas (edición del pase → páginas de la obra) la aplica ahora la tira.
describe("resolveReadingPages aplica la precedencia de páginas (#901)", () => {
  it.each(PAGE_CASES)("$name", (sample) => {
    const { pass, editions } = pageFixture(sample);
    const r = resolveReadingPages({ passes: [pass], editions, workTotalUnits: sample.workPages, position: { page: 100 } });
    expect(r.totalPages).toBe(sample.expectedPages);
    expect(r.currentPage).toBe(100);
    expect(r.openPass?.id).toBe(pass.id);
  });
});
