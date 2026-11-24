[CmdletBinding()]
param(
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$envPath = Join-Path $repoRoot '.env'
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw 'Root .env was not found. Run this script from a cloned MtaaLab repository.'
}

$envValues = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*([^#=]+?)\s*=(.*)$') {
        $envValues[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'")
    }
}

$webhookToken = $envValues['WEBHOOK_TOKEN']
$publicBaseUrl = $envValues['PUBLIC_BASE_URL']
if ([string]::IsNullOrWhiteSpace($webhookToken)) {
    throw 'WEBHOOK_TOKEN must be set in the root .env.'
}
if ([string]::IsNullOrWhiteSpace($publicBaseUrl)) {
    throw 'PUBLIC_BASE_URL must be set in the root .env.'
}

try {
    $publicUri = [System.Uri]::new($publicBaseUrl)
} catch {
    throw 'PUBLIC_BASE_URL must be a valid HTTPS ngrok URL.'
}
if ($publicUri.Scheme -ne 'https' -or $publicUri.AbsolutePath -ne '/' -or $publicUri.Query) {
    throw 'PUBLIC_BASE_URL must be an HTTPS base URL with no path or query string.'
}

$policy = @{
    on_http_request = @(
        @{
            expressions = @('req.url.path.startsWith("/api/webhooks/africastalking/")')
            actions = @(
                @{
                    type = 'add-headers'
                    config = @{
                        headers = @{
                            'x-webhook-token' = $webhookToken
                        }
                    }
                }
            )
        }
    )
}
$policyJson = ConvertTo-Json -InputObject $policy -Depth 8
ConvertFrom-Json -InputObject $policyJson | Out-Null

$policyPath = Join-Path ([System.IO.Path]::GetTempPath()) ("mtaalab-ngrok-policy-{0}.json" -f [guid]::NewGuid().ToString('N'))
try {
    [System.IO.File]::WriteAllText(
        $policyPath,
        $policyJson,
        [System.Text.UTF8Encoding]::new($false)
    )

    if ($ValidateOnly) {
        Write-Host 'ngrok policy is valid; the webhook token was not displayed and ngrok was not started.'
        return
    }

    if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
        throw 'ngrok is not on PATH. Install or enable the ngrok command, then retry.'
    }

    Write-Host "Forwarding localhost:8000 through $($publicUri.Host). Press Ctrl+C to stop."
    Write-Host "The temporary ngrok policy adds the webhook token only to Africa's Talking callback paths."
    & ngrok http 8000 --url $publicBaseUrl --traffic-policy-file $policyPath
    if ($LASTEXITCODE -ne 0) {
        throw "ngrok exited with code $LASTEXITCODE."
    }
} finally {
    Remove-Item -LiteralPath $policyPath -Force -ErrorAction SilentlyContinue
}
