[CmdletBinding(SupportsShouldProcess)]
param([switch]$RemoveUserData)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$dataDir = Join-Path $env:LOCALAPPDATA 'TosuAICoach'
$manifestPath = Join-Path $dataDir 'install.json'
$manifest = if (Test-Path -LiteralPath $manifestPath) { Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json } else { $null }
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'TOSU AI Coach.lnk'

if ($PSCmdlet.ShouldProcess($shortcut, 'Supprimer le raccourci de démarrage')) {
  Remove-Item -LiteralPath $shortcut -Force -ErrorAction SilentlyContinue
}

if ($manifest) {
  $counter = Join-Path $manifest.tosu_path 'static\Coach IA by Shinra'
  if ($PSCmdlet.ShouldProcess($counter, 'Supprimer le counter TOSU')) {
    Remove-Item -LiteralPath $counter -Recurse -Force -ErrorAction SilentlyContinue
  }
  $installDir = [IO.Path]::GetFullPath([string]$manifest.install_dir)
  $allowedRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs'))
  if (-not $installDir.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $installDir) -ne 'TosuAICoach') {
    throw "Chemin d’installation inattendu, suppression refusée : $installDir"
  }
  if ($PSCmdlet.ShouldProcess($installDir, 'Supprimer le programme')) {
    Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($RemoveUserData -and $PSCmdlet.ShouldProcess($dataDir, 'Supprimer définitivement historique, configuration et logs')) {
  Remove-Item -LiteralPath $dataDir -Recurse -Force
} else {
  Write-Host "Données conservées dans $dataDir"
}
