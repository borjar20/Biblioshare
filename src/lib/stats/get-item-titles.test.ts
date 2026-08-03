import { describe, it, expect } from "vitest";
import { keyFor } from "./get-item-titles";

describe("keyFor", () => {
  it("compone la clave tipo:id", () => {
    expect(keyFor("movie", "abc")).toBe("movie:abc");
    expect(keyFor("book", "x")).toBe("book:x");
  });
});
