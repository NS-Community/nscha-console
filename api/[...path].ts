/**
 * Vercel Serverless Function entry.
 *
 * Vercel's `api/[...path].ts` catch-all only reliably matches single-segment
 * `/api/*` paths. Nested paths such as `/api/auth/register` are NOT routed to
 * this function and fall through to a static 404. To work around that,
 * vercel.json rewrites every `/api/<rest>` to `/api/_nscha?__nscha_path=/<rest>`
 * (a single segment the function is guaranteed to receive). We then restore the
 * original path from the query param before handing the request to Hono, so the
 * app's routes (mounted at both `/` and `/api`) resolve correctly regardless of
 * depth.
 *
 * `server/app` (and therefore Prisma) is imported lazily inside the handler, not
 * at module top level. A top-level `import app` would run `new PrismaClient()`
 * during cold-load; if the query engine is missing from the bundle the whole
 * function crashes with a blank FUNCTION_INVOCATION_FAILED. Importing on demand
 * lets us return the real stack trace instead of a silent 500 — the only way to
 * debug bundling problems on Vercel.
 */
import { handle } from '@hono/node-server/vercel'

const PATH_MARKER = '__nscha_path='
type VercelHandler = ReturnType<typeof handle>
let cachedHandler: VercelHandler | null = null

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
    if (!cachedHandler) {
      const appMod = await import('../server/app')
      cachedHandler = handle(appMod.default)
    }
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
