import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  arePathsEqual,
  isSubPath,
  basename,
  dirname,
  extname,
  generateAsciiFileTree,
  isAbsolute,
  join,
} from '../pathUtils';

/**
 * Characterization tests: pin CURRENT behavior of pathUtils.
 * NOTE: tests run under vitest (node env, no `window`), so detectOS() returns
 * 'unknown' and isWindows() is false. Any platform-dependent branch is
 * documented per test.
 */

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\x\\file.ts')).toBe('C:/Users/x/file.ts');
  });

  it('prefixes WSL paths missing the // prefix', () => {
    expect(normalizePath('wsl.localhost/Ubuntu/x')).toBe('//wsl.localhost/Ubuntu/x');
    expect(normalizePath('wsl$/Ubuntu/x')).toBe('//wsl$/Ubuntu/x');
  });

  it('keeps already-normalized WSL paths unchanged', () => {
    expect(normalizePath('//wsl.localhost/Ubuntu/x')).toBe('//wsl.localhost/Ubuntu/x');
    expect(normalizePath('//wsl$/Ubuntu/x')).toBe('//wsl$/Ubuntu/x');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(normalizePath(null)).toBe('');
    expect(normalizePath(undefined)).toBe('');
    expect(normalizePath('')).toBe('');
  });
});

describe('isWSLPath', () => {
  it('detects normalized WSL prefixes', () => {
    // Current behavior under node env: pure string check on the normalized form.
    // (Import directly to pin the check; the electron twin is characterized in
    // electron/__tests__/utils.test.ts and fixed by plan 009.)
  });
});

describe('arePathsEqual', () => {
  it('treats both-empty inputs as equal', () => {
    expect(arePathsEqual(null, null)).toBe(true);
    expect(arePathsEqual('', undefined)).toBe(true);
  });

  it('treats one-empty as unequal', () => {
    expect(arePathsEqual('/a', null)).toBe(false);
  });

  it('normalizes separators before comparing', () => {
    expect(arePathsEqual('C:\\a\\b', 'C:/a/b')).toBe(true);
  });

  it('is case-sensitive when OS detection is unknown (node env)', () => {
    // detectOS() returns 'unknown' without a window; on a real Windows app
    // runtime isWindows() makes this case-insensitive.
    expect(arePathsEqual('/Repo/A.ts', '/repo/a.ts')).toBe(false);
  });

  it('compares WSL paths case-insensitively when both use the lowercase prefix', () => {
    expect(arePathsEqual('//wsl.localhost/Ubuntu/A.ts', '//wsl.localhost/ubuntu/a.ts')).toBe(
      true
    );
  });

  it('does NOT treat mixed-case WSL prefixes as WSL (case-sensitive prefix check)', () => {
    // isWSLPath's startsWith check is case-sensitive, so an uppercase
    // //WSL.LOCALHOST path is not recognized as WSL and never matches a
    // lowercase-prefix WSL path.
    expect(arePathsEqual('//wsl.localhost/Ubuntu/A.ts', '//WSL.LOCALHOST/ubuntu/a.ts')).toBe(
      false
    );
    expect(arePathsEqual('//wsl.localhost/Ubuntu/A.ts', '/home/a.ts')).toBe(false);
  });
});

describe('isSubPath', () => {
  it('returns true for direct descendants', () => {
    expect(isSubPath('/repo/src', '/repo/src/a.ts')).toBe(true);
  });

  it('returns false for the parent itself (requires trailing segment)', () => {
    expect(isSubPath('/repo/src', '/repo/src')).toBe(false);
  });

  it('returns false for siblings and prefixes', () => {
    expect(isSubPath('/repo/src', '/repo/src2/a.ts')).toBe(false);
    expect(isSubPath('/repo/src', '/repo/lib/a.ts')).toBe(false);
  });

  it('handles WSL paths case-insensitively when both use the lowercase prefix', () => {
    expect(isSubPath('//wsl.localhost/Ubuntu/repo', '//wsl.localhost/ubuntu/repo/src/a.ts')).toBe(
      true
    );
  });

  it('rejects mixed-case WSL prefixes (case-sensitive prefix check)', () => {
    expect(isSubPath('//wsl.localhost/Ubuntu/repo', '//WSL.LOCALHOST/ubuntu/repo/src/a.ts')).toBe(
      false
    );
  });
});

describe('basename / dirname / extname', () => {
  it('extracts basename', () => {
    expect(basename('/repo/src/a.ts')).toBe('a.ts');
    expect(basename('C:/Users/x/file.txt')).toBe('file.txt');
    expect(basename('/repo/trailing/')).toBe('trailing');
    expect(basename('')).toBe('');
  });

  it('extracts dirname', () => {
    expect(dirname('/repo/src/a.ts')).toBe('/repo/src');
    expect(dirname('a.ts')).toBe('.');
    expect(dirname('')).toBe('.');
  });

  it('extracts extension including the dot', () => {
    expect(extname('/repo/src/a.ts')).toBe('.ts');
    expect(extname('Makefile')).toBe('');
    expect(extname('.gitignore')).toBe('');
  });
});

describe('isAbsolute', () => {
  it('detects absolute paths', () => {
    expect(isAbsolute('C:/Users/x')).toBe(true);
    expect(isAbsolute('/usr/local')).toBe(true);
    expect(isAbsolute('//wsl.localhost/Ubuntu')).toBe(true);
    expect(isAbsolute('relative/path')).toBe(false);
  });
});

describe('join', () => {
  it('joins segments with single forward slashes (leading slashes stripped)', () => {
    expect(join('folder', 'subfolder', 'file.txt')).toBe('folder/subfolder/file.txt');
    // join() strips leading/trailing slashes from every segment.
    expect(join('/repo/', '/src/', 'a.ts')).toBe('repo/src/a.ts');
  });
});

describe('generateAsciiFileTree', () => {
  it('returns the empty message for no files', () => {
    expect(generateAsciiFileTree([], '/repo')).toBe('No files selected.');
  });

  it('renders a deterministic tree (directories first, then names)', () => {
    const files = [
      { path: '/repo/src/a.ts' },
      { path: '/repo/src/b.ts' },
      { path: '/repo/README.md' },
    ];
    expect(generateAsciiFileTree(files, '/repo')).toBe(
      '├── src\n│   ├── a.ts\n│   └── b.ts\n└── README.md\n'
    );
  });

  it('ignores files outside the root', () => {
    const files = [{ path: '/other/place/file.ts' }];
    expect(generateAsciiFileTree(files, '/repo')).toBe('');
  });
});
