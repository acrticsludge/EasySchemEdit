import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: 'static',
  integrations: [react()],
  build: {
    assets: '_astro',
  },
  vite: {
    worker: {
      format: 'es',
    },
    resolve: {
      alias: {
        '@easyschemedit/formats': resolve(__dirname, '../../packages/formats/index.ts'),
        '@easyschemedit/domain': resolve(__dirname, '../../packages/domain/src/index.ts'),
      },
    },
  },
});
