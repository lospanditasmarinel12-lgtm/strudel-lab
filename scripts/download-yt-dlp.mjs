import { writeFile, chmod } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const extraDir = join(__dirname, '..', 'extraResources');
const isWin = process.platform === 'win32';
const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const dest = join(extraDir, binName);

if (existsSync(dest)) {
  console.log(`[yt-dlp] already downloaded at ${dest}`);
  process.exit(0);
}

const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + binName;
console.log(`[yt-dlp] downloading ${url} -> ${dest}`);

const response = await fetch(url);
if (!response.ok && !(response.status >= 300 && response.status < 400)) {
  console.error(`[yt-dlp] download failed: HTTP ${response.status}`);
  process.exit(1);
}

const buffer = await response.arrayBuffer();
await writeFile(dest, Buffer.from(buffer));
if (!isWin) await chmod(dest, 0o755);
console.log('[yt-dlp] download complete');
