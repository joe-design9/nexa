# Nexa – Architektur

> Nexa ist eine eigenständige Chat- und Community-Plattform (Eigenentwicklung,
> kein Discord-Produkt). Dieses Dokument beschreibt Aufbau, Datenmodell,
> Berechtigungen, Echtzeit-Kommunikation, Authentifizierung, Sprache, Uploads,
> Moderation und Sicherheit. Die verbindliche Datenstruktur steht in
> `apps/api/prisma/schema.prisma`, der gemeinsame Code-Vertrag in `packages/shared`
> (`@nexa/shared`).

## Überblick

Nexa ist ein Monorepo (npm Workspaces) mit drei Anwendungen und einem
Shared-Package:

| Teil | Technik | Aufgabe |
| --- | --- | --- |
| `apps/web` | Next.js, React, Tailwind CSS | Web-Oberfläche (Chat, Server, Einstellungen) |
| `apps/desktop` | Electron | Windows-Desktop-App; lädt die Web-UI einer konfigurierbaren Nexa-Instanz |
| `apps/api` | NestJS, Prisma, Socket.IO | REST-API, Echtzeit-Gateway, Geschäftslogik |
| `packages/shared` | TypeScript, Zod | Berechtigungs-Bitfelder, Automod, Passwort-Stärke, Mentions, sicherer Markdown-Renderer, Zod-Schemas, DTO-Typen |

Infrastruktur läuft per Docker Compose: PostgreSQL (Daten), Redis
(Presence, Socket.IO-Adapter, Cache), MinIO (S3-Dateispeicher), MailHog
(Dev-E-Mail), LiveKit (Sprache/Video per WebRTC).

```
┌────────────────────────────┐        ┌────────────────────────────┐
│  Desktop-App (Electron)    │        │  Browser (Web-Version)     │
│  lädt UI der Ziel-Instanz  │        │  http://localhost:3000     │
└──────────────┬─────────────┘        └──────────────┬─────────────┘
               │  HTTPS (REST) · WSS (Socket.IO) · WebRTC (Medien)
               └──────────────────┬─────────────────┘
                                  ▼
                     ┌─────────────────────────┐
                     │   API (NestJS, :4000)   │
                     │   REST · Socket.IO-GW   │
                     │   Auth · Rechte · Automod│
                     └──┬───────┬───────┬──────┘
                        │       │       │
              ┌─────────▼─┐ ┌───▼────┐ ┌▼───────────────┐
              │PostgreSQL │ │ Redis  │ │ LiveKit (:7880)│
              │  (:5432)  │ │ (:6379)│ │ Sprache / Video│
              └───────────┘ └───▲────┘ └────────────────┘
                                │ Presence · Pub/Sub (Socket.IO-Adapter)
                     ┌──────────┴───────────────┐
                     │ MinIO / S3 (:9000)       │  Datei-Uploads (Presigned URLs)
                     │ MailHog (:8025, Dev-SMTP)│  Verifizierungs- & Reset-Mails
                     └──────────────────────────┘
```

Medienströme (Audio/Video) laufen **nicht** über die API, sondern direkt
zwischen Client und LiveKit-Server; die API stellt nur kurzlebige
Zugangs-Token aus (siehe „Sprach-Architektur“).

## Komponenten je App

### API (`apps/api`, NestJS)

- **REST-Module** entlang der Domänen: Auth (Registrierung, Login, 2FA,
  OAuth, Sessions), Nutzer/Profile, Server, Kategorien/Kanäle/Threads,
  Nachrichten, DMs & Freunde, Rollen/Rechte, Moderation (Kicks, Bans,
  Timeouts, Meldungen, Audit-Log), Bots & Webhooks, Uploads (Presign),
  Benachrichtigungen, Plattform-Admin.
- **Socket.IO-Gateway** für Echtzeit-Ereignisse (siehe „Echtzeit-Events“);
  Redis-Adapter, damit mehrere API-Instanzen dieselben Räume sehen.
- **Prisma** als einziger Datenbankzugriff; Transaktionen für
  Mehr-Schritt-Operationen (z. B. Server anlegen inkl. `@everyone`-Rolle).
- **Guards/Interceptor**: JWT-Authentifizierung, Rechte-Prüfung pro Route
  (Bitfelder aus `@nexa/shared`), Rate-Limits, Zod-Validierung aller
  Eingaben mit den Schemas aus `@nexa/shared`.

### Web (`apps/web`, Next.js)

- Server-/Kanal-Navigation, Nachrichtenliste mit Markdown-Rendering
  (`renderMarkdown` aus `@nexa/shared`, XSS-sicher), Editor mit
  Erwähnungs-Autovervollständigung, Uploads per Presigned URL.
- Sprach-/Video-UI auf Basis des LiveKit-Client-SDK (Räume = Kanal-IDs).
- Formulare validieren mit denselben Zod-Schemas wie die API; Fehlerbilder
  sind dadurch auf beiden Seiten identisch.
