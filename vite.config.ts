import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// web-ifc (WASM) und der Fragments-Worker werden mit der App ausgeliefert statt
// von einem CDN geladen: der Viewer soll auch offline und ohne Fremdaufruf laufen.
const ASSETS: [string, string][] = [
  ['node_modules/web-ifc/web-ifc.wasm', 'wasm/web-ifc.wasm'],
  ['node_modules/web-ifc/web-ifc-mt.wasm', 'wasm/web-ifc-mt.wasm'],
  ['node_modules/@thatopen/fragments/dist/Worker/worker.mjs', 'worker/fragments-worker.mjs'],
];

function copyEngineAssets(): Plugin {
  const copy = (outDir: string) => {
    for (const [from, to] of ASSETS) {
      const target = resolve(outDir, to);
      mkdirSync(resolve(target, '..'), { recursive: true });
      copyFileSync(resolve(from), target);
    }
  };
  return {
    name: 'copy-engine-assets',
    buildStart() {
      copy('public');
    },
  };
}

export default defineConfig({
  // GitHub Pages liefert das Repo unter /conocto-bim/ aus.
  base: process.env.GITHUB_PAGES ? '/conocto-bim/' : '/',
  plugins: [react(), copyEngineAssets()],
  test: { environment: 'node' },
});
