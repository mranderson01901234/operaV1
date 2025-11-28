# Bundling Binaries for .doc Support

This application bundles `antiword` binaries for all platforms so users don't need to install anything.

## Building Binaries

### Option 1: Download Pre-built Binaries

Run the download script:
```bash
./scripts/download-binaries.sh
```

### Option 2: Compile from Source

#### Linux
```bash
wget https://www.winfield.demon.nl/linux/antiword-0.37.tar.gz
tar -xzf antiword-0.37.tar.gz
cd antiword-0.37
make
cp antiword ../resources/binaries/linux/
```

#### macOS
```bash
brew install antiword
cp $(which antiword) resources/binaries/darwin/
```

#### Windows
1. Download from: https://www.winfield.demon.nl/
2. Extract `antiword.exe`
3. Place in `resources/binaries/win32/antiword.exe`

## Directory Structure

```
resources/
  binaries/
    linux/
      antiword          (executable)
    darwin/
      antiword          (executable)
    win32/
      antiword.exe      (executable)
```

## Build Configuration

The binaries are automatically included in the Electron build. Ensure `electron-builder` or your build tool includes the `resources` directory.

## Testing

After building, verify binaries are included:
- Check `out/resources/binaries/` contains platform-specific binaries
- Test .doc file upload in the application

