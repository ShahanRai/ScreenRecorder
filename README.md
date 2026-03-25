# Screen Recorder

A cross-platform desktop application for recording screen activity, built with web technologies.

## 🛠 Tech Stack & Architecture

This project is built using the **Electron** framework, which allows for the development of native desktop applications using web technologies.

- **Programming Languages**: JavaScript / TypeScript (Node.js environment)
- **Framework**: [Electron](https://www.electronjs.org/)
- **Native Addons**: C/C++ (via `node-gyp` for native OS-level bindings, crucial for performance-intensive tasks like screen capture and media encoding).

### Architecture
Electron applications follow a multi-process architecture:
1. **Main Process**: Runs in a Node.js environment. It is responsible for the application's lifecycle, managing windows (Renderer processes), and interacting with the native operating system.
2. **Renderer Process**: Runs a Chromium instance. It is responsible for the Graphical User Interface (UI) and capturing the screen via web APIs like `navigator.mediaDevices.getDisplayMedia` or Electron's `desktopCapturer`.

## 📦 Key Dependencies

Based on the project environment, the following core tools and libraries are utilized:
- **`electron-builder` (`app-builder-lib`)**: Used for packaging and building the application for distribution (e.g., generating NSIS installers for Windows, configuring `.plist` files for macOS).
- **`node-gyp`**: A cross-platform CLI tool written in Node.js for compiling native addon modules for Node.js. It interacts with Python and Visual Studio/Xcode build tools under the hood.
- **`dotenv`**: Loads environment variables from a `.env` file into `process.env`, keeping configuration separate from code.
- **`plist`**: Used to parse and build macOS property list files, as part of the build or configuration step for Apple environments.

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS recommended)
- Python and C++ build tools (required by `node-gyp` to compile native dependencies)

### Installation
1. Clone the repository and navigate to the project directory:
   ```bash
   cd "Screen recorder"
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
   *(Note: This step may take some time as `node-gyp` will compile any native extensions).*

### Running Locally
To start the application in development mode:
```bash
npm start
```
*(Check the scripts in `package.json` if a different command is required).*

## 🛠 Building for Production

This project uses `electron-builder` to create distributable executables. Depending on your host OS, it can generate:

- **Windows**: NSIS installer (`.exe`)
- **macOS**: `.dmg` or `.app` distributions
- **Linux**: `.AppImage`, `.deb`, or `.snap`

To package the application:
```bash
npm run build
```
*(Please check `package.json` for the exact build scripts configured for your environment).*

## 📄 License

This project is licensed under the MIT License.