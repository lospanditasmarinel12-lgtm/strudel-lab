// Copies Blockly's runtime media (cursors, sounds, icons) into the Vite public
// dir so the desktop build works fully offline. Run automatically on install,
// dev and build; safe to run repeatedly.
import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const from = resolve(root, 'node_modules', 'blockly', 'media');
const to = resolve(root, 'client', 'public', 'blockly-media');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(from))) {
    console.warn('[copy-blockly-media] blockly media not found, skipping');
    return;
  }
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
  console.log('[copy-blockly-media] copied blockly media -> client/public/blockly-media');
}

main().catch((err) => {
  console.error('[copy-blockly-media] failed:', err);
  process.exitCode = 1;
});
