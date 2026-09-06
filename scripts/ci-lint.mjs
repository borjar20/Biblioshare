import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';

// The repository is the lint surface, not untracked builds and scratch work.
const base = process.env.CI_LINT_BASE;
if (base && !/^[a-f0-9]{40}$/.test(base)) throw new Error('CI_LINT_BASE must be a full commit SHA');
const args = base
  ? ['diff', '--name-only', '--diff-filter=ACMR', '-z', base, 'HEAD']
  : ['ls-files', '-z'];
const files = execFileSync('git', args, { encoding: 'utf8' })
  .split('\0').filter((file) => /\.(?:[cm]?js|tsx?)$/.test(file));
if (!files.length) {
  console.log('Lint: no changed source files.');
  process.exit(0);
}
const eslint = new ESLint();
const results = await eslint.lintFiles(files);
console.log((await eslint.loadFormatter('stylish')).format(results));
const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
console.log(`Lint: ${files.length} ${base ? 'changed' : 'tracked'} source files, ${errors} errors.`);
process.exitCode = errors ? 1 : 0;
