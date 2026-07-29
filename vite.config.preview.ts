import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Preview build — the whole app inlined into one HTML file.
 *
 * Used to produce a shareable page someone can open on a phone without any
 * hosting set up. Two deliberate differences from the production config:
 *
 *  - **No PWA plugin.** A service worker cannot be inlined into a single file,
 *    and would not be allowed to register in an embedded context anyway. That
 *    means the preview has no offline mode and cannot be installed to a home
 *    screen — which is exactly why this is a preview and not the real thing.
 *  - **No manifest or separate icons**, for the same reason.
 *
 * Everything else is identical, so what a viewer sees is the real app.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: {
    outDir: 'dist-preview',
    emptyOutDir: true,
    // Nothing may be emitted as a separate file — it all has to end up inline.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
})
