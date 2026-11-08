/**
 * Vercel Serverless Function entry (catch-all for /api/*).
 *
 * The Hono app mounts every route both at the root and under /api, so it does
 * not matter whether Vercel hands the function the original path or the
 * rewrite destination. `framework: null` in vercel.json keeps this project
 * out of the backend-framework preset, which would otherwise look for a
 * server entrypoint inside dist/.
 */
import { handle } from '@hono/node-server/vercel'
import app from '../server/app'

export default handle(app)
