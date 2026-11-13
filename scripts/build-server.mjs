// Bundle the Vercel serverless function entry into a single self-contained
// file. All local `server/*` code is inlined; third-party packages stay
// external and are resolved from node_modules at runtime on Vercel.
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('api', { recursive: true })

await build({
  entryPoints: ['server/vercel-entry.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'api/[...path].js',
  // Keep node_modules deps external — they are installed by Vercel at deploy
  // time and would break if we tried to bundle native/complex packages.
  packages: 'external',
  logLevel: 'info',
})

console.log('✓ api/[...path].js bundled')
