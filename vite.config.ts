import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Hash routing is deliberate: the console, widget.js and the WASM payloads all
// live on one origin, and no SPA fallback rewrite is needed on Vercel. That
// keeps api/[...path].ts as the only routing rule on the platform.
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: { isCustomElement: (tag) => tag === 'nscha-widget' },
      },
    }),
  ],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8789', changeOrigin: false },
    },
  },
})
