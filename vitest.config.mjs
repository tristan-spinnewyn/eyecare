import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'test/stubs/electron.js'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: [path.resolve(__dirname, 'test/setup.js')],
    include: ['test/**/*.test.js'],
    server: {
      deps: {
        inline: ['electron'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/main/**/*.js'],
      exclude: ['src/main/main.js'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
