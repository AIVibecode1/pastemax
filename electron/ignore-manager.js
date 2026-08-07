// ======================
//  INITIALIZATION
// ======================

// Imports
const { DEFAULT_PATTERNS, GlobalModeExclusion } = require('./excluded-files'); // Import static pattern arrays
const {
  normalizePath,
  ensureAbsolutePath,
  safeRelativePath,
  isValidPath,
  safePathJoin,
} = require('./utils');

// Constants
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

// Global caches
const compiledIgnoreFilterCache = new Map(); // Cache for ignore filters keyed by normalized root directory
const rawGitignorePatternsCache = new Map(); // Cache for already found/processed gitignore files

// Pre-compiled default ignore filter for early checks using the imported DEFAULT_PATTERNS
const systemDefaultFilter = ignore().add(DEFAULT_PATTERNS);

// Precompiled ignore() instance for GlobalModeExclusion (global mode).
// Built once at module load instead of per-file during scans (plan 026).
// Null when the list is empty: ignore() with no patterns misbehaves.
const globalModeExclusionFilter =
  GlobalModeExclusion && GlobalModeExclusion.length > 0
    ? ignore().add(GlobalModeExclusion)
    : null;

/**
 * The function `isPathExcludedByDefaults` checks if a file path should be excluded based on various
 * criteria such as OS-specific checks, reserved names, default patterns, and global mode exclusions.
 * @param filePath - The `filePath` parameter represents the path of the file you want to check if it
 * is excluded by default based on certain conditions and filters.
 * @param rootDir - The `rootDir` parameter in the `isPathExcludedByDefaults` function represents the
 * root directory from which the `filePath` is being checked for exclusion based on certain criteria.
 * It is used to calculate the relative path of the `filePath` with respect to the `rootDir`.
 * @param ignoreMode - The `ignoreMode` parameter in the `isPathExcludedByDefaults` function determines
 * the mode in which the path exclusion should be applied. It can have the following values:
 * @returns The function `isPathExcludedByDefaults` returns a boolean value - `true` if the filePath is
 * excluded by defaults, and `false` if it is not excluded.
 */
function isPathExcludedByDefaults(filePath, rootDir, ignoreMode) {
  filePath = ensureAbsolutePath(filePath);
  rootDir = ensureAbsolutePath(rootDir);

  const relativePath = safeRelativePath(rootDir, filePath);

  if (!isValidPath(relativePath) || relativePath.startsWith('..')) {
    return true;
  }

  // OS-specific and reserved name checks
  if (process.platform === 'win32') {
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(path.basename(filePath))) {
      // console.log(`Excluding reserved Windows name: ${path.basename(filePath)}`);
      return true;
    }
    if (
      filePath.toLowerCase().includes('\\windows\\') ||
      filePath.toLowerCase().includes('\\system32\\')
    ) {
      // console.log(`Excluding Windows system path: ${filePath}`);
      return true;
    }
  } else if (process.platform === 'darwin') {
    if (
      filePath.includes('/.Spotlight-') ||
      filePath.includes('/.Trashes') ||
      filePath.includes('/.fseventsd')
    ) {
      // console.log(`Excluding macOS system path: ${filePath}`);
      return true;
    }
  } else if (process.platform === 'linux') {
    if (
      filePath.startsWith('/proc/') ||
      filePath.startsWith('/sys/') ||
      filePath.startsWith('/dev/')
    ) {
      // console.log(`Excluding Linux system path: ${filePath}`);
      return true;
    }
  }

  // Check against DEFAULT_PATTERNS (using the module-level defaultIgnoreFilter)
  if (systemDefaultFilter.ignores(relativePath)) {
    // console.log(`[isPathExcludedByDefaults] Excluded by DEFAULT_PATTERNS: ${relativePath}`);
    return true;
  }

  // If in 'global' mode, also check against GlobalModeExclusion
  if (ignoreMode === 'global' && globalModeExclusionFilter) {
    if (globalModeExclusionFilter.ignores(relativePath)) {
      // console.log(`[isPathExcludedByDefaults] Excluded by GlobalModeExclusion (Global Mode): ${relativePath}`);
      return true;
    }
  }

  return false;
}

/**
 * The function `isPathIgnoredByActiveFilter` determines if a file path should be ignored based on
 * specified filters.
 * @param filePath - The `filePath` parameter represents the full path of the file you want to check if
 * it is ignored by the active filter.
 * @param rootDir - The `rootDir` parameter is the root directory against which the file path is being
 * checked for being ignored by the active filter.
 * @param ignoreFilter - The `ignoreFilter` parameter is a filter that contains patterns to ignore
 * specific file paths. These patterns are expected to be normalized to be relative to the `rootDir`.
 * The function `isPathIgnoredByActiveFilter` uses this filter to determine if a given file path should
 * be ignored based on
 * @returns The function `isPathIgnoredByActiveFilter` returns a boolean value - `true` if the filePath
 * is ignored by either the system default filter or the provided contextual ignoreFilter, and `false`
 * if it is not ignored by either.
 */
