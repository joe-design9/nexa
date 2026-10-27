#!/usr/bin/env node
/**
 * Baut die Admin-Desktop-Version „Nexa Admin“:
 *  1. Build-Variante auf 'admin' setzen (src/build-variant.ts)
 *  2. TypeScript kompilieren
 *  3. electron-builder mit electron-builder.admin.json (Ausgabe: release-admin/)
 *  4. Build-Variante in jedem Fall wieder auf 'standard' zurücksetzen
 *
 * Verwendung: npm run dist:win:admin
 * Zusätzliche electron-builder-Argumente werden durchgereicht,
 * z. B. `node scripts/build-admin.mjs --dir` für nur das entpackte Verzeichnis.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
// npm-Workspaces: Abhängigkeiten liegen gehisst in der Repo-Wurzel.
const repoRoot = join(root, '..', '..');
const tscBin = join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const builderBin = join(repoRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const extraArgs = process.argv.slice(2);

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} endete mit Code ${result.status}`);
}

try {
  run(process.execPath, ['scripts/set-variant.mjs', 'admin']);
  run(process.execPath, [tscBin, '-p', 'tsconfig.json']);
  run(process.execPath, [builderBin, '--win', '--x64', '--config', 'electron-builder.admin.json', ...extraArgs]);
} finally {
  try {
    run(process.execPath, ['scripts/set-variant.mjs', 'standard']);
  } catch {
    console.error('WARNUNG: Build-Variante konnte nicht auf "standard" zurückgesetzt werden – bitte scripts/set-variant.mjs standard manuell ausführen.');
  }
}
