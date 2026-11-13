import { compare, hash } from 'bcryptjs'
import { sign, verify } from 'hono/jwt'
import type { Context } from 'hono'
import type { User } from '../prisma/generated/client'
import { prisma } from './db'
import { readRuntime } from './env'

const SESSION_SECONDS = 7 * 24 * 60 * 60

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160
}

export async function registerUser(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase()
  if (!isEmail(email)) return { error: '请输入有效的邮箱地址' } as const
  if (!password || password.length < 8 || password.length > 128) {
    return { error: '密码长度需在 8–128 位之间' } as const
  }
  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return { error: '该邮箱已注册' } as const

  const user = await prisma.user.create({
    data: { email, passwordHash: await hash(password, 10) },
  })
  return { user, token: await issueToken(user) } as const
}

export async function loginUser(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase()
  const user = await prisma.user.findUnique({ where: { email } })
  // Same message for unknown email and wrong password: no account probing.
  if (!user || !(await compare(password, user.passwordHash))) {
    return { error: '邮箱或密码不正确' } as const
  }
  return { user, token: await issueToken(user) } as const
}

async function issueToken(user: User): Promise<string> {
  return sign(
    {
      ns: 'console-session',
      uid: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    },
    readRuntime().jwtSecret,
    'HS256'
  )
}

export async function currentUser(c: Context): Promise<User | null> {
  const header = c.req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  try {
    const payload = (await verify(token, readRuntime().jwtSecret, 'HS256')) as Record<string, unknown>
    if (payload.ns !== 'console-session' || typeof payload.uid !== 'string') return null
    const exp = Number(payload.exp || 0)
    if (!exp || exp * 1000 < Date.now()) return null
    return await prisma.user.findUnique({ where: { id: payload.uid } })
  } catch {
    return null
  }
}

export function publicUser(user: User) {
  return { id: user.id, email: user.email, createdAt: user.createdAt }
}
