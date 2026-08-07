import { describe, it, expect } from 'vitest';
import {
  formatBaseFileContent,
  formatUserInstructionsBlock,
  assembleCopyContent,
} from '../contentFormatUtils';
import { FileData } from '../../types/FileTypes';

/**
 * Characterization tests: pin CURRENT behavior of the copy-formatting pipeline.
 * The FileData fixture uses real language mappings from languageUtils
 * (ts -> typescript, js -> javascript, md -> markdown, json -> json).
 */

const file = (overrides: Partial<FileData> & { path: string; name: string }): FileData => ({
  content: '',
  tokenCount: 0,
  size: 0,
  isBinary: false,
  isSkipped: false,
  ...overrides,
});

const baseParams = {
  files: [] as FileData[],
  selectedFiles: [] as string[],
  sortOrder: 'name-asc',
  includeFileTree: false,
  includeBinaryPaths: false,
  selectedFolder: '/repo',
};

describe('formatBaseFileContent', () => {
  it('returns empty string for an empty selection', () => {
    expect(formatBaseFileContent(baseParams)).toBe('');
  });

  it('formats a single text file with path, language fence, and content', () => {
    const files = [
      file({
        path: '/repo/src/a.ts',
        name: 'a.ts',
        content: 'const x = 1;',
        tokenCount: 5,
        size: 12,
      }),
    ];
    const out = formatBaseFileContent({ ...baseParams, files, selectedFiles: ['/repo/src/a.ts'] });
    expect(out).toBe(
      '<file_contents>\nFile: /repo/src/a.ts\n```typescript\nconst x = 1;\n```\n\n</file_contents>\n'
    );
  });

  it('includes the file map section when includeFileTree is enabled', () => {
    const files = [file({ path: '/repo/a.ts', name: 'a.ts', content: 'x' })];
    const out = formatBaseFileContent({
      ...baseParams,
      files,
      selectedFiles: ['/repo/a.ts'],
      includeFileTree: true,
    });
    expect(out).toContain('<file_map>\n/repo\n└── a.ts\n\n</file_map>\n\n');
    expect(out).toContain('<file_contents>');
  });

  it('includes binary file paths when includeBinaryPaths is enabled', () => {
    const files = [
      file({ path: '/repo/data.json', name: 'data.json', isBinary: true, content: '' }),
    ];
    const out = formatBaseFileContent({
      ...baseParams,
      files,
      selectedFiles: ['/repo/data.json'],
      includeBinaryPaths: true,
    });
    expect(out).toContain('<binary_files>\nFile: /repo/data.json\nThis is a file of the type: Json\n\n</binary_files>\n\n');
  });

  it('omits binary files from the file_contents section', () => {
    const files = [file({ path: '/repo/data.json', name: 'data.json', isBinary: true })];
    const out = formatBaseFileContent({
      ...baseParams,
      files,
      selectedFiles: ['/repo/data.json'],
      includeBinaryPaths: false,
    });
    expect(out).not.toContain('data.json');
  });

  describe('sort orders', () => {
    const files = [
      file({ path: '/repo/b.ts', name: 'b.ts', content: 'b', tokenCount: 10, size: 5 }),
      file({ path: '/repo/a.md', name: 'a.md', content: 'a', tokenCount: 3, size: 8 }),
    ];
    const selected = ['/repo/b.ts', '/repo/a.md'];

    it('sorts by name ascending', () => {
      const out = formatBaseFileContent({ ...baseParams, files, selectedFiles: selected });
      expect(out.indexOf('a.md')).toBeLessThan(out.indexOf('b.ts'));
    });

    it('sorts by name descending', () => {
      const out = formatBaseFileContent({
        ...baseParams,
        files,
        selectedFiles: selected,
        sortOrder: 'name-desc',
      });
      expect(out.indexOf('b.ts')).toBeLessThan(out.indexOf('a.md'));
    });

    it('sorts by tokens ascending', () => {
      const out = formatBaseFileContent({
        ...baseParams,
        files,
        selectedFiles: selected,
        sortOrder: 'tokens-asc',
      });
      expect(out.indexOf('a.md')).toBeLessThan(out.indexOf('b.ts'));
    });

    it('sorts by size descending', () => {
      const out = formatBaseFileContent({
        ...baseParams,
        files,
        selectedFiles: selected,
        sortOrder: 'size-desc',
      });
      expect(out.indexOf('a.md')).toBeLessThan(out.indexOf('b.ts')); // size 8 > size 5, desc
    });
  });
});

describe('formatUserInstructionsBlock', () => {
  it('returns empty string for empty or whitespace-only instructions', () => {
    expect(formatUserInstructionsBlock('')).toBe('');
    expect(formatUserInstructionsBlock('   ')).toBe('');
  });

  it('wraps non-empty instructions in tags with trimmed content', () => {
    expect(formatUserInstructionsBlock('  Fix the bug  ')).toBe(
      '<user_instructions>\nFix the bug\n</user_instructions>\n'
    );
  });
});

describe('assembleCopyContent', () => {
  it('returns empty string when both inputs are empty', () => {
    expect(assembleCopyContent('', '')).toBe('');
    expect(assembleCopyContent('', '   ')).toBe('');
  });

  it('returns base content unchanged when instructions are empty', () => {
    expect(assembleCopyContent('<file_contents>\n</file_contents>\n', '')).toBe(
      '<file_contents>\n</file_contents>\n'
    );
  });

  it('puts the instructions block FIRST, then a blank line, then base content', () => {
    const out = assembleCopyContent('<file_contents>\n</file_contents>\n', 'Fix the bug');
    expect(out).toBe(
      '<user_instructions>\nFix the bug\n</user_instructions>\n\n<file_contents>\n</file_contents>\n'
    );
  });

  it('returns only the instructions block when base content is empty', () => {
    expect(assembleCopyContent('', 'Fix the bug')).toBe(
      '<user_instructions>\nFix the bug\n</user_instructions>\n'
    );
  });

  it('treats whitespace-only instructions as empty', () => {
    expect(assembleCopyContent('base', '   ')).toBe('base');
  });
});
