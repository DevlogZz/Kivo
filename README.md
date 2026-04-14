<div align="center">
  <img src="assests/icon/icon.png" alt="Kivo Logo" width="128" height="128">

  # Kivo

  **A minimal, fast, and modern desktop HTTP client built with Rust and Tauri**

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Rust](https://img.shields.io/badge/Rust-1.77+-orange.svg)](https://www.rust-lang.org/)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
  [![React](https://img.shields.io/badge/React-19-lightblue.svg)](https://react.dev/)
  [![Vite](https://img.shields.io/badge/Vite-7-purple.svg)](https://vitejs.dev/)

  ![Kivo Banner](/assests/banner/banner-dark.jpg)
</div>

## Overview

Kivo is a lightweight cross-platform HTTP client designed for developers who value speed and simplicity. It provides a clean, distraction-free environment for testing APIs and managing request collections without the bloat of traditional tools.

## Features

- **Cross-Platform Support**: Native builds for Windows (MSI/NSIS), macOS (Silicon/Intel DMG), and Linux (DEB/RPM)
- **Multi-Scope Environments**: Manage global workspace variables and collection-specific overrides
- **Hierarchical Structure**: Organize your API requests into workspaces and nested collections
- **Modernized Settings**: Completely redesigned Overview, Headers, and Auth pages for a premium experience
- **Setup Wizard**: Seamless onboarding experience to bootstrap your application configuration
- **Tabbed Interface**: Work on multiple requests simultaneously with a robust tab management system
- **Sidebar Search**: Quickly filter through your collections and requests with real-time search
- **Advanced Request Interaction**: Comprehensive context menus for cloning, renaming, and copy-pasting requests
- **Self-Updating**: Built-in background auto-updater with signature verification guarantees you're always on the latest version.
- **Security**: Local-first data storage ensuring your request data stays on your machine
- **JSON Response Query Engine** *(upcoming)*: Filter and search JSON response bodies using text search, conditional expressions (`userid > 3`), compound queries (`age > 20 && status == active`), and logical operators. See the [engine documentation](docs/json-query-engine.md) for details.

> **Note**: The JSON Query Engine is not included in the latest release (v0.3.5). To try it, [build the project from source](#build-from-source). It will be available in the next release.

## Download Kivo (v0.3.5)

Get the latest stable version for your operating system:

| Platform | Installer | Architecture |
| :--- | :--- | :--- |
| **Windows** | [Download .exe](https://github.com/dexter-xD/Kivo/releases/download/v0.3.5/Kivo_0.3.5_x64-setup.exe) / [.msi](https://github.com/dexter-xD/Kivo/releases/download/v0.3.5/Kivo_0.3.5_x64_en-US.msi) | `x64` |
| **macOS** | [Apple Silicon .dmg](https://github.com/dexter-xD/Kivo/releases/download/v0.3.5/Kivo_0.3.5_aarch64.dmg) | `arm64` |
| **macOS** | [Intel .dmg](https://github.com/dexter-xD/Kivo/releases/download/v0.3.5/Kivo_0.3.5_x64.dmg) | `x64` |
| **Linux** | [Download .deb](https://github.com/dexter-xD/Kivo/releases/download/v0.3.5/Kivo_0.3.5_amd64.deb) | `x64` |
| **Linux** | [Download .rpm](https://github.com/dexter-xD/Kivo/releases/download/v0.3.5/Kivo-0.3.5-1.x86_64.rpm) | `x64` |

*For other formats and old releases, visit the [Releases page](https://github.com/dexter-xD/Kivo/releases).*

### Linux Installation Guide

- **Debian / Ubuntu**:
  ```bash
  sudo apt install ./Kivo_0.3.5_amd64.deb
  ```
- **Fedora / RHEL**:
  ```bash
  sudo dnf install ./Kivo-0.3.5-1.x86_64.rpm
  ```
- **Arch / Other (RPM via rpm tool)**:
  ```bash
  sudo rpm -i --nodeps --nosignature ./Kivo-0.3.5-1.x86_64.rpm
  ```

---

## Build from Source

### Prerequisites

- Node.js (v18 or later)
- pnpm (Recommended)
- Rust toolchain (v1.77 or later)

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/dexter-xD/Kivo.git
   cd Kivo
   ```

2. Install frontend dependencies
   ```bash
   pnpm install
   ```

3. Run in development mode
   ```bash
   pnpm dev
   ```

### Building for Production

To create a production-ready bundle for your current platform:

```bash
pnpm build
```

The installer will be generated in the `desktop/target/release/bundle` directory.

## Contributing

Contributions are welcome! If you have suggestions for improvements or encounter any bugs, please feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Changelog

### v0.3.5 (2026-04-12)

- **Cross-Platform Storage Fixes**. Improved default storage path logic for macOS and Linux with robust fallbacks.
- **Smart Setup Wizard**. Added a subfolder creation toggle and automatic directory detection to prevent data nesting.
- **Native Experience Refinement**. Smarter path separator handling and dynamic placeholders based on detected OS.

### v0.3.4 (2026-04-11)

- **macOS Support**. Added native builds for both Apple Silicon (`aarch64`) and Intel (`x86_64`) Macs with a premium transparent titlebar experience.
- **Linux RPM Expansion**. Added support for `.rpm` packages, bringing Kivo to Fedora, RHEL, openSUSE, and more.
- **Improved Release Pipeline**. Automated build and release process for all major desktop platforms.

### v0.3.3 (2026-04-11)

- **Auto-Update Polish**. Refined the auto-update UI to adhere to the sharp-edged design system.
- **Bug Fixes**. Fixed various UI inconsistencies and improved window drag regions.

### v0.3.2 (2026-04-08)

- **Auto Updater**. Kivo now automatically checks, downloads, and stages updates in the background flawlessly, offering a convenient Restart button once verified.
- **Signed Upgrades**. Ensures full security by validating all upgrades against cryptographic public keys.

### v0.3.1 (2026-04-06)

- **Collection Data Loss**. Editing environment variables no longer wipes requests and subfolders from the collection directory.
- **Requests Not Persisted**. New requests are now correctly saved to disk and survive app restarts.
- **Request Not Working**. Deleting a request now properly removes its file from disk.
- **Slash Names Breaking Storage**. Collection and request names with `/` are now safely sanitized for the filesystem.

See the full [CHANGELOG.md](CHANGELOG.md) for more details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app/) for the excellent desktop application framework
- [Rust](https://www.rust-lang.org/) for providing the performance and safety
- [React](https://react.dev/) and [Tailwind CSS](https://tailwindcss.com/) for the modern frontend stack
- [Lucide](https://lucide.dev/) for the beautiful icon set
