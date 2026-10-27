import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BUILD_VARIANT, APP_DISPLAY_NAME } from './build-variant';

interface NexaConfig {
  serverUrl?: string;
}

const DEFAULT_SERVER_URL = 'http://localhost:3000';
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

// Desktop-eigene Meldungen folgen der Systemsprache (app.getLocale());
// die Oberflächensprache der Web-App wird dort selbst umgeschaltet.
const DESKTOP_STRINGS = {
  de: {
    unreachableHint: (url: string) => `Server unter ${url} nicht erreichbar. Läuft die Nexa-Web-App dort?`,
    loadFailed: (url: string) => `Server unter ${url} konnte nicht geladen werden.`,
    loadFailedGeneric: (desc: string) => `Laden fehlgeschlagen (${desc}). Bitte Server-URL prüfen.`,
    invalidUrl: 'Bitte eine gültige http(s)-URL eingeben.',
    unreachable: (url: string) => `Server unter ${url} nicht erreichbar.`,
    adminStartTitle: 'Nexa Admin – Server verbinden',
  },
  en: {
    unreachableHint: (url: string) => `Server at ${url} is unreachable. Is the Nexa web app running there?`,
    loadFailed: (url: string) => `Server at ${url} could not be loaded.`,
    loadFailedGeneric: (desc: string) => `Loading failed (${desc}). Please check the server URL.`,
    invalidUrl: 'Please enter a valid http(s) URL.',
    unreachable: (url: string) => `Server at ${url} is unreachable.`,
    adminStartTitle: 'Nexa Admin – Connect to server',
  },
} as const;

function ds() {
  return app.getLocale().toLowerCase().startsWith('de') ? DESKTOP_STRINGS.de : DESKTOP_STRINGS.en;
}

function configPath(): string {
  return join(app.getPath('userData'), 'nexa-config.json');
}

function readConfig(): NexaConfig {
  try {
    if (existsSync(configPath())) {
      return JSON.parse(readFileSync(configPath(), 'utf8')) as NexaConfig;
    }
  } catch {
    /* defekte Konfiguration ignorieren */
  }
  return {};
}

function writeConfig(cfg: NexaConfig): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

// ── Eingebackene Server-Adresse (nexa-server.txt) ──────────────────────────
// Liegt neben der ausgeführten .exe (im win-unpacked-Ordner bzw. beim
// Portable-Build im Ordner der portablen .exe) eine Datei "nexa-server.txt"
// mit einer einzigen Server-URL, gilt diese Adresse als fest verdrahtet:
// Die App verbindet sich beim Start automatisch mit dieser Instanz – ein
// Endnutzer muss keine Adresse eingeben und sieht im Normalfall kein
// Adressfeld. Erstellt wird die Datei vom Betreiber mit
// hosting/windows/bake-release.ps1.
//
// Priorität der Server-Adresse (höchste zuerst):
//   1. Vom Nutzer gespeicherte Adresse (nexa-config.json, gesetzt über den
//      Startbildschirm oder die Einstellungen in der Web-App). Sobald sie
//      existiert, gewinnt sie – die eingebackene Adresse überschreibt eine
//      bewusste Nutzerentscheidung nie stillschweigend (Bestandsschutz:
//      die Adresse bleibt in den Einstellungen änderbar).
//   2. Eingebackene Adresse aus nexa-server.txt. Sie gewinnt beim
//      Erststart (noch keine gespeicherte Adresse) gegenüber dem Standard.
//   3. Standard (http://localhost:3000) bzw. Startbildschirm zur Eingabe.
const BAKED_SERVER_FILE = 'nexa-server.txt';
let bakedServerUrlCache: string | null | undefined;

