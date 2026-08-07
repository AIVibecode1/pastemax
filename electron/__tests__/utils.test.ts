import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const utils = require('../../electron/utils.js') as {
  normalizePath: (p: string | null | undefined) => string;
  isWSLPath: (p: string | null | undefined) => boolean;
  isMacAppBundlePath: (p: string | null | undefined) => boolean;
  ensureAbsolutePath: (p: string) => string;
  safeRelativePath: (from: string, to: string) => string;
  safePathJoin: (...paths: string[]) => string;
  isValidPath: (p: string) => boolean;
};

/**
 * Characterization tests for electron/utils.js (CommonJS main-process module).
 * IMPORTANT: this test suite runs on the actual host platform. On win32,
 * normalizePath converts leading-\\ UNC paths to // form. The isWSLPath tests
 * pin CURRENT (broken) behavior — plan 009 flips them to the intended behavior.
 */

describe('electron normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(utils.normalizePath('C:\\Users\\x\\file.ts')).toBe('C:/Users/x/file.ts');
  });

  it('converts win32 UNC WSL paths to // form', () => {
    expect(utils.normalizePath('\\\\wsl.localhost\\Ubuntu\\home\\x')).toBe(
      '//wsl.localhost/Ubuntu/home/x'
    );
    expect(utils.normalizePath('\\\\wsl$\\Ubuntu\\x')).toBe('//wsl$/Ubuntu/x');
  });

  it('passes through already-normalized paths', () => {
    expect(utils.normalizePath('//wsl.localhost/Ubuntu/x')).toBe('//wsl.localhost/Ubuntu/x');
  });
});

describe('electron isWSLPath (intended behavior — plan 009)', () => {
  it('returns true for normalized //wsl paths', () => {
    expect(utils.isWSLPath('//wsl.localhost/Ubuntu/x')).toBe(true);
    expect(utils.isWSLPath('//wsl$/Ubuntu/x')).toBe(true);
  });

  it('returns true for raw backslash WSL paths (normalized internally)', () => {
    expect(utils.isWSLPath('\\\\wsl.localhost\\Ubuntu\\x')).toBe(true);
    expect(utils.isWSLPath('\\\\wsl$\\Ubuntu\\x')).toBe(true);
  });

  it('returns true for bare WSL roots', () => {
    expect(utils.isWSLPath('//wsl.localhost')).toBe(true);
    expect(utils.isWSLPath('//wsl$')).toBe(true);
    expect(utils.isWSLPath('\\\\wsl.localhost')).toBe(true);
    expect(utils.isWSLPath('\\\\wsl$')).toBe(true);
  });

  it('returns false for non-WSL paths', () => {
    expect(utils.isWSLPath('C:/Users/x')).toBe(false);
    expect(utils.isWSLPath('/home/x')).toBe(false);
    expect(utils.isWSLPath('')).toBe(false);
    expect(utils.isWSLPath(null)).toBe(false);
  });
});

describe('electron safeRelativePath', () => {
  it('computes a normalized relative path', () => {
    expect(utils.safeRelativePath('/a/b', '/a/b/c/d.txt')).toBe('c/d.txt');
  });

  it('normalizes separators in inputs', () => {
    expect(utils.safeRelativePath('C:\\a\\b', 'C:\\a\\b\\c.txt')).toBe('c.txt');
  });
});

describe('electron safePathJoin', () => {
  it('joins and normalizes segments', () => {
    expect(utils.safePathJoin('/repo', 'src', 'a.ts')).toBe('/repo/src/a.ts');
  });
});

describe('electron ensureAbsolutePath', () => {
  it('keeps absolute paths unchanged (normalized)', () => {
    expect(utils.ensureAbsolutePath('C:\\repo')).toBe('C:/repo');
    expect(utils.ensureAbsolutePath('/repo/src')).toBe('/repo/src');
  });
});

describe('electron isValidPath', () => {
  it('accepts valid paths', () => {
    expect(utils.isValidPath('/repo/a.ts')).toBe(true);
    expect(utils.isValidPath('C:/repo/a.ts')).toBe(true);
  });
});

describe('electron isMacAppBundlePath', () => {
  it('detects real .app bundles and their contents', () => {
    expect(utils.isMacAppBundlePath('/Applications/PasteMax.app')).toBe(true);
    expect(utils.isMacAppBundlePath('/Applications/PasteMax.app/Contents/Resources/app.asar')).toBe(
      true
    );
    expect(utils.isMacAppBundlePath('C:/Users/x/My App.app/config.json')).toBe(true);
  });

  it('does NOT match substrings inside segments', () => {
    expect(utils.isMacAppBundlePath('/repo/src/foo.app.js')).toBe(false);
    expect(utils.isMacAppBundlePath('/repo/src/apple/')).toBe(false);
    expect(utils.isMacAppBundlePath('/repo/package.json.applesauce')).toBe(false);
    expect(utils.isMacAppBundlePath('/repo/src/webapp/index.html')).toBe(false);
  });

  it('handles empty input', () => {
    expect(utils.isMacAppBundlePath('')).toBe(false);
    expect(utils.isMacAppBundlePath(null)).toBe(false);
  });
});
