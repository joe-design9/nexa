# Nexa

**Nexa** ist eine Chat- und Community-Plattform als eigenständige
Eigenentwicklung – gedacht für Freundeskreise, Gaming-Communities und
Lerngruppen, die ihren eigenen Server besitzen und betreiben wollen.
Nexa ist **kein Discord-Produkt** und hat mit Discord nichts zu tun;
Name, Design und Code sind eigenständig.

Im Kern: Server mit Kategorien, Text-/Sprach-/Stage-Kanälen, Threads und
Foren, Direktnachrichten und Gruppen-DMs, Sprache/Video, ein fein
einstellbares Rollen- und Rechtesystem, Moderationswerkzeuge mit
Automod, Bots und Webhooks – nutzbar primär als **Windows-Desktop-App**
und alternativ im Browser.

Technische Details stehen in der [ARCHITECTURE.md](ARCHITECTURE.md),
das Datenmodell in `apps/api/prisma/schema.prisma`, der gemeinsame
Code-Vertrag (Rechte, Automod, Markdown, Schemas) in `packages/shared`.

## Features

- **Server & Entdecken**: öffentliche und private Server mit Kategorien
  (Gaming, Freunde, Lerngruppe, Community, Kreativ, Technik, Musik,
  Sonstiges), Vorlagen beim Erstellen, Einladungslinks mit Ablaufdatum
  und Nutzungs-Limit.
- **Server-Favoriten**: Server per Stern an der Serverleiste (oder per
  Rechtsklick im Kontextmenü) als persönlichen Favoriten markieren –
  Favoriten stehen in der Leiste immer ganz oben, damit die
  Lieblingsserver ohne Suchen erreichbar sind. Die manuelle
  Drag-Reihenfolge bleibt innerhalb der Favoriten und der übrigen
  Server erhalten.
- **Kanäle**: Text, Ankündigungen, Forum, Sprache, Stage, dazu Threads
  unter Nachrichten/Forum-Beiträgen; Kategorien, Themen, Slowmode,
  NSFW-Markierung und private Kanäle.
- **Nachrichten**: Echtzeit-Chat (Socket.IO) mit Markdown (fett/kursiv/
  Code-Blöcke mit Syntax-Highlighting, Spoiler, Zitate, Listen),
  Erwähnungen, Antworten, Weiterleitungen, Anheften, Bearbeiten/Löschen,
  Reaktionen mit eigenen Server-Emojis, Link-Vorschauen und
  Anhängen (bis 100 MB, Presigned Uploads auf S3/MinIO).
- **Beitritts-Verifizierung & Onboarding**: Stufen von „offen“ bis
  „bestätigte E-Mail / Konto-Alter / Mitgliedschafts-Alter / Telefon“,
  Regeln-Anzeige mit Akzeptieren-Button, Verifizierungs-Button mit
  automatischer Rolle, Willkommensnachricht im gewählten Kanal.
- **Sprache & Video**: Sprach- und Stage-Kanäle sowie Video und
  Bildschirm-Teilen über LiveKit (WebRTC), inkl. Stummschalten,
  Taub-Schalten und Vorrang-Sprecher – gesteuert über Kanalrechte.
- **Rollen & Berechtigungen**: 30 Einzelrechte als Bitfelder, Rollen mit
  Farbe, Icon, Position und Erwähnbarkeit plus Kanal-Overrides pro Rolle
  oder Mitglied (siehe Architektur-Dokument).
- **Freunde & DMs**: Freundschaftsanfragen, Blockieren, DMs und
  Gruppen-DMs (bis 10 Personen), Privatsphäre-Einstellungen für DMs und
  Anfragen.
- **Moderation & Automod**: Wortfilter (auch gegen Leet-Speak und
  auseinandergezogene Schreibweise), Link-Sperre, Erwähnungs-Limit,
  Spam-Burst-Bremse, Slowmode, Timeouts, Kicks, Bans, Audit-Log,
  Melde-System und Plattform-Admin.
