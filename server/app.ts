/**
 * NSCHA Console HTTP surface.
 *
 * Two audiences share one origin:
 *   /api/console/*  — the site owner's browser (session JWT)
 *   /api/challenge  — the visitor's browser, cross-origin from the owner's site
 *   /api/redeem
 *   /api/verify     — the owner's backend (secret)
 *
 * Routes are authored without the /api prefix and mounted twice, so the same
 * app works behind Vite's dev proxy, the local Node server, and Vercel's
 * api/[...path].ts function regardless of which path shape the platform sends.
 */
import { Hono, type Context } from 'hono'
import type { User, Widget } from '../prisma/generated/client'
import { prisma } from './db'
import { currentUser, loginUser, publicUser, registerUser } from './auth'
import {
  decryptSecret,
  encryptSecret,
  isConfigured,
  normalizeOrigin,
  randomHex,
  readRuntime,
  sha256Hex,
  splitList,
  todayUtc,
} from './env'
import {
  bindingFor,
  createChallenge,
  inspectVerificationToken,
  redeemChallenge,
} from './protocol'

type Env = { Variables: { origin: string } }
const api = new Hono<Env>()
const app = new Hono<Env>()

const ALLOW_HEADERS =
  'Content-Type, Authorization, x-nscha-sitekey, x-captcha-scope, x-nscha-preview'

function corsHeaders(c: Context): Record<string, string> {
  const origin = c.get('origin') || c.req.header('origin') || ''
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  }
}

function reply(c: Context, data: unknown, status = 200) {
  return c.json(data, status as 200, corsHeaders(c))
}

api.use('*', async (c, next) => {
  c.set('origin', c.req.header('origin') || '')
  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204, corsHeaders(c))
  }
  await next()
  for (const [key, value] of Object.entries(corsHeaders(c))) c.res.headers.set(key, value)
})

// ─── helpers ────────────────────────────────────────────────────────────────

async function bump(
  widgetId: string,
  field: 'challenges' | 'solved' | 'verified' | 'rejected',
  n = 1
) {
  const date = todayUtc()
  await prisma.usageDaily.upsert({
    where: { widgetId_date: { widgetId, date } },
    create: { widgetId, date, [field]: n },
    update: { [field]: { increment: n } },
  })
}

async function logEvent(userId: string, widgetId: string | null, type: string, detail: string) {
  await prisma.event.create({ data: { userId, widgetId, type, detail } })
}

function publicWidget(w: Widget) {
  return {
    id: w.id,
    name: w.name,
    sitekey: w.sitekey,
    scope: w.scope,
    scopes: splitList(w.scopes),
    domains: splitList(w.domains),
    theme: w.theme,
    size: w.size,
    label: w.label,
    link: w.link,
    difficulty: w.difficulty,
    timeoutSec: w.timeoutSec,
    autoRetry: w.autoRetry,
    trigger: w.trigger,
    status: w.status,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  }
}

function originOf(c: Context): string {
  const direct = normalizeOrigin(c.get('origin') || c.req.header('origin') || '')
  if (direct) return direct
  // A same-origin fetch (the console's own preview) may omit Origin entirely.
  // Reconstruct it from Host; cross-origin browser requests always carry
  // Origin, so this fallback never weakens the per-widget domain binding.
  const host = c.req.header('host') || ''
  if (!host) return ''
  const local = /^(localhost|127\.0\.0\.1)(\D|$)/.test(host)
  const proto = c.req.header('x-forwarded-proto') || (local ? 'http' : 'https')
  return normalizeOrigin(`${proto}://${host}`)
}

/** Effective public endpoint shown in copy-paste snippets. */
function endpointOf(c: Context): string {
  const cfg = readRuntime()
  if (cfg.publicOrigin) return cfg.publicOrigin
  const host = c.req.header('host') || 'guard.nsbbs.eu.cc'
  const proto = c.req.header('x-forwarded-proto') || 'https'
  return `${proto}://${host}`
}

