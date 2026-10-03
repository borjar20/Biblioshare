import { describe, expect, it } from "vitest";
import { getLibraryView } from "@/lib/library/get-library-items";
import { getCollection } from "@/lib/library/collections";
import { getProgress, passPercent } from "./progress";
import { PAGE_CASES, PAGE_COLLECTION, PAGE_USER, pageFixture } from "@/lib/editions/edition-pages.test-fixture";

describe("páginas de edición en la hidratación de biblioteca y colección (#901)", () => {
  it.each(PAGE_CASES)("biblioteca: $name", async (sample) => {
    const { client } = pageFixture(sample);
    const view = await getLibraryView(client, PAGE_USER, {});
    expect(view.items).toHaveLength(1);
    expect(view.items[0].pageCount).toBe(sample.expectedPages);
    const progress = getProgress(view.items[0]);
    if (sample.expectedPages === null) expect(progress).toBeNull();
    else {
      expect(progress).toEqual({ current: 100, total: sample.expectedPages, label: `100/${sample.expectedPages}` });
      expect(passPercent(progress!.current, progress!.total)).toBe(sample.expectedPercent);
    }
  });

  it.each(PAGE_CASES)("colección: $name", async (sample) => {
    const { client } = pageFixture(sample);
    const detail = await getCollection(client, PAGE_USER, PAGE_COLLECTION);
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0].pageCount).toBe(sample.expectedPages);
  });
});
