import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const utils = require('../../electron/utils.js') as {
  normalizePath: (p: string | null | undefined) => string;
  isWSLPath: (p: string | null | undefined) => boolean;
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

describe('electron isWSLPath (CURRENT behavior — plan 009 flips this)', () => {
  it('returns false for normalized //wsl paths today (the bug)', () => {
    // The function tests for the \\ form AFTER normalizePath already converted
    // to // form, so it never matches. Plan 009 changes these assertions.
    expect(utils.isWSLPath('//wsl.localhost/Ubuntu/x')).toBe(false);
    expect(utils.isWSLPath('//wsl$/Ubuntu/x')).toBe(false);
  });

  it('returns false for raw backslash WSL paths today (the bug)', () => {
    expect(utils.isWSLPath('\\\\wsl.localhost\\Ubuntu\\x')).toBe(false);
    expect(utils.isWSLPath('\\\\wsl$\\Ubuntu\\x')).toBe(false);
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