- **Konten & Sicherheit**: Registrierung nur mit **Plattform-Invite-Code**
  (invite-only – Codes vergibt der Betreiber über die Admin-Version),
  E-Mail-Verifizierung, Passwort-Reset, Passwort-Stärkeprüfung,
  Sitzungs-Verwaltung pro Gerät, Zwei-Faktor-Authentifizierung
  (TOTP + Backup-Codes), Captcha-Schutz und optional Social Login
  mit Google und Apple.
- **Profile**: Anzeigename, „Über mich“, Pronomen, Avatar/Banner,
  Custom-Status mit Emoji, Anwesenheitsstatus, Verifiziert-Abzeichen.
- **Abzeichen**: 27 Sammel-Abzeichen in fünf Kategorien (Status &
  Rollen, Exklusiv, Aktivität, Community, Saisonal) – z. B. das
  Beta-Abzeichen nur für Beta-Teilnehmer oder das Early-Adopter-
  Abzeichen für die ersten 100 Konten. Sie werden im Profil als
  Sammlung angezeigt (nicht besessene ausgegraut) und stehen als
  kleine Zeichen neben den Namen in Chat, Mitglieder-, Freundes-
  und DM-Listen. Der Plattform-Owner trägt ein besonderes Zeichen:
  das Nexa-Logo mit Haken. Vergeben und entfernt werden Abzeichen
  vom Plattform-Admin in der Admin-Version; automatisch kommen nur
  Early Adopter (bei der Registrierung) und Server-Gründer (beim
  ersten eigenen Server) dazu.
- **Benachrichtigungen**: Erwähnungen, DMs, Freundschaftsanfragen und
  Systemmeldungen; pro Server/Kanal einstellbar (alles / nur
  Erwähnungen / nichts), Lesestatus mit Erwähnungs-Zählern.
- **Bots & Webhooks**: Bots als eigene Konten mit Token-Verwaltung,
  eingehende Webhooks pro Kanal, ausgehende Ereignis-Webhooks
  (Nachricht erstellt, Mitglied beigetreten/verlassen).
- **Desktop-App**: Windows-Programm auf Electron-Basis, das sich mit
  beliebigen Nexa-Instanzen verbindet (Server-URL einstellbar).
- **Zweisprachig (Deutsch/Englisch)**: Die komplette Oberfläche gibt es
  auf Deutsch und Englisch – umschaltbar in den Einstellungen
  (Kategorie „Sprache“), direkt im Nutzerbereich der App (🌐-Knopf) und
  auf der Login-/Landing-Seite. Die Auswahl wird in diesem Browser
  gespeichert und – wenn du angemeldet bist – zusätzlich in deinem
  Profil, sodass sie geräteübergreifend gilt. Beim allerersten Start
  gilt die Browser-/Systemsprache, sonst Englisch. Auch Datums- und
  Zeitangaben sowie die Fehlermeldungen der Oberfläche folgen der
  Auswahl. Die Desktop-App zeigt ihre eigenen Bildschirme
  (Startbildschirm + Verbinden-Seite) in der Systemsprache.
- **Onboarding-Tutorial**: Neue Konten bekommen beim ersten Login eine
  geführte Tour (10 kurze Schritte, Deutsch/Englisch): Serverleiste,
  Favoriten-Stern, Kanäle, Nachrichten schreiben, Freunde & DMs,
  Sprachkanäle, Entdecken & eigenen Server erstellen, Profil &
  Abzeichen sowie Einstellungen & Sprache. Das erklärte Element wird
  dabei mit einem Rahmen hervorgehoben. Die Tour ist jederzeit
  überspringbar und startet nach Abschluss nie wieder automatisch
  (Gesehen-Status liegt im Profil); in den Konto-Einstellungen lässt
  sie sich über „Tutorial erneut ansehen“ jederzeit manuell neu
  starten. Bestehende und Demo-Konten bekommen die Tour nicht
  automatisch gezeigt.

## Fehlerbehebungen

