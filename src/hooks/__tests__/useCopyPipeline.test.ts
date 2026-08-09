// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCopyPipeline, UseCopyPipelineInput } from '../useCopyPipeline';
import { FileData } from '../../types/FileTypes';

/**
 * Characterization tests for useCopyPipeline (plan 036).
 * jsdom has no Web Worker, so `new Worker` throws and the hook falls back to
 * its synchronous formatting path - exactly the production fallback. The
 * get-token-count IPC is absent in jsdom, so token counts settle at 0 via the
 * hook's own error handling.
 */

const makeFile = (path: string, content = 'const x = 1;'): FileData => ({
  name: path.split('/').pop() || path,
  path,
  content,
  tokenCount: 5,
  size: 10,
  isBinary: false,
  isSkipped: false,
});

const baseInput: UseCopyPipelineInput = {
  allFiles: [],
  selectedFiles: [],
  sortOrder: 'name-asc',
  includeFileTree: false,
  includeBinaryPaths: false,
  selectedFolder: null,
  userInstructions: '',
  isElectron: true,
};

describe('useCopyPipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the cached content and token counts at the empty baseline for an empty selection', async () => {
    const { result } = renderHook(() => useCopyPipeline(baseInput));

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.cachedBaseContentString).toBe('');
    expect(result.current.cachedBaseContentTokens).toBe(0);
    expect(result.current.totalFormattedContentTokens).toBe(0);
  });

  it('updates the cached base content when files are selected', async () => {
    const file = makeFile('/proj/a.ts', 'export const a = 1;');
    const { result } = renderHook(() =>
      useCopyPipeline({
        ...baseInput,
        allFiles: [file],
        selectedFiles: ['/proj/a.ts'],
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.cachedBaseContentString).toContain('File: /proj/a.ts');
    expect(result.current.cachedBaseContentString).toContain('export const a = 1;');
  });

  it('exposes a stable public API', () => {
    const { result } = renderHook(() => useCopyPipeline(baseInput));

    expect(Object.keys(result.current).sort()).toEqual([
      'cachedBaseContentString',
      'cachedBaseContentTokens',
      'getSelectedFilesContent',
      'totalFormattedContentTokens',
    ]);
    expect(typeof result.current.getSelectedFilesContent).toBe('function');
  });
});
