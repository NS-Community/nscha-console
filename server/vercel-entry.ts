/**
 * Vercel Serverless Function entry (bundled by scripts/build-server.mjs).
 *
 * Vercel's api/[...path].js catch-all only reliably matches single-segment
 * /api/* paths. Nested paths such as /api/auth/register are NOT routed to this
 * function and fall through to a static 404. To work around that, vercel.json
 * rewrites every /api/<rest> to /api/_nscha?__nscha_path=/<rest> (a single
 * segment the function is guaranteed to receive). We then restore the original
 * path from the query param before handing the request to Hono, so the app's
 * routes (mounted at both `/` and `/api`) resolve correctly regardless of depth.
 *
 * All local `server/*` code is bundled into this single file at build time by
 * esbuild, so there are no cross-directory module-resolution surprises on
 * Vercel. Third-party packages stay external and are resolved from node_modules
 * at runtime.
 */
import { handle } from '@hono/node-server/vercel'
import app from './app'

const PATH_MARKER = '__nscha_path='
let cachedHandler: any = null

export default async function (req: any, res: any) {
  // Restore the real path from the rewrite before handing off to Hono.
  const raw = req.url || ''
  if (raw.indexOf(PATH_MARKER) !== -1) {
    try {
      const u = new URL(raw, 'http://localhost')
      const restored = u.searchParams.get('__nscha_path')
      if (restored) {
        u.pathname = restored
        u.searchParams.delete('__nscha_path')
        req.url = u.search ? `${u.pathname}${u.search}` : u.pathname
      }
    } catch {
      // Leave req.url untouched if parsing fails.
    }
  }

  try {
    if (!cachedHandler) cachedHandler = handle(app)
    return cachedHandler(req, res)
  } catch (err) {
    const message = err instanceof Error ? (err.stack || err.message) : String(err)
    if (res && typeof res.setHeader === 'function') {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    }
    if (res && typeof res.end === 'function') res.end('NSCHA_BOOT_ERROR:\n' + message)
    return
  }
}
