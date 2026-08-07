/// <reference lib="webworker" />
/**
 * Web Worker: formats copy content off the UI thread (plan 025).
 * Megabyte-scale string concatenation must not block rendering.
 * The worker imports only pure modules (contentFormatUtils -> languageUtils,
 * pathUtils) — keep those free of DOM/window references.
 */
import { formatBaseFileContent } from './contentFormatUtils';

interface FormatWorkerRequest {
  id: number;
  params: Parameters<typeof formatBaseFileContent>[0];
}

interface FormatWorkerResponse {
  id: number;
  content?: string;
  error?: string;
}

self.onmessage = (e: MessageEvent<FormatWorkerRequest>) => {
  const { id, params } = e.data;
  try {
    const content = formatBaseFileContent(params);
    const response: FormatWorkerResponse = { id, content };
    (self as unknown as Worker).postMessage(response);
  } catch (err) {
    const response: FormatWorkerResponse = { id, error: String(err) };
    (self as unknown as Worker).postMessage(response);
  }
};

export {};
