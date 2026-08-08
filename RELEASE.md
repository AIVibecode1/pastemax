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

This fork is released from the AIVibecode1 GitHub account. The original project's release flow still applies, plus these steps:

1. Bump the version in `package.json` (for example, `"version": "1.2.0"`).
2. Update `CHANGELOG.md` with the new version heading and date.
3. Rebuild the installers and test them:

```bash
npm run test-build:win
```

4. Test the built `.exe` files in `release-builds` on your machine (the installer and the portable version).
5. Commit the version bump and docs, then tag and push:

```bash
git add -A
git commit -m "release: v1.2.0"
git tag v1.2.0
git push origin master
git push origin v1.2.0
```

6. Create the release on GitHub (github.com/AIVibecode1/pastemax/releases/new) and attach the installers from `release-builds`.

Note: the release URL in `electron/update-checker.js` and the badge links in `README.md` must point at the account that publishes the releases. For this fork, that is `AIVibecode1/pastemax`.

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
