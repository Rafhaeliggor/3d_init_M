import { defineConfig } from 'vite';

export default defineConfig({
  // main.js usa await no topo do módulo.
  build: { target: 'esnext' },
});
