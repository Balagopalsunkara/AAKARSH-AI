param(
    [string]$Region = "ap-south-1",
    [string]$AccountId = "734115983240",
    [string]$BackendRepository = "ai-app-backend",
    [string]$FrontendRepository = "ai-app-frontend",
    [string]$BackendServiceArn,
    [string]$FrontendServiceArn,
    [string]$ImageTag,
    [string]$AwsProfile,
    [switch]$SkipBuild,
    [switch]$SkipDeploy,
    [switch]$DryRun
)

<#!
.SYNOPSIS
    Build and deploy the AI-APP containers to AWS ECR and AWS App Runner.

.DESCRIPTION
    1. Runs the dependency checker to ensure Docker, AWS CLI, and Terraform are available.
    2. Ensures the requested ECR repositories exist (creates them if missing).
    3. Builds backend and frontend Docker images (unless -SkipBuild is provided).
    4. Pushes images to ECR with a generated or supplied tag.
    5. Triggers App Runner deployments using the provided service ARNs (unless -SkipDeploy).

.PARAMETER Region
    AWS region (default ap-south-1).

.PARAMETER AccountId
    AWS account ID.

.PARAMETER BackendRepository
    Name of the backend ECR repository (default ai-app-backend).

.PARAMETER FrontendRepository
    Name of the frontend ECR repository (default ai-app-frontend).

.PARAMETER BackendServiceArn
    ARN of the backend App Runner service. Required to trigger deployment.

.PARAMETER FrontendServiceArn
    ARN of the frontend App Runner service. Required to trigger deployment.

.PARAMETER ImageTag
    Optional Docker image tag. If omitted, the script uses the current git commit (first 12 chars) or falls back to a timestamp.

.PARAMETER AwsProfile
    Optional AWS CLI profile name to use for authentication.

.PARAMETER SkipBuild
    Skip docker build/push steps.

.PARAMETER SkipDeploy
    Skip App Runner deployment triggers.

.PARAMETER DryRun
    Print the actions without executing AWS or Docker commands.

.EXAMPLE
    ./scripts/start_aws_apprunner.ps1 -BackendServiceArn "arn:aws:apprunner:ap-south-1:123456789012:service/backend" -FrontendServiceArn "arn:aws:apprunner:ap-south-1:123456789012:service/frontend"

.NOTES
    The script prompts for AWS access key and secret if no profile or environment credentials are available.
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

function Set-AwsSessionCredentials {
    if ($DryRun) {
        Write-Info 'Dry run mode: skipping AWS credential configuration.'
        return
    }

    if ($AwsProfile) {
        Write-Info "Using AWS profile '$AwsProfile'."
        $env:AWS_PROFILE = $AwsProfile
        $env:AWS_DEFAULT_REGION = $Region
        return
    }

    if ($env:AWS_ACCESS_KEY_ID -and $env:AWS_SECRET_ACCESS_KEY) {
        Write-Info 'Using AWS credentials from environment.'
        $env:AWS_DEFAULT_REGION = $Region
        return
    }

    Write-Info 'AWS credentials not found. Prompting for Access Key ID and Secret.'
    $accessKey = Read-Host 'AWS Access Key ID'
    if (-not $accessKey) {
        throw 'AWS Access Key ID is required.'
    }

    $secretSecure = Read-Host 'AWS Secret Access Key' -AsSecureString
    if (-not $secretSecure) {
        throw 'AWS Secret Access Key is required.'
    }

    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretSecure)
    try {
        $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }

    $env:AWS_ACCESS_KEY_ID = $accessKey
    $env:AWS_SECRET_ACCESS_KEY = $secret
    $env:AWS_DEFAULT_REGION = $Region

    Write-Info 'AWS credentials configured for this session.'
}

function Invoke-CommandSafe {
    param(
        [string]$Command,
        [switch]$PassThru
    )

    Write-Info "Executing: $Command"

    if ($DryRun) {
        Write-Host '  (dry-run) command not executed.'
        return
    }

    $result = Invoke-Expression $Command
    if ($PassThru) {
        return $result
    }
}

