param(
    [string]$Region = "ap-south-1",
    [string]$AccountId = "734115983240",
    [string]$BackendRepository = "ai-app-backend",
    [string]$FrontendRepository = "ai-app-frontend",
    [Parameter(Mandatory=$true)][string]$BackendServiceArn,
    [Parameter(Mandatory=$true)][string]$FrontendServiceArn,
    [string]$ImageTag,
    [string]$AwsProfile,
    [switch]$SkipBuild,
    [switch]$SkipDeploy,
    [bool]$LaunchBrowser = $true,
    [switch]$DryRun
)

<#!
.SYNOPSIS
    End-to-end deploy of AI-APP to AWS App Runner and launch the public web UI.

.DESCRIPTION
    This orchestrator wraps the lower-level start script to build/push images, trigger App Runner
    deployments, enforce public ingress, wait for the services to reach RUNNING status, and finally
    open the frontend URL in the default browser (unless -LaunchBrowser:$false is supplied).

.NOTES
    Requires AWS CLI credentials with ECR and App Runner permissions. Use -DryRun to preview actions.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Warn {
    param([string]$Message)
    Write-Warning $Message
}

function Invoke-StartScript {
    $scriptRoot = Split-Path -Parent $PSCommandPath
    $startScript = Join-Path $scriptRoot 'start_aws_apprunner.ps1'

    if (-not (Test-Path $startScript)) {
        throw "start_aws_apprunner.ps1 not found at $startScript"
    }

    $argsList = @(
        '-Region', $Region,
        '-AccountId', $AccountId,
        '-BackendRepository', $BackendRepository,
        '-FrontendRepository', $FrontendRepository,
        '-BackendServiceArn', $BackendServiceArn,
        '-FrontendServiceArn', $FrontendServiceArn
    )

    if ($ImageTag)    { $argsList += @('-ImageTag', $ImageTag) }
    if ($AwsProfile)  { $argsList += @('-AwsProfile', $AwsProfile) }
    if ($SkipBuild)   { $argsList += '-SkipBuild' }
    if ($SkipDeploy)  { $argsList += '-SkipDeploy' }
    if ($DryRun)      { $argsList += '-DryRun' }

    Write-Info 'Invoking start_aws_apprunner.ps1...'
    & powershell -ExecutionPolicy RemoteSigned -File $startScript @argsList
}

function Get-AppRunnerService {
    param([string]$ServiceArn)

    if ($DryRun) {
        Write-Info "(dry-run) Skipping describe-service for $ServiceArn"
        return $null
    }

    $json = aws apprunner describe-service --service-arn $ServiceArn --output json
    return $json | ConvertFrom-Json
}

function Set-AppRunnerPublicIngress {
    param([string]$ServiceArn)

    if ($DryRun) {
        Write-Info "(dry-run) Skipping ingress update for $ServiceArn"
        return
    }

    $service = Get-AppRunnerService -ServiceArn $ServiceArn
    if (-not $service) { return }

    $isPublic = $service.Service.IngressConfiguration.IsPubliclyAccessible
    if ($isPublic) {
        Write-Info "Service ingress already public for $ServiceArn"
        return
    }

    Write-Info "Enabling public ingress for $ServiceArn"
    aws apprunner update-service `
        --service-arn $ServiceArn `
        --ingress-configuration IsPubliclyAccessible=true `
        --output json | Out-Null
}

function Wait-AppRunnerServiceReady {
    param(
        [string]$ServiceArn,
        [int]$TimeoutSeconds = 900,
        [int]$PollSeconds = 15
    )

    if ($DryRun -or $SkipDeploy) {
        Write-Info "(dry-run/skip) Skipping wait for $ServiceArn"
        return $null
    }

    $startTime = Get-Date
    while ($true) {
        $service = Get-AppRunnerService -ServiceArn $ServiceArn
        if ($null -eq $service) { return $null }

        $status = $service.Service.Status
    Write-Info ("Service status for {0}: {1}" -f $ServiceArn, $status)

        if ($status -eq 'RUNNING') {
            return $service
        }

        if ((Get-Date) -gt $startTime.AddSeconds($TimeoutSeconds)) {
            throw "Timed out waiting for App Runner service to become RUNNING ($ServiceArn)."
        }

        Start-Sleep -Seconds $PollSeconds
    }
}

function Open-FrontendUi {
    param([string]$Url)

    if (-not $Url) {
        Write-Warn 'Frontend URL not provided; skipping browser launch.'
        return
    }

    Write-Info "Opening frontend UI: $Url"
    if (-not $DryRun) {
        Start-Process $Url | Out-Null
    }
}

# --- main ---
$currentLocation = Get-Location
try {
    $repoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
    Set-Location $repoRoot

    Invoke-StartScript

    Set-AppRunnerPublicIngress -ServiceArn $BackendServiceArn
    Set-AppRunnerPublicIngress -ServiceArn $FrontendServiceArn

    $backendService = Wait-AppRunnerServiceReady -ServiceArn $BackendServiceArn
    $frontendService = Wait-AppRunnerServiceReady -ServiceArn $FrontendServiceArn

    $frontendUrl = $null
    if ($frontendService -and $frontendService.Service) {
        $frontendUrl = $frontendService.Service.ServiceUrl
    }

    $backendUrl = $null
    if ($backendService -and $backendService.Service) {
        $backendUrl = $backendService.Service.ServiceUrl
    }

    Write-Host ''
    Write-Info 'Deployment summary:'
    if ($backendUrl)  { Write-Host "  Backend API : $backendUrl" }
    if ($frontendUrl) { Write-Host "  Frontend UI : $frontendUrl" }

    if ($LaunchBrowser -and $frontendUrl) {
        Open-FrontendUi -Url $frontendUrl
    } elseif ($LaunchBrowser -and -not $frontendUrl) {
        Write-Warn 'Frontend URL missing; cannot launch browser.'
    } else {
        Write-Info 'Browser launch disabled by parameter.'
    }
}
finally {
    Set-Location $currentLocation
}
