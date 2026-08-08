// Imports
const path = require('path');

// ======================
// PATH UTILITIES
// ======================

function isWSLPath(filePath) {
  if (!filePath) return false;
  const normalized = normalizePath(filePath);
  // normalizePath converts both \\wsl.localhost\... and \\wsl$\... to the
  // // form on every platform, so checking the normalized prefixes covers all
  // four input shapes (raw backslash and forward-slash, both hosts).
  return (
    normalized === '//wsl.localhost' ||
    normalized === '//wsl$' ||
    normalized.startsWith('//wsl.localhost/') ||
    normalized.startsWith('//wsl$/')
  );
}

/**
 * True when any path segment ends with '.app' (a macOS application bundle),
 * or the path IS a .app bundle. Segment-aware: 'foo.app.js' and 'src/webapp/'
 * are NOT bundles and return false.
 * @param {string} filePath - normalized or raw path
 * @returns {boolean}
 */
function isMacAppBundlePath(filePath) {
  if (!filePath) return false;
  const segments = normalizePath(filePath).split('/');
  return segments.some((seg) => seg.length > 4 && seg.endsWith('.app'));
}

function normalizePath(filePath) {
  if (!filePath) return filePath;

  if (filePath.startsWith('\\\\')) {
    // For paths like \\wsl.localhost\foo or \\network\share\foo
    // This converts them to //wsl.localhost/foo or //network/share/foo
    // Platform-independent: the app's path model is forward-slash based
    // everywhere (raw backslash input can arrive from any OS config file).
    return '//' + filePath.slice(2).replace(/\\/g, '/');
  }

  return filePath.replace(/\\/g, '/');
}

/**
 * Platform-independent absolute-path check (same model as the renderer's
 * pathUtils.isAbsolute): drive-letter paths, leading-backslash UNC paths,
 * and leading-slash paths are absolute on every OS, so ensureAbsolutePath
 * never re-resolves them against the cwd on POSIX runners.
 * @param {string} p - raw (un-normalized) path
 * @returns {boolean}
 */
function isAbsolutePath(p) {
  return p.startsWith('\\\\') || p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

function ensureAbsolutePath(inputPath) {
  if (!isAbsolutePath(inputPath)) {
    inputPath = path.resolve(inputPath);
  }
  return normalizePath(inputPath);
}

function safeRelativePath(from, to) {
  from = normalizePath(from);
  to = normalizePath(to);

  // For WSL paths, use case-insensitive comparison (like Windows)
  if (isWSLPath(from) || isWSLPath(to)) {
    from = from.toLowerCase();
    to = to.toLowerCase();
  }

  if (process.platform === 'win32') {
    from = from.toLowerCase();
    to = to.toLowerCase();
  }

  let relativePath = path.relative(from, to);
  return normalizePath(relativePath);
}

function safePathJoin(...paths) {
  const joined = path.join(...paths);
  return normalizePath(joined);
}

function isValidPath(pathToCheck) {
  try {
    path.parse(pathToCheck);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Simple trailing debounce (replaces the lodash debounce usage).
 * @param {Function} fn
 * @param {number} waitMs
 * @returns {Function}
 */
function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };
}

module.exports = {
  isWSLPath,
  isMacAppBundlePath,
  debounce,
  normalizePath,
  ensureAbsolutePath,
  safeRelativePath,
  safePathJoin,
  isValidPath,
};
