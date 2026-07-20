[CmdletBinding()]
param()

$ErrorActionPreference = 'Continue'
$dataDir = Join-Path $env:LOCALAPPDATA 'TosuAICoach'
$manifestPath = Join-Path $dataDir 'install.json'

function Check([string]$Name, [bool]$Ok, [string]$Detail) {
  $symbol = if ($Ok) { '[OK]' } else { '[ERREUR]' }
  $color = if ($Ok) { 'Green' } else { 'Red' }
  Write-Host "$symbol $Name - $Detail" -ForegroundColor $color
}

$node = Get-Command node -ErrorAction SilentlyContinue
Check 'Node.js' ([bool]$node) $(if ($node) { & node --version } else { 'introuvable' })
$claude = Get-Command claude -ErrorAction SilentlyContinue
$codex = Get-Command codex -ErrorAction SilentlyContinue
Check 'Claude CLI' ([bool]$claude) $(if ($claude) { $claude.Source } else { 'introuvable (optionnel si Codex existe)' })
Check 'Codex CLI' ([bool]$codex) $(if ($codex) { $codex.Source } else { 'introuvable (optionnel si Claude existe)' })
Check 'Données utilisateur' (Test-Path -LiteralPath $dataDir) $dataDir

$manifest = if (Test-Path -LiteralPath $manifestPath) { Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json } else { $null }
Check 'Manifeste installation' ([bool]$manifest) $manifestPath
if ($manifest) {
  Check 'Installation' (Test-Path -LiteralPath $manifest.install_dir) $manifest.install_dir
  Check 'TOSU' (Test-Path -LiteralPath $manifest.tosu_path) $manifest.tosu_path
  $counter = Join-Path $manifest.tosu_path 'static\Coach IA by Shinra\index.html'
  Check 'Counter Coach IA' (Test-Path -LiteralPath $counter) $counter
}

try {
  $tosu = Invoke-RestMethod -Uri 'http://127.0.0.1:24050/json/v2' -TimeoutSec 3
  Check 'API TOSU' $true "état $($tosu.state.name)"
} catch { Check 'API TOSU' $false $_.Exception.Message }

try {
  $coach = Invoke-RestMethod -Uri 'http://127.0.0.1:24051/state' -TimeoutSec 3
  Check 'API Coach' $true "état $($coach.status)"
} catch { Check 'API Coach' $false $_.Exception.Message }

$log = Join-Path $dataDir 'logs\coach.log'
if (Test-Path -LiteralPath $log) {
  Write-Host "`nDernières lignes du log :" -ForegroundColor Cyan
  Get-Content -LiteralPath $log -Tail 8
}