- **27.10. – Crash der eingeloggten Ansicht behoben (React-Fehler #185
  „Maximum update depth exceeded“)**: Mehrere Store-Selektoren in der
  Web-Shell nutzten ein literales `|| []` als Fallback. Solange die
  Server-Detaildaten (Kanäle, Kategorien, Mitglieder, Rollen) noch nicht
  im Store waren, lieferte jeder Selektor-Aufruf eine neue Array-Referenz –
  Reacts `useSyncExternalStore` (zustand v5, ohne Ergebnis-Cache) wertete
  das endlos als Änderung und die Ansicht stürzte ab. Der Fehler trat nur
  mit echten Daten/einer echten Datenbank auf (Server vorhanden, Details
  beim Rendern noch nicht geladen), nicht ohne Login und nicht mit leeren
  Testzuständen. Fix: referenzstabile Konstante `EMPTY_LIST`
  (`apps/web/src/lib/store.ts`) in allen betroffenen Selektoren
  (Kanal-Sidebar, Mitgliederliste, Erstellen-Modals, Voice-Status).
  Live mit echter DB verifiziert (0 Konsolen-Fehler, Ansicht rendert
  vollständig); Testsuite weiterhin 126/126 grün.

## Schnellstart (Docker)

Voraussetzung: Docker mit Compose.

```bash
cp .env.example .env
docker compose up --build
```

Danach die Demo-Daten einspielen (legt Admin, Demo-Nutzer, drei Server,
Beispiel-Nachrichten und fünf Start-Invite-Codes an; idempotent – ein
zweiter Lauf ändert an den Demo-Daten nichts und legt nur ggf. fehlende
Start-Codes nach):

```bash
docker compose exec api npm run db:seed
```

**Wichtig:** Die Registrierung ist invite-only. Neue Konten brauchen
einen Plattform-Invite-Code – die fünf Start-Codes aus dem Seed stehen
unten bei den Demo-Konten; weitere Codes erzeugt der Admin in der
**Admin-Desktop-Version** (siehe unten). Bestehende Konten melden sich
ohne Code an.

| Dienst | URL | Zweck |
| --- | --- | --- |
| Web | http://localhost:3000 | Nexa-Oberfläche im Browser |
| API | http://localhost:4000 | REST-API + Socket.IO-Gateway |
| MailHog | http://localhost:8025 | Dev-Postfach: Verifizierungs- und Reset-Mails |
| MinIO Console | http://localhost:9001 | Dateispeicher-Verwaltung (Zugangsdaten in `.env`/Compose) |
| LiveKit | ws://localhost:7880 | Sprache/Video (WebRTC-Signaling) |

E-Mail-Verifizierung und Passwort-Reset landen lokal in MailHog, nicht in
einem echten Postfach. Ohne SMTP-Konfiguration schreibt die API die
Links zusätzlich ins Server-Log.

## Desktop-App (primär) – zwei Versionen

Die empfohlene Nutzung ist die **Windows-Desktop-App**. Es gibt zwei
Auslieferungen aus derselben Codebasis:

| Version | Ordner | Für wen |
| --- | --- | --- |
| **Nexa** (normal) | `apps/desktop/release` | Alle Nutzer. Enthält **keine** Invite-Verwaltung. |
| **Nexa Admin** | `apps/desktop/release-admin` | Nur für den Plattform-Betreiber: Die Admin-Seite zeigt zusätzlich die **Plattform-Invite-Verwaltung** (Codes erzeugen, kopieren, auflisten, widerrufen) und die **Abzeichen-Verwaltung** (Abzeichen pro Nutzer vergeben und entfernen). Zugang mit dem Admin-Konto `nexaadmin`. |

- **Fertige `.exe`**: Nach einem Build liegt der Installer (und die
  portable Variante) im jeweiligen Ordner (`release` bzw. `release-admin`).
  In dieser Auslieferung liegen dort entpackte, lauffähige Programme als
  ZIP (`Nexa-Windows.zip` / `Nexa-Admin-Windows.zip`) bei – entpacken und
  `Nexa.exe` bzw. `Nexa Admin.exe` starten (Details in BUILD_STATUS.md).
- **Selbst bauen**:

  ```bash
  npm install
  npm run dist:win -w @nexa/desktop         # normale Version → release/
  npm run dist:win:admin -w @nexa/desktop   # Admin-Version → release-admin/
  ```

