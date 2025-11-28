# .doc File Support - System Dependencies

This application supports reading legacy Microsoft Word `.doc` files, but requires the `antiword` system utility to be installed.

## Quick Installation

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update && sudo apt-get install -y antiword
```

### Linux (Fedora/RHEL)
```bash
sudo dnf install antiword
```

### Linux (Arch)
```bash
sudo pacman -S antiword
```

### macOS
```bash
brew install antiword
```

### Windows
Using Chocolatey:
```powershell
choco install antiword
```

Or download manually from: https://www.winfield.demon.nl/

## Automated Installation

We provide installation scripts for convenience:

### Linux/macOS
```bash
./scripts/install-dependencies.sh
```

### Windows (PowerShell)
```powershell
.\scripts\install-dependencies.ps1
```

## Verification

After installation, verify that `antiword` is available:
```bash
antiword --version
```

## Application Behavior

- **If antiword is installed**: `.doc` files will be processed automatically
- **If antiword is missing**: The application will show a helpful error message with installation instructions

## For Production Builds

If you're distributing this Electron application, you have two options:

1. **Require users to install antiword** (current approach)
   - Document the requirement in your README
   - Show helpful error messages if missing

2. **Bundle antiword binaries** (advanced)
   - Download platform-specific binaries
   - Include them in your Electron app bundle
   - Update PATH or use absolute paths to the bundled binary
   - This requires additional build configuration

## Troubleshooting

### "antiword: command not found"
- Ensure antiword is installed
- Verify it's in your PATH: `which antiword` (Linux/macOS) or `where antiword` (Windows)
- Restart the application after installation

### Permission Errors
- On Linux/macOS, you may need `sudo` to install
- On Windows, run PowerShell as Administrator for Chocolatey

## Alternative Solutions

If you cannot install system dependencies, consider:
- Converting `.doc` files to `.docx` format (which doesn't require system dependencies)
- Using online conversion services
- Using Microsoft Word or LibreOffice to convert files

