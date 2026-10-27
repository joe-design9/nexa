// Erzeugt build/icon.png (512×512) aus assets/icon.svg.
// electron-builder erzeugt daraus unter Windows automatisch die .ico-Datei.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'assets', 'icon.svg'));
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } });
const png = resvg.render().asPng();
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'icon.png'), png);
console.log('build/icon.png geschrieben:', png.length, 'Bytes');
