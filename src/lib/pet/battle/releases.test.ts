import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import ts from "typescript";
import manifest from "./versions/r2.2/manifest.json";

const dir = join(dirname(fileURLToPath(import.meta.url)), "versions/r2.2");

it("retains every released file byte-for-byte (LF normalized)", () => {
  expect(readdirSync(dir).filter((name) => name !== "manifest.json").sort()).toEqual(Object.keys(manifest).sort());
  for (const [name, hash] of Object.entries(manifest)) {
    const source = readFileSync(join(dir, name), "utf8").replaceAll("\r\n", "\n");
    expect(createHash("sha256").update(source).digest("hex"), name).toBe(hash);
  }
});

it("retained executable code has no dependency on mutable modules outside its release", () => {
  for (const name of readdirSync(dir).filter((name) => name.endsWith(".ts"))) {
    // Type imports disappear; inspect the actual emitted runtime imports.
    const output = ts.transpileModule(readFileSync(join(dir, name), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const file = ts.createSourceFile(name, output, ts.ScriptTarget.ES2022, true);
    for (const statement of file.statements) {
      if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) && statement.moduleSpecifier) {
        const dependency = (statement.moduleSpecifier as ts.StringLiteral).text;
        expect(dependency, `${name}: ${dependency}`).toMatch(/^\.\/[^/]+$/);
        expect(readdirSync(dir)).toContain(`${dependency.slice(2)}.ts`);
      }
    }
    expect(output).not.toMatch(/\bimport\s*\(|\brequire\s*\(/);
  }
});