Die Umschaltung läuft über eine Build-Variante; sichtbar wird die
Invite-Verwaltung nur in der Admin-Version. Die zugehörigen
API-Endpunkte sind unabhängig davon serverseitig durch die
Admin-Rolle geschützt.

**So funktioniert die App:** Beim Start zeigt die App einen
Startbildschirm mit einer **Server-URL** (Standard:
`http://localhost:3000`). Die `.exe` lädt die Web-UI genau dieser
Nexa-Instanz und verbindet sich mit deren API – die App bringt also
keine eigene Oberfläche mit, sondern ist ein schlanker, nativer Rahmen
(Fenster, Tray, Autostart) um deine Nexa-Installation. Für eine selbst
gehostete Instanz einfach deren URL eintragen. Wer keinen Desktop-Client
möchte, nutzt dieselbe Instanz alternativ einfach im **Browser**.

**Feste Server-Adresse einbacken (keine Eingabe beim Nutzer):** Liegt
neben der `Nexa.exe` eine Datei **`nexa-server.txt`** mit einer einzigen
Server-URL, verbindet sich die App nach der Start-Animation automatisch
mit dieser Instanz – der Startbildschirm entfällt, ein Endnutzer sieht
im Normalfall kein Adressfeld. Priorität der Adresse: Eine vom Nutzer
in den Einstellungen gespeicherte Adresse (`nexa-config.json`) gewinnt
immer; die eingebackene Adresse gilt, solange nichts Eigenes gespeichert
ist, und ersetzt nur den Standard. So bleibt die Adresse für jeden
Nutzer weiterhin änderbar. Erstellt wird ein Release mit eingebackener
Adresse per **`hosting/windows/bake-release.ps1`** – dort liegt auch das
komplette **Windows-Hosting-Kit**: Nexa auf dem eigenen PC hosten
(Autostart des Servers bei der Anmeldung) und eine feste öffentliche
Adresse per Tunnel bekommen, Schritt für Schritt erklärt in
[hosting/windows/README.md](hosting/windows/README.md).

## Lokale Entwicklung ohne Docker

Nur die Infrastruktur aus Compose starten, Apps lokal laufen lassen:

```bash
docker compose up postgres redis minio mailhog livekit
npm install
npm run db:generate
npm run db:push          # Entwicklungs-Datenbankschema anwenden
                         # (alternativ produktionsnah: npm run db:migrate)
npm run db:seed          # Demo-Daten einspielen (idempotent)
npm run dev              # API (Port 4000) + Web (Port 3000)
```

Voraussetzung: Node.js ≥ 20. Die `.env` im Projektwurzel-Verzeichnis
wird aus `.env.example` kopiert und bei Bedarf angepasst.

## Social Login einrichten

Die Buttons „Mit Google anmelden“ / „Mit Apple anmelden“ sind immer
sichtbar. **Ohne Konfiguration gibt es kein Fake-Login:** Der Klick führt
dann ehrlich auf einen „nicht konfiguriert“-Fehler zurück. Aktiviert wird
Social Login ausschließlich über Umgebungsvariablen in der `.env`.

### Google

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein
   Projekt anlegen und unter „APIs & Dienste → Anmeldedaten“ einen
   **OAuth-Client (Webanwendung)** erstellen.
2. Als autorisierte Weiterleitungs-URI eintragen:
   `http://localhost:4000/auth/oauth/google/callback`
   (für Produktion die eigene API-Domain verwenden).
3. In der `.env` setzen:

   ```dotenv
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_CALLBACK_URL=http://localhost:4000/auth/oauth/google/callback
   ```

### Apple

1. Im Apple Developer Portal eine **Services ID** für „Sign in with
   Apple“ anlegen, eine **Team ID** und eine **Key ID** notieren und einen
   Sign-in-Schlüssel (`.p8`-Datei) erzeugen. Rückleitungs-URL wie unten.
2. In der `.env` setzen:

   ```dotenv
   APPLE_CLIENT_ID=...          # die Services ID
   APPLE_TEAM_ID=...
   APPLE_KEY_ID=...
   APPLE_PRIVATE_KEY=...        # Inhalt der .p8, Zeilenumbrüche als \n
   # alternativ: APPLE_PRIVATE_KEY_PATH=/pfad/zur/AuthKey_XXXX.p8
   APPLE_CALLBACK_URL=http://localhost:4000/auth/oauth/apple/callback
   ```

