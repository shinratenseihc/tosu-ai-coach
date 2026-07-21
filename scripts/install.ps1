[CmdletBinding()]
param(
  [string]$TosuPath,
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\TosuAICoach'),
  [switch]$NoStartup,
  [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $env:LOCALAPPDATA 'TosuAICoach'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'TOSU AI Coach.lnk'

function Write-Step([string]$Message) { Write-Host "[TOSU AI Coach] $Message" -ForegroundColor Cyan }

function Resolve-TosuPath {
  param([string]$Requested)
  if ($Requested) { return (Resolve-Path -LiteralPath $Requested).Path }
  $process = Get-Process -Name 'tosu' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($process -and $process.Path) { return (Split-Path -Parent $process.Path) }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'tosu'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'tosu')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate 'static')) { return $candidate }
  }
  $answer = Read-Host 'Dossier de TOSU (celui qui contient static)'
  return (Resolve-Path -LiteralPath $answer).Path
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 20+ est requis : https://nodejs.org/' }
$major = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($major -lt 20) { throw "Node.js 20+ est requis (version détectée : $major)." }

$resolvedTosu = Resolve-TosuPath $TosuPath
$tosuStatic = Join-Path $resolvedTosu 'static'
if (-not (Test-Path -LiteralPath $tosuStatic)) { throw "Dossier static introuvable dans $resolvedTosu" }

Write-Step "Installation dans $InstallDir"
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $dataDir 'logs') -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $projectRoot 'coach-service.js') -Destination $InstallDir -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'osu-api.js') -Destination $InstallDir -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'start-coach.vbs') -Destination $InstallDir -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'config.example.json') -Destination $InstallDir -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination $InstallDir -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'LICENSE') -Destination $InstallDir -Force
$installedLib = Join-Path $InstallDir 'lib'
New-Item -ItemType Directory -Path $installedLib -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'lib\*') -Destination $installedLib -Recurse -Force
$installedDocs = Join-Path $InstallDir 'docs'
New-Item -ItemType Directory -Path $installedDocs -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\COACHING_KNOWLEDGE.md') -Destination $installedDocs -Force

$installedCounter = Join-Path $InstallDir 'counter'
New-Item -ItemType Directory -Path $installedCounter -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'counter\*') -Destination $installedCounter -Recurse -Force

$installedDashboard = Join-Path $InstallDir 'dashboard'
New-Item -ItemType Directory -Path $installedDashboard -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'dashboard\*') -Destination $installedDashboard -Recurse -Force

$tosuCounter = Join-Path $tosuStatic 'Coach IA by Shinra'
New-Item -ItemType Directory -Path $tosuCounter -Force | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'counter\*') -Destination $tosuCounter -Recurse -Force

$configPath = Join-Path $dataDir 'config.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  Copy-Item -LiteralPath (Join-Path $projectRoot 'config.example.json') -Destination $configPath
}
@{ install_dir = $InstallDir; tosu_path = $resolvedTosu; installed_at = (Get-Date).ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir 'install.json') -Encoding UTF8

if (-not $NoStartup) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $shortcut.Arguments = '"' + (Join-Path $InstallDir 'start-coach.vbs') + '"'
  $shortcut.WorkingDirectory = $InstallDir
  $shortcut.Description = 'TOSU AI Coach'
  $shortcut.Save()
}

if (-not $NoStart) {
  Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList ('"' + (Join-Path $InstallDir 'start-coach.vbs') + '"') -WindowStyle Hidden
}

Write-Host ''
Write-Host 'Installation terminée.' -ForegroundColor Green
Write-Host "Données : $dataDir"
Write-Host "Counter TOSU : $tosuCounter"
Write-Host 'Dans osu!, ouvre Shift+F2 puis active Coach IA.'
