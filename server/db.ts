import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Reuse one client across hot reloads / warm serverless invocations.
const globalForPrisma = globalThis as unknown as { nschaPrisma?: PrismaClient }

function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL || ''
  // On Vercel (Postgres/Neon) use the driver adapter. This ships no native
  // query-engine binary, so there is nothing to bundle into the serverless
  // function — which is what previously crashed the function on cold load.
  if (url.startsWith('postgres')) {
    const pool = new pg.Pool({ connectionString: url })
    return new PrismaClient({ adapter: new PrismaPg(pool) })
  }
  // Local development uses SQLite with the default engine.
  return new PrismaClient()
}

export const prisma: PrismaClient = globalForPrisma.nschaPrisma ?? createPrisma()
globalForPrisma.nschaPrisma = prisma
