/**
 * Central, multi-tenant PoW protocol.
 *
 *   POST /api/challenge  → signed puzzle bound to one widget + one scope
 *   POST /api/redeem     → browser's answers are checked, a short-lived
 *                          verification token is minted for that widget
 *   POST /api/verify     → the site owner's server exchanges { token, secret }
 *
 * The puzzle itself never leaves this process. The only durable state is a
 * token digest used to stop replay (see UsedToken); no visitor identifier is
 * ever stored.
 */
import { generateChallenge, validateChallenge } from 'capjs-core'
import { sign, verify } from 'hono/jwt'
import type { RuntimeConfig } from './env'
import { randomHex } from './env'

export interface Difficulty {
  count: number
  difficulty: number
}

const DIFFICULTIES: Record<string, Difficulty> = {
  low: { count: 12, difficulty: 2 },
  medium: { count: 20, difficulty: 3 },
  high: { count: 32, difficulty: 4 },
}

export function difficultyFor(level: string, cfg: RuntimeConfig): Difficulty {
  return DIFFICULTIES[level] || { count: cfg.count, difficulty: cfg.difficulty }
}

/** The scope handed to capjs-core binds a puzzle to one widget + one purpose. */
export function bindingFor(widgetId: string, scope: string, preview: boolean): string {
  return `${widgetId}|${scope}|${preview ? 'preview' : 'live'}`
}

export async function createChallenge(
  cfg: RuntimeConfig,
  binding: string,
  level: string
) {
  const d = difficultyFor(level, cfg)
  return await generateChallenge(cfg.capSecret, {
    challengeCount: d.count,
    challengeSize: cfg.size,
    challengeDifficulty: d.difficulty,
    expiresMs: cfg.expiresSeconds * 1000,
    scope: binding,
  })
}

// One challenge → one redemption per instance. The signed TTL + the token
// digest table do the real work across instances.
const usedNonces = new Map<string, number>()
function consumeNonce(key: string, ttlMs: number): boolean {
  const now = Date.now()
  if (usedNonces.size > 5_000) {
    for (const [k, until] of usedNonces) if (until < now) usedNonces.delete(k)
  }
  if (usedNonces.has(key)) return false
  usedNonces.set(key, now + ttlMs)
  return true
}

export interface RedeemClaims {
  widgetId: string
  sitekey: string
  scope: string
  preview: boolean
}

export type RedeemOutcome =
  | { ok: true; token: string; expires: number }
  | { ok: false; reason: string }

export async function redeemChallenge(
  cfg: RuntimeConfig,
  body: { token?: string; solutions?: unknown; instr?: unknown; instr_blocked?: boolean; instr_timeout?: boolean },
  binding: string,
  claims: RedeemClaims
): Promise<RedeemOutcome> {
  const jti = randomHex(12)
  const result = await validateChallenge(
    cfg.capSecret,
    {
      token: String(body?.token || ''),
      solutions: body?.solutions as never,
      instr: body?.instr as never,
      instr_blocked: body?.instr_blocked,
      instr_timeout: body?.instr_timeout,
    },
    {
      scope: binding,
      tokenTtlMs: cfg.tokenTtlSeconds * 1000,
      consumeNonce: (sigHex: string) => consumeNonce(`${binding}:${sigHex}`, cfg.expiresSeconds * 1000),
      signToken: async ({ expires }) =>
        sign(
          {
            nscha: true,
            wid: claims.widgetId,
            sk: claims.sitekey,
            scope: claims.scope,
            jti,
            preview: claims.preview,
            exp: Math.floor(expires / 1000),
          },
          cfg.capTokenSecret,
          'HS256'
        ),
    }
  )

  if (!result.success) return { ok: false, reason: String(result.reason || 'invalid') }
  return { ok: true, token: result.token, expires: result.expires }
}

export interface VerificationPayload {
  wid: string
  sk: string
  scope: string
  jti: string
  preview: boolean
  exp: number
}

export type InspectOutcome =
  | { ok: true; payload: VerificationPayload }
  | { ok: false; reason: string }

export async function inspectVerificationToken(
  cfg: RuntimeConfig,
  raw: string
): Promise<InspectOutcome> {
  const token = (raw || '').trim()
  if (!token) return { ok: false, reason: 'missing_token' }
  let p: Record<string, unknown>
  try {
    p = (await verify(token, cfg.capTokenSecret, 'HS256')) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'invalid_token' }
  }
  if (p.nscha !== true) return { ok: false, reason: 'wrong_token_kind' }
  const exp = Number(p.exp || 0)
  if (!exp || exp * 1000 < Date.now()) return { ok: false, reason: 'expired' }
  if (typeof p.wid !== 'string' || typeof p.sk !== 'string' || typeof p.jti !== 'string') {
    return { ok: false, reason: 'malformed_token' }
  }
  if (p.preview === true) return { ok: false, reason: 'preview_token' }
  return {
    ok: true,
    payload: {
      wid: p.wid,
      sk: p.sk,
      scope: String(p.scope || ''),
      jti: p.jti,
      preview: false,
      exp,
    },
  }
}
