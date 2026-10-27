#Requires -Version 5.1
<#
.SYNOPSIS
  Internes Start-Skript der geplanten Aufgabe "Nexa Server Autostart".

.BESCHREIBUNG
  Wird von setup-nexa-host.ps1 in der Windows-Aufgabenplanung registriert
  und bei jeder Anmeldung unsichtbar ausgeführt. Wartet (bis zu 10 Minuten),
  bis der Docker-Daemon antwortet, und startet dann im Nexa-Ordner
  "docker compose up -d". Alles wird in nexa-host.log neben diesem Skript
  protokolliert.

  Nicht für den manuellen Start gedacht - dafür gibt es start-nexa-server.bat.
#>
[CmdletBinding()]
param(
    [string]$NexaDir = ""
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not $NexaDir) {
    $NexaDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$logFile = Join-Path $PSScriptRoot 'nexa-host.log'
function Log($text) {
    Add-Content -Path $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $text"
}

Log "Autostart: warte auf den Docker-Daemon (Nexa-Ordner: $NexaDir) ..."

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 10
}

if (-not $ready) {
    Log "FEHLER: Docker-Daemon nach 10 Minuten nicht erreichbar - Nexa-Server nicht gestartet."
    exit 1
}

Set-Location $NexaDir
docker compose up -d *> $null
if ($LASTEXITCODE -eq 0) {
    Log "Nexa-Server gestartet (docker compose up -d)."
} else {
    Log "FEHLER: 'docker compose up -d' endete mit Code $LASTEXITCODE."
    exit 1
}
