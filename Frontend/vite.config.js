import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SLAMS frontend - Vite config
// base: './' so the built files work correctly when hosted on S3 static website hosting
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist'
  }
})
