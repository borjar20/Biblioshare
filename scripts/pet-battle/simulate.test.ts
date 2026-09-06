import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function cli(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "scripts/pet-battle/simulate.ts", ...args], { encoding: "utf8" });
}

for (const flags of [["--json"], ["--events", "--json"]]) {
  test(`stdout ${flags.join(" ")} is a replayable JSON document`, () => {
    const folder = mkdtempSync(join(tmpdir(), "battle-cli-"));
    try {
      const run = cli("run", ...flags);
      assert.equal(run.status, 0, run.stderr);
      const exported = JSON.parse(run.stdout);
      assert.ok(exported.events.length > 0);
      assert.match(exported.digest, /^[0-9a-f]{64}$/);
      const file = join(folder, "battle.json");
      writeFileSync(file, run.stdout);
      const replay = cli("replay", file);
      assert.equal(replay.status, 0, replay.stderr);
      assert.ok(replay.stdout.includes(exported.digest));
      assert.match(replay.stdout, /✓ coincide/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
}
