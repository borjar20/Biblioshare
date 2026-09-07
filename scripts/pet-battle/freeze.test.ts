import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { forkVersion, manifestFor, releaseBlock, writeManifest } from "./freeze";

const REAL = "src/lib/pet/battle";

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "battle-freeze-"));
  cpSync(join(REAL, "versions", "r3.1"), join(root, "versions", "r3.1"), { recursive: true });
  return root;
}

test("manifestFor reproduce byte a byte el manifiesto publicado de r3.1", () => {
  const committed = JSON.parse(readFileSync(join(REAL, "versions/r3.1/manifest.json"), "utf8"));
  assert.deepEqual(manifestFor(join(REAL, "versions/r3.1")), committed);
});

test("fork copia solo los .ts y rechaza sobrescribir", () => {
  const root = tempRoot();
  try {
    const copied = forkVersion(root, "r3.1", "r9.9");
    assert.ok(copied.includes("engine.ts") && !copied.includes("normative.json") && !copied.includes("manifest.json"));
    assert.ok(existsSync(join(root, "versions/r9.9/engine.ts")));
    assert.throws(() => forkVersion(root, "r3.1", "r9.9"), /no se sobrescribe/);
    assert.throws(() => forkVersion(root, "r3.1", "bonita"), /versión inválida/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("freeze exige normative.json, escribe el manifiesto una sola vez", () => {
  const root = tempRoot();
  try {
    forkVersion(root, "r3.1", "r9.9");
    assert.throws(() => writeManifest(root, "r9.9"), /normative\.json/);
    writeFileSync(join(root, "versions/r9.9/normative.json"), "{}\n");
    const manifest = writeManifest(root, "r9.9");
    assert.ok("normative.json" in manifest && "engine.ts" in manifest && !("manifest.json" in manifest));
    assert.throws(() => writeManifest(root, "r9.9"), /ya está publicada/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("releaseBlock imprime la entrada de BATTLE_RELEASES con versión y hash", () => {
  const block = releaseBlock("r4.1", "ab".repeat(32));
  assert.match(block, /rulesetVersion: "r4\.1"/);
  assert.match(block, new RegExp("ab".repeat(32)));
  assert.match(block, /versions\/r4\.1/);
});