function isPathIgnoredByActiveFilter(filePath, rootDir, ignoreFilter) {
  const relativeToRoot = safeRelativePath(rootDir, filePath);

  // Basic validation for the path itself and its relative form
  if (!filePath || filePath.trim() === '' || !relativeToRoot || relativeToRoot.trim() === '') {
    // console.warn('Ignoring empty or invalid path in isPathIgnoredByActiveFilter:', filePath); // Can be noisy
    return true; // Treat as ignorable
  }

  // Check against default system/common ignores first
  if (systemDefaultFilter.ignores(relativeToRoot)) {
    return true;
  }

  // Then, check against the provided contextual ignoreFilter.
  // This filter is expected to have all patterns already normalized to be relative to rootDir.
  if (ignoreFilter.ignores(relativeToRoot)) {
    return true;
  }

  return false; // If not ignored by any of the above, it's not ignored.
}

// ======================
// IGNORE CACHE LOGIC
// ======================

/**
 * Clears all ignore-related caches
 */
function clearIgnoreCaches() {
  compiledIgnoreFilterCache.clear();
  rawGitignorePatternsCache.clear();
  console.log('Cleared all ignore caches');
}

// ======================
// AUTOMATIC MODE
// ======================

/**
 * The function `collectGitignoreMapRecursive` recursively scans directories to collect and map
 * `.gitignore` patterns.
 * @param startDir - The `startDir` parameter in the `collectGitignoreMapRecursive` function represents
 * the directory from which the function will start collecting `.gitignore` files and their patterns
 * recursively. It is the initial directory where the function will begin its search for `.gitignore`
 * files and process subdirectories.
 * @param rootDir - The `rootDir` parameter in the `collectGitignoreMapRecursive` function represents
 * the root directory from which the recursive search for `.gitignore` files starts. It is used to
 * calculate the relative paths of the directories where `.gitignore` files are found in relation to
 * the root directory.
 * @param [currentMap] - The `currentMap` parameter in the `collectGitignoreMapRecursive` function is a
 * Map object that stores the mapping of directory paths to arrays of gitignore patterns. Each key in
 * the map represents a directory path relative to the root directory, and the corresponding value is
 * an array of gitignore patterns
 * @returns The function `collectGitignoreMapRecursive` returns a `Map` object containing the directory
 * paths and corresponding patterns found in the `.gitignore` files within the specified directory and
 * its subdirectories.
 */
