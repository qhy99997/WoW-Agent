import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renderer-only dev server used for visual QA in a normal browser.
// The app falls back to an in-memory mock bridge when window.wow is absent.
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src')
    }
  },
  server: { port: 5199, strictPort: true }
})
