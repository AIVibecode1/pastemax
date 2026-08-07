import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ignore = require('ignore');
const { GlobalModeExclusion } = require('../../electron/excluded-files.js');
const ignoreManager = require('../../electron/ignore-manager.js') as {
  isPathExcludedByDefaults: (filePath: string, rootDir: string, ignoreMode: string) => boolean;
  globalModeExclusionFilter: { ignores: (path: string) => boolean } | null;
};

/**
 * Equivalence tests for plan 026: the precompiled global-mode filter must
 * behave identically to building ignore().add(GlobalModeExclusion) fresh per
 * call (the pre-change behavior).
 */

const ROOT = '/repo';

const CASES = [
  '/repo/src/a.ts',
  '/repo/npm-debug.log',
  '/repo/npm-debug.log.2026',
  '/repo/yarn-error.log',
  '/repo/src/npm-debug.log',
  '/repo/README.md',
  '/repo/package.json',
  '/repo/dist/bundle.js',
  '/repo/src/deep/nested/file.txt',
];

describe('globalModeExclusionFilter (plan 026 equivalence)', () => {
  it('is precompiled (not null) since GlobalModeExclusion is non-empty', () => {
    expect(ignoreManager.globalModeExclusionFilter).not.toBeNull();
  });

  it('matches the fresh per-call ignore().add(GlobalModeExclusion) verdicts exactly', () => {
    const reference = ignore().add(GlobalModeExclusion);
    for (const filePath of CASES) {
      const relative = filePath.replace(`${ROOT}/`, '');
      expect(
        ignoreManager.globalModeExclusionFilter!.ignores(relative),
        `${filePath} (relative: ${relative})`
      ).toBe(reference.ignores(relative));
    }
  });
});

describe('isPathExcludedByDefaults global mode (integration)', () => {
  it('returns true whenever the global exclusion filter matches', () => {
    const reference = ignore().add(GlobalModeExclusion);
    for (const filePath of CASES) {
      const relative = filePath.replace(`${ROOT}/`, '');
      if (reference.ignores(relative)) {
        expect(
          ignoreManager.isPathExcludedByDefaults(filePath, ROOT, 'global'),
          `${filePath} should be excluded in global mode`
        ).toBe(true);
      }
    }
  });

  it('still returns true for a DEFAULT_PATTERNS match in global mode', () => {
    // node_modules is in DEFAULT_PATTERNS, which always applies.
    expect(ignoreManager.isPathExcludedByDefaults('/repo/node_modules/x/y.js', ROOT, 'global')).toBe(
      true
    );
  });
});
