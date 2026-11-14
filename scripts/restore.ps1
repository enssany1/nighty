[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$BackupDirectory,
  [string]$DeploymentDirectory = (Split-Path -Parent $PSScriptRoot),
  [string]$ProjectName = "nighty",
  [string[]]$ComposeFiles = @("compose.yaml"),
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore is destructive. Re-run with -ConfirmRestore after verifying the named deployment and backup." }
$backup = (Resolve-Path -LiteralPath $BackupDirectory).Path
$deployment = (Resolve-Path -LiteralPath $DeploymentDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $deployment "compose.yaml") -PathType Leaf)) { throw "DeploymentDirectory must contain compose.yaml" }
$manifestPath = Join-Path $backup "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Backup manifest is missing" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema -ne "nighty.backup/v1") { throw "Unsupported backup manifest" }
foreach ($file in $manifest.files) {
  $target = Join-Path $backup ([string]$file.name)
  if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Backup file missing: $($file.name)" }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
  if ($actual -ne ([string]$file.sha256).ToLowerInvariant()) { throw "Backup digest mismatch: $($file.name)" }
}
$compose = @("compose", "--project-directory", $deployment, "-p", $ProjectName)
foreach ($composeFile in $ComposeFiles) { $compose += @("-f", (Join-Path $deployment $composeFile)) }
& docker @compose stop web api
if ($LASTEXITCODE -ne 0) { throw "Could not stop Nighty application services" }
try {
  & docker @compose cp (Join-Path $backup "database.dump") "postgres:/tmp/nighty-restore.dump"
  if ($LASTEXITCODE -ne 0) { throw "Could not stage database backup" }
  & docker @compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner /tmp/nighty-restore.dump'
  if ($LASTEXITCODE -ne 0) { throw "Database restore failed" }
  $volumeMount = "${backup}:/restore:ro"
  & docker @compose run --rm --no-deps --entrypoint sh --volume $volumeMount api -c 'find /data/attachments -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -xzf /restore/attachments.tar.gz -C /data'
  if ($LASTEXITCODE -ne 0) { throw "Attachment restore failed" }
} finally {
  & docker @compose exec -T postgres rm -f /tmp/nighty-restore.dump 2>$null
  & docker @compose up -d api web
}
Write-Output "Nighty restore completed for deployment: $deployment"
