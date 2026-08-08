# PasteMax

<p align="center">
   <img src="https://github.com/user-attachments/assets/fe5ed9f2-fcb1-41d7-bc38-fb130fadf116" width="150" alt="PasteMaxIcon">
</p>

<p align="center">
   A modern file viewer application for developers to easily navigate, search, and copy code from repositories.<br/>
   Ideal for pasting into ChatGPT or your LLM of choice. Built with Electron, React, and TypeScript.
</p>

<p align="center">
   <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
   <a href="https://github.com/AIVibecode1/pastemax/issues"><img src="https://img.shields.io/github/issues/AIVibecode1/pastemax" alt="GitHub issues"></a>
   <a href="https://github.com/AIVibecode1/pastemax/releases/latest"><img src="https://img.shields.io/github/v/release/AIVibecode1/pastemax" alt="GitHub releases"></a>
</p>

## Fork Notice

PasteMax was originally created and is maintained by **[kleneway](https://github.com/kleneway)**. The original project lives at [github.com/kleneway/pastemax](https://github.com/kleneway/pastemax) and all credit for the app concept, design, and most of the code goes to the original author.

**This repository is a fork** maintained by [AIVibecode](https://github.com/AIVibecode1). It keeps the original author's work intact and adds fixes, security hardening, performance work, and a visual refresh on top. The improvements in this fork are listed in the next section and in `CHANGELOG.md` under `[1.2.0]`.

## What's New in This Fork

This fork focuses on three things: fixing real bugs, making the app safer, and making it faster. The full detail is in `CHANGELOG.md`; here is the short version.

**Bugs fixed**

- Your instructions are now placed at the TOP of the copied content, as the app always intended. Before, they were appended at the end.
- Closing the window during a folder scan no longer leaves the app stuck for minutes.
- Corrupt saved data can no longer make the app show a blank screen.
- The task type you selected is restored when you reopen the app.
- Files like `foo.app.js` are no longer wrongly skipped by the macOS bundle check.
- Scan failures now show a real error instead of a false "Found 0 files".

**Security**

- The renderer can only use a small whitelist of internal channels.
- The app refuses to open file, data, and about links in new windows.
- Production now runs a strict Content-Security-Policy.
- The app only scans folders you actually picked with the folder dialog.

**Performance**

- Reopening a folder skips re-reading files that did not change.
- The file tree no longer rebuilds completely when you expand or collapse.
- Copy formatting runs off the UI thread, so huge copies do not freeze the window.
- The model list loads once instead of on every selection.

**Dependencies**

- Electron bumped from 40 (end of life) to 43.3.0.
- `npm audit` went from 30 to 6 findings, all of which need a separate breaking upgrade.

**Quality**

- 81 automated tests now guard the core logic.
- The app now lives in a git repository with a clean commit history.
- `App.tsx` was split into focused hooks and is about 300 lines smaller.

**Visual refresh**

- Self-hosted Geist fonts (no Google Fonts requests).
- Refined color palette, consistent focus rings for keyboard users, and tabular numbers in token counts.

## Overview

PasteMax is a simple desktop app built for developers using AI coding assistants. It makes sharing your code with LLMs easy, thanks to a smart file explorer with token counting, file filtering, quick copy, and a previewer. Select the files you need, skip binaries and junk, and get clean, formatted snippets ready for your LLM.

![PasteMax](https://github.com/user-attachments/assets/c2eea45f-2696-4bfa-8eaf-a6b07e7ca522)
![FilePreview](https://github.com/user-attachments/assets/9bb9b6ff-b9cc-4655-b8a8-318f23c2e2b0)
![ModelList](https://github.com/user-attachments/assets/e045f4f0-1bdd-4a30-8696-b388d598dcc5)

## Video

[YouTube Link](https://youtu.be/YV-pZSDNnPo)

## Features

### File Navigation & Management

- **File Tree Navigation**: Browse directories and files with an expandable tree view
- **Search Capabilities**: Quickly find files by name or content
- **Sorting Options**: Sort files by name, size, or token count
- **File Change Watcher**: Automatically updates the file list when files are added, modified, or deleted
- **Manual Refresh**: Option to perform a full directory re-scan when needed

### AI-Ready Features

- **Token Counting**: View approximate token count for each file
- **Model Context Limit**: Select different models (Claude-3.7, GPT-4o, Gemini 2.5, etc.)
- **Context Limit Warning**: Get alerted when selections exceed the model's context limit

### Content & Preview

- **File Previewer**: View file contents in a dedicated preview pane
- **Selection Management**: Select multiple files and copy their contents together
- **Binary File Detection**: Automatic detection and exclusion of binary files
- **Smart File Exclusion**: Auto-excludes package-lock.json, node_modules, etc.

### Workflow Enhancements

- **Workspace Management**: Save and load workspaces for quick directory access
- **Automatic Update Checker**: Stay current with the latest releases
- **Dark Mode**: Toggle between light and dark themes for comfortable viewing
- **Cross-Platform**: Available for Windows, Mac, Linux and WSL

## Installation

### Download Binary

Download the latest PasteMax version from the [releases page](https://github.com/AIVibecode1/pastemax/releases/latest).

### Build from Source

1. Clone the repository:

```
git clone https://github.com/AIVibecode1/pastemax.git
cd pastemax
```

2. Install dependencies:

```
npm install
```

3. Build the app:

```
npm run build:electron
npm run package
```

**Note**: If you encounter issues with `npm run package`, you can try the platform-specific command:

```
npm run package:win
npm run package:mac
npm run package:linux
```

After successful build, you'll find the executable files inside the `release-builds` directory:

**Windows:**

- `PasteMax Setup 1.2.0.exe` - Installer version
- `PasteMax 1.2.0.exe` - Portable version

**Mac:**

- `PasteMax 1.2.0.dmg` - Installer version
- `PasteMax 1.2.0.zip` - Portable version

**Linx:**

- `PasteMax 1.2.0.deb` - Installer version (Deb package)
- `PasteMax 1.2.0.rpm` - Installer version (RPM package)
- `PasteMax 1.2.0.AppImage` - Portable version

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Running in Development Mode

To run the application in development mode:

```
# Start the Vite dev server
npm run dev

# In a separate terminal, start Electron
npm run dev:electron
```

On newer npm versions (11+), the install step may block the Electron binary download. If `electron.exe` is missing after `npm install`, run:

```
npm install-scripts approve electron esbuild electron-winstaller
```

### Testing

Run the automated test suite:

```
npm test
```

Quality gates used during development:

```
npm run typecheck
npm run lint
npm run build
```

### Building for Production

To build the application for production:

```
# Build the React app with Vite and update paths for Electron
npm run build:electron

# Create platform-specific distributables
npm run package
```

## Project Structure

- `src/` - React application source code
  - `components/` - React components
  - `context/` - React context providers
  - `hooks/` - Custom React hooks
  - `types/` - TypeScript type definitions
  - `utils/` - Utility functions
  - `styles/` - CSS styles
  - `assets/` - Static assets like images
- `electron/` - Electron-Backend related files
- `public/` - Public assets (favicon, etc.)
- `scripts/` - Utility scripts for building and testing
- `docs/` - Documentation

## Libraries Used

- Electron - Desktop application framework
- React - UI library
- TypeScript - Type safety
- Vite - Build tool and development server
- tiktoken - Token counting for LLM context estimation
- ignore - .gitignore-style pattern matching for file exclusions
- chokidar - File Watcher

## Troubleshooting

### Getting "Warning: Not trusted" on Windows

If you see a warning about the app not being trusted, you can bypass this by clicking "run anyways". This is a common issue with Electron apps, especially since PasteMax is not signed.

### Getting "App not responding" on Mac

If you encounter an "App not responding" message on Mac, it may be due to macOS security settings. You can try the following:

1. Open System Preferences.
2. Go to Security & Privacy.
3. Under the General tab, look for the "Allow apps downloaded from" section.
4. Look for "PasteMax" and click "Open Anyway".

### Other Issues

If you encounter other issues, please [report them on GitHub](https://github.com/AIVibecode1/pastemax/issues).

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Star History ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=AIVibecode1/pastemax&type=Date)](https://www.star-history.com/#AIVibecode1/pastemax&Date)

---
