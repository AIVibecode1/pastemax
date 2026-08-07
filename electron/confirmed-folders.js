/**
 * Tracks the set of folder roots the user has confirmed via the folder dialog.
 * The renderer may only request scans of paths equal to or under a confirmed
 * root; this is the consent boundary for renderer-chosen scan paths.
 */
const fs = require('fs');
const path = require('path');
const { normalizePath, safeRelativePath } = require('./utils.js');

const MAX_CONFIRMED = 20;
let confirmedRoots = [];
let storePath = null; // set via init()

/**
 * Loads the persisted confirmed roots from the user data directory.
 * @param {string} userDataPath - app.getPath('userData')
 */
function init(userDataPath) {
  storePath = path.join(userDataPath, 'confirmed-folders.json');
  try {
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      confirmedRoots = parsed.map(normalizePath).filter(Boolean);
    }
  } catch {
    confirmedRoots = [];
  }
}

/**
 * Records a folder the user confirmed via the native dialog and persists it,
 * so the confirmation survives restarts (launch-restore and workspace flows).
 * @param {string} root
 */
function addConfirmedRoot(root) {
  const normalized = normalizePath(root);
  confirmedRoots = [normalized, ...confirmedRoots.filter((r) => r !== normalized)].slice(
    0,
    MAX_CONFIRMED
  );
  try {
    fs.writeFileSync(storePath, JSON.stringify(confirmedRoots, null, 2));
  } catch (err) {
    console.warn('Failed to persist confirmed folders:', err);
  }
}

/**
 * True when `candidate` equals or is under any confirmed root.
 * @param {string} candidate
 * @returns {boolean}
 */
function isConfirmed(candidate) {
  const normalized = normalizePath(candidate);
  return confirmedRoots.some((root) => {
    if (root === normalized) return true;
    const rel = safeRelativePath(root, normalized);
    return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}

function getConfirmedRoots() {
  return [...confirmedRoots];
}

module.exports = { init, addConfirmedRoot, isConfirmed, getConfirmedRoots };
