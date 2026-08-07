/**
 * Safe localStorage helpers.
 * A single corrupt value or a quota error must never crash the app.
 */

/** Parse JSON safely; returns fallback on invalid input or non-matching shape. */
export function safeParseJSON<T>(
  raw: string | null | undefined,
  fallback: T,
  validate?: (v: unknown) => v is T
): T {
  if (raw === null || raw === undefined) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((item) => typeof item === 'string');

export function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[storage] Failed to persist '${key}':`, err);
    return false;
  }
}

/**
 * Like safeSetItem but reports the failure reason, so callers can react to
 * quota errors specifically (e.g. drop-oldest retry for copy history).
 * @returns 'ok' | 'quota' (QuotaExceededError) | 'error' (anything else)
 */
export function safeSetItemQuota(key: string, value: string): 'ok' | 'quota' | 'error' {
  try {
    localStorage.setItem(key, value);
    return 'ok';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') return 'quota';
    console.warn(`[storage] Failed to persist '${key}':`, err);
    return 'error';
  }
}

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[storage] Failed to remove '${key}':`, err);
  }
}
