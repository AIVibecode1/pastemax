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

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[storage] Failed to remove '${key}':`, err);
  }
}