function embedCode(origin: string, w: Widget) {
  return [
    `<script src="${origin}/widget.js" defer></script>`,
    `<nscha-widget sitekey="${w.sitekey}" action="${w.scope}" name="nschaToken"></nscha-widget>`,
    '<!-- 验证通过后自动写入表单字段 nschaToken -->',
  ].join('\n')
}

function verifySnippet(origin: string, w: Widget) {
  return [
    `const res = await fetch('${origin}/api/verify', {`,
    "  method: 'POST',",
    "  headers: { 'Content-Type': 'application/json' },",
    '  body: JSON.stringify({',
    '    token: req.body.nschaToken,',
    `    scope: '${w.scope}',`,
    '    secret: process.env.NSCHA_SECRET,',
    '  }),',
    '})',
    '',
    "if (!res.ok) return res.status(403).send('人机验证未通过，请重试')",
  ].join('\n')
}

type WidgetRequest =
  | { ok: true; widget: Widget; scope: string; preview: boolean }
  | { ok: false; error: string; status: number }

/** Bind every public PoW request to one widget, one scope, one origin. */
async function widgetFromRequest(c: Context): Promise<WidgetRequest> {
  const sitekey = (c.req.header('x-nscha-sitekey') || '').trim()
  const scope = (c.req.header('x-captcha-scope') || 'login').trim().toLowerCase()
  const preview = c.req.header('x-nscha-preview') === '1'
  const widget = sitekey
    ? await prisma.widget.findUnique({ where: { sitekey } })
    : null
  if (!widget) return { ok: false, error: '未登记的小组件', status: 400 }

  const origin = originOf(c)
  if (!origin) return { ok: false, error: '缺少来源域名', status: 403 }

  const cfg = readRuntime()
  if (preview) {
    if (!cfg.consoleOrigins.includes(origin)) {
      return { ok: false, error: '预览来源未被允许', status: 403 }
    }
  } else if (!splitList(widget.domains).includes(origin)) {
    return { ok: false, error: '该域名未绑定此小组件', status: 403 }
  }

  if (!splitList(widget.scopes).includes(scope)) {
    return { ok: false, error: '该用途未登记', status: 400 }
  }
  return { ok: true, widget, scope, preview }
}

async function requireUser(c: Context): Promise<User | null> {
  return await currentUser(c)
}

// ─── meta / health ──────────────────────────────────────────────────────────

api.get('/health', (c) =>
  reply(c, { ok: true, configured: isConfigured(readRuntime()), service: 'nscha-console' })
)

api.get('/meta', (c) => {
  const cfg = readRuntime()
  return reply(c, {
    endpoint: endpointOf(c),
    docsUrl: cfg.docsUrl,
    configured: isConfigured(cfg),
  })
})

// ─── accounts ───────────────────────────────────────────────────────────────

api.post('/auth/register', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string }
  const result = await registerUser(String(body.email || ''), String(body.password || ''))
  if ('error' in result) return reply(c, { error: result.error }, 400)
  await logEvent(result.user.id, null, 'account_created', '控制台账号已创建')
  return reply(c, { token: result.token, user: publicUser(result.user) }, 201)
})

api.post('/auth/login', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string }
  const result = await loginUser(String(body.email || ''), String(body.password || ''))
  if ('error' in result) return reply(c, { error: result.error }, 401)
  return reply(c, { token: result.token, user: publicUser(result.user) })
})

api.get('/auth/me', async (c) => {
  const user = await requireUser(c)
  if (!user) return reply(c, { error: '请先登录' }, 401)
  return reply(c, { user: publicUser(user) })
})

// ─── console: widgets ───────────────────────────────────────────────────────

