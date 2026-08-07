import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const cf = require('../../electron/confirmed-folders.js') as {
  init: (userDataPath: string) => void;
  addConfirmedRoot: (root: string) => void;
  isConfirmed: (candidate: string) => boolean;
  getConfirmedRoots: () => string[];
};

describe('confirmed-folders (folder-consent boundary)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf-test-'));
    cf.init(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects everything when no folder was ever confirmed', () => {
    expect(cf.isConfirmed('C:/repo')).toBe(false);
    expect(cf.isConfirmed('C:/repo/src/a.ts')).toBe(false);
  });

  it('accepts the confirmed root and its descendants', () => {
    cf.addConfirmedRoot('C:/repo');
    expect(cf.isConfirmed('C:/repo')).toBe(true);
    expect(cf.isConfirmed('C:/repo/src/a.ts')).toBe(true);
    expect(cf.isConfirmed('C:/repo/src/sub/file.ts')).toBe(true);
  });

  it('rejects siblings, parents, and unrelated paths', () => {
    cf.addConfirmedRoot('C:/repo');
    expect(cf.isConfirmed('C:/repo2')).toBe(false);
    expect(cf.isConfirmed('C:/repo2/file.ts')).toBe(false);
    expect(cf.isConfirmed('C:/')).toBe(false);
    expect(cf.isConfirmed('/other/place')).toBe(false);
    expect(cf.isConfirmed('D:/repo')).toBe(false);
  });

  it('accepts normalized backslash forms of the same root', () => {
    cf.addConfirmedRoot('C:\\repo');
    expect(cf.isConfirmed('C:/repo/src/a.ts')).toBe(true);
  });

  it('persists confirmations across re-init (restart flow)', () => {
    cf.addConfirmedRoot('C:/repo');
    cf.init(dir); // simulate app restart: reload from disk
    expect(cf.isConfirmed('C:/repo/src')).toBe(true);
  });

  it('keeps the most recent roots and dedupes', () => {
    cf.addConfirmedRoot('C:/a');
    cf.addConfirmedRoot('C:/b');
    cf.addConfirmedRoot('C:/a'); // re-confirm
    const roots = cf.getConfirmedRoots();
    expect(roots[0]).toBe('C:/a');
    expect(roots.filter((r) => r === 'C:/a')).toHaveLength(1);
    expect(roots).toContain('C:/b');
  });
});
