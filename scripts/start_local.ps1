# AI-APP Local Dev Starter
# Starts backend and frontend dev servers in separate PowerShell windows
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\start_local.ps1 [-UsePnpm]

param(
    [switch]$UsePnpm
)

$PackageManager = if ($UsePnpm) { "pnpm" } else { "npm" }

Write-Host "AI-APP Local Development Starter" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$ProjectRoot = Split-Path -Parent $PSScriptRoot

try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js 18 or higher." -ForegroundColor Red
    exit 1
}

if ($UsePnpm) {
    try {
        $pnpmVersion = pnpm --version
        Write-Host "✓ pnpm version: $pnpmVersion" -ForegroundColor Green
    } catch {
        Write-Host "✗ pnpm not found." -ForegroundColor Yellow
        $install = Read-Host "Would you like to install pnpm globally? (y/n)"
        if ($install -eq 'y') {
            Write-Host "Installing pnpm..." -ForegroundColor Yellow
            npm install -g pnpm | Out-Null
        } else {
            Write-Host "Continuing without pnpm. Using npm instead." -ForegroundColor Yellow
            $PackageManager = "npm"
        }
    }
}

function Start-ServiceWindow {
    param (
        [string]$Path,
        [string]$CommandLabel
    )

    $script = @"
Set-Location '$Path'
$PackageManager install
$PackageManager run dev
"@

    Write-Host "Starting $CommandLabel..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $script
}

Start-ServiceWindow -Path "$ProjectRoot\backend" -CommandLabel "backend server"

Start-Sleep -Seconds 2

Start-ServiceWindow -Path "$ProjectRoot\frontend" -CommandLabel "frontend server"

Write-Host "`n✓ Development servers started!" -ForegroundColor Green
Write-Host "`nAccess points:" -ForegroundColor Cyan
Write-Host "- Frontend UI: http://localhost:3000" -ForegroundColor White
Write-Host "- Backend API: http://localhost:4000/health" -ForegroundColor White
Write-Host "`nBoth servers are running in separate PowerShell windows." -ForegroundColor Yellow
