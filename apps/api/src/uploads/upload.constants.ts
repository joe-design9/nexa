/** Erlaubte Upload-Dateitypen (Präfix- und exakte Typen). */
export const ALLOWED_CONTENT_PREFIXES = ['image/', 'video/', 'audio/'];
export const ALLOWED_CONTENT_EXACT = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/markdown',
];

export function isAllowedContentType(contentType: string): boolean {
  const ct = (contentType || '').toLowerCase();
  return ALLOWED_CONTENT_PREFIXES.some((p) => ct.startsWith(p)) || ALLOWED_CONTENT_EXACT.includes(ct);
}

export function maxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024;
}
