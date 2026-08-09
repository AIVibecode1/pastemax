// Shared vitest setup (plan 036).
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// RTL's auto-cleanup needs vitest `globals: true`; this repo imports vitest
// explicitly, so clean up between tests manually to keep queries isolated.
afterEach(() => {
  cleanup();
});
