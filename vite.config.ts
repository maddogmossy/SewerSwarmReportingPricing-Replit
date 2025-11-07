// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',      // ✅ ensure this is just 'dist'
  },
  plugins: [react()],
})
