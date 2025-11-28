# PowerShell installation script for .doc file support dependencies (Windows)
# This script installs antiword for Windows

Write-Host "Installing dependencies for .doc file support..." -ForegroundColor Cyan

# Check if Chocolatey is installed
if (Get-Command choco -ErrorAction SilentlyContinue) {
    Write-Host "Detected Chocolatey - Installing antiword..." -ForegroundColor Green
    choco install antiword -y
    Write-Host ""
    Write-Host "✅ Dependencies installed successfully!" -ForegroundColor Green
    Write-Host "You can now use .doc file support in the application." -ForegroundColor Green
} else {
    Write-Host "Chocolatey not found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please install antiword manually:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://www.winfield.demon.nl/" -ForegroundColor Yellow
    Write-Host "2. Extract and add to PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Or install Chocolatey first:" -ForegroundColor Yellow
    Write-Host "https://chocolatey.org/install" -ForegroundColor Cyan
    exit 1
}

