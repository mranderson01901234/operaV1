#!/bin/bash
# Installation script for .doc file support dependencies
# This script installs antiword for the current platform

set -e

echo "Installing dependencies for .doc file support..."

# Detect OS
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    if command -v apt-get &> /dev/null; then
        echo "Detected Debian/Ubuntu - Installing antiword..."
        sudo apt-get update
        sudo apt-get install -y antiword
    elif command -v dnf &> /dev/null; then
        echo "Detected Fedora/RHEL - Installing antiword..."
        sudo dnf install -y antiword
    elif command -v pacman &> /dev/null; then
        echo "Detected Arch Linux - Installing antiword..."
        sudo pacman -S --noconfirm antiword
    elif command -v yum &> /dev/null; then
        echo "Detected CentOS/RHEL (yum) - Installing antiword..."
        sudo yum install -y antiword
    else
        echo "Unknown Linux distribution. Please install antiword manually."
        exit 1
    fi
elif [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if command -v brew &> /dev/null; then
        echo "Detected macOS - Installing antiword via Homebrew..."
        brew install antiword
    else
        echo "Homebrew not found. Please install Homebrew first: https://brew.sh"
        exit 1
    fi
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    # Windows
    echo "Windows detected."
    if command -v choco &> /dev/null; then
        echo "Installing antiword via Chocolatey..."
        choco install antiword -y
    else
        echo "Chocolatey not found. Please install antiword manually:"
        echo "1. Download from: https://www.winfield.demon.nl/"
        echo "2. Extract and add to PATH"
        echo ""
        echo "Or install Chocolatey: https://chocolatey.org/install"
        exit 1
    fi
else
    echo "Unknown operating system: $OSTYPE"
    echo "Please install antiword manually for your platform."
    exit 1
fi

echo ""
echo "✅ Dependencies installed successfully!"
echo "You can now use .doc file support in the application."

