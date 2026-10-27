# Nexa auf dem eigenen PC hosten (Windows-Hosting-Kit)

Mit diesem Kit läuft **dein eigener Nexa-Server auf deinem Windows-PC** –
kostenlos, ohne fremden Server. Zwei Dinge macht das Kit für dich:

1. **Autostart:** Der Nexa-Server startet bei jeder Windows-Anmeldung
   automatisch mit, sobald Docker bereit ist.
2. **Feste Adresse einbacken:** Du packst ein Release-ZIP, bei dem deine
   Server-Adresse fest in der App steht. Wer das ZIP herunterlädt und
   Nexa startet, landet **ohne Adresseingabe** direkt auf deiner Instanz.

> **Ehrlich vorab:** Dein Server ist nur online, **solange dein PC läuft**
> (und mit dem Internet verbunden ist). PC aus = Nexa offline. Für eine
> kleine Community reicht das völlig – für einen 24/7-Betrieb bräuchte
> es einen echten Server.

## Voraussetzungen

- Windows 10/11-PC, der als Server laufen soll
- **Docker Desktop** installiert
  (<https://www.docker.com/products/docker-desktop/>)
  - In Docker Desktop unter *Settings → General* die Option
    **„Start Docker Desktop when you sign in“** aktivieren – sonst kann
    der Autostart nicht funktionieren.
- Der Nexa-Ordner (dieses Repo) auf dem PC, einmalig eingerichtet:
  `.env` aus `.env.example` kopiert und einmal `docker compose up --build -d`
  plus `docker compose exec api npm run db:seed` ausgeführt
  (steht alles in der Haupt-README des Repos).

## Schritt 1: Autostart einrichten

1. In diesem Ordner (`hosting\windows`) Rechtsklick auf
   **`setup-nexa-host.ps1`** → **„Mit PowerShell ausführen“**.
   (Falls Windows das Skript blockiert: PowerShell in diesem Ordner
   öffnen und `powershell -ExecutionPolicy Bypass -File .\setup-nexa-host.ps1`
   eingeben.)
2. Das Skript prüft Docker und den Nexa-Ordner und legt die geplante
   Aufgabe **„Nexa Server Autostart“** an. Erneut ausführen ist kein
   Problem – die Aufgabe wird einfach aktualisiert.
3. Fertig. Ab der nächsten Anmeldung startet Nexa von selbst.
   Was passiert, steht in der Datei `nexa-host.log` in diesem Ordner.

Zum sofortigen Starten (ohne Ab-/Anmelden): **`start-nexa-server.bat`**
doppelklicken. Zum Anhalten: **`stop-nexa-server.bat`** (die Daten und
Datenbank-Volumes bleiben dabei erhalten).

## Schritt 2: Feste öffentliche Adresse bekommen

Damit deine Freunde von außerhalb auf deinen PC kommen, brauchst du
eine **öffentliche Adresse, die immer gleich bleibt**. Der sichere Weg
dafür ist ein **Tunnel** – dabei verbindet sich ein kleines Programm von
deinem PC nach außen, und niemand muss an deinem Router etwas öffnen.
**Keine Port-Weiterleitung im Router einrichten** – ein Tunnel ist
deutlich sicherer.

### Empfohlen: Cloudflare Tunnel

Voraussetzung: eine eigene Domain, die bei Cloudflare liegt (eine
günstige Domain reicht völlig). Dann:

1. `cloudflared` installieren:
   <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>
2. PowerShell öffnen und einmalig einrichten:
   ```powershell
   cloudflared tunnel login
   cloudflared tunnel create nexa
   cloudflared tunnel route dns nexa nexa.deinedomain.de
   ```
3. In `C:\Users\<DeinName>\.cloudflared\config.yml` eintragen
   (Name und ID zeigt dir `cloudflared tunnel list`):
   ```yaml
   tunnel: <Tunnel-ID>
   credentials-file: C:\Users\<DeinName>\.cloudflared\<Tunnel-ID>.json

   ingress:
     - hostname: nexa.deinedomain.de
       service: http://localhost:3000
     - service: http_status:404
   ```
4. Tunnel bei jeder Anmeldung mitstarten:
   ```powershell
   cloudflared service install
   ```
   (installiert einen Windows-Dienst, der automatisch startet).

Ergebnis: **`https://nexa.deinedomain.de`** zeigt dauerhaft auf den
Nexa-Server auf deinem PC – immer dieselbe Adresse, perfekt zum
Einbacken.

### Alternativen mit fester Adresse

- **ngrok mit reservierter Domain:** ngrok-Konto (reservierte Domains
  sind Teil der bezahlten Pläne). Einmal eine Domain im ngrok-Dashboard
  reservieren, dann bei der Anmeldung z. B. per Aufgabe starten:
  `ngrok http --domain=deine-reservierte-domain.ngrok-free.app 3000`
- **Tailscale Funnel:** Tailscale installieren, Funnel für Port 3000
  freischalten (`tailscale funnel 3000`). Die Adresse sieht so aus:
  `https://<pc-name>.<dein-netz>.ts.net` – fest und kostenlos, macht
  deinen Server aber öffentlich erreichbar (Funnel ist bewusst „public“).

### Wichtig: Quick-Tunnel eignet sich NICHT

`cloudflared tunnel --url http://localhost:3000` (und ähnliche
 Schnellstart-Modi) erzeugen bei **jedem Start eine neue, zufällige
Adresse**. Die kannst du nicht einbacken – deine Nutzer würden nach
jedem Neustart ins Leere laufen. Zum kurzen Testen okay, fürs Release
nicht.

## Schritt 3: Release mit eingebauter Adresse packen

1. PowerShell in diesem Ordner öffnen:
   ```powershell
   .\bake-release.ps1 -ServerUrl https://nexa.deinedomain.de
   ```
   (für normal **und** Admin: zusätzlich `-Both` anhängen;
   nur Admin: `-Admin`)
2. Das Skript legt die Adresse als `nexa-server.txt` neben die
   `Nexa.exe` und packt `Nexa-Windows.zip` (bzw.
   `Nexa-Admin-Windows.zip`) in den Release-Ordnern neu – Größe und
   SHA-256-Prüfsumme werden ausgegeben.
3. **ZIP als GitHub-Release hochladen.** Tipp: Lädst du sie als Ersatz
   im bestehenden Release hoch, bleibt der Download-Link auf deiner
   Download-Seite gleich. Bei einem neuen Release (neue Version) musst
   du den Download-Link auf der Seite an die neue Version anpassen.

## Schritt 4: Testen

1. Die neue ZIP in einen **anderen Ordner** entpacken (nicht in den
   Repo-Ordner).
2. `Nexa.exe` starten: Nach der Start-Animation muss die App **direkt**
   deine Nexa-Instanz laden – kein Bildschirm mit Adressfeld.
   (Die Adresse lässt sich trotzdem später in den Einstellungen der
   App ändern; wer dort eine eigene Adresse speichert, behält diese –
   die eingebackene Adresse gilt nur, solange nichts Eigenes
   gespeichert ist.)

## Dateien in diesem Kit

| Datei | Zweck |
| --- | --- |
| `setup-nexa-host.ps1` | Einmal-Setup: richtet die Autostart-Aufgabe ein (idempotent) |
| `autostart-nexa-host.ps1` | Internes Start-Skript der Autostart-Aufgabe – wartet auf Docker, startet Nexa, schreibt `nexa-host.log`. Nicht von Hand nötig |
| `start-nexa-server.bat` | Server von Hand starten (Fallback, mit sichtbarem Fenster) |
| `stop-nexa-server.bat` | Server anhalten, ohne Daten zu löschen |
| `bake-release.ps1` | Release-ZIP mit fest eingebauter Server-Adresse neu packen |

## Ehrliche Grenzen

- **Online nur bei laufendem PC.** Schlafen legen/Energiesparen des PCs
  unterbricht die Verbindung genauso wie Ausschalten.
- **Dein Internet ist der Flaschenhals:** Sprache/Video für viele
  Nutzer gleichzeitig hängt an deiner Upload-Geschwindigkeit.
- **Adresse ändern = neu backen.** Ändert sich deine feste Adresse,
  musst du Schritt 3 wiederholen und ein neues Release hochladen.
  Nutzer, die in den Einstellungen eine eigene Adresse gespeichert
  haben, sind davon nicht betroffen (ihre Einstellung gewinnt immer).
- **Kein Installer:** Wie bisher wird die App als ZIP verteilt
  (entpacken, `Nexa.exe` starten) – ein einzelner `.exe`-Installer
  steht weiterhin aus (siehe BUILD_STATUS.md).
