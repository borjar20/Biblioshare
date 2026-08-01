export function itemsMissingFromLibrary<
  T extends { viewerHasActivePass?: boolean },
>(items: readonly T[]): T[] {
  return items.filter((item) => !item.viewerHasActivePass);
}
