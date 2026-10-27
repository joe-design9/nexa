@echo off
chcp 65001 >nul
setlocal
title Nexa Server starten

rem Nexa-Ordner = Repo-Wurzel (zwei Ebenen ueber diesem Skript-Ordner)
set "NEXA_DIR=%~dp0..\.."

echo.
echo === Nexa Server starten ===
echo.

if not exist "%NEXA_DIR%\docker-compose.yml" (
    echo [FEHLER] Keine docker-compose.yml in "%NEXA_DIR%" gefunden.
    echo Dieses Skript muss im Ordner hosting\windows des Nexa-Repos liegen.
    echo.
    pause
    exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
    echo [FEHLER] Docker wurde nicht gefunden.
    echo Bitte zuerst Docker Desktop installieren und einmal starten:
    echo https://www.docker.com/products/docker-desktop/
    echo.
    pause
    exit /b 1
)

echo Warte, bis der Docker-Daemon bereit ist (Docker Desktop ggf. starten) ...
set /a TRIES=0
:waitloop
docker info >nul 2>nul
if not errorlevel 1 goto dockeready
set /a TRIES+=1
if %TRIES% GEQ 30 (
    echo [FEHLER] Docker-Daemon nach 5 Minuten nicht erreichbar.
    echo Bitte Docker Desktop von Hand starten und es dann erneut versuchen.
    echo.
    pause
    exit /b 1
)
timeout /t 10 /nobreak >nul
goto waitloop

:dockeready
echo Docker ist bereit. Starte Nexa ...
pushd "%NEXA_DIR%"
docker compose up -d
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" (
    echo [FEHLER] "docker compose up -d" ist fehlgeschlagen (Code %RC%).
    echo.
    pause
    exit /b %RC%
)

echo.
echo [OK] Nexa-Server laeuft. Web-Oberflaeche: http://localhost:3000
echo Anhalten geht mit stop-nexa-server.bat in diesem Ordner.
echo.
pause
