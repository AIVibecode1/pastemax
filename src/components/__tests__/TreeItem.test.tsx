// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TreeItem from '../TreeItem';
import { TreeNode, FileData } from '../../types/FileTypes';

/**
 * Characterization tests for TreeItem (plan 036): pin the CURRENT selection,
 * expand and disabled-state behaviour with real props - no mocked internals.
 */

const makeFile = (overrides: Partial<FileData> = {}): FileData => ({
  name: 'file.ts',
  path: '/proj/file.ts',
  content: 'const a = 1;',
  tokenCount: 10,
  size: 100,
  isBinary: false,
  isSkipped: false,
  ...overrides,
});

const fileNode = (fileData: FileData = makeFile()): TreeNode => ({
  id: 'node-file.ts',
  name: fileData.name,
  path: fileData.path,
  type: 'file',
  level: 0,
  fileData,
});

const directoryNode = (overrides: Partial<TreeNode> = {}): TreeNode => ({
  id: 'node-src',
  name: 'src',
  path: '/proj/src',
  type: 'directory',
  level: 0,
  isExpanded: true,
  children: [
    fileNode(makeFile({ name: 'a.ts', path: '/proj/src/a.ts' })),
    fileNode(makeFile({ name: 'b.ts', path: '/proj/src/b.ts' })),
  ],
  ...overrides,
});

const baseProps = {
  selectedFiles: [] as string[],
  toggleFileSelection: vi.fn(),
  toggleFolderSelection: vi.fn(),
  toggleExpanded: vi.fn(),
  includeBinaryPaths: false,
};

describe('TreeItem', () => {
  it('renders a file node with its name', () => {
    render(<TreeItem node={fileNode()} {...baseProps} />);
    expect(screen.getByText('file.ts')).toBeInTheDocument();
  });

  it('checks the checkbox when the file path is selected', () => {
    render(<TreeItem node={fileNode()} {...baseProps} selectedFiles={['/proj/file.ts']} />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('calls toggleFileSelection with the node path when the checkbox is clicked', async () => {
    const user = userEvent.setup();
    const toggleFileSelection = vi.fn();
    render(
      <TreeItem node={fileNode()} {...baseProps} toggleFileSelection={toggleFileSelection} />
    );
    await user.click(screen.getByRole('checkbox'));
    expect(toggleFileSelection).toHaveBeenCalledWith('/proj/file.ts');
  });

  it('shows an expand chevron on directories and calls toggleExpanded when clicked', async () => {
    const user = userEvent.setup();
    const toggleExpanded = vi.fn();
    render(
      <TreeItem
        node={directoryNode({ isExpanded: false })}
        {...baseProps}
        toggleExpanded={toggleExpanded}
      />
    );
    await user.click(screen.getByLabelText('Expand folder'));
    expect(toggleExpanded).toHaveBeenCalledWith('node-src');
  });

  it('disables the checkbox for skipped and excluded-by-default files', () => {
    const { rerender } = render(<TreeItem node={fileNode(makeFile({ isSkipped: true }))} {...baseProps} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();

    rerender(<TreeItem node={fileNode(makeFile({ excludedByDefault: true }))} {...baseProps} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('disables binary files only when includeBinaryPaths is off', () => {
    const { rerender } = render(
      <TreeItem node={fileNode(makeFile({ isBinary: true }))} {...baseProps} />
    );
    expect(screen.getByRole('checkbox')).toBeDisabled();

    rerender(
      <TreeItem node={fileNode(makeFile({ isBinary: true }))} {...baseProps} includeBinaryPaths />
    );
    expect(screen.getByRole('checkbox')).toBeEnabled();
  });

  it('checks the directory checkbox fully when all selectable files are selected', () => {
    const node = directoryNode();
    render(
      <TreeItem node={node} {...baseProps} selectedFiles={['/proj/src/a.ts', '/proj/src/b.ts']} />
    );
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('marks the directory checkbox partially checked when only some files are selected', () => {
    const node = directoryNode();
    render(<TreeItem node={node} {...baseProps} selectedFiles={['/proj/src/a.ts']} />);
    expect(screen.getByRole('checkbox')).toBePartiallyChecked();
  });
});
