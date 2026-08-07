import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const fp = require('../../electron/file-processor.js') as {
  clearFileCaches: () => void;
  getCachedFileIfFresh: (path: string) => Promise<object | null>;
  updateFileCacheEntry: (path: string, data: object) => void;
  removeFileCacheEntry: (path: string) => void;
};

/**
 * Tests for the cross-scan file cache freshness validation (plan 023):
 * a cache entry is only served while mtime+size match the file on disk.
 */
describe('file cache freshness (plan 023)', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fc-test-'));
    file = join(dir, 'a.txt');
    writeFileSync(file, 'hello world');
    fp.clearFileCaches();
  });

  afterEach(() => {
    fp.clearFileCaches();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the path is not cached', async () => {
    expect(await fp.getCachedFileIfFresh(file)).toBeNull();
  });

  it('serves a cached entry while the file is unchanged', async () => {
    const data = { name: 'a.txt', size: 11, tokenCount: 2 };
    await fp.updateFileCacheEntry(file, data); // await the mtime refresh
    const cached = await fp.getCachedFileIfFresh(file);
    expect(cached).toEqual(data);
  });

  it('evicts and returns null when the file mtime changes', async () => {
    const data = { name: 'a.txt', size: 11, tokenCount: 2 };
    await fp.updateFileCacheEntry(file, data);
    // Give the mtime a chance to differ, then modify the file.
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(file, 'hello world changed!');
    expect(await fp.getCachedFileIfFresh(file)).toBeNull();
    // The stale entry is evicted.
    expect(await fp.getCachedFileIfFresh(file)).toBeNull();
  });

  it('returns null when the file is deleted', async () => {
    await fp.updateFileCacheEntry(file, { name: 'a.txt', size: 11 });
    rmSync(file);
    expect(await fp.getCachedFileIfFresh(file)).toBeNull();
  });

  it('removeFileCacheEntry clears the entry and its mtime', async () => {
    await fp.updateFileCacheEntry(file, { name: 'a.txt', size: 11 });
    fp.removeFileCacheEntry(file);
    expect(await fp.getCachedFileIfFresh(file)).toBeNull();
  });
});
