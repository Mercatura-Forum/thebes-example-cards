import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served by the Thebes asset/media contract via the boundary at
//   GET /_/raw/{contract_id}/{*path}
// `base: './'` makes emitted <script>/<link>/<img> tags resolve relative to the
// current URL, so they land under the same /_/raw/{id}/ prefix — no contract id
// is baked into the bundle. Output is chunked small for the asset uploader.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    assetsInlineLimit: 4096,
    target: 'es2022',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-[hash].js',
        chunkFileNames: 'assets/chunk-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