api.get('/widgets', async (c) => {
  const user = await requireUser(c)
  if (!user) return reply(c, { error: '请先登录' }, 401)

  const widgets = await prisma.widget.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  const ids = widgets.map((w) => w.id)
  const usage = ids.length
    ? await prisma.usageDaily.findMany({ where: { widgetId: { in: ids } } })
    : []
  const today = todayUtc()
  const month = today.slice(0, 7)

  const byWidget = new Map<string, Record<string, number>>()
  let todayVerified = 0,
    todayRejected = 0,
    monthRequests = 0
  for (const u of usage) {
    const acc = byWidget.get(u.widgetId) || {
      challenges: 0,
      solved: 0,
      verified: 0,
      rejected: 0,
      today: 0,
    }
    acc.challenges += u.challenges
    acc.solved += u.solved
    acc.verified += u.verified
    acc.rejected += u.rejected
    if (u.date.startsWith(month)) monthRequests += u.challenges
    if (u.date === today) {
      acc.today = u.verified
      todayVerified += u.verified
      todayRejected += u.rejected
    }
    byWidget.set(u.widgetId, acc)
  }

  const events = await prisma.event.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const denominator = todayVerified + todayRejected
  return reply(c, {
    user: publicUser(user),
    items: widgets.map((w) => ({
      ...publicWidget(w),
      today: byWidget.get(w.id)?.today ?? 0,
      total: byWidget.get(w.id)?.verified ?? 0,
    })),
    kpi: {
      todayVerified,
      passRate: denominator ? Math.round((todayVerified / denominator) * 1000) / 10 : 100,
      active: widgets.filter((w) => w.status === 'active').length,
      monthRequests,
    },
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      detail: e.detail,
      createdAt: e.createdAt,
    })),
  })
})