- Zustand: serverseitig per REST geladen, live per Socket.IO aktualisiert;
  Presence und Schreib-Indikatoren kommen ausschließlich über das Gateway.

### Desktop (`apps/desktop`, Electron)

- Die Desktop-App ist die **primäre** Nutzungsform. Sie rendert keine eigene
  UI, sondern lädt die Web-UI der im Startbildschirm gewählten Nexa-Instanz
  (Standard: `http://localhost:3000`) und verbindet sich mit deren API.
  Dadurch funktionieren beliebige selbst gehostete Instanzen ohne Neu-Build.
- Electron kümmert sich um Fenster, Tray, Autostart und den
  Windows-Installer (NSIS); Geschäftslogik bleibt in Web/API.

### Shared (`packages/shared`, `@nexa/shared`)

Reine, seiteneffektfreie Bibliothek ohne Framework-Abhängigkeit:

- `permissions.ts` – Bitfelder, `computeServerPermissions`,
  `computeChannelPermissions` (Override-Algorithmus).
- `password.ts` – `passwordStrength` (deutsche Rückmeldungen) und
  `isPasswordAcceptable`.
- `automod.ts` – `normalizeForFilter`, `containsBannedWord` (Leet-Speak-
  und „auseinandergezogene“ Schreibweise resistent), `countLinks`,
  `checkAutomod`, `isSpamBurst`.
- `mentions.ts` – `parseMentions` (`<@id>`, `<@&id>`, `<#id>`, `@everyone`,
  `@here`) plus Format-Helfer.
- `markdown.ts` – `renderMarkdown`: erst escapen, dann formatieren;
  Code per Platzhalter-Technik geschützt.
- `types.ts` – DTOs (`PublicUser`, `ServerDto`, `ChannelDto`, `MessageDto`,
  …), Konstanten (`SERVER_CATEGORIES`, `MIN_AGE = 13`,
  `MAX_GROUP_DM_MEMBERS = 10`, `validateAge`).
- `schemas.ts` – alle Zod-Eingabe-Schemas (Auth, Server, Kanäle,
  Nachrichten, Rollen, Profil, Meldungen, Bots, Webhooks).

## Datenmodell

Verbindlich ist `apps/api/prisma/schema.prisma`; die folgende Übersicht
fasst alle Models und ihre Beziehungen zusammen. IDs sind CUIDs,
Berechtigungen werden als `BigInt`-Bitfelder gespeichert.

### Nutzer, Auth, Sitzungen

| Model | Wichtige Felder | Beziehungen |
| --- | --- | --- |
| `User` | `email` (unique), `username` (unique), `displayName`, `passwordHash` (nullable für Bots/OAuth), `dateOfBirth`, `emailVerifiedAt`, `totpSecret`/`totpEnabled`, `backupCodes`, `avatarUrl`, `bannerUrl`, `about`, `pronouns`, `status` (Presence), `customStatusText/Emoji`, `isBot`, `verified` (Abzeichen), `isPlatformAdmin`, `dmPrivacy`, `friendRequestPrivacy`, `locale` (nullable – UI-Sprache, s. Zweisprachigkeit), `theme`, Login-Sperrzähler | besitzt Server, Mitgliedschaften, Nachrichten, Sitzungen, OAuth-Identitäten, Bot-Konten u. v. m. |
| `Session` | `refreshTokenHash`, `deviceName`, `userAgent`, `ipAddress`, `expiresAt`, `revokedAt` | `userId` → `User` (Cascade) |
| `VerificationToken` | `type` (`EMAIL_VERIFY`/`PASSWORD_RESET`), `tokenHash`, `expiresAt`, `usedAt` | `userId` → `User` (Cascade) |
| `OAuthIdentity` | `provider` (`GOOGLE`/`APPLE`), `providerUserId`, `email` | `userId` → `User`; unique auf `(provider, providerUserId)` |
| `PlatformInviteCode` | `code` (unique, Format `NEXA-XXXXXX-XXXXXX`), `maxUses` (Standard 1), `usedCount`, `revoked`, `expiresAt` (optional) | `createdById` → `User`; Registrierungs-Gate (nicht mit Server-`Invite` verwechseln) |
| `UserBadge` | `badgeKey` (Schlüssel aus dem code-definierten Katalog in `@nexa/shared`, 27 Abzeichen), `grantedAt` | `userId` → `User` (Cascade), `grantedById` → `User` (optional, SetNull; NULL = System-Vergabe per Auto-Hook/Seed); unique auf `(userId, badgeKey)`; Vergabe/Entzug nur durch Plattform-Admins (Admin-API, audit-geloggt) |

### Server, Rollen, Mitglieder

