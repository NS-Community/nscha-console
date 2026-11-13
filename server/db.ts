import { PrismaClient } from '../prisma/generated/client'

// Reuse one client across hot reloads / warm serverless invocations.
const globalForPrisma = globalThis as unknown as { nschaPrisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.nschaPrisma ?? new PrismaClient()
globalForPrisma.nschaPrisma = prisma
