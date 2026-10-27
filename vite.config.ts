/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Recharts accounts for most of the bundle; one chunk is fine for this app.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/calculations/**/*.test.ts', 'tests/components/**/*.test.tsx'],
  },
});