| Model | Wichtige Felder | Beziehungen |
| --- | --- | --- |
| `Server` | `name`, `iconUrl`, `bannerUrl`, `description`, `isPublic`, `category`, `verificationLevel`, `accountAgeMinutes`, `memberAgeMinutes`, `rulesText`, `requireRulesAccept`, `verificationRoleId`, `welcomeMessage`, `welcomeChannelId`, `systemChannelId`, Automod-Felder (`automodEnabled`, `bannedWords`, `automodBlockLinks`, `automodMaxMentions`, `automodSpamLimit`) | `ownerId` → `User`; hat Kategorien, Kanäle, Rollen, Mitglieder, Einladungen, Bans, Emojis, Audit-Logs, Meldungen |
| `Role` | `name`, `color`, `icon`, `position`, `permissions` (BigInt), `isDefault` (`@everyone`), `mentionable`, `hoist` | `serverId` → `Server`; unique auf `(serverId, name)` |
| `Member` | `nickname`, `rulesAcceptedAt`, `isVerifiedByButton`, `timeoutUntil`, `joinedAt`, `mutedById` | `(serverId, userId)` unique; Rollen über `MemberRole` |
| `MemberRole` | zusammengesetzter Schlüssel `(memberId, roleId)` | Join-Tabelle `Member` ↔ `Role` |
| `Invite` | `code` (unique), `maxUses` (0 = unbegrenzt), `uses`, `expiresAt`, `channelId` | `serverId` → `Server`, `createdById` → `User` |
| `Ban` | `reason`, `deleteMessageDays`, `expiresAt` | `(serverId, userId)` unique; `bannedById` → `User` |

### Kanäle

| Model | Wichtige Felder | Beziehungen |
| --- | --- | --- |
| `ChannelCategory` | `name`, `position` | `serverId` → `Server`; gruppiert Kanäle |
| `Channel` | `name`, `type` (`TEXT`, `VOICE`, `ANNOUNCEMENT`, `FORUM`, `STAGE`, `THREAD`, `DM`, `GROUP_DM`), `topic`, `position`, `slowmodeSeconds`, `nsfw`, `isPrivate`, `parentChannelId` (Threads), `starterMessageId`, `archived` | `serverId` → `Server` (nullable für DMs), `categoryId` → `ChannelCategory`, Threads selbstreferenzierend über `parentChannelId` |
| `ChannelPermissionOverride` | `targetType` (`ROLE`/`MEMBER`), `allow`/`deny` (BigInt) | `channelId` → `Channel`; `roleId` → `Role` oder `memberId` → `Member`; unique pro `(channelId, roleId)` bzw. `(channelId, memberId)` |
| `DmParticipant` | – | `(channelId, userId)` unique; Teilnehmer von DM-/Gruppen-Kanälen (Gruppen max. `MAX_GROUP_DM_MEMBERS`) |

### Nachrichten, Reaktionen, Emojis

| Model | Wichtige Felder | Beziehungen |
| --- | --- | --- |
| `Message` | `content` (Text), `type` (`DEFAULT`, `REPLY`, `SYSTEM`, `CALL`), `replyToId`, `forwardedFromId`, `pinned`, `embeds` (OpenGraph-JSON), `mentionUserIds`, `mentionRoleIds`, `mentionEveryone`, `editedAt`, `deletedAt` (Soft Delete) | `channelId` → `Channel`, `authorId` → `User`; Antworten selbstreferenzierend |
| `Attachment` | `fileName`, `storageKey` (S3-Schlüssel), `url`, `contentType`, `size`, `width`/`height` | `messageId` → `Message` (Cascade) |
| `Reaction` | `emoji` (Unicode oder Custom-Name), `customEmojiId` | `(messageId, userId, emoji)` unique |
| `CustomEmoji` | `name`, `imageUrl` | `(serverId, name)` unique; `createdById` → `User` |

### Soziales, Benachrichtigungen, Moderation

| Model | Wichtige Felder | Beziehungen |
| --- | --- | --- |
| `Friendship` | `status` (`PENDING`, `ACCEPTED`, `BLOCKED`) | `(requesterId, addresseeId)` unique, beide → `User` |
| `Notification` | `type` (String: `MENTION`, `DM`, `FRIEND_REQUEST`, `INVITE`, `SYSTEM`, `MODERATION`), `title`, `body`, `data` (JSON), `readAt` | `userId` → `User` (Cascade) |
| `NotificationPreference` | `level` (`ALL`, `MENTIONS`, `NOTHING`), optional `serverId` oder `channelId` | unique pro `(userId, serverId)` bzw. `(userId, channelId)` |
| `ReadState` | `lastReadMessageId`, `lastReadAt`, `mentionCount` | `(userId, channelId)` unique |
| `AuditLog` | `action` (String, z. B. `MEMBER_KICK`), `targetType`, `targetId`, `reason`, `changes` (JSON) | `serverId` → `Server` (nullable für Plattform-Aktionen), `actorId` → `User` |
| `Report` | `targetType` (`MESSAGE`, `USER`, `SERVER`), `targetId`, `reason`, `status` (`OPEN`, `REVIEWING`, `RESOLVED`, `DISMISSED`), `resolution` | `reporterId`/`handledById` → `User`, `serverId` → `Server` |
| `BotAccount` | `tokenHash`, `tokenPrefix`, `description`, `lastUsedAt` | `botUserId` → `User` (der Bot ist ein normaler `User` mit `isBot`), `ownerId` → `User` |
| `Webhook` | `name`, `avatarUrl`, `token` (unique) | `channelId` → `Channel`, `createdById` → `User`; hat `WebhookSubscription`s |
| `WebhookSubscription` | `event` (`MESSAGE_CREATE`, `MEMBER_JOIN`, `MEMBER_LEAVE`), `url`, `secret`, `active` | `webhookId` → `Webhook` |

