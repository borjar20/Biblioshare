import { transform, type Declaration, type StyleRule } from "lightningcss";
import { parse, type AtRule, type Rule } from "postcss";
import { describe, expect, it } from "vitest";
import { compilePetSpriteCss } from "./pet-sprite-css.test-support";

const css = compilePetSpriteCss();
const stripNames = ["stripIdle", "stripSleepy", "stripSad", "stripJoy", "stripReady"] as const;
const topKeyframes = css.root.nodes.filter(
  (node): node is AtRule => node.type === "atrule" && node.name === "keyframes",
);

function keyframes(name: string, scope = css.root): AtRule {
  const matches: AtRule[] = [];
  scope.walkAtRules("keyframes", (rule) => { if (rule.params === css.names[name]) matches.push(rule); });
  expect(matches, `keyframes existente y único: ${name}`).toHaveLength(1);
  return matches[0];
}

// Sustituye dos juegos de variables conocidos en la declaración REAL. El parser,
// no una implementación propia de calc(), resuelve el desplazamiento en píxeles.
function positionAt(rule: AtRule, endpoint: "from" | "to", frames: number, cell: number) {
  const frame = rule.nodes?.find(
    (node): node is Rule => node.type === "rule" &&
      [endpoint, endpoint === "from" ? "0%" : "100%"].includes(node.selector),
  );
  expect(frame, `frame ${endpoint}`).toBeDefined();
  const positions: string[] = [];
  frame!.walkDecls("background-position-x", (declaration) => {
    const value = declaration.value
      .replaceAll("var(--pet-frames)", String(frames))
      .replaceAll("var(--pet-cell)", `${cell}px`);
    const resolved = transform({
      filename: "strip-frame.css",
      code: Buffer.from(`div { background-position-x: ${value}; }`),
      minify: true,
      errorRecovery: false,
    });
    parse(resolved.code.toString()).walkDecls("background-position-x", (node) => { positions.push(node.value); });
  });
  return positions;
}

function animation(rule: StyleRule, important: boolean) {
  const declarations = important
    ? rule.declarations?.importantDeclarations
    : rule.declarations?.declarations;
  const values = declarations?.filter(
    (node): node is Extract<Declaration, { property: "animation" }> => node.property === "animation",
  );
  expect(values).toHaveLength(1);
  expect(values![0].value).toHaveLength(1);
  return values![0].value[0];
}

function reducedMotion() {
  const media = css.ast.rules.filter((rule) => rule.type === "media");
  expect(media).toHaveLength(1);
  expect(media[0].value.query.mediaQueries).toEqual([{
    qualifier: null,
    mediaType: "all",
    condition: {
      type: "feature",
      value: { type: "plain", name: "prefers-reduced-motion", value: { type: "ident", value: "reduce" } },
    },
  }]);
  return media[0].value.rules.filter((rule) => rule.type === "style");
}

describe("PetSprite: contrato del CSS real", () => {
  it.each(stripNames)("%s tiene un recorrido completo y proporcional a frames y celda", (name) => {
    const strip = keyframes(name);
    expect(topKeyframes).toContain(strip);
    expect(strip.nodes?.filter((node) => node.type === "rule")).toHaveLength(2);
    expect(positionAt(strip, "from", 9, 96)).toEqual(["0"]);
    expect(positionAt(strip, "to", 9, 96)).toEqual(["-864px"]);
    expect(positionAt(strip, "to", 2, 104)).toEqual(["-208px"]);
  });

  it("los cinco nombres locales se exportan distintos y apuntan a keyframes compilados", () => {
    const names = stripNames.map((name) => css.names[name]);
    expect(names.every((name) => typeof name === "string" && name.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(5);
    for (const name of stripNames) {
      expect(css.names[name]).not.toBe(name);
      expect(topKeyframes.some((rule) => rule.params === css.names[name])).toBe(true);
    }
  });

  it("evolve normal conserva destello y escala, una sola vez durante 1.2 s", () => {
    const normal = css.ast.rules.filter((rule) => rule.type === "style");
    const rule = normal.find((candidate) => candidate.value.selectors.some(
      (selector) => selector.some((part) => part.type === "attribute" && part.name === "data-reaction"),
    ));
    expect(rule).toBeDefined();
    expect(rule!.value.selectors).toEqual([[
      { type: "class", name: css.names.root },
      {
        type: "attribute", namespace: null, name: "data-reaction",
        operation: { operator: "equal", value: "evolve", caseSensitivity: "case-sensitive" },
      },
    ]]);
    const effect = animation(rule!.value, false);
    expect(effect.name).toEqual({ type: "ident", value: css.names.evolve });
    expect(effect.duration.type).toBe("seconds");
    expect(effect.duration.value).toBeCloseTo(1.2);
    expect(effect.iterationCount).toEqual({ type: "number", value: 1 });
    const evolve = keyframes("evolve");
    const middle = evolve.nodes?.find((node): node is Rule => node.type === "rule" && node.selector === "40%");
    expect(middle).toBeDefined();
    expect(middle!.nodes?.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]))
      .toEqual([["filter", "brightness(2.2)"], ["transform", "scale(1.15)"]]);
  });

  it("reduce cancela el strip con important para superar los longhands inline", () => {
    const rules = reducedMotion();
    const stopped = rules.find((rule) => JSON.stringify(rule.value.selectors) ===
      JSON.stringify([[{ type: "class", name: css.names.animated }]]));
    expect(stopped).toBeDefined();
    const effect = animation(stopped!.value, true);
    expect(effect.name).toEqual({ type: "none" });
    expect(effect.duration.value).toBe(0);
  });

  it("reduce + evolve gana a animated e inline y sólo hace un fundido de 0.6 s", () => {
    const rules = reducedMotion();
    const fadeRule = rules.find((rule) => rule.value.selectors.some(
      (selector) => selector.some((part) => part.type === "attribute" && part.name === "data-reaction"),
    ));
    expect(fadeRule).toBeDefined();
    expect(fadeRule!.value.selectors).toEqual([[
      { type: "class", name: css.names.root },
      {
        type: "attribute", namespace: null, name: "data-reaction",
        operation: { operator: "equal", value: "evolve", caseSensitivity: "case-sensitive" },
      },
    ]]);
    const effect = animation(fadeRule!.value, true);
    expect(effect.name).toEqual({ type: "ident", value: css.names.fadeIn });
    expect(effect.duration.type).toBe("seconds");
    expect(effect.duration.value).toBeCloseTo(0.6);
    expect(effect.iterationCount).toEqual({ type: "number", value: 1 });
    expect(effect.timingFunction).toEqual({ type: "ease-out" });
    const fade = keyframes("fadeIn");
    expect(fade.parent?.type).toBe("atrule");
    const frames = fade.nodes?.filter((node): node is Rule => node.type === "rule");
    expect(frames?.map((frame) => frame.selector)).toEqual(["from", "to"]);
    expect(frames?.map((frame) => frame.nodes?.filter((node) => node.type === "decl")
      .map((node) => [node.prop, Number(node.value)]))).toEqual([
      [["opacity", 0.4]], [["opacity", 1]],
    ]);
  });
});
