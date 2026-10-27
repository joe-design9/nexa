#Requires -Version 5.1
<#
.SYNOPSIS
  Packt ein Nexa-Windows-Release mit fest eingebauter Server-Adresse neu.

.BESCHREIBUNG
  Nimmt den gebauten win-unpacked-Ordner (normale oder Admin-Version),
  legt eine Datei "nexa-server.txt" mit der angegebenen Server-URL neben
  die Nexa.exe und packt daraus ein verteilfertiges ZIP. Nutzer, die
  dieses ZIP entpacken und die App starten, verbinden sich automatisch
  mit genau dieser Nexa-Instanz - ganz ohne Adresseingabe.

  Wichtig: Der win-unpacked-Ordner im Repo wird NICHT verändert. Das
  Skript arbeitet auf einer Kopie im Temp-Ordner und ersetzt nur die
  ZIP-Datei im jeweiligen Release-Ordner. Ein frischer App-Build
  (npm run dist:win / dist:win:admin) erzeugt wieder ZIPs ohne
  eingebackene Adresse - dann einfach dieses Skript erneut ausführen.

.PARAMETER ServerUrl
  Die feste, öffentliche Adresse der Nexa-Instanz, z. B.
  https://nexa.deinedomain.de - sie muss dauerhaft gleich bleiben
  (siehe README.md in diesem Ordner: Quick-Tunnel-Adressen wechseln
  bei jedem Start und eignen sich NICHT zum Einbacken).
  Wird der Parameter weggelassen, fragt das Skript die Adresse ab.

.PARAMETER Admin
  Nur die Admin-Version (release-admin) packen.

.PARAMETER Both
  Beide Versionen packen (normal + Admin). Ohne Schalter wird nur die
  normale Version gepackt.

.BEISPIEL
  .\bake-release.ps1 -ServerUrl https://nexa.deinedomain.de
  .\bake-release.ps1 -ServerUrl https://nexa.deinedomain.de -Both
#>
[CmdletBinding()]
param(
    [string]$ServerUrl,
    [switch]$Admin,
    [switch]$Both
)

$ErrorActionPreference = 'Stop'

function Ok($text)     { Write-Host "[OK] $text" -ForegroundColor Green }
function Warn($text)   { Write-Host "[!]  $text" -ForegroundColor Yellow }
function Fehler($text) { Write-Host "[FEHLER] $text" -ForegroundColor Red }

Write-Host ""
Write-Host "=== Nexa Release mit eingebauter Server-Adresse packen ===" -ForegroundColor Cyan
Write-Host ""

# --- Adresse bestimmen und prüfen -------------------------------------------
if (-not $ServerUrl) {
    $ServerUrl = Read-Host "Feste Server-Adresse eingeben (z. B. https://nexa.deinedomain.de)"
}
$ServerUrl = "$ServerUrl".Trim().TrimEnd('/')
if ($ServerUrl -notmatch '^https?://.+') {
    Fehler "Keine gültige Adresse: '$ServerUrl'"
    Write-Host "Die Adresse muss mit http:// oder https:// beginnen und dauerhaft gleich bleiben."
    exit 1
}
Ok "Server-Adresse: $ServerUrl"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

# --- Eine Version packen ------------------------------------------------------
function New-BakedZip {
    param(
        [string]$ReleaseDirName,
        [string]$ZipName
    )
    $releaseDir = Join-Path $repoRoot "apps\desktop\$ReleaseDirName"
    $unpacked   = Join-Path $releaseDir 'win-unpacked'
    if (-not (Test-Path $unpacked)) {
        Warn "$ReleaseDirName\win-unpacked nicht gefunden - übersprungen."
        Warn "Bitte zuerst die App bauen (npm run dist:win bzw. dist:win:admin, siehe Haupt-README)."
        return
    }

    $stage = Join-Path $env:TEMP ("nexa-bake-" + [guid]::NewGuid().ToString('N'))
    try {
        $stageUnpacked = Join-Path $stage 'win-unpacked'
        Copy-Item $unpacked $stageUnpacked -Recurse

        # Adresse neben die .exe in die KOPIE legen (Repo-Ordner bleibt sauber).
        Set-Content -Path (Join-Path $stageUnpacked 'nexa-server.txt') `
            -Value $ServerUrl -Encoding ASCII

        $zipPath = Join-Path $releaseDir $ZipName
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
        Compress-Archive -Path $stageUnpacked -DestinationPath $zipPath -CompressionLevel Optimal

        $size = (Get-Item $zipPath).Length
        $hash = (Get-FileHash $zipPath -Algorithm SHA256).Hash
        Ok "$ZipName neu gepackt ($size Bytes)"
        Write-Host "     SHA-256: $hash"
        Write-Host "     Ziel:    $zipPath"
    } finally {
        Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($Both -or -not $Admin) { New-BakedZip 'release' 'Nexa-Windows.zip' }
if ($Both -or $Admin)      { New-BakedZip 'release-admin' 'Nexa-Admin-Windows.zip' }

Write-Host ""
Write-Host "Fertig! Die ZIP(s) kannst du jetzt verteilen bzw. als GitHub-Release"
Write-Host "hochladen. Tipp: Lädst du sie als Ersatz im bestehenden Release hoch,"
Write-Host "bleibt der Download-Link auf der Download-Seite gleich; bei einem"
Write-Host "neuen Release musst du den Link auf der Seite anpassen."