function readBakedServerUrl(): string | null {
  if (bakedServerUrlCache !== undefined) return bakedServerUrlCache;
  bakedServerUrlCache = null;
  const dirs: string[] = [];
  // Portable-Builds entpacken sich in ein Temp-Verzeichnis (app.getPath('exe')
  // zeigt dorthin); der Ordner der portablen .exe selbst steht in dieser
  // Umgebungsvariable – dort gehört die nexa-server.txt hin.
  if (process.env.PORTABLE_EXECUTABLE_DIR) dirs.push(process.env.PORTABLE_EXECUTABLE_DIR);
  try {
    dirs.push(dirname(app.getPath('exe')));
  } catch {
    /* ignorieren – dann gibt es eben keine eingebackene Adresse */
  }
  for (const dir of dirs) {
    try {
      const file = join(dir, BAKED_SERVER_FILE);
      if (!existsSync(file)) continue;
      const firstLine = readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (!firstLine) continue;
      const clean = firstLine.replace(/\/+$/, '');
      if (/^https?:\/\/.+/i.test(clean)) {
        bakedServerUrlCache = clean;
        break;
      }
    } catch {
      /* nicht lesbar/ungültig → wie „keine eingebackene Adresse“ behandeln */
    }
  }
  return bakedServerUrlCache;
}

/** Wirksame Server-Adresse: Nutzer-Config > eingebacken > null (Startbildschirm). */
function effectiveServerUrl(): string | null {
  return readConfig().serverUrl ?? readBakedServerUrl();
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await net.fetch(url, { method: 'HEAD', signal: controller.signal as never });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}

function showStartPage(error?: string): void {
  if (!mainWindow) return;
  const file = join(__dirname, '..', 'src', 'start.html');
  const query = error ? `?error=${encodeURIComponent(error)}` : '';
  void mainWindow.loadFile(file).then(() => {
    if (!mainWindow) return;
    // Admin-Version auf der Startseite kenntlich machen (Titel + Überschrift).
    if (BUILD_VARIANT === 'admin') {
      void mainWindow.webContents.executeJavaScript(
        `document.title = ${JSON.stringify(ds().adminStartTitle)}; var h = document.querySelector('h1'); if (h) h.textContent = 'NEXA ADMIN';`,
      ).catch(() => undefined);
    }
    if (error) {
      void mainWindow.webContents.executeJavaScript(
        `window.__NEXA_START_ERROR__ = ${JSON.stringify(error)}; document.dispatchEvent(new Event('nexa-start-error'));`,
      ).catch(() => undefined);
    }
  });
  void query;
}

async function loadServer(url: string): Promise<void> {
  if (!mainWindow) return;
  const ok = await isReachable(url);
  if (!ok) {
    showStartPage(ds().unreachableHint(url));
    return;
  }
  try {
    await mainWindow.loadURL(url);
  } catch {
    showStartPage(ds().loadFailed(url));
  }
}

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 420,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  void splashWindow.loadFile(join(__dirname, '..', 'src', 'splash.html'));
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0B0B12',
    autoHideMenuBar: true,
    title: APP_DISPLAY_NAME,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, description, validatedURL, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = abgebrochen
    if (validatedURL.startsWith('file://')) return;
    showStartPage(ds().loadFailedGeneric(description));
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  ipcMain.handle('nexa:get-build-variant', () => BUILD_VARIANT);
  ipcMain.handle(
    'nexa:get-server-url',
    () => readConfig().serverUrl ?? readBakedServerUrl() ?? DEFAULT_SERVER_URL,
  );
  ipcMain.handle('nexa:set-server-url', async (_e, url: string) => {
    const clean = String(url || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\/.+/i.test(clean)) return { ok: false, error: ds().invalidUrl };
    const ok = await isReachable(clean);
    if (!ok) return { ok: false, error: ds().unreachable(clean) };
    writeConfig({ ...readConfig(), serverUrl: clean });
    await loadServer(clean);
    return { ok: true };
  });

  void app.whenReady().then(async () => {
    createSplash();
    createMainWindow();
    // Gespeicherte Adresse oder eingebackene Adresse (nexa-server.txt) →
    // nach dem Splash automatisch verbinden, kein Startbildschirm nötig.
    const startUrl = effectiveServerUrl();
    setTimeout(async () => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      splashWindow = null;
      if (mainWindow) {
        mainWindow.show();
        if (startUrl) {
          await loadServer(startUrl);
        } else {
          showStartPage();
        }
      }
    }, 1850);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