async function collectGitignoreMapRecursive(startDir, rootDir, currentMap = new Map()) {
  const normalizedStartDir = normalizePath(startDir);
  const normalizedRootDir = normalizePath(rootDir);

  try {
    await fs.promises.access(normalizedStartDir, fs.constants.R_OK);
  } catch (err) {
    console.warn(`Cannot access directory: ${normalizedStartDir}`, err);
    return currentMap;
  }

  // Read .gitignore in current directory
  const gitignorePath = safePathJoin(normalizedStartDir, '.gitignore');
  try {
    const content = await fs.promises.readFile(gitignorePath, 'utf8');
    const patterns = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));

    if (patterns.length > 0) {
      const relativeDirPath = safeRelativePath(normalizedRootDir, normalizedStartDir) || '.';
      currentMap.set(relativeDirPath, patterns);
      console.log(`Found .gitignore in ${relativeDirPath} with ${patterns.length} patterns`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error reading ${gitignorePath}:`, err);
    }
  }

  // Recursively scan subdirectories in parallel
  try {
    const dirents = await fs.promises.readdir(normalizedStartDir, { withFileTypes: true });
    const subdirs = dirents.filter((dirent) => dirent.isDirectory());

    // Process subdirectories in parallel
    await Promise.all(
      subdirs.map(async (dirent) => {
        const subDir = safePathJoin(normalizedStartDir, dirent.name);
        await collectGitignoreMapRecursive(subDir, normalizedRootDir, currentMap);
      })
    );
  } catch (err) {
    console.error(`Error reading directory ${normalizedStartDir} for recursion:`, err);
  }

  return currentMap;
}

/**
 * The function `createAutomaticIgnoreFilter` generates an ignore filter based on parent filters and
 * patterns from a `.gitignore` file in automatic mode.
 * @param rootDir - The `rootDir` parameter represents the root directory of your project. It is the
 * starting point from which all other directories are referenced.
 * @param currentDir - The `currentDir` parameter in the `createAutomaticIgnoreFilter` function
 * represents the current directory for which the ignore filter is being created. It is used to
 * determine the path to the `.gitignore` file and to adjust patterns relative to this directory.
 * @param parentIgnoreFilter - The `parentIgnoreFilter` parameter is used to provide an existing ignore
 * filter instance that contains patterns to be added to the new ignore filter being created. If the
 * `parentIgnoreFilter` is a valid ignore instance, its rules will be added to the new filter. If it is
 * not a valid ignore
 * @param [ignoreMode=automatic] - The `ignoreMode` parameter in the `createAutomaticIgnoreFilter`
 * function determines how patterns are added to the ignore filter. If `ignoreMode` is set to
 * `'automatic'`, patterns will be added from the `.gitignore` file in the current directory. If it is
 * set to any
 * @returns The function `createAutomaticIgnoreFilter` returns an instance of an ignore filter (`ig`)
 * that includes patterns from the parent ignore filter (if provided and valid) and patterns from a
 * `.gitignore` file if in automatic mode.
 */
function createAutomaticIgnoreFilter(
  rootDir,
  currentDir,
  parentIgnoreFilter,
  ignoreMode = 'automatic'
) {
  const ig = ignore();

  // 1. Add all patterns from parent filter
  if (parentIgnoreFilter && typeof parentIgnoreFilter.ignores === 'function') {
    // If parentIgnoreFilter is a valid ignore instance, add its rules
    ig.add(parentIgnoreFilter);
  } else if (parentIgnoreFilter) {
    // Optional: Log a warning if parentIgnoreFilter was expected but invalid
    console.warn(
      '[createAutomaticIgnoreFilter] parentIgnoreFilter was provided but is not a valid ignore instance.'
    );
  }

  // 2. Only add patterns from .gitignore if in automatic mode
  if (ignoreMode === 'automatic') {
    const gitignorePath = safePathJoin(currentDir, '.gitignore');

    // Create a cache key for this .gitignore file
    const cacheKey = normalizePath(gitignorePath);

    let patterns = [];
    let needToProcessFile = true;

    // Check if we've already processed this .gitignore file
    if (rawGitignorePatternsCache.has(cacheKey)) {
      patterns = rawGitignorePatternsCache.get(cacheKey);
      needToProcessFile = false;
    }

    if (needToProcessFile) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        patterns = content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#'));

        // Cache the patterns for future use
        if (patterns.length > 0) {
          rawGitignorePatternsCache.set(cacheKey, patterns);

          // Get a more concise path for display
          const relativePath = safeRelativePath(rootDir, currentDir);
          console.log(
            `[Contextual Filter] Added ${patterns.length} patterns from ${relativePath === '.' ? 'root' : relativePath} .gitignore`
          );
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error(`Error reading ${gitignorePath}:`, err);
        }
      }
    }

    if (patterns.length > 0) {
      // Adjust patterns to be relative to current directory
      const adjustedPatterns = patterns.map((pattern) => {
        if (pattern.startsWith('/')) {
          return pattern.substring(1); // Make root-relative
        }
        if (!pattern.includes('**')) {
          // Make relative to current directory
          const relPath = safeRelativePath(rootDir, currentDir);
          return safePathJoin(relPath, pattern);
        }
        return pattern;
      });

      ig.add(adjustedPatterns);
    }
  }

  return ig;
}

/**
 * The function `loadAutomaticModeIgnoreFilter` loads an ignore filter for automatic mode based on
 * default patterns and patterns collected from `.gitignore` files in a specified directory.
 * @param rootDir - The `rootDir` parameter is the root directory path where the automatic mode ignore
 * filter will be loaded from.
 * @returns The function `loadAutomaticModeIgnoreFilter` returns an ignore filter (`ig`) object after
 * adding default patterns and patterns collected from `.gitignore` files in the specified `rootDir`.
 * It also caches the compiled filter for future use.
 */
async function loadAutomaticModeIgnoreFilter(rootDir) {
  rootDir = ensureAbsolutePath(rootDir);
  const cacheKey = `${rootDir}:automatic`;

  if (compiledIgnoreFilterCache.has(cacheKey)) {
    console.log(`Using cached ignore filter for automatic mode in:`, rootDir);
    const cached = compiledIgnoreFilterCache.get(cacheKey);
    console.log('Cache entry details:', {
      patternCount: Object.keys(cached.patterns.gitignoreMap || {}).length,
    });
    return cached.ig;
  }
  console.log(`Cache miss for key: ${cacheKey}`);

  const ig = ignore();

  try {
    // Automatic mode starts with only DEFAULT_PATTERNS
    const initialPatterns = [...DEFAULT_PATTERNS];

    ig.add(initialPatterns);
    console.log(
      `[Automatic Mode] Added ${initialPatterns.length} default patterns (excludedFiles.js not used for main filter)`
    );

    const gitignoreMap = await collectGitignoreMapRecursive(rootDir, rootDir);
    let totalGitignorePatterns = 0;

    // Store raw patterns with their origin directory
    const patternOrigins = new Map();
    for (const [relativeDirPath, patterns] of gitignoreMap) {
      patternOrigins.set(relativeDirPath, patterns);

      // Add patterns to root filter
      const patternsToAdd = patterns.map((pattern) => {
        // Ensure patterns are correctly relative to the rootDir
        if (pattern.startsWith('/')) {
          // Anchored to .gitignore's location's root
          return normalizePath(
            path.join(relativeDirPath === '.' ? '' : relativeDirPath, pattern.substring(1))
          );
        }
        // For patterns like 'file.txt' or 'dir/', they apply to the .gitignore's directory and subdirs
        // For patterns like '**/foo' or 'foo/**' they are more global within the scope of that .gitignore
        // The ignore library handles this if paths are relative to the .gitignore's location.
        // We make them relative to rootDir here.
        return normalizePath(path.join(relativeDirPath === '.' ? '' : relativeDirPath, pattern));
      });

      if (patternsToAdd.length > 0) {
        ig.add(patternsToAdd);
        totalGitignorePatterns += patternsToAdd.length;
        console.log(
          `[Automatic Mode] Added ${patternsToAdd.length} repository patterns from ${relativeDirPath}/.gitignore`
        );
      }
    }

    if (totalGitignorePatterns > 0) {
      console.log(
        `[Automatic Mode] Added ${totalGitignorePatterns} repository-specific patterns (combined with ${initialPatterns.length} default patterns) for:`,
        rootDir
      );
    }

    compiledIgnoreFilterCache.set(cacheKey, {
      ig,
      patterns: {
        gitignoreMap: Object.fromEntries(gitignoreMap),
        patternOrigins: Object.fromEntries(patternOrigins),
      },
    });

    return ig;
  } catch (err) {
    console.error(`Error in loadAutomaticModeIgnoreFilter for ${rootDir}:`, err);
    return ig;
  }
}

// ======================
// GLOBAL MODE
// ======================

/**
 * The function `createGlobalIgnoreFilter` creates a global ignore filter by combining default
 * patterns, global mode exclusions, and custom ignores.
 * @param [customIgnores] - The `customIgnores` parameter is an optional array that allows users to
 * specify additional patterns to ignore in the global filter. These custom patterns will be
 * normalized, sorted, and added to the global filter along with the default patterns and other
 * predefined exclusions. The function then logs the number of
 * @returns The function `createGlobalIgnoreFilter` is returning an instance of the `ignore` class with
 * global ignore patterns added based on default patterns, GlobalModeExclusion entries, and any custom
 * ignores provided as input.
 */
function createGlobalIgnoreFilter(customIgnores = []) {
  const normalizedCustomIgnores = (customIgnores || []).map((p) => p.trim()).sort();
  const ig = ignore();
  const globalPatterns = [
    ...DEFAULT_PATTERNS,
    ...GlobalModeExclusion,
    ...normalizedCustomIgnores,
  ].map((pattern) => normalizePath(pattern));
  ig.add(globalPatterns);
  console.log(
    `[Global Mode] Added ${DEFAULT_PATTERNS.length} default patterns, ${GlobalModeExclusion.length} GlobalModeExclusion entries, and ${normalizedCustomIgnores.length} custom ignores.`
  );

  console.log(
    `[Global Mode] Total patterns in global filter: ${globalPatterns.length} (includes ${DEFAULT_PATTERNS.length} defaults, ${GlobalModeExclusion.length} GlobalModeExclusion, ${normalizedCustomIgnores.length} custom).`
  );
  // console.log(`[Global Mode] Custom ignores added:`, normalizedCustomIgnores); // This can be noisy if many custom ignores

  return ig;
}

// Exports
module.exports = {
  systemDefaultFilter, // Pre-compiled default ignore filter (uses imported DEFAULT_PATTERNS)
  loadAutomaticModeIgnoreFilter, // for Automatic Mode
  createGlobalIgnoreFilter, // for Global Mode
  createAutomaticIgnoreFilter, // utils
  isPathIgnoredByActiveFilter, // Utils
  isPathExcludedByDefaults, // Utils
  globalModeExclusionFilter, // exported for equivalence tests (plan 026)
  compiledIgnoreFilterCache, // Cache for ignore filters
  clearIgnoreCaches, // clear ignore caches
};
