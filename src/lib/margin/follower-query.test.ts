import { describe, expect, it } from "vitest";
import { sanitizeFollowerQuery } from "./follower-query";

describe("sanitizeFollowerQuery", () => {
  it("quita lo que rompe o inyecta en un filtro .or() de PostgREST", () => {
    expect(sanitizeFollowerQuery("a,username.eq.x")).toBe("ausernameeqx");
    expect(sanitizeFollowerQuery("ana)*(\\\"")).toBe("ana");
    expect(sanitizeFollowerQuery("100%_real")).toBe("100real");
  });
  it("respeta letras, acentos y espacios simples", () => {
    expect(sanitizeFollowerQuery("  María   José ")).toBe("María José");
  });
});
