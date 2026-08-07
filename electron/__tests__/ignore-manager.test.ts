import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ignore = require('ignore');
const { GlobalModeExclusion } = require('../../electron/excluded-files.js');
const ignoreManager = require('../../electron/ignore-manager.js') as {
  isPathExcludedByDefaults: (filePath: string, rootDir: string, ignoreMode: string) => boolean;
};

/**
 * Behavior-equivalence test for plan 026: the precompiled global-mode filter
 * must produce identical verdicts to building ignore().add(GlobalModeExclusion)
 * fresh per call (the pre-change behavior).
 */

const ROOT = '/repo';

// Representative paths: some match GlobalModeExclusion patterns, some don't.
// npm-debug.log* and yarn-error.log* are real entries in GlobalModeExclusion.
const CASES = [
  '/repo/src/a.ts',
  '/repo/npm-debug.log',
  '/repo/npm-debug.log.2026',
  '/repo/yarn-error.log',
  '/repo/src/npm-debug.log',
  '/repo/README.md',
  '/repo/package.json',
  '/repo/.git/config',
  '/repo/dist/bundle.js',
  '/repo/src/deep/nested/file.txt',
];

describe('isPathExcludedByDefaults global mode (plan 026 equivalence)', () => {
  it('matches the per-call ignore().add(GlobalModeExclusion) verdicts', () => {
    const reference = ignore().add(GlobalModeExclusion);

    for (const filePath of CASES) {
      const relative = filePath.replace(`${ROOT}/`, '');
      const expected = reference.ignores(relative);
      const actual = ignoreManager.isPathExcludedByDefaults(filePath, ROOT, 'global');
      expect(actual, `${filePath} (relative: ${relative})`).toBe(expected);
    }
  });

  it('still returns true for a default-pattern match in global mode', () => {
    // node_modules is in DEFAULT_PATTERNS, which always applies.
    expect(ignoreManager.isPathExcludedByDefaults('/repo/node_modules/x/y.js', ROOT, 'global')).toBe(
      true
    );
  });
});
