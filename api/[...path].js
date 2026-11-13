// server/vercel-entry.ts
import { handle } from "@hono/node-server/vercel";

// server/app.ts
import { Hono } from "hono";

// server/db.ts
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
var globalForPrisma = globalThis;
function createPrisma() {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("postgres")) {
    const pool = new pg.Pool({ connectionString: url });
    return new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  return new PrismaClient();
}
var prisma = globalForPrisma.nschaPrisma ?? createPrisma();
globalForPrisma.nschaPrisma = prisma;

// server/auth.ts
import { compare, hash } from "bcryptjs";
import { sign, verify } from "hono/jwt";

// server/env.ts
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
function intEnv(name, fallback, min, max) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
function listEnv(name, fallback) {
  return (process.env[name] || fallback).split(",").map((v) => v.trim().replace(/\/+$/, "").toLowerCase()).filter(Boolean);
}
function readRuntime() {
  const capSecret = (process.env.CAP_SECRET || "").trim();
  return {
    jwtSecret: (process.env.CONSOLE_JWT_SECRET || "").trim(),
    encKey: (process.env.CONSOLE_ENC_KEY || "").trim(),
    capSecret,
    capTokenSecret: (process.env.CAP_TOKEN_SECRET || "").trim() || capSecret,
    publicOrigin: (process.env.NSCHA_PUBLIC_ORIGIN || "").trim().replace(/\/+$/, ""),
    consoleOrigins: listEnv("CONSOLE_ORIGIN", "http://localhost:5173"),
    docsUrl: process.env.NSCHA_DOCS_URL || "https://nscha.nsbbs.eu.cc",
    count: intEnv("CAP_CHALLENGE_COUNT", 20, 4, 200),
    size: intEnv("CAP_CHALLENGE_SIZE", 32, 16, 64),
    difficulty: intEnv("CAP_CHALLENGE_DIFFICULTY", 3, 1, 6),
    expiresSeconds: intEnv("CAP_EXPIRES_SECONDS", 600, 60, 3600),
    tokenTtlSeconds: intEnv("CAP_TOKEN_TTL_SECONDS", 300, 60, 3600)
  };
}
function isConfigured(cfg) {
  return Boolean(cfg.jwtSecret && cfg.encKey && cfg.capSecret);
}
function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}
function encryptSecret(plain, keyHex) {
  const key = Buffer.from(keyHex.padEnd(64, "0").slice(0, 64), "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), body.toString("base64url")].join(".");
}
function decryptSecret(payload, keyHex) {
  try {
    const [iv, tag, body] = payload.split(".");
    const key = Buffer.from(keyHex.padEnd(64, "0").slice(0, 64), "hex");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
function normalizeOrigin(raw) {
  const value = (raw || "").trim().toLowerCase().replace(/\/+$/, "");
  if (!value) return "";
  const withProtocol = /^https?:\/\//.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}
function splitList(value) {
  return value.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}
function todayUtc() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}

// server/auth.ts
var SESSION_SECONDS = 7 * 24 * 60 * 60;
function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}
async function registerUser(emailRaw, password) {
  const email = emailRaw.trim().toLowerCase();
  if (!isEmail(email)) return { error: "\u8BF7\u8F93\u5165\u6709\u6548\u7684\u90AE\u7BB1\u5730\u5740" };
  if (!password || password.length < 8 || password.length > 128) {
    return { error: "\u5BC6\u7801\u957F\u5EA6\u9700\u5728 8\u2013128 \u4F4D\u4E4B\u95F4" };
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "\u8BE5\u90AE\u7BB1\u5DF2\u6CE8\u518C" };
  const user = await prisma.user.create({
    data: { email, passwordHash: await hash(password, 10) }
  });
  return { user, token: await issueToken(user) };
}
async function loginUser(emailRaw, password) {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !await compare(password, user.passwordHash)) {
    return { error: "\u90AE\u7BB1\u6216\u5BC6\u7801\u4E0D\u6B63\u786E" };
  }
  return { user, token: await issueToken(user) };
}
async function issueToken(user) {
  return sign(
    {
      ns: "console-session",
      uid: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1e3) + SESSION_SECONDS
    },
    readRuntime().jwtSecret,
    "HS256"
  );
}
async function currentUser(c) {
  const header = c.req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const payload = await verify(token, readRuntime().jwtSecret, "HS256");
    if (payload.ns !== "console-session" || typeof payload.uid !== "string") return null;
    const exp = Number(payload.exp || 0);
    if (!exp || exp * 1e3 < Date.now()) return null;
    return await prisma.user.findUnique({ where: { id: payload.uid } });
  } catch {
    return null;
  }
}
function publicUser(user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

// server/protocol.ts
import { generateChallenge, validateChallenge } from "capjs-core";
import { sign as sign2, verify as verify2 } from "hono/jwt";
var DIFFICULTIES = {
  low: { count: 12, difficulty: 2 },
  medium: { count: 20, difficulty: 3 },
  high: { count: 32, difficulty: 4 }
};
function difficultyFor(level, cfg) {
  return DIFFICULTIES[level] || { count: cfg.count, difficulty: cfg.difficulty };
}
function bindingFor(widgetId, scope, preview) {
  return `${widgetId}|${scope}|${preview ? "preview" : "live"}`;
}
async function createChallenge(cfg, binding, level) {
  const d = difficultyFor(level, cfg);
  return await generateChallenge(cfg.capSecret, {
    challengeCount: d.count,
    challengeSize: cfg.size,
    challengeDifficulty: d.difficulty,
    expiresMs: cfg.expiresSeconds * 1e3,
    scope: binding
  });
}
var usedNonces = /* @__PURE__ */ new Map();
function consumeNonce(key, ttlMs) {
  const now = Date.now();
  if (usedNonces.size > 5e3) {
    for (const [k, until] of usedNonces) if (until < now) usedNonces.delete(k);
  }
  if (usedNonces.has(key)) return false;
  usedNonces.set(key, now + ttlMs);
  return true;
}
async function redeemChallenge(cfg, body, binding, claims) {
  const jti = randomHex(12);
  const result = await validateChallenge(
    cfg.capSecret,
    {
      token: String(body?.token || ""),
      solutions: body?.solutions,
      instr: body?.instr,
      instr_blocked: body?.instr_blocked,
      instr_timeout: body?.instr_timeout
    },
    {
      scope: binding,
      tokenTtlMs: cfg.tokenTtlSeconds * 1e3,
      consumeNonce: (sigHex) => consumeNonce(`${binding}:${sigHex}`, cfg.expiresSeconds * 1e3),
      signToken: async ({ expires }) => sign2(
        {
          nscha: true,
          wid: claims.widgetId,
          sk: claims.sitekey,
          scope: claims.scope,
          jti,
          preview: claims.preview,
          exp: Math.floor(expires / 1e3)
        },
        cfg.capTokenSecret,
        "HS256"
      )
    }
  );
  if (!result.success) return { ok: false, reason: String(result.reason || "invalid") };
  return { ok: true, token: result.token, expires: result.expires };
}
async function inspectVerificationToken(cfg, raw) {
  const token = (raw || "").trim();
  if (!token) return { ok: false, reason: "missing_token" };
  let p;
  try {
    p = await verify2(token, cfg.capTokenSecret, "HS256");
  } catch {
    return { ok: false, reason: "invalid_token" };
  }
  if (p.nscha !== true) return { ok: false, reason: "wrong_token_kind" };
  const exp = Number(p.exp || 0);
  if (!exp || exp * 1e3 < Date.now()) return { ok: false, reason: "expired" };
  if (typeof p.wid !== "string" || typeof p.sk !== "string" || typeof p.jti !== "string") {
    return { ok: false, reason: "malformed_token" };
  }
  if (p.preview === true) return { ok: false, reason: "preview_token" };
  return {
    ok: true,
    payload: {
      wid: p.wid,
      sk: p.sk,
      scope: String(p.scope || ""),
      jti: p.jti,
      preview: false,
      exp
    }
  };
}

// server/app.ts
var api = new Hono();
var app = new Hono();
var ALLOW_HEADERS = "Content-Type, Authorization, x-nscha-sitekey, x-captcha-scope, x-nscha-preview";
function corsHeaders(c) {
  const origin = c.get("origin") || c.req.header("origin") || "";
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "Cache-Control": "no-store"
  };
}
function reply(c, data, status = 200) {
  return c.json(data, status, corsHeaders(c));
}
api.use("*", async (c, next) => {
  c.set("origin", c.req.header("origin") || "");
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204, corsHeaders(c));
  }
  await next();
  for (const [key, value] of Object.entries(corsHeaders(c))) c.res.headers.set(key, value);
});
async function bump(widgetId, field, n = 1) {
  const date = todayUtc();
  await prisma.usageDaily.upsert({
    where: { widgetId_date: { widgetId, date } },
    create: { widgetId, date, [field]: n },
    update: { [field]: { increment: n } }
  });
}
async function logEvent(userId, widgetId, type, detail) {
  await prisma.event.create({ data: { userId, widgetId, type, detail } });
}
function publicWidget(w) {
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
    updatedAt: w.updatedAt
  };
}
function originOf(c) {
  const direct = normalizeOrigin(c.get("origin") || c.req.header("origin") || "");
  if (direct) return direct;
  const host = c.req.header("host") || "";
  if (!host) return "";
  const local = /^(localhost|127\.0\.0\.1)(\D|$)/.test(host);
  const proto = c.req.header("x-forwarded-proto") || (local ? "http" : "https");
  return normalizeOrigin(`${proto}://${host}`);
}
function endpointOf(c) {
  const cfg = readRuntime();
  if (cfg.publicOrigin) return cfg.publicOrigin;
  const host = c.req.header("host") || "guard.nsbbs.eu.cc";
  const proto = c.req.header("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}
function embedCode(origin, w) {
  return [
    `<script src="${origin}/widget.js" defer></script>`,
    `<nscha-widget sitekey="${w.sitekey}" action="${w.scope}" name="nschaToken"></nscha-widget>`,
    "<!-- \u9A8C\u8BC1\u901A\u8FC7\u540E\u81EA\u52A8\u5199\u5165\u8868\u5355\u5B57\u6BB5 nschaToken -->"
  ].join("\n");
}
function verifySnippet(origin, w) {
  return [
    `const res = await fetch('${origin}/api/verify', {`,
    "  method: 'POST',",
    "  headers: { 'Content-Type': 'application/json' },",
    "  body: JSON.stringify({",
    "    token: req.body.nschaToken,",
    `    scope: '${w.scope}',`,
    "    secret: process.env.NSCHA_SECRET,",
    "  }),",
    "})",
    "",
    "if (!res.ok) return res.status(403).send('\u4EBA\u673A\u9A8C\u8BC1\u672A\u901A\u8FC7\uFF0C\u8BF7\u91CD\u8BD5')"
  ].join("\n");
}
async function widgetFromRequest(c) {
  const sitekey = (c.req.header("x-nscha-sitekey") || "").trim();
  const scope = (c.req.header("x-captcha-scope") || "login").trim().toLowerCase();
  const preview = c.req.header("x-nscha-preview") === "1";
  const widget = sitekey ? await prisma.widget.findUnique({ where: { sitekey } }) : null;
  if (!widget) return { ok: false, error: "\u672A\u767B\u8BB0\u7684\u5C0F\u7EC4\u4EF6", status: 400 };
  const origin = originOf(c);
  if (!origin) return { ok: false, error: "\u7F3A\u5C11\u6765\u6E90\u57DF\u540D", status: 403 };
  const cfg = readRuntime();
  if (preview) {
    if (!cfg.consoleOrigins.includes(origin)) {
      return { ok: false, error: "\u9884\u89C8\u6765\u6E90\u672A\u88AB\u5141\u8BB8", status: 403 };
    }
  } else if (!splitList(widget.domains).includes(origin)) {
    return { ok: false, error: "\u8BE5\u57DF\u540D\u672A\u7ED1\u5B9A\u6B64\u5C0F\u7EC4\u4EF6", status: 403 };
  }
  if (!splitList(widget.scopes).includes(scope)) {
    return { ok: false, error: "\u8BE5\u7528\u9014\u672A\u767B\u8BB0", status: 400 };
  }
  return { ok: true, widget, scope, preview };
}
async function requireUser(c) {
  return await currentUser(c);
}
api.get(
  "/health",
  (c) => reply(c, { ok: true, configured: isConfigured(readRuntime()), service: "nscha-console" })
);
api.get("/meta", (c) => {
  const cfg = readRuntime();
  return reply(c, {
    endpoint: endpointOf(c),
    docsUrl: cfg.docsUrl,
    configured: isConfigured(cfg)
  });
});
api.post("/auth/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await registerUser(String(body.email || ""), String(body.password || ""));
  if ("error" in result) return reply(c, { error: result.error }, 400);
  await logEvent(result.user.id, null, "account_created", "\u63A7\u5236\u53F0\u8D26\u53F7\u5DF2\u521B\u5EFA");
  return reply(c, { token: result.token, user: publicUser(result.user) }, 201);
});
api.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const result = await loginUser(String(body.email || ""), String(body.password || ""));
  if ("error" in result) return reply(c, { error: result.error }, 401);
  return reply(c, { token: result.token, user: publicUser(result.user) });
});
api.get("/auth/me", async (c) => {
  const user = await requireUser(c);
  if (!user) return reply(c, { error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  return reply(c, { user: publicUser(user) });
});
api.get("/widgets", async (c) => {
  const user = await requireUser(c);
  if (!user) return reply(c, { error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  const widgets = await prisma.widget.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" }
  });
  const ids = widgets.map((w) => w.id);
  const usage = ids.length ? await prisma.usageDaily.findMany({ where: { widgetId: { in: ids } } }) : [];
  const today = todayUtc();
  const month = today.slice(0, 7);
  const byWidget = /* @__PURE__ */ new Map();
  let todayVerified = 0, todayRejected = 0, monthRequests = 0;
  for (const u of usage) {
    const acc = byWidget.get(u.widgetId) || {
      challenges: 0,
      solved: 0,
      verified: 0,
      rejected: 0,
      today: 0
    };
    acc.challenges += u.challenges;
    acc.solved += u.solved;
    acc.verified += u.verified;
    acc.rejected += u.rejected;
    if (u.date.startsWith(month)) monthRequests += u.challenges;
    if (u.date === today) {
      acc.today = u.verified;
      todayVerified += u.verified;
      todayRejected += u.rejected;
    }
    byWidget.set(u.widgetId, acc);
  }
  const events = await prisma.event.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5
  });
  const denominator = todayVerified + todayRejected;
  return reply(c, {
    user: publicUser(user),
    items: widgets.map((w) => ({
      ...publicWidget(w),
      today: byWidget.get(w.id)?.today ?? 0,
      total: byWidget.get(w.id)?.verified ?? 0
    })),
    kpi: {
      todayVerified,
      passRate: denominator ? Math.round(todayVerified / denominator * 1e3) / 10 : 100,
      active: widgets.filter((w) => w.status === "active").length,
      monthRequests
    },
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      detail: e.detail,
      createdAt: e.createdAt
    }))
  });
});
api.post("/widgets", async (c) => {
  const user = await requireUser(c);
  if (!user) return reply(c, { error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  const body = await c.req.json().catch(() => ({}));
  const name = String(body.name || "").trim().slice(0, 60);
  const domain = normalizeOrigin(String(body.domain || ""));
  const scope = String(body.scope || "login").trim().toLowerCase();
  const trigger = ["auto", "click"].includes(String(body.trigger)) ? String(body.trigger) : "auto";
  if (!name) return reply(c, { error: "\u8BF7\u586B\u5199\u5C0F\u7EC4\u4EF6\u540D\u79F0" }, 400);
  if (!domain) return reply(c, { error: "\u8BF7\u586B\u5199\u6709\u6548\u7684\u7F51\u7AD9\u57DF\u540D" }, 400);
  if (!/^[a-z0-9_-]{2,32}$/.test(scope)) return reply(c, { error: "\u7528\u9014\u53EA\u80FD\u542B\u5C0F\u5199\u5B57\u6BCD\u3001\u6570\u5B57\u3001_ \u6216 -" }, 400);
  const cfg = readRuntime();
  const sitekey = `ns_site_${randomHex(8)}`;
  const secret = `ns_sec_${randomHex(24)}`;
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
      link: cfg.docsUrl
    }
  });
  await logEvent(user.id, widget.id, "widget_created", `\u521B\u5EFA\u5C0F\u7EC4\u4EF6\u300C${name}\u300D\uFF0C\u7ED1\u5B9A ${domain}`);
  return reply(c, { widget: publicWidget(widget), secret }, 201);
});
api.get("/widgets/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return reply(c, { error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  const widget = await prisma.widget.findFirst({
    where: { id: c.req.param("id"), userId: user.id }
  });
  if (!widget) return reply(c, { error: "\u5C0F\u7EC4\u4EF6\u4E0D\u5B58\u5728" }, 404);
  return reply(c, { widget: publicWidget(widget) });
});
var EDITABLE = [
  "name",
  "theme",
  "size",
  "label",
  "link",
  "difficulty",
  "timeoutSec",
  "autoRetry",
  "trigger",
  "scope",
  "scopes",
  "domains"
];
api.patch("/widgets/:id", async (c) => {
  const user = await requireUser(c);
  if (!user) return reply(c, { error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  const widget = await prisma.widget.findFirst({
    where: { id: c.req.param("id"), userId: user.id }
  });
  if (!widget) return reply(c, { error: "\u5C0F\u7EC4\u4EF6\u4E0D\u5B58\u5728" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const data = {};
  for (const key of EDITABLE) {
    if (!(key in body)) continue;
    const value = body[key];
    if (key === "domains") {
      const list = Array.isArray(value) ? value.map((v) => normalizeOrigin(String(v))).filter(Boolean) : splitList(String(value)).map(normalizeOrigin).filter(Boolean);
      if (!list.length) return reply(c, { error: "\u81F3\u5C11\u7ED1\u5B9A\u4E00\u4E2A\u57DF\u540D" }, 400);
      data.domains = [...new Set(list)].join(",");
    } else if (key === "scopes") {
      const list = Array.isArray(value) ? value.map((v) => String(v).trim().toLowerCase()) : splitList(String(value));
      const clean = [...new Set(list.filter((s) => /^[a-z0-9_-]{2,32}$/.test(s)))];
      if (!clean.length) return reply(c, { error: "\u81F3\u5C11\u767B\u8BB0\u4E00\u4E2A\u7528\u9014" }, 400);
      data.scopes = clean.join(",");
      if (!clean.includes(String(body.scope || widget.scope))) data.scope = clean[0];
    } else if (key === "timeoutSec") {
      const n = Math.min(120, Math.max(10, Number(value) || 30));
      data.timeoutSec = n;
    } else if (key === "autoRetry") {
      data.autoRetry = Boolean(value);
    } else {
      data[key] = String(value).trim().slice(0, 120);
    }
  }
  if (!Object.keys(data).length) return reply(c, { error: "\u6CA1\u6709\u53EF\u66F4\u65B0\u7684\u8BBE\u7F6E" }, 400);
  const updated = await prisma.widget.update({ where: { id: widget.id }, data });
  await logEvent(user.id, widget.id, "settings_updated", `\u66F4\u65B0\u8BBE\u7F6E\uFF1A${Object.keys(data).join(", ")}`);
  return reply(c, { widget: publicWidget(updated) });
});
api.post("/widgets/:id/rotate-secret", async (c) => {
  const user = await requireUser(c);
  if (!user) return reply(c, { error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  const widget = await prisma.widget.findFirst({
    where: { id: c.req.param("id"), userId: user.id }
  });
  if (!widget) return reply(c, { error: "\u5C0F\u7EC4\u4EF6\u4E0D\u5B58\u5728" }, 404);
  const cfg = readRuntime();
  const secret = `ns_sec_${randomHex(24)}`;
  await prisma.widget.update({
    where: { id: widget.id },
    data: { secretHash: sha256Hex(secret), secretEnc: encryptSecret(secret, cfg.encKey) }
  });
  await logEvent(user.id, widget.id, "secret_rotated", "secret \u5DF2\u8F6E\u6362\uFF0C\u65E7\u5BC6\u94A5\u7ACB\u5373\u5931\u6548");
  return reply(c, { secret });
});
api.get("/widgets/:id/install", async (c) => {
  const user = await requireUser(c);
  if (!user) return reply(c, { error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  const widget = await prisma.widget.findFirst({
    where: { id: c.req.param("id"), userId: user.id }
  });
  if (!widget) return reply(c, { error: "\u5C0F\u7EC4\u4EF6\u4E0D\u5B58\u5728" }, 404);
  const cfg = readRuntime();
  const origin = endpointOf(c);
  return reply(c, {
    widget: publicWidget(widget),
    origin,
    docsUrl: cfg.docsUrl,
    sitekey: widget.sitekey,
    secret: decryptSecret(widget.secretEnc, cfg.encKey),
    scope: widget.scope,
    embedCode: embedCode(origin, widget),
    verifySnippet: verifySnippet(origin, widget)
  });
});
api.get("/config", async (c) => {
  const sitekey = String(c.req.query("sitekey") || "");
  const widget = sitekey ? await prisma.widget.findUnique({ where: { sitekey } }) : null;
  if (!widget) return reply(c, { error: "\u672A\u767B\u8BB0\u7684\u5C0F\u7EC4\u4EF6" }, 404);
  const cfg = readRuntime();
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
    docsUrl: cfg.docsUrl
  });
});
api.post("/challenge", async (c) => {
  const cfg = readRuntime();
  if (!isConfigured(cfg)) return reply(c, { error: "\u9A8C\u8BC1\u670D\u52A1\u672A\u914D\u7F6E" }, 503);
  const ctx = await widgetFromRequest(c);
  if (!ctx.ok) return reply(c, { error: ctx.error }, ctx.status);
  try {
    const binding = bindingFor(ctx.widget.id, ctx.scope, ctx.preview);
    const challenge = await createChallenge(cfg, binding, ctx.widget.difficulty);
    if (!ctx.preview) await bump(ctx.widget.id, "challenges");
    return reply(c, challenge);
  } catch {
    return reply(c, { error: "\u6311\u6218\u7B7E\u53D1\u5931\u8D25" }, 500);
  }
});
api.post("/redeem", async (c) => {
  const cfg = readRuntime();
  if (!isConfigured(cfg)) return reply(c, { success: false, error: "\u9A8C\u8BC1\u670D\u52A1\u672A\u914D\u7F6E" }, 503);
  const ctx = await widgetFromRequest(c);
  if (!ctx.ok) return reply(c, { success: false, error: ctx.error }, ctx.status);
  const body = await c.req.json().catch(() => ({}));
  const binding = bindingFor(ctx.widget.id, ctx.scope, ctx.preview);
  const result = await redeemChallenge(cfg, body, binding, {
    widgetId: ctx.widget.id,
    sitekey: ctx.widget.sitekey,
    scope: ctx.scope,
    preview: ctx.preview
  });
  if (!result.ok) {
    console.warn(`[nscha] redeem rejected reason=${result.reason} widget=${ctx.widget.id}`);
    if (!ctx.preview) await bump(ctx.widget.id, "rejected");
    return reply(c, { success: false, error: "\u9A8C\u8BC1\u672A\u901A\u8FC7" }, 400);
  }
  if (!ctx.preview) await bump(ctx.widget.id, "solved");
  return reply(c, { success: true, token: result.token, expires: result.expires });
});
api.post("/verify", async (c) => {
  const cfg = readRuntime();
  if (!isConfigured(cfg)) return reply(c, { ok: false }, 503);
  const body = await c.req.json().catch(() => ({}));
  const secret = String(body.secret || "");
  const widget = secret ? await prisma.widget.findUnique({ where: { secretHash: sha256Hex(secret) } }) : null;
  if (!widget) return reply(c, { ok: false }, 403);
  const verdict = await inspectVerificationToken(cfg, String(body.token || ""));
  const reject = async (reason) => {
    console.warn(`[nscha] verify rejected reason=${reason} widget=${widget.id}`);
    await bump(widget.id, "rejected");
    return reply(c, { ok: false }, 403);
  };
  if (!verdict.ok) return reject(verdict.reason);
  const p = verdict.payload;
  if (p.wid !== widget.id || p.sk !== widget.sitekey) return reject("widget_mismatch");
  if (String(body.scope || "") !== p.scope) return reject("scope_mismatch");
  if (!splitList(widget.scopes).includes(p.scope)) return reject("scope_unregistered");
  try {
    await prisma.usedToken.create({
      data: { jti: p.jti, widgetId: widget.id, expiresAt: new Date(p.exp * 1e3) }
    });
  } catch {
    return reject("replay");
  }
  await prisma.usedToken.deleteMany({ where: { expiresAt: { lt: /* @__PURE__ */ new Date() } } });
  await bump(widget.id, "verified");
  if (widget.status === "draft") {
    await prisma.widget.update({ where: { id: widget.id }, data: { status: "active" } });
    await logEvent(widget.userId, widget.id, "first_verification", "\u6536\u5230\u7B2C\u4E00\u6B21\u771F\u5B9E\u9A8C\u8BC1\uFF0C\u72B6\u6001\u53D8\u4E3A\u5DF2\u63A5\u5165");
  }
  return reply(c, { ok: true });
});
app.route("/", api);
app.route("/api", api);
var app_default = app;

// server/vercel-entry.ts
var PATH_MARKER = "__nscha_path=";
var cachedHandler = null;
async function vercel_entry_default(req, res) {
  const raw = req.url || "";
  if (raw.indexOf(PATH_MARKER) !== -1) {
    try {
      const u = new URL(raw, "http://localhost");
      const restored = u.searchParams.get("__nscha_path");
      if (restored) {
        u.pathname = restored;
        u.searchParams.delete("__nscha_path");
        req.url = u.search ? `${u.pathname}${u.search}` : u.pathname;
      }
    } catch {
    }
  }
  try {
    if (!cachedHandler) cachedHandler = handle(app_default);
    return cachedHandler(req, res);
  } catch (err) {
    const message = err instanceof Error ? err.stack || err.message : String(err);
    if (res && typeof res.setHeader === "function") {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    if (res && typeof res.end === "function") res.end("NSCHA_BOOT_ERROR:\n" + message);
    return;
  }
}
export {
  vercel_entry_default as default
};