Enums im Schema: `PresenceStatus`, `ChannelType`, `VerificationLevel`,
`FriendshipStatus`, `ReportStatus`, `ReportTargetType`,
`NotificationLevel`, `OverrideTargetType`, `MessageType`, `TokenType`,
`WebhookEventType`, `OAuthProvider`.

## Berechtigungsmodell

Rechte sind Bits eines `BigInt` (Definition und Reihenfolge in
`@nexa/shared`: Bit 0 = `VIEW_CHANNELS` … Bit 29 = `ADMINISTRATOR`).
Rollen speichern ihr Bitfeld in `Role.permissions`; die API persistiert
Bitfelder in JSON als Dezimal-String (siehe `RoleDto.permissions`,
`ChannelDto.myPermissions`, `ServerDto.myPermissions`).

**Serverrechte** (`computeServerPermissions`):

1. Server-Eigentümer erhalten `ALL_PERMISSIONS`.
2. Sonst: bitweises OR aller Rollen des Mitglieds (inkl. `@everyone`).
3. Enthält das Ergebnis `ADMINISTRATOR`, wird es auf `ALL_PERMISSIONS`
   gehoben; `hasPermission` behandelt `ADMINISTRATOR` ebenfalls als
   „impliziert alles“.

**Kanalrechte** (`computeChannelPermissions`) – Overrides aus
`ChannelPermissionOverride` werden in fester Reihenfolge angewendet
(Formel jeweils `perms = (perms & ~deny) | allow`):

1. Override der Rolle `@everyone` des Kanals.
2. Alle Rollen-Overrides der Rollen des Mitglieds: erst alle `deny`-Bits
   gesammelt abziehen, dann alle `allow`-Bits gesammelt setzen
   (Allow einer Rolle kann das Deny einer anderen aufheben).
3. Mitglieds-Override des konkreten Mitglieds (gewinnt gegen Rollen).

Eigentümer und Administratoren umgehen Overrides vollständig. Fehlt am
Ende `VIEW_CHANNELS`, ist der Kanal für das Mitglied unsichtbar – die
Funktion liefert dann `0n`, und die API gibt den Kanal in Listen gar nicht
erst aus. Kanalrechte werden bei **jeder** Aktion serverseitig geprüft
(lesen, schreiben, verbinden, moderieren); Client-Anzeigen sind nur Kosmetik.

## Echtzeit-Events (Socket.IO)

Verbindungsaufbau mit dem Access-Token im Handshake; der Socket tritt
Räumen pro Server, Kanal und Nutzer (für DMs/Benachrichtigungen) bei.
Presence wird in Redis gehalten und bei mehreren API-Instanzen über den
Redis-Adapter synchronisiert.

**Client → Server (eingehend):**

| Event | Nutzlast (Kurzform) | Zweck |
| --- | --- | --- |
| `message:send` | Kanal-ID, Inhalt, Anhänge, `replyToId`, `nonce` | Nachricht senden (inkl. Slowmode-, Rechte- und Automod-Prüfung) |
| `message:edit` | Nachrichten-ID, neuer Inhalt | Eigene Nachricht bearbeiten |
| `message:delete` | Nachrichten-ID | Eigene Nachricht löschen (Mods: fremde mit `MANAGE_MESSAGES`) |
| `reaction:add` / `reaction:remove` | Nachrichten-ID, Emoji | Reaktion setzen/entfernen |
| `typing:start` / `typing:stop` | Kanal-ID | Schreib-Indikator |
| `presence:set` | `PresenceStatus`, optional Custom-Status | Anwesenheit ändern |
| `voice:state` | Kanal-ID, `muted`/`deafened`/`video`/`stream` | Eigenen Sprach-Zustand melden |
| `read:mark` | Kanal-ID, Nachrichten-ID | Lesestatus aktualisieren |
| `dm:open` | Nutzer-ID(s) | DM-/Gruppen-DM-Kanal holen oder anlegen |

**Server → Client (ausgehend):**

