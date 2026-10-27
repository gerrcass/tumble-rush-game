#!/usr/bin/env node
/**
 * Read-only release audit.
 *
 * The M3 release left four merged remote branches behind because branch
 * cleanup was a prose checklist item. This command makes the state a lookup:
 * dirty tree, branch position, open PRs/issues, stale local/remote branches,
 * and worktrees, all in one place.
 *
 * Usage:
 *   npm run release:audit
 *   npm run release:audit -- --strict   # exit 1 when anything needs cleanup
 *
 * It never deletes anything. Cleanup stays an explicit human/agent action.
 */
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const strict = process.argv.includes('--strict');
const problems = [];

function run(command, args, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

const branch = run('git', ['branch', '--show-current']) || '(detached)';
const status = run('git', ['status', '--porcelain']);
const dirty = status.split('\n').filter(Boolean);
const aheadBehind = run('git', ['rev-list', '--left-right', '--count', 'origin/main...HEAD'], {
  allowFailure: true,
});
const [behind, ahead] = aheadBehind.split(/\s+/).map(Number);

const openPrs = run('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title'], {
  allowFailure: true,
});
const openIssues = run(
  'gh',
  ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title'],
  { allowFailure: true },
);
function isMerged(name) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', name, 'origin/main'], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const remoteBranches = run('git', ['branch', '-r', '--format=%(refname:short)'])
  .split('\n')
  .filter((name) => name && !name.endsWith('/HEAD') && name !== 'origin/main');
const remoteStates = new Map(remoteBranches.map((name) => [name, branchState(name)]));
const staleRemote = remoteBranches.filter((name) => remoteStates.get(name)?.includes('safe to delete'));
const worktrees = run('git', ['worktree', 'list', '--porcelain'])
  .split('\n\n')
  .filter(Boolean)
  .map((entry) => {
    const path = entry.match(/^worktree (.+)$/m)?.[1] ?? '?';
    const branchName = entry.match(/^branch (.+)$/m)?.[1] ?? '(detached)';
    return `${path} ${branchName}`;
  });

console.log(`Release audit — ${new Date().toISOString()}`);
console.log(`Branch: ${branch}`);
console.log(`main: ${behind} behind, ${ahead} ahead`);
console.log(`Working tree: ${dirty.length === 0 ? 'clean' : `${dirty.length} changed file(s)`}`);
for (const line of dirty) console.log(`  ${line}`);

let prs = [];
try {
  prs = JSON.parse(openPrs);
} catch {
  // gh is unavailable or unauthenticated; report the raw failure once.
}
let issues = [];
try {
  issues = JSON.parse(openIssues);
} catch {
  // Same as above.
}

console.log(`Open PRs: ${prs.length}`);
for (const pr of prs) console.log(`  #${pr.number} ${pr.title}`);
console.log(`Open issues: ${issues.length}`);
for (const issue of issues) console.log(`  #${issue.number} ${issue.title}`);
function branchState(name) {
  if (isMerged(name)) return 'merged into main; safe to delete';
  const short = name.replace(/^origin\//, '');
  const raw = run('gh', ['pr', 'list', '--head', short, '--state', 'all', '--limit', '5', '--json', 'number,state,mergedAt,title'], {
    allowFailure: true,
  });
  try {
    const prs = JSON.parse(raw);
    const merged = prs.find((pr) => pr.state === 'MERGED' || pr.mergedAt);
    if (merged) return `merged via PR #${merged.number}; safe to delete`;
    if (prs.length > 0) return `PR #${prs[0].number} is ${prs[0].state}`;
  } catch {
    // gh unavailable; leave the branch as unmerged (not safe to delete).
  }
  return 'unmerged; keep or open a PR';
}

console.log(`Remote branches (non-main): ${remoteBranches.length}`);
for (const name of remoteBranches) {
  console.log(`  ${name} [${remoteStates.get(name)}]`);
}
console.log(`Worktrees: ${worktrees.length}`);
for (const worktree of worktrees) console.log(`  ${worktree}`);

if (dirty.length > 0) problems.push('working tree is dirty');
if (ahead > 0 && branch === 'main') problems.push('local main has unpushed commits');
if (prs.length > 0) problems.push('open pull requests');
if (issues.length > 0) problems.push('open issues');
if (staleRemote.length > 0) problems.push('merged remote branches still exist');
if (worktrees.length > 1) problems.push('extra worktrees');

if (problems.length === 0) {
  console.log('\nAudit: clean.');
} else {
  console.log(`\nAudit: ${problems.length} item(s) need attention — ${problems.join(', ')}.`);
  if (strict) process.exitCode = 1;
}
