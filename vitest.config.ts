import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // tests/e2e/** are Playwright specs — run by `npm run e2e`, not vitest
    exclude: [...configDefaults.exclude, 'tests/e2e/**']
  }
})