| Event | Zweck |
| --- | --- |
| `message:created` / `message:updated` / `message:deleted` | Nachrichten-Lebenszyklus an alle Kanal-Teilnehmer |
| `reaction:updated` | Aktuelle Reaktions-Zähler einer Nachricht |
| `typing:updated` | Liste aktuell schreibender Nutzer pro Kanal |
| `presence:updated` | Presence-/Custom-Status-Änderung eines Nutzers |
| `member:joined` / `member:left` / `member:updated` | Mitgliedschaft, Rollen, Nickname, Timeout |
| `channel:created` / `channel:updated` / `channel:deleted` | Kanal- und Kategorie-Änderungen eines Servers |
| `server:updated` / `role:updated` | Server-Einstellungen bzw. Rollen/Rechte geändert (Clients rechnen `myPermissions` neu) |
| `voice:stateUpdated` | Sprach-Zustände aller Teilnehmer eines Voice-Kanals |
| `notification:created` | Neue Benachrichtigung (Erwähnung, DM, Freundschaftsanfrage, …) |
| `friend:updated` | Freundschaftsanfragen und -Status |
| `moderation:action` | Kick/Ban/Timeout-Betroffene direkt informieren (z. B. Verbindungsabbau) |

## Auth-Flows

### Plattform-Invite-Gate (Registrierung nur mit Einladung)

Nexa ist invite-only: **Ohne gültigen Plattform-Invite-Code
(`PlatformInviteCode`) kann kein Konto erstellt werden** – weder per
E-Mail/Passwort noch per Social Login. Ablauf:

1. Ein Plattform-Admin erzeugt Codes in der **Admin-Desktop-Version**
   (Admin-Seite → Invite-Verwaltung) oder per API
   (`POST /admin/platform-invites`, auch als Batch; `GET` listet inkl.
   Nutzung, `POST /admin/platform-invites/:id/revoke` widerruft).
   Alle drei Endpunkte liegen hinter dem `AdminGuard`
   (`User.isPlatformAdmin`) – die Sichtbarkeit in der UI ist nur
   Komfort, maßgeblich ist die serverseitige Rolle.
2. Die Registrierung übermittelt den Code als `platformInviteCode`.
   Der Auth-Service prüft ihn (existiert, nicht widerrufen, nicht
   abgelaufen, `usedCount < maxUses`) und verbraucht eine Nutzung
   **atomar in derselben DB-Transaktion** wie die Kontoanlage
   (bedingtes Inkrement als optimistische Sperre gegen Parallel-
   Registrierungen mit demselben Einmal-Code). Fehler:
   `INVITE_REQUIRED` (kein Code) / `INVITE_INVALID` (unbrauchbar).
3. Social Login: Der Code wird beim OAuth-Start als `?inviteCode=`
   übergeben, per httpOnly-Cookie durch den Provider-Flow getragen
   und nur verlangt/verbraucht, wenn der Callback ein **neues** Konto
   anlegen würde. Bestehende Konten und Verknüpfungen brauchen keinen
   Code; der Login bestehender Konten ist generell codefrei.
4. Der Seed legt fünf Start-Codes an (siehe README), damit der Betreiber
   sofort Einladungen verteilen kann.

### E-Mail/Passwort + Verifizierung

1. Registrierung mit `registerSchema` (E-Mail, Nutzername
   `^[a-z0-9_.]{2,32}$` nach Kleinbuchstaben-Normalisierung, Passwort
   8–128 Zeichen, Geburtsdatum). Zusätzlich: `isPasswordAcceptable`
   (Länge ≥ 8 und Stärke-Score ≥ 2) und `validateAge` (Mindestalter 13).
2. Passwort wird gehasht gespeichert (nie im Klartext); Konto startet
   unverifiziert.
3. Verifizierungs-Mail mit Einmal-Token (`VerificationToken`, nur der Hash
   wird gespeichert, Ablaufzeit gesetzt) – lokal landet sie in MailHog,
   ohne SMTP-Konfiguration wird der Link ins Server-Log geschrieben.
4. Klick auf den Link setzt `emailVerifiedAt`. Server können per
   `verificationLevel = EMAIL` unverifizierte Konten aussperren.
5. Login prüft Passwort (Fehlversuche zählen mit, Konto wird temporär
   gesperrt), danach ggf. 2FA, dann Session-Erstellung.
6. Passwort vergessen: `PASSWORD_RESET`-Token per Mail, danach werden alle
   bestehenden Sessions des Kontos widerrufen.

### JWT, Rotation und Sessions

- **Access-Token (JWT)**: kurzlebig (`JWT_ACCESS_TTL`, Standard 900 s),
  signiert mit `JWT_ACCESS_SECRET`; wird bei jedem API-Aufruf geprüft.
- **Refresh-Token**: langlebig (`JWT_REFRESH_TTL`, Standard 30 Tage), in
  der DB liegt nur sein Hash (`Session.refreshTokenHash`). Bei jedem
  Refresh wird das Token **rotiert** (neues Refresh-Token, altes ungültig);
  Wiederverwendung eines rotierten Tokens widerruft die Session
  (Diebstahl-Erkennung).
