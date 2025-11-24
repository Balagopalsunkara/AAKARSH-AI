param(
    [string]$Output = "backend\\dist\\backend-lambda.zip",
    [switch]$SkipInstall,
    [switch]$IncludeDevDependencies
)

$ErrorActionPreference = 'Stop'

function Invoke-NpmInstall {
    param(
        [string]$WorkingDirectory,
        [bool]$IncludeDev
    )

    Push-Location $WorkingDirectory
    try {
        if ($IncludeDev) {
            npm.cmd install
        } else {
            npm.cmd install --omit=dev
        }
    } finally {
        Pop-Location
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendPath = Join-Path $repoRoot 'backend'
$distPath = Join-Path $backendPath 'dist'
$stagingPath = Join-Path $distPath 'lambda'
$zipPath = if ([System.IO.Path]::IsPathRooted($Output)) { $Output } else { Join-Path $repoRoot $Output }

if (!(Test-Path $backendPath)) {
    throw "Backend directory not found at $backendPath"
}

if (-not $SkipInstall) {
    Write-Host 'Installing backend dependencies...'
    Invoke-NpmInstall -WorkingDirectory $backendPath -IncludeDev:$IncludeDevDependencies
}

Write-Host 'Preparing staging directory...'
Remove-Item -Path $stagingPath -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $stagingPath | Out-Null

$excludeDirectories = @('dist', 'coverage', 'logs', 'lambda', '.vscode', '__tests__', '__mocks__')
$excludeFiles = @('server.test.js', 'jest.config.js', '*.md', 'package-lock.json')

$robocopyArgs = @(
    $backendPath,
    $stagingPath,
    '/MIR'
)

foreach ($dir in $excludeDirectories) {
    $robocopyArgs += '/XD'
    $robocopyArgs += (Join-Path $backendPath $dir)
}

foreach ($file in $excludeFiles) {
    $robocopyArgs += '/XF'
    $robocopyArgs += $file
}

Write-Host 'Copying project files for Lambda package...'
$null = & robocopy @robocopyArgs
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -gt 3) {
    throw "robocopy failed with exit code $robocopyExit"
}

Write-Host 'Ensuring production dependencies are present...'
$packageJsonPath = Join-Path $stagingPath 'package.json'
if (!(Test-Path $packageJsonPath)) {
    throw 'package.json not copied to staging directory.'
}

Write-Host 'Creating deployment archive...'
if (!(Test-Path (Split-Path $zipPath -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $zipPath -Parent) | Out-Null
}

Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $stagingPath '*') -DestinationPath $zipPath -Force

Write-Host "Lambda deployment package created at $zipPath" -ForegroundColor Green
