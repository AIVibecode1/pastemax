// src/components/FileList.tsx
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FileListProps, FileData } from '../types/FileTypes';
import FileCard from './FileCard';
import FilePreviewModal from './FilePreviewModal';
import { Files, FolderOpen } from 'lucide-react';
import { arePathsEqual } from '../utils/pathUtils';

// Add proper memoization to avoid unnecessary re-renders
const FileList = ({ files, selectedFiles, toggleFileSelection }: FileListProps) => {
  // Only show files that are in the selectedFiles array and not binary/skipped
  const displayableFiles = useMemo(
    () =>
      files.filter(
        (file: FileData) =>
          selectedFiles.some((selectedPath) => arePathsEqual(selectedPath, file.path)) &&
          !file.isSkipped &&
          !file.excludedByDefault
      ),
    [files, selectedFiles]
  );

  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [activePreviewFile, setActivePreviewFile] = useState('' as string); // Track active file

  // Get live file data for preview instead of using stale snapshot
  const previewFiles = useMemo(() => {
    if (!activePreviewFile) return [];
    const fileToPreview = files.find((f) => f.path === activePreviewFile);
    return fileToPreview ? [fileToPreview] : [];
  }, [files, activePreviewFile]);

  // Memoize the handlePreview to prevent recreation on each render
  const handlePreview = useCallback(
    (filePath: string) => {
      const fileToPreview = files.find((f) => f.path === filePath);
      if (fileToPreview) {
        setActivePreviewFile(filePath);
        setPreviewModalOpen(true);
      }
    },
    [files]
  );

  // Memoize the handleClosePreview to prevent recreation on each render
  const handleClosePreview = useCallback(() => {
    setPreviewModalOpen(false);
    setActivePreviewFile('');
  }, []);

  // Virtualize the card grid by rows (plan 033): FileCard has a fixed height
  // (80px), so a row is 92px incl. the 12px grid gap. The column count mirrors
  // the CSS auto-fill formula `repeat(auto-fill, minmax(220px, 1fr))` so the
  // visual grid is unchanged - only the mounted DOM window shrinks.
  const fileListRef = useRef<HTMLDivElement | null>(null);
  const [fileListWidth, setFileListWidth] = useState(0);

  useEffect(() => {
    const el = fileListRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setFileListWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [displayableFiles.length > 0]);

  const fileListColumns = Math.max(1, Math.floor((fileListWidth + 12) / 232)); // minmax 220px + 12px gap

  const fileRows = useMemo(() => {
    const rows: FileData[][] = [];
    for (let i = 0; i < displayableFiles.length; i += fileListColumns) {
      rows.push(displayableFiles.slice(i, i + fileListColumns));
    }
    return rows;
  }, [displayableFiles, fileListColumns]);

  const fileListVirtualizer = useVirtualizer({
    count: fileRows.length,
    getScrollElement: () => fileListRef.current,
    estimateSize: () => 92,
    overscan: 4,
  });

  const renderedFileRows = useMemo(
    () =>
      fileListVirtualizer.getVirtualItems().map((virtualRow) => {
        const row = fileRows[virtualRow.index];
        return (
          <div
            key={virtualRow.index}
            className="file-list-row"
            style={
              {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                '--file-list-cols': fileListColumns,
              } as React.CSSProperties
            }
          >
            {row.map((file: FileData) => (
              <FileCard
                key={file.path}
                file={file}
                isSelected={true} // All displayed files are selected
                toggleSelection={toggleFileSelection}
                onPreview={handlePreview}
              />
            ))}
          </div>
        );
      }),
    [fileListVirtualizer, fileRows, fileListColumns, toggleFileSelection, handlePreview]
  );

  return (
    <div className="file-list-container">
      {displayableFiles.length > 0 ? (
        <div className="file-list" ref={fileListRef}>
          <div
            style={{
              height: fileListVirtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {renderedFileRows}
          </div>
        </div>
      ) : (
        <div className="file-list-empty">
          {files.length > 0 ? (
            <>
              <Files size={36} className="empty-state-icon" aria-hidden="true" />
              <div className="empty-state-title">No files selected</div>
              <div className="empty-state-hint">Select files in the sidebar to build your prompt.</div>
            </>
          ) : (
            <>
              <FolderOpen size={36} className="empty-state-icon" aria-hidden="true" />
              <div className="empty-state-title">No folder open</div>
              <div className="empty-state-hint">Select a folder to view files.</div>
            </>
          )}
        </div>
      )}
      <FilePreviewModal
        isOpen={previewModalOpen}
        onClose={handleClosePreview}
        files={previewFiles}
        initialActiveFile={activePreviewFile}
      />
    </div>
  );
};

export default FileList;
