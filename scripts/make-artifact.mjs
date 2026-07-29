/**
 * Converts the single-file preview build into an artifact-ready fragment.
 *
 * The publishing host supplies its own `<!doctype>`, `<html>`, `<head>` and
 * `<body>`, so a complete document cannot be handed over as-is. This pulls the
 * three pieces that matter out of `dist-preview/index.html` — the title, the
 * inlined stylesheet, and the inlined bundle — and re-emits them as a fragment
 * with the mount point the app expects.
 *
 * Usage: node scripts/make-artifact.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'dist-preview/index.html')
const target = resolve(root, 'dist-preview/artifact.html')

const html = readFileSync(source, 'utf8')

// A script or stylesheet left pointing at a separate file means the build did
// not fully inline, and the fragment would publish unstyled or dead. Icon links
// are exempt: they never reach the fragment, and the host supplies its own.
const external = [...html.matchAll(/<(?:script|link)\b[^>]*>/g)]
  .map((m) => m[0])
  .filter((tag) => !/rel="(?:icon|apple-touch-icon|manifest)"/.test(tag))
  .map((tag) => tag.match(/\b(?:src|href)="([^"]+)"/)?.[1])
  .filter((url) => url && !url.startsWith('data:'))

if (external.length > 0) {
  console.error('Build left external references, refusing to emit:', external)
  process.exit(1)
}

const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1])
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
)

if (styles.length === 0 || scripts.length === 0) {
  console.error(
    `Expected inline styles and scripts, found ${styles.length} style and ${scripts.length} script blocks.`,
  )
  process.exit(1)
}

const fragment = `<title>GF Field Command — Preview</title>
<style>
${styles.join('\n')}
</style>

<div id="root"></div>

<script type="module">
${scripts.join('\n')}
</script>
`

mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, fragment, 'utf8')

const kb = (n) => `${(n / 1024).toFixed(0)} kB`
console.log(`artifact.html written — ${kb(Buffer.byteLength(fragment))}`)
console.log(`  ${styles.length} style block(s), ${scripts.length} script block(s)`)
