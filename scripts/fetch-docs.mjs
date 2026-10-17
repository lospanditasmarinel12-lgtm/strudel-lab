// Downloads reference documentation used to build the Strudel block catalog.
// Run: `node scripts/fetch-docs.mjs`. Output: docs/reference/{strudel,blockly}/*.html
// The raw snapshots are committed so the catalog can be audited offline.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const STRUDEL = [
  'learn/mini-notation',
  'learn/factories',
  'learn/time-modifiers',
  'learn/signals',
  'learn/random-modifiers',
  'learn/conditional-modifiers',
  'learn/accumulation',
  'learn/tonal',
  'learn/stepwise',
  'learn/samples',
  'learn/synths',
  'learn/effects',
  'learn/code',
  'functions/value-modifiers',
];

const BLOCKLY = [
  'https://docs.blockly.com/guides/create-custom-blocks/define/json-and-js/',
  'https://docs.blockly.com/guides/create-custom-blocks/code-generation/block-code/',
  'https://docs.blockly.com/reference/blockly.inject_function/',
  'https://docs.blockly.com/guides/get-started/get-the-code/',
];

async function grab(url, out) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    await writeFile(out, body, 'utf8');
    console.log(`ok   ${url}`);
  } catch (err) {
    console.warn(`skip ${url} (${err.message})`);
  }
}

async function main() {
  const strudelDir = resolve(root, 'docs', 'reference', 'strudel');
  const blocklyDir = resolve(root, 'docs', 'reference', 'blockly');
  await mkdir(strudelDir, { recursive: true });
  await mkdir(blocklyDir, { recursive: true });

  for (const p of STRUDEL) {
    const name = p.replace(/[\/]/g, '__') + '.html';
    await grab(`https://strudel.cc/${p}/`, resolve(strudelDir, name));
  }
  for (const url of BLOCKLY) {
    const name = url.replace(/^https?:\/\//, '').replace(/[\/]/g, '__') + '.html';
    await grab(url, resolve(blocklyDir, name));
  }
  console.log('done');
}

main();
