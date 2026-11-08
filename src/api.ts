const TOKEN_KEY = 'nscha_console_token'

export function token(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(value: string) {
  if (value) localStorage.setItem(TOKEN_KEY, value)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = token()
  if (t) headers.Authorization = `Bearer ${t}`

  const res = await fetch(`/api${path}`, {
    method: init.method || 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

  let data: Record<string, unknown> = {}
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    throw new ApiError(res.status, String(data.error || `请求失败（${res.status}）`))
  }
  return data as T
}

export interface WidgetItem {
  id: string
  name: string
  sitekey: string
  scope: string
  scopes: string[]
  domains: string[]
  theme: string
  size: string
  label: string
  link: string
  difficulty: string
  timeoutSec: number
  autoRetry: boolean
  trigger: string
  status: string
  createdAt: string
  updatedAt: string
  today?: number
  total?: number
}

export interface WidgetsResponse {
  user: { id: string; email: string }
  items: WidgetItem[]
  kpi: { todayVerified: number; passRate: number; active: number; monthRequests: number }
  events: { id: string; type: string; detail: string; createdAt: string }[]
}

export interface InstallResponse {
  widget: WidgetItem
  origin: string
  docsUrl: string
  sitekey: string
  secret: string
  scope: string
  embedCode: string
  verifySnippet: string
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }
  const el = document.createElement('textarea')
  el.value = text
  el.style.position = 'fixed'
  el.style.opacity = '0'
  document.body.appendChild(el)
  el.select()
  try {
    document.execCommand('copy')
  } finally {
    el.remove()
  }
  return Promise.resolve()
}

export function fmtDate(value: string): string {
  const d = new Date(value)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