- **Sessions** sind pro Gerät sichtbar (Gerätename, User-Agent, IP,
  zuletzt genutzt) und einzeln oder gesamt widerrufbar; `revokedAt` setzt
  die Session endgültig außer Kraft.

### Zwei-Faktor-Authentifizierung (2FA)

- TOTP-Einrichtung: Secret generieren, per QR-Code/Authenticator-App
  bestätigen, `totpEnabled` setzen; dazu Einmal-Backup-Codes (nur Hashes
  in `User.backupCodes`).
- Login-Ablauf: Passwort korrekt → API verlangt Zwei-Faktor-Code
  (`loginSchema.twoFactorCode`) → TOTP- oder Backup-Code prüfen → Session.
- 2FA deaktivieren nur mit aktuellem Passwort + gültigem Code; dabei
  werden Secret und Backup-Codes verworfen.

### OAuth (Google / Apple): Sequenz und Linking-Regeln

```
Client                 API                          Anbieter
  │  Klick auf Button     │                             │
  │──────────────────────▶│  Redirect (state, PKCE*)    │
  │                       │────────────────────────────▶│
  │                       │                             │ Login beim Anbieter
  │                       │◀────────────────────────────│ Callback mit Code
  │                       │  Code → Tokens, Profil +    │
  │                       │  bestätigte E-Mail lesen     │
  │  Session (JWT-Flow    │  Identität verknüpfen/      │
  │  wie oben)            │  Konto anlegen              │
  │◀──────────────────────│                             │
```
(*PKCE, wo vom Anbieter unterstützt.)

Linking-Regeln:

1. `(provider, providerUserId)` ist eindeutig (`OAuthIdentity`). Bekannte
   Identität → Login in das verknüpfte Konto.
2. Unbekannte Identität, aber die vom Anbieter **bestätigte** E-Mail
   gehört zu einem bestehenden Konto → Identität wird genau diesem Konto
   zugeordnet (kein Doppelkonto).
3. Weder Identität noch E-Mail bekannt → neues Konto: Nutzername aus dem
   Profilvorschlag ableiten (Kollisionen auflösen), `emailVerifiedAt`
   gesetzt (E-Mail gilt als anbietergeprüft), Geburtsdatum muss ggf. im
   Onboarding nachgetragen werden (Mindestalter bleibt Pflicht).
4. Niemals Verknüpfung über eine **unbestätigte** E-Mail; Apple
   „Private Relay“-Adressen werden wie normale E-Mails behandelt,
   Identitätsanker bleibt die `providerUserId`.
5. Manuelles Verknüpfen/Trennen in den Einstellungen nur im eingeloggten
   Zustand und nie für die letzte verbleibende Login-Methode eines Kontos
   ohne Passwort.

### Captcha

Login/Registrierung können per Captcha geschützt werden (Cloudflare
Turnstile oder hCaptcha, `CAPTCHA_PROVIDER`): Das Frontend übergibt
`captchaToken` (`loginSchema`/`registerSchema`-Flow), die API verifiziert
serverseitig gegen den Anbieter. Für lokale Entwicklung gibt es einen
ausdrücklichen Dev-Bypass (`CAPTCHA_DEV_BYPASS=true`) – ohne Schlüssel
und ohne Bypass schlägt die Prüfung ehrlich fehl statt durchzuwinken.

### Social-Login-Aktivierung (Env-Variablen)

Ohne Konfiguration zeigen die Buttons „Mit Google/Apple anmelden“ beim
Klick einen ehrlichen „nicht konfiguriert“-Fehler (kein Fake-Login).
Aktivierung nur über Umgebungsvariablen (Details im README):

- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_CALLBACK_URL`
- Apple: `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
  `APPLE_PRIVATE_KEY` (Inhalt der `.p8`, Zeilenumbrüche als `\n`) oder
  `APPLE_PRIVATE_KEY_PATH`, `APPLE_CALLBACK_URL`

## Sprach-Architektur (LiveKit)

- **Räume = Kanal-IDs**: Jeder Voice-/Stage-Kanal ist ein LiveKit-Raum,
  dessen Name exakt die Nexa-Kanal-ID ist. Es gibt keine zweite
  Raum-Verwaltung.
- **Token-Erstellung**: Die API prüft zuerst die Kanalrechte (`CONNECT`,
  für Sprechen `SPEAK`, für Kamera `VIDEO`, für Bildschirm `STREAM`,
  `PRIORITY_SPEAKER` für Vorrang) und stellt danach ein kurzlebiges
  LiveKit-JWT aus (`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` serverseitig).
- **Grants**: `roomJoin` nur für den einen Raum; `canPublish`/
  `canSubscribe` aus den Rechten abgeleitet (z. B. stummgeschaltete oder
  getimete Mitglieder: `canPublish = false`). Identität im Token ist die
  Nexa-Nutzer-ID, Anzeigename/Metadaten kommen aus dem Profil.
