# Nexa Desktop (Electron)

Originaler Electron-Client für Nexa – keine Discord-Assets oder -Marken.

## Architektur (ehrlich dokumentiert)

- Die Desktop-App lädt die **Nexa-Web-Oberfläche** von einer konfigurierbaren
  **Server-URL** (Standard `http://localhost:3000`). Das ist die Adresse, unter
  der die Next.js-Web-App läuft (im Docker-Compose-Deployment: Port 3000).
- Die **API-Adresse** (`NEXT_PUBLIC_API_URL`, Standard `http://localhost:4000`)
  wird **beim Build/Deployment der Web-App** festgelegt – sie ist nicht Teil der
  Desktop-Konfiguration. Wer einen eigenen Server betreibt, stellt die Web-App
  mit passender API-URL bereit und trägt hier nur die Web-Adresse ein.
- Gespeicherte Konfiguration: `nexa-config.json` im Electron-`userData`-Ordner
  (`{ "serverUrl": "http://localhost:3000" }`), per IPC gelesen/geschrieben
  (`nexa:get-server-url` / `nexa:set-server-url`).
- Start-Ablauf: Splash-Fenster mit animiertem Nexa-Logo (~1,8 s) → Hauptfenster.
  Ist eine Server-URL gespeichert, prüft die App ihre Erreichbarkeit
  (HEAD-Request, 2,5 s Timeout) und lädt sie; sonst (oder bei Fehler) erscheint
  die lokale Startseite `src/start.html` mit URL-Eingabe und Fehlermeldung.
- Web-Integration: `window.nexaDesktop` (contextBridge) mit
  `{ isDesktop: true, appVersion, getServerUrl(), setServerUrl(url), getBuildVariant() }`.
  Die Web-App zeigt damit in den Einstellungen einen Abschnitt „Desktop-Server“.

## Zwei Versionen: „Nexa“ und „Nexa Admin“

Es gibt zwei Desktop-Auslieferungen aus derselben Codebasis:

| Version | Paket | Zweck |
| --- | --- | --- |
| **Nexa** (normal) | `release/` | Für alle Nutzer. Die Web-UI zeigt **keine** Invite-Verwaltung. |
| **Nexa Admin** | `release-admin/` | Für den Plattform-Betreiber. Die Admin-Seite der Web-UI blendet zusätzlich die **Plattform-Invite-Verwaltung** ein (Codes erzeugen, kopieren, auflisten, widerrufen). |

Umschaltung über die Build-Variante (`src/build-variant.ts`, Werte
`'standard' | 'admin'`), die der Web-UI über die Preload-Bridge
(`nexa:get-build-variant` → `window.nexaDesktop.getBuildVariant()`)
gemeldet wird. Die Admin-Variante hat eigene `appId`
(`app.nexa.desktop.admin`), eigenen Produktnamen und ein eigenes
`userData`-Verzeichnis – beide Versionen laufen nebeneinander.
**Sicherheit:** Die Variante steuert nur die Sichtbarkeit. Die
Invite-Endpunkte (`/admin/platform-invites`) prüft die API
serverseitig per `AdminGuard` (Plattform-Admin-Rolle); Zugang ist das
Admin-Konto `nexaadmin`.

## Entwicklung

```bash
npm install            # im Repo-Root (Workspaces)
npm run start -w @nexa/desktop
```

## Windows-Build

```bash
npm run icon -w @nexa/desktop        # build/icon.png aus assets/icon.svg
npm run dist:win -w @nexa/desktop    # → release/ (NSIS-Installer + Portable-.exe)
npm run dist:win:admin -w @nexa/desktop
                                     # → release-admin/ („Nexa Admin“, NSIS + Portable)
```

Der Admin-Build (`scripts/build-admin.mjs`) setzt die Variante auf
`'admin'`, kompiliert, paketiert mit `electron-builder.admin.json`
und setzt die Variante danach automatisch wieder auf `'standard'`
zurück. Für nur das entpackte Verzeichnis (ohne Installer):
`node scripts/build-admin.mjs --dir`.

`signAndEditExecutable: false` erlaubt den Cross-Build unter Linux ohne Wine.
Die `.ico` erzeugt electron-builder automatisch aus `build/icon.png` (512 px).
