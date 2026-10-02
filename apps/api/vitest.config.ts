import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
    pool: 'forks',
    // `pdf-parse` hace `require()` dinámico de un build interno de pdf.js
    // (webpack). Si Vite lo procesa, ese require no resuelve y la extracción de
    // PDF falla con "bad XRef entry" SOLO en tests. Externalizarlo lo corre en
    // Node real, igual que en la app.
    server: {
      deps: {
        external: [/pdf-parse/],
      },
    },
  },
});