- **Zustand**: Mute/Deafen/Video-Zustände meldet der Client zusätzlich per
  Socket (`voice:state`), damit auch Nicht-Teilnehmer die Kanal-Besetzung
  korrekt sehen. Stage-Kanäle nutzen dieselben Grants (Publikum nur
  `canSubscribe`, Sprecher nach Freigabe `canPublish`).
- Medien laufen als WebRTC direkt Client ↔ LiveKit; die API sieht keine
  Audio-/Video-Daten.

## Datei-Uploads (Presign-Flow)

1. Client meldet Dateiname, Typ und Größe an die API; die API prüft
   Rechte (`ATTACH_FILES`), Größenlimits und erzeugt einen S3-Objektschlüssel
   (`storageKey`) sowie eine **presigned PUT-URL** auf MinIO/S3.
2. Client lädt die Datei direkt in den Objektspeicher (kein Durchreichen
   durch die API), Download läuft über die öffentliche Objekt-URL bzw.
   presigned GET für private Inhalte.
3. Beim Nachrichtensenden übergibt der Client die Anhang-Metadaten
   (`sendMessageSchema.attachments`: `fileName`, `url`, `storageKey`,
   `contentType`, `size` ≤ 100 MB, max. 10 Anhänge); die API legt die
   `Attachment`-Zeilen in derselben Transaktion wie die Nachricht an.
4. Avatare/Banner/Server-Icons laufen über denselben Flow mit eigenem
   Größenlimit (`MAX_UPLOAD_MB` für allgemeine Uploads).

## Moderation & Automod

- **Automod beim Senden** (pro Server konfigurierbar): gesperrte Wörter
  (`containsBannedWord` auf normalisiertem Text – Leet-Speak wie `b4d`,
  auseinandergezogene Schreibweise und Wortgrenzen werden behandelt),
  Link-Sperre (`automodBlockLinks`), Erwähnungs-Limit
  (`automodMaxMentions`; `@everyone`/`@here` zählen je 1) und Burst-Bremse
  (`isSpamBurst` mit `automodSpamLimit` Nachrichten pro 5 Sekunden).
  Verstöße werden blockiert, bevor die Nachricht persistiert wird;
  zusätzlich greifen Slowmode (`slowmodeSeconds`) und die Zeitstrafe.
- **Moderationsaktionen**: Nachrichten löschen (`MANAGE_MESSAGES`),
  Timeout (zeitlich befristetes Stummschalten, `timeoutUntil` am Member),
  Kick, Ban (optional mit Nachrichten-Löschung der letzten Tage,
  optional befristet). Jede Aktion schreibt einen `AuditLog`-Eintrag.
- **Beitritts-Verifizierung** pro Server: `verificationLevel`
  (`NONE`, `EMAIL`, `ACCOUNT_AGE`, `MEMBER_AGE`, `PHONE`) mit
  konfigurierbaren Alters-Schwellen, Regeln-Akzeptanz (`rulesText` +
  `rulesAcceptedAt`) und Verifizierungs-Button, der die
  `verificationRoleId`-Rolle vergibt (`isVerifiedByButton`).
- **Meldungen** (`Report`): Nachrichten/Nutzer/Server melden, Moderatoren
  arbeiten sie als `OPEN → REVIEWING → RESOLVED/DISMISSED` ab.
- **Plattform-Ebene**: `isPlatformAdmin` für globale Eingriffe,
  `isPlatformBanned` sperrt Konten plattformweit.

## Bots & Webhooks

- **Bots sind Nutzer**: Ein Bot ist ein `User` mit `isBot = true` plus
  `BotAccount` (Eigentümer, `tokenHash`, `tokenPrefix` zur Anzeige).
  Bot-Token werden nur einmal im Klartext ausgegeben, danach liegt nur der
  Hash vor; Authentifizierung per `Authorization`-Header, Aktionen laufen
  mit den Rechten des Bots als Server-Mitglied – ein Bot kann nie mehr als
  seine Rollen erlauben.
- **Eingehende Webhooks**: Pro Kanal erstellbar (`Webhook.token`), damit
  externe Dienste Nachrichten in den Kanal posten können (Name/Avatar des
  Webhooks ersetzend den Autorauftritt).
- **Ausgehende Webhooks** (`WebhookSubscription`): HTTP-POST an eine
  Ziel-URL bei `MESSAGE_CREATE`, `MEMBER_JOIN`, `MEMBER_LEAVE`,
  optional mit `secret` zur Signaturprüfung (`active` schaltbar).

## Sicherheitsmaßnahmen

- Passwörter: Hash-Verfahren (bcrypt/argon2-Familie), Kostenfaktor
  serverseitig festgelegt; keine Klartext-Speicherung, keine Passwörter in
  Logs. Alle Einmal-Tokens (Verifizierung, Reset, Refresh, Bot) liegen
  ausschließlich als Hash in der Datenbank.
