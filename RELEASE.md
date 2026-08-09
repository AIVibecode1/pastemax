# Building and Releasing PasteMax

This document explains how to build and release PasteMax for distribution.

## Building the Application Locally

To build the application for local testing:

```bash
npm run build:electron
```

This will:

1. Build the React app with Vite
2. Fix any resource paths for Electron compatibility
3. Package the application with electron-builder

The packaged application will be available in the `release-builds` directory.

## Creating a Release

To create a release version for distribution:

```bash
# For a public release without publishing
npm run package

# For a GitHub release (requires GitHub token)
npm run release
```

### Releasing This Fork (v1.2.0 and later)

This fork is released from the AIVibecode1 GitHub account. The `.github/workflows/build.yml` workflow does the heavy lifting: when you push a version tag, it runs the full quality suite (typecheck, strict lint, tests) on three platforms, builds the installers (Windows NSIS + portable, macOS dmg/zip, Linux AppImage/deb/rpm), and creates a draft GitHub release with every artifact attached.

The steps are:

1. Bump the version in `package.json` (for example, `"version": "1.3.0"`).
2. Update `CHANGELOG.md` with the new version heading and date.
3. Commit and push the code, then push the tag:

```bash
git add -A
git commit -m "release: v1.3.0"
git push origin master
git tag v1.3.0
git push origin v1.3.0
```

4. Wait for the "Build and Release" workflow to finish (about 15-25 minutes, three platforms in parallel). You can watch it under the Actions tab.
5. Open the draft release it created (Releases page, "Draft" tab), check the notes and the attached installers, then click **Publish release**.

Notes:

- The release is created as a DRAFT on purpose, so you can review it before it goes public. The in-app update checker only sees published releases.
- Tests, typecheck, and strict lint all run in CI before packaging. If any of them fail, no release is created.
- The workflow builds unsigned apps (no code signing certificate), which matches the app's existing "Not trusted" behavior on Windows.
- If you bump Electron or other packages that run install scripts, npm may block those scripts on fresh installs (npm 11.16+ behavior). The approved list lives in `package.json` under `allowScripts`; when the version changes, run `npm approve-scripts --allow-scripts-pending` and commit the updated list.

### Platform-Specific Notes

#### macOS

For macOS builds, you may need to sign and notarize the application for distribution:

1. Set up the following environment variables:

   ```bash
   export APPLE_ID=your.apple.id@example.com
   export APPLE_APP_SPECIFIC_PASSWORD=your-app-specific-password
   export TEAM_ID=your-team-id
   export NOTARIZE=true
   ```

2. Run the release command:
   ```bash
   npm run release
   ```

#### Windows

For Windows builds, you'll get:

- NSIS installer (.exe)
- Portable version (.exe)

#### Linux

For Linux builds, you'll get:

- AppImage (.AppImage)
- Debian package (.deb)
- RPM package (.rpm)

## Common Issues and Solutions

### Asset Loading Issues

If you encounter blank screens or resource loading errors:

1. Check if the app is properly finding the assets
2. The issue might be related to how paths are resolved in the packaged app
3. Our build script automatically fixes path issues in index.html

### macOS Specific Issues

For notarization issues:

- Make sure you have the correct environment variables set
- You may need to create an app-specific password in your Apple ID account

### Windows/Linux Specific Issues

- For Linux, ensure you have the necessary build dependencies installed
- For Windows, ensure you have the appropriate certificate if you want to sign the application
