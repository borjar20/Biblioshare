import { describe, expect, it } from "vitest";
import { rankFollowers, type FollowerCandidate } from "./follower-query";

const p = (username: string, display_name: string | null = null): FollowerCandidate => ({
  user_id: username, username, display_name, avatar_url: null,
});

describe("rankFollowers", () => {
  it("encuentra usernames con guion bajo y punto", () => {
    const all = [p("juan_p"), p("ana.lopez"), p("otro")];
    expect(rankFollowers(all, "juan_p").map((x) => x.username)).toEqual(["juan_p"]);
    expect(rankFollowers(all, "ana.l").map((x) => x.username)).toEqual(["ana.lopez"]);
  });
  it("ignora tildes y mayúsculas, en username y en nombre", () => {
    const all = [p("mj", "María José"), p("zed")];
    expect(rankFollowers(all, "MARIA").map((x) => x.username)).toEqual(["mj"]);
    expect(rankFollowers([p("maría")], "maria")).toHaveLength(1);
  });
  it("trata comodines y comas como texto, sin casar de más", () => {
    const all = [p("abc"), p("a_c")];
    expect(rankFollowers(all, "a_").map((x) => x.username)).toEqual(["a_c"]);
    expect(rankFollowers(all, "a,b")).toEqual([]);
    expect(rankFollowers(all, "%%")).toEqual([]);
  });
  it("prefijo primero, luego alfabético", () => {
    const all = [p("zeta_ana"), p("ana_b"), p("ana_a"), p("xana")];
    expect(rankFollowers(all, "ana").map((x) => x.username)).toEqual(["ana_a", "ana_b", "xana", "zeta_ana"]);
  });
  it("máximo 8 y mínimo 2 caracteres", () => {
    const all = Array.from({ length: 20 }, (_, i) => p(`user${String(i).padStart(2, "0")}`));
    expect(rankFollowers(all, "user")).toHaveLength(8);
    expect(rankFollowers(all, "u")).toEqual([]);
  });
});
