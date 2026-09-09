/** Read a stable, ordered query without silently stopping at the API row cap. */
export async function readAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  const size = 200;
  for (let offset = 0; ; offset += size) {
    const result = await page(offset, offset + size - 1);
    if (result.error) throw result.error;
    const data = result.data ?? [];
    rows.push(...data);
    if (data.length < size) return rows;
  }
}
