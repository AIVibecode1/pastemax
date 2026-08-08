/**
 * Module to handle application update checks against GitHub releases.
 */
const https = require('https');
const { app } = require('electron');
const semver = require('semver');

/**
 * Checks for available updates by comparing current version with latest GitHub release.
 * Uses semver for robust version comparison.
 * @returns {Promise<Object>} Resolves to update status object with:
 *   - isUpdateAvailable {boolean}
 *   - currentVersion {string} (cleaned of any 'v' prefix)
 *   - latestVersion {string|null} (cleaned of any 'v' prefix)
 *   - releaseUrl {string|null}
 *   - error {string|null}
 */
async function checkForUpdates() {
  const debugLogs = [];
  try {
    const currentVersion = app.getVersion();
    const GITHUB_API_URL = 'api.github.com';
    const GITHUB_API_PATH = '/repos/AIVibecode1/pastemax/releases/latest';
    const USER_AGENT = 'PasteMax-Update-Checker';

    const options = {
      hostname: GITHUB_API_URL,
      path: GITHUB_API_PATH,
      method: 'GET',
      headers: {
        'User-Agent': USER_AGENT,
      },
    };

    const { latestVersionFromApi, releaseUrlFromApi } = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        debugLogs.push('GitHub API Status Code: ' + res.statusCode);

        // Log rate limit headers if present
        if (res.headers['x-ratelimit-limit']) {
          debugLogs.push('GitHub API X-RateLimit-Limit: ' + res.headers['x-ratelimit-limit']);
        }
        if (res.headers['x-ratelimit-remaining']) {
          debugLogs.push(
            'GitHub API X-RateLimit-Remaining: ' + res.headers['x-ratelimit-remaining']
          );
        }
        if (res.headers['x-ratelimit-reset']) {
          debugLogs.push('GitHub API X-RateLimit-Reset: ' + res.headers['x-ratelimit-reset']);
        }

        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API returned status code ${res.statusCode}`));
          return;
        }

        let rawData = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(rawData);
            // Field-selective log only: never ship raw API bodies to the renderer.
            debugLogs.push('GitHub API latest tag: ' + response.tag_name);
            if (!response.tag_name || !response.html_url) {
              reject(new Error('GitHub response missing required fields'));
              return;
            }

            resolve({
              latestVersionFromApi: response.tag_name,
              releaseUrlFromApi: response.html_url,
            });
          } catch (error) {
            reject(new Error(`Failed to parse GitHub response: ${error.message}`));
          }
        });
      });

      // Bound the request: a stalled connection must not hang the IPC forever.
      req.setTimeout(10000, () => {
        req.destroy(new Error('Update check timed out after 10 seconds'));
      });

      req.on('error', (error) => {
        reject(new Error(`Network error while checking for updates: ${error.message}`));
      });

      req.end();
    });

    // Clean versions by removing 'v' prefix if present
    const cleanLatestVersion = latestVersionFromApi.replace(/^v/, '');
    const cleanCurrentVersion = currentVersion.replace(/^v/, '');

    // Robust version comparison using semver
    debugLogs.push(
      'Current version (clean): ' +
        cleanCurrentVersion +
        ' semver.valid: ' +
        semver.valid(cleanCurrentVersion)
    );
    debugLogs.push(
      'Latest version (clean): ' +
        cleanLatestVersion +
        ' semver.valid: ' +
        semver.valid(cleanLatestVersion)
    );
    debugLogs.push(
      'semver.gt(latest, current): ' + semver.gt(cleanLatestVersion, cleanCurrentVersion)
    );

    const isUpdateAvailable =
      semver.valid(cleanLatestVersion) &&
      semver.valid(cleanCurrentVersion) &&
      semver.gt(cleanLatestVersion, cleanCurrentVersion);

    return {
      isUpdateAvailable,
      currentVersion: cleanCurrentVersion,
      latestVersion: cleanLatestVersion,
      releaseUrl: releaseUrlFromApi,
      error: null,
      debugLogs: debugLogs.join('\n'),
    };
  } catch (error) {
    debugLogs.push('Update check failed: ' + error.message);
    return {
      isUpdateAvailable: false,
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseUrl: null,
      error: error.message,
      debugLogs: debugLogs.join('\n'),
    };
  }
}

module.exports = { checkForUpdates };
