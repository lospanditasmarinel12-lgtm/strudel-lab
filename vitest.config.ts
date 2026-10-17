import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./client/src/test/setup.ts'],
    include: ['client/src/**/*.test.{ts,tsx}'],
    // Property-based and corpus tests are intentionally heavier than unit tests
    // (and run slower under Stryker's perTest instrumentation).
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['client/src/**/*.{ts,tsx}'],
      exclude: [
        'client/src/**/*.test.{ts,tsx}',
        'client/src/test/**',
        'client/src/components/ui/**',
      ],
      // Per-module floors for the critical path. Set just below the achieved
      // numbers so a regression that removes coverage fails CI, while normal
      // refactors have headroom. See TEST_REPORT.md for the measured baseline.
      thresholds: {
        'client/src/lib/diff.ts': { lines: 95, branches: 88 },
        'client/src/lib/wav-encoder.ts': { lines: 92, branches: 95 },
        'client/src/lib/recorder.ts': { lines: 85, branches: 75 },
        'client/src/lib/code-session-player.ts': { lines: 92, branches: 75 },
        'client/src/lib/timeline-parser.ts': { lines: 90, branches: 80 },
        'client/src/lib/session-exporter.ts': { lines: 78, branches: 50 },
        'client/src/lib/sample-registry.ts': { lines: 18, branches: 10 },
        'client/src/lib/blockly/**': { lines: 85, branches: 65 },
      },
    },
    deps: {
      optimizer: {
        ssr: {
          exclude: ['monaco-editor'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './client/src'),
      '@shared': path.resolve(import.meta.dirname, './shared'),
      // Force the ESM bundle (the `main` field points at a UMD build with no exports).
      '@strudel/web': path.resolve(import.meta.dirname, './node_modules/@strudel/web/dist/index.mjs'),
    },
  },
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
});
