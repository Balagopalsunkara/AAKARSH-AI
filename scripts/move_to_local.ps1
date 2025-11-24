# AI-APP Mover Script
# Safely moves the project from OneDrive to a local path
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\move_to_local.ps1 -Destination "C:\projects\AI-APP" -RestartDocker

param(
    [Parameter(Mandatory=$true)]
    [string]$Destination,
    
    [switch]$RestartDocker
)

Write-Host "AI-APP Local Mover Script" -ForegroundColor Cyan
Write-Host "==========================`n" -ForegroundColor Cyan

# Get current directory
$Source = Get-Location

# Check if destination exists
if (Test-Path $Destination) {
    Write-Host "Destination already exists: $Destination" -ForegroundColor Yellow
    $confirm = Read-Host "Do you want to overwrite? (y/n)"
    if ($confirm -ne 'y') {
        Write-Host "Aborted." -ForegroundColor Red
        exit
    }
}

# Create destination directory
Write-Host "Creating destination directory..." -ForegroundColor Green
New-Item -ItemType Directory -Path $Destination -Force | Out-Null

# Copy files
Write-Host "Copying files from $Source to $Destination..." -ForegroundColor Green
Copy-Item -Path "$Source\*" -Destination $Destination -Recurse -Force

Write-Host "`nFiles copied successfully!" -ForegroundColor Green

# Restart Docker if requested
if ($RestartDocker) {
    Write-Host "`nRestarting Docker Desktop..." -ForegroundColor Yellow
    Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Host "Docker Desktop restarted." -ForegroundColor Green
}

Write-Host "`n✓ Project moved successfully to: $Destination" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Open VS Code: code `"$Destination`"" -ForegroundColor White
Write-Host "2. Run local dev: powershell -File `"$Destination\scripts\start_local.ps1`"" -ForegroundColor White
Write-Host "3. Or use Docker: cd `"$Destination`" && docker compose up -d" -ForegroundColor White
