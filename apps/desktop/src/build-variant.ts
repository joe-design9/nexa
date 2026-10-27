/**
 * Build-Variante der Desktop-App.
 *
 * - 'standard' → normales „Nexa“ (lädt die Web-UI ohne Invite-Verwaltung).
 * - 'admin'    → „Nexa Admin“ (die Web-UI blendet für Plattform-Admins
 *                zusätzlich die Plattform-Invite-Verwaltung ein; die
 *                Admin-Rolle prüft die API weiterhin serverseitig).
 *
 * Diese Datei wird von scripts/set-variant.mjs bzw. scripts/build-admin.mjs
 * vor dem Admin-Build umgeschrieben und danach wieder auf 'standard'
 * zurückgesetzt. Im Repository steht sie immer auf 'standard'.
 */
function detectVariant(): 'standard' | 'admin' {
  return 'standard';
}

export const BUILD_VARIANT: 'standard' | 'admin' = detectVariant();

export const APP_DISPLAY_NAME = BUILD_VARIANT === 'admin' ? 'Nexa Admin' : 'Nexa';
