#!/usr/bin/env node
/**
 * Mechanical guardrails for the rules that are easy to state in prose and easy
 * to break by accident:
 *
 * - gameplay/content randomness comes from the seeded Rng, never Math.random;
 * - the runtime makes no network requests and loads no third-party assets;
 * - shipped code does not leave console noise behind.
 *
 * The check is intentionally small and dependency-free. It runs before
 * typecheck/tests so a violation fails with a file and line, not a mystery
 * regression.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN_ROOTS = ['src'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'test-results']);
const CODE_EXTENSIONS = new Set(['.ts', '.css', '.html']);

/** Remove // and block comments while preserving line structure. */
function stripComments(source) {
  let out = '';
  let block = false;
  let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (block) {
      if (char === '*' && next === '/') {
        out += '  ';
        i += 1;
        block = false;
      } else {
        out += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (quote) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '/' && next === '/') {
      out += '  ';
      i += 1;
      while (i + 1 < source.length && source[i + 1] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (char === '/' && next === '*') {
      out += '  ';
      i += 1;
      block = true;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    out += char;
  }
  return out;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* walk(path);
    else if (CODE_EXTENSIONS.has(path.slice(path.lastIndexOf('.')))) yield path;
  }
}

const violations = [];
let files = 0;

for (const root of SCAN_ROOTS) {
  for (const path of walk(join(ROOT, root))) {
    const rel = relative(ROOT, path);
    const isTest = rel.startsWith('src/test/');
    const code = stripComments(readFileSync(path, 'utf8'));
    const lines = code.split('\n');
    files += 1;
    lines.forEach((line, index) => {
      const where = `${rel}:${index + 1}`;
      if (!isTest && /\bMath\.random\s*\(/.test(line)) {
        violations.push(`${where}: Math.random() in runtime code; use the seeded Rng`);
      }
      if (!isTest && /\bconsole\.(log|debug|info)\s*\(/.test(line)) {
        violations.push(`${where}: console.${RegExp.$1} left in shipped code`);
      }
      if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(line) || /\bsendBeacon\s*\(/.test(line)) {
        violations.push(`${where}: runtime network API; the game is static-hosted`);
      }
      if (/https?:\/\//.test(line) && !isTest) {
        violations.push(`${where}: external URL in runtime code; assets must be procedural`);
      }
    });
  }
}

// index.html is not under src, but it is the one place a CDN tag could hide.
const index = stripComments(readFileSync(join(ROOT, 'index.html'), 'utf8'));
files += 1;
index.split('\n').forEach((line, indexNumber) => {
  if (/<(script|link)\b[^>]*(src|href)=["']https?:\/\//i.test(line)) {
    violations.push(`index.html:${indexNumber + 1}: external runtime asset; bundle it instead`);
  }
});

if (violations.length > 0) {
  console.error('Invariant check failed:\n');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Invariants: ${files} files checked; seeded RNG, no network, no console noise.`);
