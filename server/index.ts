/** Local Node entry. Static assets are served by Vite on :5173 in dev. */
import 'dotenv/config'
import { serve } from '@hono/node-server'
import app from './app'

const port = Number(process.env.PORT) || 8789

serve({ fetch: (req) => app.fetch(req), port, hostname: '127.0.0.1' }, (info) => {
  console.log(`NSCHA Console API → http://127.0.0.1:${info.port}`)
})
