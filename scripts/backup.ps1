[CmdletBinding()]
param(
  [string]$DeploymentDirectory = (Split-Path -Parent $PSScriptRoot),
  [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) "backups"),
  [string]$ProjectName = "nighty",
  [string[]]$ComposeFiles = @("compose.yaml")
)

$ErrorActionPreference = "Stop"
$deployment = (Resolve-Path -LiteralPath $DeploymentDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $deployment "compose.yaml") -PathType Leaf)) { throw "DeploymentDirectory must contain compose.yaml" }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$output = (Resolve-Path -LiteralPath $OutputDirectory).Path
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$destination = Join-Path $output "nighty-$timestamp"
New-Item -ItemType Directory -Path $destination | Out-Null
$compose = @("compose", "--project-directory", $deployment, "-p", $ProjectName)
foreach ($composeFile in $ComposeFiles) { $compose += @("-f", (Join-Path $deployment $composeFile)) }
$database = "database.dump"
$attachments = "attachments.tar.gz"
try {
  & docker @compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/nighty-database.dump'
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL backup failed" }
  & docker @compose cp "postgres:/tmp/nighty-database.dump" (Join-Path $destination $database)
  if ($LASTEXITCODE -ne 0) { throw "Could not copy PostgreSQL backup" }
  & docker @compose exec -T api sh -c 'tar -czf /tmp/nighty-attachments.tar.gz -C /data attachments'
  if ($LASTEXITCODE -ne 0) { throw "Attachment backup failed" }
  & docker @compose cp "api:/tmp/nighty-attachments.tar.gz" (Join-Path $destination $attachments)
  if ($LASTEXITCODE -ne 0) { throw "Could not copy attachment backup" }
} finally {
  & docker @compose exec -T postgres rm -f /tmp/nighty-database.dump 2>$null
  & docker @compose exec -T api rm -f /tmp/nighty-attachments.tar.gz 2>$null
}
$manifest = [ordered]@{
  schema = "nighty.backup/v1"
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  deploymentDirectory = $deployment
  files = @(
    [ordered]@{ name = $database; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $destination $database)).Hash.ToLowerInvariant() },
    [ordered]@{ name = $attachments; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $destination $attachments)).Hash.ToLowerInvariant() }
  )
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $destination "manifest.json") -Encoding utf8NoBOM
Write-Output "Nighty backup created: $destination"
