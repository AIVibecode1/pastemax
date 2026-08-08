// src/global.d.ts
/// <reference types="react" />
/// <reference types="react-dom" />

export {}; // make this a module

// Global types for Electron API
// The preload (electron/preload.js) exposes only whitelisted channels via
// send/on/off/receive/invoke. Keep this declaration in sync with the IPC
// whitelist constants in that file.
declare global {
  interface Window {
    electron: {
      send: (channel: string, data?: unknown) => void;
      on(channel: string, func: (...args: unknown[]) => void): unknown;
      off: (channel: string) => void;
      receive(channel: string, func: (...args: unknown[]) => void): void;
      invoke: (channel: string, data?: unknown) => Promise<unknown>;
    };
  }
}

// Add missing TypeScript definitions
declare namespace React {
  interface MouseEvent<T = Element> extends globalThis.MouseEvent {
    readonly currentTarget: T;
  }
  interface ChangeEvent<T = Element> extends Event {
    readonly target: T;
  }
}

// Type declarations for external modules
declare module 'react';
declare module 'react-dom/client';
declare module 'react/jsx-runtime';
declare module 'electron';
declare module 'tiktoken';
declare module 'ignore';

// asset imports
declare module '*.css' {
  const c: Record<string, string>;
  export default c;
}
declare module '*.svg' {
  const c: string;
  export default c;
}
declare module '*.png' {
  const c: string;
  export default c;
}
declare module '*.jpg' {
  const c: string;
  export default c;
}
