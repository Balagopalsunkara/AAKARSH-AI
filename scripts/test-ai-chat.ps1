# test-ai-chat.ps1
# PowerShell script to test the AI chat backend endpoint
# Usage: Run in PowerShell. Prompts for user input, sends to backend, prints AI response.
# Set AI_APP_API_URL to override the default http://localhost:4000

$apiUrl = $env:AI_APP_API_URL
if (-not $apiUrl) {
    $apiUrl = "http://localhost:4000"
}

function Get-Models {
    try {
        $resp = Invoke-RestMethod -Uri "$apiUrl/api/v1/models" -UseBasicParsing
        return $resp.models[0].id
    } catch {
        Write-Host "[ERROR] Could not fetch models. Using default: 'local'." -ForegroundColor Red
        return "local"
    }
}

function Send-ChatMessage($message, $model) {
    $body = @{ messages = @(@{ role = 'user'; content = $message }); model = $model; options = @{ maxTokens = 512; temperature = 0.7 } } | ConvertTo-Json -Depth 5
    try {
        $resp = Invoke-RestMethod -Uri "$apiUrl/api/v1/chat" -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing
        return $resp.message
    } catch {
        Write-Host "[ERROR] Chat request failed: $_" -ForegroundColor Red
        return $null
    }
}

$model = Get-Models
Write-Host "Using model: $model" -ForegroundColor Cyan

while ($true) {
    $userMsg = Read-Host "Type your message (or 'exit' to quit)"
    if ($userMsg -eq 'exit') { break }
    if ([string]::IsNullOrWhiteSpace($userMsg)) { continue }
    $aiResp = Send-ChatMessage $userMsg $model
    if ($aiResp) {
        Write-Host "AI: $aiResp" -ForegroundColor Green
    }
}
