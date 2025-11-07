// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',                 // important for relative asset paths on Vercel
  build: {
    outDir: 'dist',           // must match Vercel’s Output Directory
  },
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
})
