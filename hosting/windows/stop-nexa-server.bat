@echo off
chcp 65001 >nul
setlocal
title Nexa Server anhalten

rem Nexa-Ordner = Repo-Wurzel (zwei Ebenen ueber diesem Skript-Ordner)
set "NEXA_DIR=%~dp0..\.."

echo.
echo === Nexa Server anhalten ===
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
    echo.
    pause
    exit /b 1
)

echo Halte alle Nexa-Container an (Daten/Volumes bleiben erhalten) ...
pushd "%NEXA_DIR%"
docker compose down
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" (
    echo [FEHLER] "docker compose down" ist fehlgeschlagen (Code %RC%).
    echo.
    pause
    exit /b %RC%
)

echo.
echo [OK] Nexa-Server ist angehalten.
echo.
pause
