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
 * `framework: null` keeps this project out of the backend-framework preset,
 * which would otherwise look for a server entrypoint inside dist/.
 */
import { handle } from '@hono/node-server/vercel'
import app from '../server/app'

const vercelHandler = handle(app)

const PATH_MARKER = '__nscha_path='

export default async function (req: { url?: string }, res: unknown) {
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
  return vercelHandler(req as never, res as never)
}
