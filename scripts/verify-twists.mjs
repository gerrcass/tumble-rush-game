#!/usr/bin/env node
/**
 * M4 twist gate — placeholder.
 *
 * M4-001 and M4-005 replace this with the pure twist-plan checks and the
 * 12-seed real-Match sweep. Until then the command exists so the planning docs
 * resolve, and it fails loudly instead of pretending the gate ran.
 */
console.error(
  'verify:twists is not implemented yet (M4-005). ' +
    'Run `npm run verify:variety` for the current M3 gate.',
);
process.exitCode = 1;
