#!/usr/bin/env node
/**
 * Mechanical documentation guardrail.
 *
 * M3 shipped two documentation drifts that a human review caught late:
 * a command that no longer existed and a link to evidence that had moved.
 * Prose can be wrong; a broken `npm run` or a dead relative link is a lookup
 * the environment can answer. This check answers both before typecheck:
 *
 * - every `npm run <script>` mentioned in docs resolves in package.json;
 * - every relative Markdown link resolves to a file in the tree;
 * - every `docs/evidence/...` reference resolves to a committed file.
 *
 * It is intentionally dependency-free and runs as part of `npm run lint` and
 * `npm run check`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'test-results', 'playwright-report']);
const DOC_ROOTS = ['README.md', 'AGENTS.md', 'GLOSSARY.md', 'docs'];
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const scripts = new Set(Object.keys(packageJson.scripts ?? {}));

function* walk(path) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (SKIP_DIRS.has(entry)) continue;
      yield* walk(join(path, entry));
    }
    return;
  }
  if (path.endsWith('.md')) yield path;
}

const files = [];
for (const root of DOC_ROOTS) {
  const path = join(ROOT, root);
  try {
    for (const file of walk(path)) files.push(file);
  } catch {
    // A missing optional root is reported by the link check below.
  }
}

const violations = [];
const checkedScripts = new Set();
const checkedLinks = new Set();

function report(file, line, message) {
  violations.push(`${relative(ROOT, file)}:${line}: ${message}`);
}

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, index) => {
    const line = index + 1;

    // Commands in prose and fenced blocks. Ignore `npm run` inside a template
    // placeholder such as `<script>`.
    for (const match of text.matchAll(/\bnpm run ([\w:-]+)/g)) {
      const name = match[1];
      checkedScripts.add(name);
      if (!scripts.has(name)) report(file, line, `npm script "${name}" does not exist`);
    }

    // Relative Markdown links. External URLs, anchors, and absolute paths are
    // outside this repository's contract.
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target) || target.startsWith('/')) continue;
      const pathPart = target.split('#')[0].split('?')[0];
      if (!pathPart) continue;
      const resolved = resolve(dirname(file), decodeURIComponent(pathPart));
      checkedLinks.add(resolved);
      try {
        statSync(resolved);
      } catch {
        report(file, line, `relative link does not resolve: ${target}`);
      }
    }

    // Evidence paths are often written as plain code spans, not links. Require
    // a real extension so directory examples (`docs/evidence/...`) are not
    // mistaken for claims.
    for (const match of text.matchAll(/docs\/evidence\/[\w./-]+\.(?:png|jpe?g|webp|json|log|md|txt)/g)) {
      const evidence = resolve(ROOT, match[0]);
      checkedLinks.add(evidence);
      try {
        statSync(evidence);
      } catch {
        report(file, line, `evidence path does not exist: ${match[0]}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Documentation check failed:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  console.error('\nFix the command/link or remove the stale claim.');
  process.exit(1);
}

console.log(
  `Docs: ${files.length} files, ${checkedScripts.size} npm scripts and ${checkedLinks.size} relative paths checked.`,
);
