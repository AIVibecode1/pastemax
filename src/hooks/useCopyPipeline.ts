/**
 * Copy pipeline (extracted from App.tsx by plan 029): cached base content,
 * token counting, the formatting Web Worker lifecycle, and the assembled
 * copy-content getter. Pure rendering/copy-glue stays in App.tsx.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { FileData } from '../types/FileTypes';
import { formatBaseFileContent, formatUserInstructionsBlock, assembleCopyContent } from '../utils/contentFormatUtils';

export interface UseCopyPipelineInput {
  allFiles: FileData[];
  selectedFiles: string[];
  sortOrder: string;
  includeFileTree: boolean;
  includeBinaryPaths: boolean;
  selectedFolder: string | null;
  userInstructions: string;
  isElectron: boolean;
}

export function useCopyPipeline({
  allFiles,
  selectedFiles,
  sortOrder,
  includeFileTree,
  includeBinaryPaths,
  selectedFolder,
  userInstructions,
  isElectron,
}: UseCopyPipelineInput) {
  const [totalFormattedContentTokens, setTotalFormattedContentTokens] = useState(0);
  const [cachedBaseContentString, setCachedBaseContentString] = useState('');
  const [cachedBaseContentTokens, setCachedBaseContentTokens] = useState(0);

  // Formatting runs in a Web Worker so megabyte-scale concatenation never
  // blocks the UI thread (plan 025); the token-count IPC consumes the
  // worker-produced string. Falls back to synchronous formatting if the
  // worker cannot be created or errors.
  const formatWorkerRef = useRef<Worker | null>(null);
  const formatRequestIdRef = useRef(0);
  const formatWorkerErrorRef = useRef(false);

  const runTokenCountForContent = useCallback(
    async (content: string) => {
      if (isElectron && content) {
        try {
          const result = await window.electron.invoke('get-token-count', content);
          if (result?.tokenCount !== undefined) {
            setCachedBaseContentTokens(result.tokenCount);
          }
        } catch (error) {
          console.error('Error getting base content token count:', error);
          setCachedBaseContentTokens(0);
        }
      } else {
        setCachedBaseContentTokens(0);
      }
    },
    [isElectron]
  );

  const getFormatWorker = useCallback(() => {
    if (formatWorkerRef.current || formatWorkerErrorRef.current) {
      return formatWorkerRef.current;
    }
    try {
      const worker = new Worker(new URL('../utils/formatWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent) => {
        const { id, content, error } = e.data as {
          id: number;
          content?: string;
          error?: string;
        };
        if (id !== formatRequestIdRef.current) return; // stale response
        if (error) {
          console.error('Format worker error, falling back to sync formatting:', error);
          formatWorkerErrorRef.current = true;
          worker.terminate();
          formatWorkerRef.current = null;
          return;
        }
        setCachedBaseContentString(content || '');
        void runTokenCountForContent(content || '');
      };
      formatWorkerRef.current = worker;
      return worker;
    } catch (err) {
      console.error('Failed to create format worker, using sync formatting:', err);
      formatWorkerErrorRef.current = true;
      return null;
    }
  }, [runTokenCountForContent]);

  // Cache base content when file selections or formatting options change
  useEffect(() => {
    const updateBaseContent = async () => {
      const params = {
        files: allFiles,
        selectedFiles,
        sortOrder,
        includeFileTree,
        includeBinaryPaths,
        selectedFolder,
      };

      const worker = getFormatWorker();
      if (worker) {
        const id = ++formatRequestIdRef.current;
        worker.postMessage({ id, params });
        return;
      }

      // Fallback: synchronous formatting (original path).
      const baseContent = formatBaseFileContent(params);
      setCachedBaseContentString(baseContent);
      await runTokenCountForContent(baseContent);
    };

    const debounceTimer = setTimeout(updateBaseContent, 300);
    return () => clearTimeout(debounceTimer);
  }, [
    allFiles,
    selectedFiles,
    sortOrder,
    includeFileTree,
    includeBinaryPaths,
    selectedFolder,
    getFormatWorker,
    runTokenCountForContent,
  ]);

  // Terminate the worker on unmount.
  useEffect(
    () => () => {
      formatWorkerRef.current?.terminate();
      formatWorkerRef.current = null;
    },
    []
  );

  // Calculate total tokens when user instructions change
  useEffect(() => {
    const calculateAndSetTokenCount = async () => {
      const instructionsBlock = formatUserInstructionsBlock(userInstructions);

      if (isElectron) {
        try {
          let totalTokens = cachedBaseContentTokens;

          // Only calculate instruction tokens if there are instructions
          if (instructionsBlock) {
            const instructionResult = await window.electron.invoke(
              'get-token-count',
              instructionsBlock
            );
            totalTokens += instructionResult?.tokenCount || 0;
          }

          setTotalFormattedContentTokens(totalTokens);
        } catch (error) {
          console.error('Error getting token count:', error);
          setTotalFormattedContentTokens(0);
        }
      } else {
        setTotalFormattedContentTokens(0);
      }
    };

    const debounceTimer = setTimeout(calculateAndSetTokenCount, 150);
    return () => clearTimeout(debounceTimer);
  }, [userInstructions, cachedBaseContentTokens, isElectron]);

  const getSelectedFilesContent = useCallback(() => {
    return assembleCopyContent(cachedBaseContentString, userInstructions);
  }, [cachedBaseContentString, userInstructions]);

  return {
    cachedBaseContentString,
    cachedBaseContentTokens,
    totalFormattedContentTokens,
    getSelectedFilesContent,
  };
}