- Transport & Sitzungen: JWT-Secrets aus der Umgebung (lang/zufällig),
  Refresh-Rotation mit Wiederverwendungs-Erkennung, Login-Rate-Limits
  (`AUTH_RATE_LIMIT_MAX`) plus Konto-Sperrzähler gegen Brute Force,
  generelles API-Rate-Limit.
- Eingaben: Jede Route validiert mit den Zod-Schemas aus `@nexa/shared`
  (Längen, Enums, Regex) – keine unvalidierten Schreibzugriffe.
- Ausgaben: Chat-Markdown wird mit `renderMarkdown` gerendert (erst
  escapen, dann formatieren, keine Inline-Event-Handler, Links nur
  `http(s)` mit `rel="nofollow noopener noreferrer"`). Damit ist
  gespeichertes XSS über Nachrichten ausgeschlossen.
- Rechte: Server- und Kanalrechte werden serverseitig bei jeder Operation
  geprüft; private Kanäle/DMs erscheinen für Unbefugte nicht einmal in
  Listen (`VIEW_CHANNELS`-Regel des Override-Algorithmus).
- Uploads: Presigned URLs sind kurzlebig und objektgebunden; Größen- und
  Typ-Prüfung vor dem Ausstellen; Objektschlüssel werden serverseitig
  vergeben (keine Pfad-Vorgaben durch Clients).
- Datenschutz-Minimalismus: Presences, Lesestatus und
  Benachrichtigungs-Einstellungen sind nutzerbezogen getrennt; DMs sind
  nur für `DmParticipant`s sichtbar, Gruppen-DMs gedeckelt.
- Geheimnisse nur über `.env` (siehe `.env.example`), niemals im Repo;
  Demo-Zugänge/Tokens im Seed sind ausdrücklich nur für lokale Entwicklung.

## Ordnerstruktur

```
nexa/
├── apps/
│   ├── api/                  # NestJS-API
│   │   ├── prisma/
│   │   │   ├── schema.prisma # Datenmodell (verbindlich)
│   │   │   └── seed.ts       # Demo-Daten (idempotent)
│   │   ├── src/              # REST-Module + Socket.IO-Gateway
│   │   └── test/
│   ├── web/                  # Next.js-Frontend
│   └── desktop/              # Electron-Wrapper (Windows-.exe)
├── packages/
│   └── shared/               # @nexa/shared
│       └── src/
│           ├── permissions.ts  # Bitfelder + Override-Algorithmus
│           ├── password.ts     # Passwort-Stärke
│           ├── automod.ts      # Wortfilter, Links, Spam-Burst
│           ├── mentions.ts     # Erwähnungen parsen/formatieren
│           ├── markdown.ts     # XSS-sicherer Renderer
│           ├── types.ts        # DTOs + Konstanten
│           ├── schemas.ts      # Zod-Schemas aller Eingaben
│           └── *.test.ts       # Jest-Tests (neben den Modulen)
├── docker-compose.yml        # Postgres, Redis, MinIO, MailHog, LiveKit, API, Web
├── livekit.yaml              # LiveKit-Dev-Konfiguration
├── .env.example              # Alle Umgebungsvariablen mit Erklärungen
├── ARCHITECTURE.md           # Dieses Dokument
└── README.md                 # Schnellstart, Demo-Konten, Einrichtung
```

## Skalierung & Deployment-Notizen

- **API horizontal skalierbar**: zustandslos bis auf Redis (Presence,
  Socket.IO-Adapter, Rate-Limit-Zähler); beliebig viele Instanzen hinter
  einem Load-Balancer, WebSockets mit Sticky-Alternative über den
  Redis-Adapter.
- **PostgreSQL** ist die einzige Wahrheit; Indizes liegen auf den
  Abfragemustern (Kanal + Zeit, Server + Position, Nutzer + Lesezustand).
  Für Wachstum: Read-Replicas für Lese-Peaks, Partitionierung der
  `Message`-Tabelle nach Zeit/Kanal, Archivierung alter Audit-Logs.
- **LiveKit** skaliert getrennt (SFU): Räume sind kanalgebunden und damit
  natürlich shardbar; bei Bedarf Cluster-Modus und regionsnahe Platzierung.
- **MinIO/S3**: Objektspeicher unabhängig skalierbar; CDN vor öffentliche
  Anhänge legen, private Inhalte weiter per Presign ausliefern.
- **Redis** für Presence/Cache einsetzen, nicht als Dauer-Speicher –
  Verlust von Redis darf keine Daten kosten, nur Live-Zustände.
- **Deployment**: Docker Compose für kleine Instanzen; produktiv API/Web
  als eigene Container/Services, verwaltetes PostgreSQL, S3 statt MinIO,
  echte SMTP-Zustellung, `CAPTCHA_DEV_BYPASS=false`, starke Zufalls-Secrets,
  HTTPS überall (auch für WebSockets und LiveKit), Backups für PostgreSQL
  und Objektspeicher einplanen.