Verknüpfungs-Regeln (Bestands-Konto über bestätigte E-Mail usw.) sind in
der ARCHITECTURE.md im Abschnitt „Auth-Flows“ beschrieben.

**Invite-Gate auch bei Social Login:** Wer sich über Google/Apple **neu**
registriert, braucht denselben Plattform-Invite-Code wie bei der
E-Mail-Registrierung. Auf der Login-Seite gibt es dafür ein optionales
Feld „Invite-Code (nur bei erster Registrierung)“ über den
Social-Login-Buttons; der Code wird durch den OAuth-Flow getragen und
erst bei der Kontoanlage geprüft und verbraucht. Wer schon ein Konto
hat, lässt das Feld leer – der Login bleibt codefrei. Ohne konfigurierte
Provider bleibt es beim ehrlichen `not_configured`-Verhalten.

## Captcha einrichten

Registrierung und Login können mit Cloudflare Turnstile oder hCaptcha
geschützt werden:

```dotenv
CAPTCHA_PROVIDER=turnstile     # oder hcaptcha
CAPTCHA_SITE_KEY=...           # öffentlicher Schlüssel fürs Frontend
CAPTCHA_SECRET_KEY=...         # serverseitige Prüfung
CAPTCHA_DEV_BYPASS=false
```

Für lokale Entwicklung ohne Anbieter einfach `CAPTCHA_DEV_BYPASS=true`
setzen (Standard in der `.env.example`) – die Prüfung wird dann
ausdrücklich übersprungen statt still zu fehlen.

## Demo-Konten

Alle Konten stammen aus dem Seed (`npm run db:seed`). Passwörter nur für
die lokale Entwicklungsumgebung verwenden.

| E-Mail | Passwort | Rolle / Hinweis |
| --- | --- | --- |
| `admin@nexa.local` | `NexaAdmin!2026` | Plattform-Admin, Nutzername `nexaadmin`, Eigentümer des **Nexa Gaming Hub** |
| `lena@nexa.local` | `NexaDemo!2026` | Admin-Rolle im Gaming Hub, Eigentümerin der **Lerngruppe Informatik** |
| `max@nexa.local` | `NexaDemo!2026` | Moderator im Gaming Hub, Eigentümer von **Freunde & Chill** |
| `mia@nexa.local` | `NexaDemo!2026` | VIP-Rolle, mit Verifiziert-Abzeichen |
| `jonas@nexa.local` | `NexaDemo!2026` | Normales Mitglied |

Seed-Inhalte im Überblick: drei Server (Gaming Hub öffentlich mit
Rollen `@everyone`, `Verifiziert`, `VIP`, `Moderator`, `Admin`,
Kategorien, Text-/Forum-/Voice-/Stage-Kanälen, eigenen Emojis,
Einladungen `nexa-start` und `gaming2026`, Regeln + Verifizierung per
E-Mail-Stufe), die öffentliche Lerngruppe und der private
Freunde-Server, Freundschaften, eine DM und eine Gruppen-DM sowie
Demo-Nachrichten inkl. Markdown-Beispielen und Thread.

| Bot | Token | Hinweis |
| --- | --- | --- |
| `nexa-helper` („Nexa Helper“) | `nexa-bot-demo-token-0123456789abcdef` | Demo-Bot, Eigentümer ist der Admin. In der Datenbank liegt nur der bcrypt-Hash des Tokens; hier steht das Klartext-Token ausschließlich für lokale Bot-Tests. |

**Demo-Abzeichen aus dem Seed:** Der Admin trägt OWNER (das
Nexa-Logo-mit-Haken-Zeichen) und ADMIN, die vier Demo-Nutzer tragen
als Beta-Teilnehmer das BETA-Abzeichen – Lena zusätzlich
EARLY_ADOPTER und CHATTERBOX, Max zusätzlich MODERATOR, Mia
zusätzlich VERIFIED, der Bot das BOT-Abzeichen. Weitere Abzeichen
vergibt der Admin in der Admin-Version unter
„Plattform-Administration → Abzeichen vergeben“ oder per API
(`POST /admin/users/:id/badges`).

