#!/bin/bash
# Download antiword binaries for all platforms
# This script downloads precompiled antiword binaries and places them in resources/binaries/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARIES_DIR="$PROJECT_ROOT/resources/binaries"

echo "Downloading antiword binaries for all platforms..."

# Create directories
mkdir -p "$BINARIES_DIR/linux"
mkdir -p "$BINARIES_DIR/darwin"
mkdir -p "$BINARIES_DIR/win32"

# Download Linux binary (x86_64)
echo "Downloading Linux binary..."
if command -v wget &> /dev/null; then
    wget -q -O "$BINARIES_DIR/linux/antiword" "https://www.winfield.demon.nl/linux/antiword-0.37-1.i386.tar.gz" || {
        echo "Warning: Could not download Linux binary. You may need to compile it manually."
    }
elif command -v curl &> /dev/null; then
    curl -sL -o "$BINARIES_DIR/linux/antiword" "https://www.winfield.demon.nl/linux/antiword-0.37-1.i386.tar.gz" || {
        echo "Warning: Could not download Linux binary. You may need to compile it manually."
    }
else
    echo "Warning: Neither wget nor curl found. Please download binaries manually."
fi

# Note: For macOS and Windows, binaries need to be compiled or downloaded separately
# This is a placeholder - you'll need to provide actual binary URLs or compile them
echo ""
echo "⚠️  Note: macOS and Windows binaries need to be added manually:"
echo "   - macOS: Compile from source or use Homebrew binary"
echo "   - Windows: Download from https://www.winfield.demon.nl/"
echo ""
echo "Binaries should be placed in:"
echo "  - Linux: $BINARIES_DIR/linux/antiword"
echo "  - macOS: $BINARIES_DIR/darwin/antiword"
echo "  - Windows: $BINARIES_DIR/win32/antiword.exe"

# Make Linux binary executable if it exists
if [ -f "$BINARIES_DIR/linux/antiword" ]; then
    chmod +x "$BINARIES_DIR/linux/antiword"
fi

echo ""
echo "✅ Binary download script completed."
echo "Please ensure all platform binaries are present before building the app."

