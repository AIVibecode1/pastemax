/**
 * Update Manager Module
 * Handles session-based caching of update checks in the Electron main process.
 * Successful results are cached for the session (one API call per session);
 * ERROR results are NOT cached, so a transient failure can be retried later.
 * Exports functions for retrieving update status and resetting session state.
 *
 * @module update-manager
 */

const { app } = require('electron');
const { checkForUpdates: actualCheckForUpdates } = require('./update-checker');

/**
 * Cached result of the last SUCCESSFUL update check for the current session.
 * @type {null | import('./update-checker').UpdateCheckResultFromMain}
 */
let cachedUpdateResult = null;

/**
 * Get the update status for the current session.
 * Returns a cached SUCCESS result if available, otherwise performs a new API call.
 * Errors are returned but not cached, so a later check can retry.
 *
 * @async
 * @returns {Promise<import('./update-checker').UpdateCheckResultFromMain & { isLoading: boolean }>}
 */
async function getUpdateStatus() {
  // If we have a cached result, always return it for the session (no further API calls)
  if (cachedUpdateResult) {
    return { ...cachedUpdateResult, isLoading: false };
  }

  // Make a new API call (first call in session, or retry after an earlier error)
  try {
    const result = await actualCheckForUpdates();
    if (result.error) {
      // Error result: return it but do NOT cache, so a later check can retry.
      return { ...result, isLoading: false };
    }
    cachedUpdateResult = { ...result };
    return { ...result, isLoading: false };
  } catch (error) {
    const errorResult = {
      isUpdateAvailable: false,
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseUrl: null,
      error: error.message || 'Unknown error during update check execution',
      debugLogs: '',
      isLoading: false,
    };
    return errorResult;
  }
}

/**
 * Reset the update session state.
 * Clears the cached update result and resets the API call attempt counter.
 */
function resetUpdateSessionState() {
  cachedUpdateResult = null;
}

module.exports = {
  getUpdateStatus,
  resetUpdateSessionState,
};
