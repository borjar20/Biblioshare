// Ritual de publicar una versión de combate (#1093, README de versions/):
// fork = copiar el código ejecutable; freeze = fijar fixture normativo + manifiesto.
// Funciones puras sobre un directorio raíz para poder probarlas en una copia temporal.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BATTLE_DIR = "src/lib/pet/battle";

export function versionDir(root: string, version: string): string {
  return join(root, "versions", version);
}

export function forkVersion(root: string, from: string, to: string): string[] {
  if (!/^r\d+\.\d+$/.test(to)) throw new Error(`versión inválida: ${to} (forma rN.M)`);
  const src = versionDir(root, from);
  const dst = versionDir(root, to);
  if (!existsSync(src)) throw new Error(`no existe la versión de origen ${src}`);
  if (existsSync(dst)) throw new Error(`ya existe ${dst}: una versión publicada no se sobrescribe`);
  mkdirSync(dst, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(src).filter((n) => n.endsWith(".ts"))) {
    cpSync(join(src, name), join(dst, name));
    copied.push(name);
  }
  return copied.sort();
}

/** Mismo cálculo que releases.test.ts: sha256 del fuente con CRLF normalizado a LF. */
export function manifestFor(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).filter((n) => n !== "manifest.json").sort()) {
    const source = readFileSync(join(dir, name), "utf8").replaceAll("\r\n", "\n");
    out[name] = createHash("sha256").update(source).digest("hex");
  }
  return out;
}

export function writeManifest(root: string, version: string): Record<string, string> {
  const dir = versionDir(root, version);
  if (!existsSync(dir)) throw new Error(`no existe ${dir}`);
  if (existsSync(join(dir, "manifest.json"))) throw new Error(`${version} ya está publicada (manifest.json existe): publica otra versión`);
  if (!existsSync(join(dir, "normative.json"))) throw new Error(`${version} no tiene normative.json: ejecuta \`golden --version ${version}\` antes`);
  const manifest = manifestFor(dir);
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export function releaseBlock(version: string, contentHash: string): string {
  const v = version.replace(".", "_");
  return [
    `// src/lib/pet/battle/replay.ts — añadir al FINAL de BATTLE_RELEASES (append-only).`,
    `// Imports: import * as ${v} from "./versions/${version}/content"; validateInputs as validate_${v} from "./versions/${version}/inputs";`,
    `// resimulate as resimulate_${v} from "./versions/${version}/record"; isBattleSnapshot as is_${v}_Snapshot from "./versions/${version}/snapshot".`,
    `Object.freeze({`,
    `  rulesetVersion: "${version}",`,
    `  contentHash: "${contentHash}",`,
    `  ruleset: ${v}.RULESET, enemies: ${v}.ENEMIES, isSnapshot: is_${v}_Snapshot,`,
    `  validateInputs: (raw: unknown, fights = 1) => validate_${v}(raw, ${v}.RULESET, fights),`,
    `  async replay(record) { return resimulate_${v}(record, { ruleset: ${v}.RULESET, enemies: ${v}.ENEMIES, contentHash: await ${v}.contentHash() }); },`,
    `}),`,
  ].join("\n");
}
