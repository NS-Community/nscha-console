/**
 * Runtime configuration and small crypto helpers.
 *
 * Every value is read lazily inside a function: serverless platforms inject
 * env at cold start, and an ESM module-level read can capture an empty string
 * permanently. This is load-bearing on Vercel.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

export interface RuntimeConfig {
  jwtSecret: string
  encKey: string
  capSecret: string
  capTokenSecret: string
  publicOrigin: string
  consoleOrigins: string[]
  docsUrl: string
  count: number
  size: number
  difficulty: number
  expiresSeconds: number
  tokenTtlSeconds: number
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name])
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function listEnv(name: string, fallback: string): string[] {
  return (process.env[name] || fallback)
    .split(',')
    .map((v) => v.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean)
}

export function readRuntime(): RuntimeConfig {
  const capSecret = (process.env.CAP_SECRET || '').trim()
  return {
    jwtSecret: (process.env.CONSOLE_JWT_SECRET || '').trim(),
    encKey: (process.env.CONSOLE_ENC_KEY || '').trim(),
    capSecret,
    capTokenSecret: (process.env.CAP_TOKEN_SECRET || '').trim() || capSecret,
    publicOrigin: (process.env.NSCHA_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, ''),
    consoleOrigins: listEnv('CONSOLE_ORIGIN', 'http://localhost:5173'),
    docsUrl: process.env.NSCHA_DOCS_URL || 'https://nscha.nsbbs.eu.cc',
    count: intEnv('CAP_CHALLENGE_COUNT', 20, 4, 200),
    size: intEnv('CAP_CHALLENGE_SIZE', 32, 16, 64),
    difficulty: intEnv('CAP_CHALLENGE_DIFFICULTY', 3, 1, 6),
    expiresSeconds: intEnv('CAP_EXPIRES_SECONDS', 600, 60, 3600),
    tokenTtlSeconds: intEnv('CAP_TOKEN_TTL_SECONDS', 300, 60, 3600),
  }
}

export function isConfigured(cfg: RuntimeConfig): boolean {
  return Boolean(cfg.jwtSecret && cfg.encKey && cfg.capSecret)
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex')
}

/** AES-256-GCM. Key material is a hex string from the environment. */
export function encryptSecret(plain: string, keyHex: string): string {
  const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.')
}

export function decryptSecret(payload: string, keyHex: string): string {
  try {
    const [iv, tag, body] = payload.split('.')
    const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

/** Accept `example.com`, `http://…`, `https://…`, with or without a path. */
export function normalizeOrigin(raw: string): string {
  const value = (raw || '').trim().toLowerCase().replace(/\/+$/, '')
  if (!value) return ''
  const withProtocol = /^https?:\/\//.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withProtocol)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin
  } catch {
    return ''
  }
}

export function splitList(value: string): string[] {
  return value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}