### Start-Plattform-Invite-Codes

Der Seed legt diese fünf Codes an (je **1× nutzbar**, ohne Ablaufdatum).
Damit kannst du sofort erste Mitglieder einladen – jeder Code wird bei
der Registrierung verbraucht. Weitere Codes (auch Mehrfach-Codes und
Batches) erzeugst du in der **Admin-Version** unter
„Plattform-Administration → Plattform-Invite-Codes“ oder per API
(`POST /admin/platform-invites`).

| Code |
| --- |
| `NEXA-K7Q2XD-M9T4PA` |
| `NEXA-R3W8ZN-B6K2HE` |
| `NEXA-T5P9QA-D2X7MK` |
| `NEXA-H8N4RE-W6Z3QB` |
| `NEXA-Q2M7TX-P9D5KA` |

Das sind Demo-Codes für die lokale Umgebung. Für einen echten Betrieb:
Start-Codes einlösen oder widerrufen und nur eigene Codes verteilen.

## Tests

```bash
npm test
```

Führt die Tests aller Workspaces aus (Shared-Package, API und Web). Nur das
Shared-Package:

```bash
npm test -w @nexa/shared
```

Die Web-Tests prüfen die Zweisprachigkeit: Deutsch und Englisch haben im
Wörterbuch (`apps/web/src/lib/i18n.ts`) exakt dieselben Keys, keine
leeren Texte und übereinstimmende Platzhalter – und jeder
Abzeichen-Schlüssel aus dem Katalog (`@nexa/shared`) hat dort einen
Namen und eine Beschreibung in beiden Sprachen. Die API-Tests decken
u. a. die Abzeichen-Vergabe (inkl. Idempotenz und Audit-Einträgen) ab,
die Shared-Tests den Abzeichen-Katalog selbst.

Die Shared-Tests decken u. a. die Rechte-Bitfelder und den
Kanal-Override-Algorithmus, Passwort-Stärke, Automod (Wortfilter inkl.
Leet-Speak, Link-/Erwähnungs-Limits, Spam-Bursts), Erwähnungs-Parsing und
den Markdown-Renderer (inkl. XSS-Escaping) ab.

## Projektstruktur

```
nexa/
├── apps/
│   ├── api/            # NestJS-API (REST + Socket.IO), Prisma-Schema & Seed
│   ├── web/            # Next.js-Oberfläche
│   └── desktop/        # Electron-App (Windows-.exe)
├── hosting/windows/    # Hosting-Kit: Server-Autostart auf dem eigenen PC + Adresse einbacken
├── packages/
│   └── shared/         # @nexa/shared: Rechte, Automod, Mentions, Markdown, Schemas
├── docker-compose.yml  # Postgres, Redis, MinIO, MailHog, LiveKit, API, Web
├── livekit.yaml        # LiveKit-Dev-Konfiguration
└── .env.example        # Alle Umgebungsvariablen, kommentiert
```

## Tech-Stack

| Bereich | Technologie |
| --- | --- |
| Sprache | TypeScript (strict) im gesamten Repo |
| Web-Frontend | Next.js, React, Tailwind CSS |
| Desktop | Electron (Windows-Installer via NSIS) |
| Backend | NestJS, Socket.IO (Echtzeit) |
| Datenbank | PostgreSQL, Prisma ORM |
| Cache / Presence | Redis (inkl. Socket.IO-Adapter) |
| Sprache / Video | LiveKit (WebRTC) |
| Dateispeicher | MinIO (S3-kompatibel, lokal) / S3 |
| E-Mail (Dev) | MailHog (SMTP-Auffangbecken) |
| Validierung | Zod (Schemas in `@nexa/shared`, von API + Web genutzt) |
| Tests | Jest + ts-jest |

## Lizenz

Proprietäres eigenes Projekt. Alle Rechte vorbehalten – keine
Open-Source-Lizenz, keine Weitergabe ohne Zustimmung der Projektinhaber.