function Set-EcrRepository {
    param(
        [string]$RepositoryName
    )

    $describeCmd = "aws ecr describe-repositories --repository-names $RepositoryName --region $Region"
    try {
        Invoke-CommandSafe -Command $describeCmd -PassThru | Out-Null
        Write-Info "ECR repository '$RepositoryName' already exists."
    }
    catch {
        Write-Info "Creating ECR repository '$RepositoryName'."
        $createCmd = "aws ecr create-repository --repository-name $RepositoryName --image-scanning-configuration scanOnPush=true --image-tag-mutability IMMUTABLE --region $Region"
        Invoke-CommandSafe -Command $createCmd | Out-Null
    }
}

function Get-ImageTag {
    if ($ImageTag) {
        return $ImageTag
    }

    try {
        $gitHead = (git rev-parse HEAD).Trim()
        if ($gitHead) {
            return $gitHead.Substring(0, [Math]::Min(12, $gitHead.Length))
        }
    }
    catch { }

    return (Get-Date -Format 'yyyyMMddHHmmss')
}

function Invoke-ImageBuildPush {
    param(
        [string]$RepositoryName,
        [string]$ContextPath
    )

    $imageUri = '{0}.dkr.ecr.{1}.amazonaws.com/{2}:{3}' -f $AccountId, $Region, $RepositoryName, $script:GlobalImageTag
    $dockerBuild = "docker build -t $imageUri `"$ContextPath`""
    Invoke-CommandSafe -Command $dockerBuild

    $dockerPush = "docker push $imageUri"
    Invoke-CommandSafe -Command $dockerPush

    return $imageUri
}

function Invoke-EcrLogin {
    $loginCmd = "aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $AccountId.dkr.ecr.$Region.amazonaws.com"
    Invoke-CommandSafe -Command $loginCmd
}

# ------------------ Script execution begins ------------------

$ScriptRoot = Split-Path -Parent $PSCommandPath
$RepoRoot = Split-Path -Parent $ScriptRoot
Set-Location $RepoRoot

Write-Info 'Running dependency check...'
$dependencyScript = Join-Path $ScriptRoot 'check_aws_apprunner_deps.ps1'
if (Test-Path $dependencyScript) {
    $dependencyCmd = "powershell -ExecutionPolicy RemoteSigned -File `"$dependencyScript`" -NoInstall"
    Invoke-CommandSafe -Command $dependencyCmd
}
else {
    Write-Warn 'Dependency checker not found. Skipping.'
}

Set-AwsSessionCredentials

if (-not $DryRun) {
    # Validate AWS CLI access with STS call
    Write-Info 'Validating AWS credentials with STS...'    
    $callerIdentityCmd = "aws sts get-caller-identity --output json"
    try {
        Invoke-CommandSafe -Command $callerIdentityCmd | Out-Null
    }
    catch {
        throw 'Unable to validate AWS credentials. Check permissions and re-run.'
    }
}

Set-EcrRepository -RepositoryName $BackendRepository
Set-EcrRepository -RepositoryName $FrontendRepository

if (-not $SkipBuild) {
    Invoke-EcrLogin

    $script:GlobalImageTag = Get-ImageTag
    Write-Info "Using image tag: $script:GlobalImageTag"

    $backendImageUri = Invoke-ImageBuildPush -RepositoryName $BackendRepository -ContextPath (Join-Path $RepoRoot 'backend')
    $frontendImageUri = Invoke-ImageBuildPush -RepositoryName $FrontendRepository -ContextPath (Join-Path $RepoRoot 'frontend')

    Write-Host ''
    Write-Info 'Images pushed:'
    Write-Host "  Backend : $backendImageUri"
    Write-Host "  Frontend: $frontendImageUri"
}
else {
    Write-Warn 'Skipping docker build & push per -SkipBuild.'
}

if (-not $SkipDeploy) {
    if (-not $BackendServiceArn -or -not $FrontendServiceArn) {
        Write-Warn 'App Runner service ARNs not provided. Skipping deployment trigger.'
    }
    else {
        Write-Info 'Triggering App Runner deployments...'
        $backendDeployCmd = "aws apprunner start-deployment --service-arn $BackendServiceArn"
        $frontendDeployCmd = "aws apprunner start-deployment --service-arn $FrontendServiceArn"

        Invoke-CommandSafe -Command $backendDeployCmd
        Invoke-CommandSafe -Command $frontendDeployCmd
    }
}
else {
    Write-Warn 'Skipping App Runner deployment per -SkipDeploy.'
}

Write-Host ''
Write-Info 'Start script complete.'
if ($DryRun) {
    Write-Warn 'Dry run mode was enabled. No changes were made.'
}
