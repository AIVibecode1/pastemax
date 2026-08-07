// Preload script
const { contextBridge, ipcRenderer } = require('electron');

// Tracks wrappers registered by the compat `on` so removeListener can remove
// the EXACT function that ipcRenderer.on received (wrapping `func` again in
// removeListener can never match). One owner per channel; see `receive`.
const compatListenerWrappers = new Map(); // channel -> Set<wrapper>

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
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  /**
   * Invokes the main process to check for application updates.
   * @returns {Promise<object>} A promise that resolves to an object containing update status.
   * Expected format: { isUpdateAvailable: boolean, currentVersion: string, latestVersion?: string, releaseUrl?: string, error?: string }
   */
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  send: (channel, data) => {
    // whitelist channels
    const validChannels = [
      'open-folder',
      'request-file-list',
      'debug-file-selection',
      'cancel-directory-loading',
    ];
    if (validChannels.includes(channel)) {
      // Ensure data is serializable before sending
      const serializedData = ensureSerializable(data);
      ipcRenderer.send(channel, serializedData);
    }
  },
  receive: (channel, func) => {
    const validChannels = [
      'folder-selected',
      'file-list-data',
      'file-processing-status',
      'startup-mode',
      'file-added',
      'file-updated',
      'file-removed',
    ];
    if (validChannels.includes(channel)) {
      // EXCLUSIVE OWNER semantics: removeAllListeners wipes ANY other listener
      // on this channel (including compat `on` registrations). Only one
      // component may receive a channel; never mix receive() with compat `on`.
      ipcRenderer.removeAllListeners(channel);
      // Add the new listener
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  // For backward compatibility (but still ensure serialization)
  ipcRenderer: {
    send: (channel, data) => {
      const serializedData = ensureSerializable(data);
      ipcRenderer.send(channel, serializedData);
    },
    on: (channel, func) => {
      const wrapper = (event, ...args) => {
        try {
          // Don't pass the event object to the callback, only pass the serialized args
          const serializedArgs = args.map(ensureSerializable);
          func(...serializedArgs); // Only pass the serialized args, not the event
        } catch (err) {
          console.error(`Error in IPC handler for channel ${channel}:`, err);
        }
      };
      ipcRenderer.on(channel, wrapper);
      // Store the wrapper for later removal (removeListener must pass the
      // exact same function reference to ipcRenderer.removeListener).
      if (!compatListenerWrappers.has(channel)) {
        compatListenerWrappers.set(channel, new Set());
      }
      compatListenerWrappers.get(channel).add(wrapper);
      return wrapper;
    },
    removeListener: (channel) => {
      const validChannels = [
        'folder-selected',
        'file-list-data',
        'file-processing-status',
        'startup-mode',
        'file-added',
        'file-updated',
        'file-removed',
        'initial-update-status',
        'ignore-mode-updated',
      ];
      if (validChannels.includes(channel)) {
        // The renderer registers at most one listener per channel per mount;
        // remove all stored wrappers for the channel (the exact references).
        const wrappers = compatListenerWrappers.get(channel);
        if (!wrappers) return;
        for (const wrapper of wrappers) {
          ipcRenderer.removeListener(channel, wrapper);
        }
        compatListenerWrappers.delete(channel);
      }
    },
    // PATCH: Allow invoke for 'check-for-updates' as well as 'get-ignore-patterns'
    invoke: (channel, data) => {
      const validChannels = [
        'get-ignore-patterns',
        'check-for-updates',
        'get-token-count',
        'fetch-models',
      ]; // Added 'fetch-models'
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, data);
      }
      // Optionally, you could add a console.warn or throw an error for unhandled channels
      console.warn(`[preload.js] Attempted to invoke unhandled channel: ${channel}`);
      return Promise.reject(new Error(`Unhandled IPC invoke channel: ${channel}`));
    },
  },
});
