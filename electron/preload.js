// Preload script
const { contextBridge, ipcRenderer } = require('electron');

// ==========================================================================
// IPC CONTRACT: every channel the renderer may use MUST be listed below AND
// handled in electron/main.js. Add new channels to BOTH sides together.
// ==========================================================================
const IPC = {
  SEND: [
    'open-folder',
    'request-file-list',
    'debug-file-selection',
    'cancel-directory-loading',
    'set-ignore-mode',
    'clear-ignore-cache',
    'clear-main-cache',
  ],
  RECEIVE: [
    'folder-selected',
    'file-list-data',
    'file-processing-status',
    'startup-mode',
    'file-added',
    'file-updated',
    'file-removed',
    'initial-update-status',
    'ignore-mode-updated',
  ],
  INVOKE: ['check-for-updates', 'get-ignore-patterns', 'get-token-count', 'fetch-models'],
};

// Tracks wrappers registered by `on` so `off` can remove the EXACT function
// that ipcRenderer.on received. One owner per channel; see `receive`.
const listenerWrappers = new Map(); // channel -> Set<wrapper>

// Helper function to ensure data is serializable
function ensureSerializable(data) {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitive types directly
  if (typeof data !== 'object') {
    return data;
  }

  // For arrays, map each item
  if (Array.isArray(data)) {
    return data.map(ensureSerializable);
  }

  // For objects, create a new object with serializable properties
  const result = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      // Skip functions or symbols which are not serializable
      if (typeof data[key] === 'function' || typeof data[key] === 'symbol') {
        continue;
      }
      // Recursively process nested objects
      result[key] = ensureSerializable(data[key]);
    }
  }
  return result;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object.
// Every exposed method enforces the IPC whitelist above.
contextBridge.exposeInMainWorld('electron', {
  /**
   * Sends a fire-and-forget IPC message (whitelisted channels only).
   */
  send: (channel, data) => {
    if (IPC.SEND.includes(channel)) {
      ipcRenderer.send(channel, ensureSerializable(data));
    } else {
      console.warn(`[preload] Blocked send on unlisted channel: ${channel}`);
    }
  },

  /**
   * Registers a one-per-channel listener (whitelisted channels only).
   * Only one component may own a channel via `on`; `receive` is the
   * exclusive-owner alternative (it wipes other listeners on the channel).
   */
  on: (channel, func) => {
    if (!IPC.RECEIVE.includes(channel)) {
      console.warn(`[preload] Blocked on() for unlisted channel: ${channel}`);
      return null;
    }
    const wrapper = (event, ...args) => {
      try {
        // Don't pass the event object to the callback, only the serialized args
        const serializedArgs = args.map(ensureSerializable);
        func(...serializedArgs);
      } catch (err) {
        console.error(`Error in IPC handler for channel ${channel}:`, err);
      }
    };
    ipcRenderer.on(channel, wrapper);
    if (!listenerWrappers.has(channel)) {
      listenerWrappers.set(channel, new Set());
    }
    listenerWrappers.get(channel).add(wrapper);
    return wrapper;
  },

  /**
   * Removes all listeners for a channel registered via `on` (whitelisted only).
   */
  off: (channel) => {
    if (!IPC.RECEIVE.includes(channel)) {
      return;
    }
    const wrappers = listenerWrappers.get(channel);
    if (!wrappers) return;
    for (const wrapper of wrappers) {
      ipcRenderer.removeListener(channel, wrapper);
    }
    listenerWrappers.delete(channel);
  },

  /**
   * EXCLUSIVE OWNER listener registration: removeAllListeners wipes ANY other
   * listener on the channel (including `on` registrations). Only one component
   * may receive a channel; never mix receive() with on() on the same channel.
   */
  receive: (channel, func) => {
    if (IPC.RECEIVE.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },

  /**
   * Invokes a request/response IPC call (whitelisted channels only).
   * @returns {Promise<unknown>} Resolves to the main-process result.
   */
  invoke: (channel, data) => {
    if (IPC.INVOKE.includes(channel)) {
      return ipcRenderer.invoke(channel, ensureSerializable(data));
    }
    console.warn(`[preload] Blocked invoke on unlisted channel: ${channel}`);
    return Promise.reject(new Error(`Unhandled IPC invoke channel: ${channel}`));
  },
});
