import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  safeParseJSON,
  isStringArray,
  safeGetItem,
  safeSetItem,
  safeSetItemQuota,
  safeRemoveItem,
} from '../storage';

/**
 * A minimal in-memory localStorage stub for the helper tests.
 */
function createStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

describe('safeParseJSON', () => {
  it('returns fallback for null/undefined input', () => {
    expect(safeParseJSON(null, [])).toEqual([]);
    expect(safeParseJSON(undefined, [])).toEqual([]);
  });

  it('parses valid JSON of the right shape', () => {
    expect(safeParseJSON('["a","b"]', [], isStringArray)).toEqual(['a', 'b']);
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeParseJSON('{broken', [], isStringArray)).toEqual([]);
  });

  it('returns fallback when the shape does not match the validator', () => {
    expect(safeParseJSON('{"a":1}', [], isStringArray)).toEqual([]);
    expect(safeParseJSON('[1,2]', [], isStringArray)).toEqual([]);
  });

  it('parses without a validator', () => {
    expect(safeParseJSON('{"a":1}', {})).toEqual({ a: 1 });
  });
});

describe('isStringArray', () => {
  it('validates string arrays only', () => {
    expect(isStringArray(['a', 'b'])).toBe(true);
    expect(isStringArray([])).toBe(true);
    expect(isStringArray(['a', 1])).toBe(false);
    expect(isStringArray({})).toBe(false);
    expect(isStringArray('nope')).toBe(false);
  });
});

describe('safe localStorage helpers', () => {
  let stub: ReturnType<typeof createStorageStub>;

  beforeEach(() => {
    stub = createStorageStub();
    vi.stubGlobal('localStorage', stub);
  });

  it('safeGetItem reads through', () => {
    stub._store.set('k', 'v');
    expect(safeGetItem('k')).toBe('v');
    expect(safeGetItem('missing')).toBeNull();
  });

  it('safeSetItem writes and reports success', () => {
    expect(safeSetItem('k', 'v')).toBe(true);
    expect(stub._store.get('k')).toBe('v');
  });

  it('safeSetItem reports failure and warns when setItem throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stub.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(safeSetItem('k', 'v')).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('safeRemoveItem removes', () => {
    stub._store.set('k', 'v');
    safeRemoveItem('k');
    expect(stub._store.has('k')).toBe(false);
  });

  it('safeSetItemQuota reports ok, quota, and error distinctly', () => {
    expect(safeSetItemQuota('k', 'v')).toBe('ok');
    expect(stub._store.get('k')).toBe('v');

    stub.setItem.mockImplementation(() => {
      const e = new DOMException('quota', 'QuotaExceededError');
      throw e;
    });
    expect(safeSetItemQuota('k', 'v')).toBe('quota');

    stub.setItem.mockImplementation(() => {
      throw new Error('other failure');
    });
    expect(safeSetItemQuota('k', 'v')).toBe('error');
  });
});
