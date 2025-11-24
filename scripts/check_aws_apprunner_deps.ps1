param(
    [switch]$NoInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-NormalizedVersion {
    param(
        [string]$Raw
    )

    if (-not $Raw) {
        return $null
    }

    $clean = $Raw.Trim() -replace '^[^0-9]*', '' -replace '[^0-9\.]+.*$',''

    if (-not $clean) {
        return $null
    }

    try {
        return [Version]$clean
    } catch {
        return $null
    }
}

function Invoke-VersionCommand {
    param(
        [ScriptBlock]$Command
    )

    try {
        $output = & $Command | Out-String
        return $output.Trim()
    } catch {
        return $null
    }
}

$wingetAvailable = $false
try {
    Get-Command -Name winget -ErrorAction Stop | Out-Null
    $wingetAvailable = $true
} catch {
    $wingetAvailable = $false
}

$dependencies = @(
    [PSCustomObject]@{
        Name = 'Node.js'
        Command = 'node'
        VersionCommand = { & node --version }
        MinVersion = [Version]'18.0.0'
        WingetId = 'OpenJS.NodeJS.LTS'
        Notes = 'Required for backend build scripts.'
        ManualUrl = 'https://nodejs.org/en/download/'
    },
    [PSCustomObject]@{
        Name = 'npm'
        Command = 'npm'
        VersionCommand = { & npm --version }
        MinVersion = [Version]'9.0.0'
        WingetId = 'OpenJS.NodeJS.LTS'
        Notes = 'Ships with Node.js.'
        ManualUrl = 'https://nodejs.org/en/download/'
    },
    [PSCustomObject]@{
        Name = 'Docker CLI'
        Command = 'docker'
        VersionCommand = { & docker --version }
        MinVersion = [Version]'24.0.0'
        WingetId = 'Docker.DockerDesktop'
        Notes = 'Needed to build and push container images.'
        ManualUrl = 'https://www.docker.com/products/docker-desktop/'
    },
    [PSCustomObject]@{
        Name = 'AWS CLI v2'
        Command = 'aws'
        VersionCommand = { & aws --version }
        MinVersion = [Version]'2.4.0'
        WingetId = 'Amazon.AWSCLI'
        Notes = 'Used to push images and trigger App Runner deployments.'
        ManualUrl = 'https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html'
    },
    [PSCustomObject]@{
        Name = 'Terraform'
        Command = 'terraform'
        VersionCommand = { & terraform version }
        MinVersion = [Version]'1.5.0'
        WingetId = 'Hashicorp.Terraform'
        Notes = 'Optional but recommended for IaC workflow.'
        ManualUrl = 'https://developer.hashicorp.com/terraform/downloads'
        ParseVersion = {
            param($raw)
            if (-not $raw) { return $null }
            if ($raw -match 'Terraform v([0-9\.]+)') {
                return $Matches[1]
            }
            return $null
        }
    }
)

$results = @()

foreach ($dep in $dependencies) {
    $status = 'OK'
    $installedVersion = $null
    $installAttempted = $false
    $installSucceeded = $false
    $needsInstall = $false

    try {
        Get-Command -Name $dep.Command -ErrorAction Stop | Out-Null
        $rawVersion = Invoke-VersionCommand -Command $dep.VersionCommand

        $parserProperty = $dep.PSObject.Properties['ParseVersion']
        $parser = if ($parserProperty) { $parserProperty.Value } else { $null }

        if ($parser) {
            $parsed = & $parser $rawVersion
            if ($parsed) {
                try {
                    $installedVersion = [Version](Get-NormalizedVersion -Raw $parsed)
                } catch {
                    $installedVersion = $null
                }
            } else {
                $installedVersion = $null
            }
        } else {
            $installedVersion = Get-NormalizedVersion -Raw $rawVersion
        }

        if (-not $installedVersion) {
            $status = 'Unknown version'
            $needsInstall = $true
        } elseif ($dep.MinVersion -and $installedVersion -lt $dep.MinVersion) {
            $status = "Outdated ($installedVersion)"
            $needsInstall = $true
        }
    } catch {
        $status = 'Missing'
        $needsInstall = $true
    }

    if ($needsInstall -and -not $NoInstall) {
        if ($wingetAvailable -and $dep.WingetId) {
            $installAttempted = $true
            try {
                Write-Host "Installing $($dep.Name) via winget..." -ForegroundColor Cyan
                winget install --id $dep.WingetId -e --silent | Out-Null
                $installSucceeded = $true
                $status = 'Installed just now'
            } catch {
                Write-Warning "Failed to install $($dep.Name) via winget: $($_.Exception.Message)"
            }
        } else {
            Write-Warning "winget not available. Install $($dep.Name) manually."
        }
    }

    $results += [PSCustomObject]@{
        Dependency = $dep.Name
        Status = $status
        Version = if ($installedVersion) { $installedVersion.ToString() } else { 'n/a' }
        MinVersion = if ($dep.MinVersion) { $dep.MinVersion.ToString() } else { 'n/a' }
        InstallAttempted = $installAttempted
        InstallSucceeded = $installSucceeded
        Notes = $dep.Notes
    }
}

Write-Host ''
Write-Host 'Dependency Status' -ForegroundColor Green
$results | Format-Table -AutoSize

$missing = $results | Where-Object { $_.Status -in @('Missing','Outdated','Unknown version') }
if ($missing) {
    Write-Host ''
    Write-Warning 'Some dependencies are missing or outdated.'
    foreach ($item in $missing) {
        Write-Host " - $($item.Dependency): $($item.Status)" -ForegroundColor Yellow
        $depInfo = $dependencies | Where-Object { $_.Name -eq $item.Dependency } | Select-Object -First 1
        if ($depInfo -and $depInfo.ManualUrl) {
            Write-Host "   Download: $($depInfo.ManualUrl)" -ForegroundColor DarkGray
        }
    }
    exit 1
}

Write-Host ''
Write-Host 'All required dependencies are ready.' -ForegroundColor Green
