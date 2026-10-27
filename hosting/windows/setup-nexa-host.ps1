#Requires -Version 5.1
<#
.SYNOPSIS
  Nexa-Hosting: Einmal-Setup für den Autostart des Nexa-Servers auf diesem PC.

.BESCHREIBUNG
  Richtet eine geplante Aufgabe "Nexa Server Autostart" ein. Sie startet bei
  jeder Windows-Anmeldung das interne Skript autostart-nexa-host.ps1, das
  wartet, bis der Docker-Daemon antwortet, und dann im Nexa-Ordner
  "docker compose up -d" ausführt.

  Das Skript ist idempotent: Erneut ausführen aktualisiert die Aufgabe
  einfach auf den aktuellen Stand.

  Voraussetzung: Docker Desktop ist installiert und so eingestellt, dass
  es bei der Anmeldung startet (Docker Desktop -> Settings -> General ->
  "Start Docker Desktop when you sign in").

.PARAMETER NexaDir
  Ordner mit der docker-compose.yml von Nexa. Standard: der Repo-Ordner,
  in dem dieses Kit liegt (zwei Ebenen über diesem Skript).

.BEISPIEL
  .\setup-nexa-host.ps1
  .\setup-nexa-host.ps1 -NexaDir "C:\Nexa"
#>
[CmdletBinding()]
param(
    [string]$NexaDir = ""
)

$ErrorActionPreference = 'Stop'

function Ok($text)     { Write-Host "[OK] $text" -ForegroundColor Green }
function Warn($text)   { Write-Host "[!]  $text" -ForegroundColor Yellow }
function Fehler($text) { Write-Host "[FEHLER] $text" -ForegroundColor Red }

Write-Host ""
Write-Host "=== Nexa Server - Autostart-Setup ===" -ForegroundColor Cyan
Write-Host ""

# --- Nexa-Ordner bestimmen und prüfen --------------------------------------
if (-not $NexaDir) {
    $NexaDir = Join-Path $PSScriptRoot '..\..'
}
try {
    $NexaDir = (Resolve-Path $NexaDir).Path
} catch {
    Fehler "Nexa-Ordner nicht gefunden: $NexaDir"
    Write-Host "Bitte den Ordner mit der docker-compose.yml per -NexaDir angeben,"
    Write-Host "z. B.:  .\setup-nexa-host.ps1 -NexaDir `"C:\Nexa`""
    exit 1
}
if (-not (Test-Path (Join-Path $NexaDir 'docker-compose.yml'))) {
    Fehler "In $NexaDir liegt keine docker-compose.yml."
    Write-Host "Das ist nicht der Nexa-Repo-Ordner. Bitte -NexaDir auf den Ordner"
    Write-Host "zeigen lassen, in dem docker-compose.yml von Nexa liegt."
    exit 1
}
Ok "Nexa-Ordner: $NexaDir"

# --- Docker prüfen ----------------------------------------------------------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fehler "Docker wurde nicht gefunden."
    Write-Host "Bitte zuerst Docker Desktop installieren (https://www.docker.com/products/docker-desktop/)"
    Write-Host "und danach dieses Setup erneut ausführen."
    exit 1
}
Ok "Docker ist installiert."

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Warn "Der Docker-Daemon läuft gerade nicht. Das ist für das Setup okay -"
    Warn "die Autostart-Aufgabe wartet bei der Anmeldung, bis Docker bereit ist."
    Warn "Wichtig: In Docker Desktop muss 'Start Docker Desktop when you sign in'"
    Warn "aktiviert sein (Settings -> General), sonst startet der Server nicht von selbst."
}

# --- Geplante Aufgabe registrieren (idempotent dank -Force) -----------------
$taskName = 'Nexa Server Autostart'
$runner   = Join-Path $PSScriptRoot 'autostart-nexa-host.ps1'
$userId   = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -NexaDir `"$NexaDir`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'Startet den Nexa-Server (Docker Compose) nach der Anmeldung, sobald der Docker-Daemon bereit ist.' `
    -Force | Out-Null

Ok "Geplante Aufgabe '$taskName' ist eingerichtet."
Write-Host ""
Write-Host "Fertig! Ab der nächsten Anmeldung startet der Nexa-Server automatisch"
Write-Host "(sobald Docker bereit ist). Protokoll: hosting\windows\nexa-host.log"
Write-Host ""
Write-Host "Den Server sofort starten: einfach start-nexa-server.bat aus diesem"
Write-Host "Ordner doppelklicken. Anhalten geht mit stop-nexa-server.bat."
Write-Host "Wie du eine feste öffentliche Adresse bekommst, steht in der README.md"
Write-Host "in diesem Ordner."