api.post('/widgets', async (c) => {
  const user = await requireUser(c)
  if (!user) return reply(c, { error: '请先登录' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name || '').trim().slice(0, 60)
  const domain = normalizeOrigin(String(body.domain || ''))
  const scope = String(body.scope || 'login').trim().toLowerCase()
  const trigger = ['auto', 'click'].includes(String(body.trigger)) ? String(body.trigger) : 'auto'

  if (!name) return reply(c, { error: '请填写小组件名称' }, 400)
  if (!domain) return reply(c, { error: '请填写有效的网站域名' }, 400)
  if (!/^[a-z0-9_-]{2,32}$/.test(scope)) return reply(c, { error: '用途只能含小写字母、数字、_ 或 -' }, 400)

  const cfg = readRuntime()
  const sitekey = `ns_site_${randomHex(8)}`
  const secret = `ns_sec_${randomHex(24)}`
  const widget = await prisma.widget.create({
    data: {
      userId: user.id,
      name,
      sitekey,
      secretHash: sha256Hex(secret),
      secretEnc: encryptSecret(secret, cfg.encKey),
      scope,
      scopes: scope,
      domains: domain,
      trigger,
      link: cfg.docsUrl,
    },
  })
  await logEvent(user.id, widget.id, 'widget_created', `创建小组件「${name}」，绑定 ${domain}`)
  return reply(c, { widget: publicWidget(widget), secret }, 201)
})

api.get('/widgets/:id', async (c) => {
  const user = await requireUser(c)
  if (!user) return reply(c, { error: '请先登录' }, 401)
  const widget = await prisma.widget.findFirst({
    where: { id: c.req.param('id'), userId: user.id },
  })
  if (!widget) return reply(c, { error: '小组件不存在' }, 404)
  return reply(c, { widget: publicWidget(widget) })
})

const EDITABLE = [
  'name', 'theme', 'size', 'label', 'link', 'difficulty',
  'timeoutSec', 'autoRetry', 'trigger', 'scope', 'scopes', 'domains',
] as const

api.patch('/widgets/:id', async (c) => {
  const user = await requireUser(c)
  if (!user) return reply(c, { error: '请先登录' }, 401)
  const widget = await prisma.widget.findFirst({
    where: { id: c.req.param('id'), userId: user.id },
  })
  if (!widget) return reply(c, { error: '小组件不存在' }, 404)

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  for (const key of EDITABLE) {
    if (!(key in body)) continue
    const value = body[key]
    if (key === 'domains') {
      const list = Array.isArray(value)
        ? (value as unknown[]).map((v) => normalizeOrigin(String(v))).filter(Boolean)
        : splitList(String(value)).map(normalizeOrigin).filter(Boolean)
      if (!list.length) return reply(c, { error: '至少绑定一个域名' }, 400)
      data.domains = [...new Set(list)].join(',')
    } else if (key === 'scopes') {
      const list = Array.isArray(value)
        ? (value as unknown[]).map((v) => String(v).trim().toLowerCase())
        : splitList(String(value))
      const clean = [...new Set(list.filter((s) => /^[a-z0-9_-]{2,32}$/.test(s)))]
      if (!clean.length) return reply(c, { error: '至少登记一个用途' }, 400)
      data.scopes = clean.join(',')
      if (!clean.includes(String(body.scope || widget.scope))) data.scope = clean[0]
    } else if (key === 'timeoutSec') {
      const n = Math.min(120, Math.max(10, Number(value) || 30))
      data.timeoutSec = n
    } else if (key === 'autoRetry') {
      data.autoRetry = Boolean(value)
    } else {
      data[key] = String(value).trim().slice(0, 120)
    }
  }
  if (!Object.keys(data).length) return reply(c, { error: '没有可更新的设置' }, 400)

  const updated = await prisma.widget.update({ where: { id: widget.id }, data })
  await logEvent(user.id, widget.id, 'settings_updated', `更新设置：${Object.keys(data).join(', ')}`)
  return reply(c, { widget: publicWidget(updated) })
})

api.post('/widgets/:id/rotate-secret', async (c) => {
  const user = await requireUser(c)
  if (!user) return reply(c, { error: '请先登录' }, 401)
  const widget = await prisma.widget.findFirst({
    where: { id: c.req.param('id'), userId: user.id },
  })
  if (!widget) return reply(c, { error: '小组件不存在' }, 404)
  const cfg = readRuntime()
  const secret = `ns_sec_${randomHex(24)}`
  await prisma.widget.update({
    where: { id: widget.id },
    data: { secretHash: sha256Hex(secret), secretEnc: encryptSecret(secret, cfg.encKey) },
  })
  await logEvent(user.id, widget.id, 'secret_rotated', 'secret 已轮换，旧密钥立即失效')
  return reply(c, { secret })
})

api.get('/widgets/:id/install', async (c) => {
  const user = await requireUser(c)
  if (!user) return reply(c, { error: '请先登录' }, 401)
  const widget = await prisma.widget.findFirst({
    where: { id: c.req.param('id'), userId: user.id },
  })
  if (!widget) return reply(c, { error: '小组件不存在' }, 404)
  const cfg = readRuntime()
  const origin = endpointOf(c)
  return reply(c, {
    widget: publicWidget(widget),
    origin,
    docsUrl: cfg.docsUrl,
    sitekey: widget.sitekey,
    secret: decryptSecret(widget.secretEnc, cfg.encKey),
    scope: widget.scope,
    embedCode: embedCode(origin, widget),
    verifySnippet: verifySnippet(origin, widget),
  })
})

// ─── public widget config (no secrets) ─────────────────────────────────────

api.get('/config', async (c) => {
  const sitekey = String(c.req.query('sitekey') || '')
  const widget = sitekey
    ? await prisma.widget.findUnique({ where: { sitekey } })
    : null
  if (!widget) return reply(c, { error: '未登记的小组件' }, 404)
  const cfg = readRuntime()
  return reply(c, {
    sitekey: widget.sitekey,
    theme: widget.theme,
    size: widget.size,
    label: widget.label,
    link: widget.link || cfg.docsUrl,
    trigger: widget.trigger,
    difficulty: widget.difficulty,
    timeoutSec: widget.timeoutSec,
    autoRetry: widget.autoRetry,
    scopes: splitList(widget.scopes),
    docsUrl: cfg.docsUrl,
  })
})

// ─── central PoW ────────────────────────────────────────────────────────────

api.post('/challenge', async (c) => {
  const cfg = readRuntime()
  if (!isConfigured(cfg)) return reply(c, { error: '验证服务未配置' }, 503)
  const ctx = await widgetFromRequest(c)
  if (!ctx.ok) return reply(c, { error: ctx.error }, ctx.status)
  try {
    const binding = bindingFor(ctx.widget.id, ctx.scope, ctx.preview)
    const challenge = await createChallenge(cfg, binding, ctx.widget.difficulty)
    if (!ctx.preview) await bump(ctx.widget.id, 'challenges')
    return reply(c, challenge)
  } catch {
    return reply(c, { error: '挑战签发失败' }, 500)
  }
})

api.post('/redeem', async (c) => {
  const cfg = readRuntime()
  if (!isConfigured(cfg)) return reply(c, { success: false, error: '验证服务未配置' }, 503)
  const ctx = await widgetFromRequest(c)
  if (!ctx.ok) return reply(c, { success: false, error: ctx.error }, ctx.status)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  const binding = bindingFor(ctx.widget.id, ctx.scope, ctx.preview)
  const result = await redeemChallenge(cfg, body as never, binding, {
    widgetId: ctx.widget.id,
    sitekey: ctx.widget.sitekey,
    scope: ctx.scope,
    preview: ctx.preview,
  })
  if (!result.ok) {
    console.warn(`[nscha] redeem rejected reason=${result.reason} widget=${ctx.widget.id}`)
    if (!ctx.preview) await bump(ctx.widget.id, 'rejected')
    return reply(c, { success: false, error: '验证未通过' }, 400)
  }
  if (!ctx.preview) await bump(ctx.widget.id, 'solved')
  return reply(c, { success: true, token: result.token, expires: result.expires })
})

/** The one call the site owner's backend makes before doing any real work. */
api.post('/verify', async (c) => {
  const cfg = readRuntime()
  if (!isConfigured(cfg)) return reply(c, { ok: false }, 503)
  const body = (await c.req.json().catch(() => ({}))) as {
    token?: string
    scope?: string
    secret?: string
  }
  const secret = String(body.secret || '')
  const widget = secret
    ? await prisma.widget.findUnique({ where: { secretHash: sha256Hex(secret) } })
    : null
  if (!widget) return reply(c, { ok: false }, 403)

  const verdict = await inspectVerificationToken(cfg, String(body.token || ''))
  const reject = async (reason: string) => {
    console.warn(`[nscha] verify rejected reason=${reason} widget=${widget.id}`)
    await bump(widget.id, 'rejected')
    return reply(c, { ok: false }, 403)
  }
  if (!verdict.ok) return reject(verdict.reason)
  const p = verdict.payload
  if (p.wid !== widget.id || p.sk !== widget.sitekey) return reject('widget_mismatch')
  if (String(body.scope || '') !== p.scope) return reject('scope_mismatch')
  if (!splitList(widget.scopes).includes(p.scope)) return reject('scope_unregistered')

  try {
    await prisma.usedToken.create({
      data: { jti: p.jti, widgetId: widget.id, expiresAt: new Date(p.exp * 1000) },
    })
  } catch {
    return reject('replay')
  }
  // Opportunistic purge — these rows are digests, never visitor records.
  await prisma.usedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } })

  await bump(widget.id, 'verified')
  if (widget.status === 'draft') {
    await prisma.widget.update({ where: { id: widget.id }, data: { status: 'active' } })
    await logEvent(widget.userId, widget.id, 'first_verification', '收到第一次真实验证，状态变为已接入')
  }
  return reply(c, { ok: true })
})

app.route('/', api)
app.route('/api', api)

export default app
