import { describe, it, expect } from "vitest";
import { parseGoodreads } from "./parse-goodreads";

// Cabeceras mínimas de un export real de Goodreads (library_export.csv).
const HEADER =
  "Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Publisher,Binding,Exclusive Shelf,Date Read";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("parseGoodreads", () => {
  it("mapea estante, rating (x2) y fecha de lectura", () => {
    const rows = parseGoodreads(
      csv(
        'Dune,Frank Herbert,="0441172717",="9780441172719",4,412,Ace,Paperback,read,2025/08/24'
      )
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.title).toBe("Dune");
    expect(r.author).toBe("Frank Herbert");
    expect(r.isbn).toBe("9780441172719"); // prefiere ISBN13
    expect(r.pageCount).toBe(412);
    expect(r.status).toBe("completed");
    expect(r.rating).toBe(8); // 4 estrellas * 2
    expect(r.bookFormat).toBe("paperback");
    expect(r.diaryDates).toEqual([{ startedOn: null, finishedOn: "2025-08-24" }]);
  });

  it("mapea currently-reading y to-read; sin rating → null", () => {
    const rows = parseGoodreads(
      csv(
        'Leviatán,Autor A,="",="",0,,,,currently-reading,',
        'Pendiente,Autor B,="",="",0,,,,to-read,'
      )
    );
    expect(rows[0].status).toBe("in_progress");
    expect(rows[0].rating).toBeNull();
    expect(rows[0].diaryDates).toEqual([]);
    expect(rows[1].status).toBe("planned");
  });

  it("ignora filas sin título", () => {
    const rows = parseGoodreads(csv(',Autor,="",="",0,,,,read,'));
    expect(rows).toHaveLength(0);
  });
});
