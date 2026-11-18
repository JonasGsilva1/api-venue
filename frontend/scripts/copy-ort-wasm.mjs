import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const dstDir = join(root, 'public', 'ort');

if (existsSync(srcDir)) {
  mkdirSync(dstDir, { recursive: true });
  for (const file of readdirSync(srcDir)) {
    if (file.startsWith('ort-wasm') && (file.endsWith('.wasm') || file.endsWith('.mjs'))) {
      cpSync(join(srcDir, file), join(dstDir, file));
    }
  }
}
