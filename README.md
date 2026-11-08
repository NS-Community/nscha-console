# NSCHA Console

中央多租户的人机验证服务与站长控制台。第三方站长**不需要自己部署服务**：注册一个账号，添加站点、调小组件设置、复制一段代码贴进自己的网站，验证就在访客设备上跑起来了。

这是与 `NS-Community/nscha-widget`（自托管单租户版）、`NS-Community/nscha-docs`（文档站）**并列的第三个项目**。那两个仓库在本项目开发期间保持冻结，没有改动。

## 域名

| 域名 | 用途 |
| --- | --- |
| `https://guard.nsbbs.eu.cc` | 本项目：控制台 + 可嵌入脚本 + 中央验证接口，共用一个 origin |
| `https://nscha.nsbbs.eu.cc` | 文档站（独立静态项目，已冻结） |
| `https://nsbbs.eu.cc` | gamesense 论坛 |

`NSCHA_PUBLIC_ORIGIN` 决定复制给站长的嵌入代码里显示哪个域名。生产填 `https://guard.nsbbs.eu.cc`。

## 站长从 0 到上线

1. 在控制台用邮箱注册并登录（独立账号，与论坛账号分开）。
2. **添加小组件**：填名称、网站域名、用途 `scope`、触发方式。系统立即发一对 `sitekey` / `secret`。
3. **编辑设置**：主题、尺寸、盒上文案与链接、难度、超时与重试、允许的用途、绑定域名。右侧有实时预览。保存后**立即对所有访客生效，不需要重新复制嵌入代码**。
4. **安装**：复制前端嵌入代码和后端校验代码。
5. 访客提交表单时，站长后端拿 `nschaToken` 调中央 `/api/verify`。**这一步不能省**：前端成功事件可以伪造。

前端（贴进需要验证的表单）：

```html
<script src="https://guard.nsbbs.eu.cc/widget.js" defer></script>
<nscha-widget sitekey="ns_site_…" action="login" name="nschaToken"></nscha-widget>
```

后端（在处理任何业务之前）：

```js
const res = await fetch('https://guard.nsbbs.eu.cc/api/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: req.body.nschaToken,
    scope: 'login',
    secret: process.env.NSCHA_SECRET,
  }),
})

if (!res.ok) return res.status(403).send('人机验证未通过，请重试')
```

`secret` 只放服务端，绝不能出现在前端。

## 接口

| 路径 | 调用方 | 说明 |
| --- | --- | --- |
| `POST /api/auth/register` · `/login` · `GET /auth/me` | 控制台 | 邮箱账号、会话 JWT（7 天） |
| `GET /api/widgets` | 控制台 | 列表、聚合 KPI、最近配置事件 |
| `POST /api/widgets` | 控制台 | 创建，返回一次性明文 `secret` |
| `GET/PATCH /api/widgets/:id` | 控制台 | 读取 / 更新设置 |
| `POST /api/widgets/:id/rotate-secret` | 控制台 | 轮换，旧密钥立即失效 |
| `GET /api/widgets/:id/install` | 控制台 | 生成嵌入码、后端示例、密钥 |
| `GET /api/config?sitekey=…` | 访客浏览器 | 公开外观与触发设置，运行时拉取，不含密钥 |
| `POST /api/challenge` | 访客浏览器 | 签发绑定「站点 + 用途 + 来源域名」的 PoW 题目 |
| `POST /api/redeem` | 访客浏览器 | 校验答案，签发短时效验证令牌 |
| `POST /api/verify` | 站长后端 | `{ token, scope, secret }` → `{ ok: true }` / 403 |
| `GET /api/health` · `/api/meta` | 任意 | 健康检查、公开端点信息 |

挑战通过 `x-nscha-sitekey` / `x-captcha-scope` 头绑定；`/api/challenge` 与 `/api/redeem` 会校验 `Origin` 是否在**该站点自己的**域名白名单里。A 站的 sitekey 在 B 站上拿不到挑战。

## 隐私边界（写进产品的承诺，不要含糊）

平台保存：账号邮箱与密码散列、站点配置、`secret` 的散列与加密副本、**聚合**用量计数、配置事件、用于防重放的令牌摘要（TTL 后自动清除）。

平台不保存：访客 IP、设备指纹、行为轨迹、逐次验证明细。

对**站长的网站**来说，验证请求会跨域打向 `guard.nsbbs.eu.cc`。这是唯一的网络出口，不向其他第三方请求，也不采集访客行为——但「零第三方请求」这个说法在托管模式下不成立，文档站旧版里的那句话需要改写。访客的 PoW 求解始终留在本机浏览器，平台只收到答案。

## 本地运行

```bash
pnpm install --config.dangerouslyAllowAllBuilds=true --registry=https://registry.npmmirror.com
cp .env.example .env                       # 填 4 个随机密钥；本地 DATABASE_URL=file:./dev.db
pnpm db:local:generate                     # 生成本地 SQLite 版 Prisma Client
pnpm db:local:push                         # 建表，产物 prisma/local/dev.db
pnpm dev:api                               # API  → http://127.0.0.1:8789
pnpm dev:web                               # 控制台 → http://127.0.0.1:5173
pnpm typecheck && pnpm build
```

Vite 把 `/api/*` 代理到 8789；控制台、页面和 `widget.js` 都在 5173。`.env` 已被 gitignore，凭据不要入库。

验证脚本（本地保留、不入库）：`node .verify-api.mjs` 跑 API 冒烟；浏览器全链路脚本在 gamesense 项目的 `.verify-tools/nscha-console-e2e.mjs`。

## 部署到 Vercel

本项目是**一个** Vercel Project：静态 `dist/` 加一个 `api/[...path].ts` 函数。

1. Import `NS-Community/nscha-console`（或你的 fork）。Build Command `prisma generate && pnpm build`、Output Directory `dist`、Framework Preset **Other** 已由 `vercel.json` 固定。
   > `framework: null` 是必须的：依赖 Hono 且存在 `src/app.ts` 时，Vercel 会误判成后端框架项目，进而去 `dist/` 里找 server 入口并报 `No entrypoint found in output directory`。
2. 环境变量（Settings → Environment Variables，**Environment 选 `All environments`**）。

   | Key | 必填 | 值 / 生成方式 |
   | --- | --- | --- |
   | `DATABASE_URL` | ✅ 运行时 | Neon Postgres 连接池地址（`?sslmode=require`，pooler 端点适合 Vercel；构建期不需要） |
   | `CONSOLE_JWT_SECRET` | ✅ | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `CONSOLE_ENC_KEY` | ✅ | 另一个随机 hex，AES 加密保存 secret 以便控制台回显 |
   | `CAP_SECRET` | ✅ | 另一个随机 hex，PoW 与验证令牌签名 |
   | `CAP_TOKEN_SECRET` | 推荐 | 另一个随机 hex；留空回退到 `CAP_SECRET` |
   | `NSCHA_PUBLIC_ORIGIN` | 推荐 | `https://guard.nsbbs.eu.cc`（嵌入代码展示的域名） |
   | `CONSOLE_ORIGIN` | 推荐 | `https://guard.nsbbs.eu.cc`（控制台内预览测试放行的来源；不填则线上无法在控制台里实时测试） |
   | `NSCHA_DOCS_URL` | 可选 | `https://nscha.nsbbs.eu.cc`（默认值已是该地址） |
   | `CAP_CHALLENGE_COUNT` / `SIZE` / `DIFFICULTY` / `EXPIRES_SECONDS` / `TOKEN_TTL_SECONDS` | 可选 | 默认 20 / 32 / 3 / 600 / 300 |

   一条命令生成全部密钥：`node -e 'const c=require("crypto");for(const k of ["CONSOLE_JWT_SECRET","CONSOLE_ENC_KEY","CAP_SECRET","CAP_TOKEN_SECRET"])console.log(k+"="+c.randomBytes(48).toString("hex"))'`。

   > `isConfigured()` 要求 `CONSOLE_JWT_SECRET && CONSOLE_ENC_KEY && CAP_SECRET` 同时存在，否则 `/api/health` 返回 `configured:false`、接口 503。改完环境变量需 Redeploy 才生效。
3. **首次建表**：从能连到 Neon 的环境执行 `DATABASE_URL="<neon>" pnpm exec prisma db push`（用 `prisma/schema.prisma` 的 Postgres 版）。Vercel 构建期不跑迁移，这一步是显式的一次性动作。若 `db:push` 报 `channel_binding` 相关错误，从连接串去掉 `channel_binding=require`（保留 `sslmode=require`），必要时补 `&pgbouncer=true`。
4. 绑定 `guard.nsbbs.eu.cc`：Settings → Domains，按 Vercel 给出的项目专属 CNAME 值去 Cloudflare 加记录，代理状态设为「仅 DNS / 灰云」，回来 Verify。
5. 验收：`/api/health` → `{"ok":true,"configured":true}`；`/widget.js` → 200；打开控制台注册并添加一个小组件，把嵌入代码贴到绑定域名的页面上，看到「验证通过」，再用 `secret` 调一次 `/api/verify` 得到 `{ ok: true }`。

`vercel.json` 的 `headers` 给 `widget.js` / `nscha-solver.js` / `cap/*` 加了跨域放行：访客页面与这些资源不同源，WASM 需要能跨域读取。Worker 用 blob URL 创建，不受跨源限制。

## 已知边界

- 挑战的「一次性兑换」是进程级 nonce；跨 serverless 实例的防重放由 `UsedToken` 令牌摘要表承担。短 TTL + 签名站点/用途是主要防线。
- 控制台里的「预览测试」走 `CONSOLE_ORIGIN` 通道，签发带 `preview` 标记的令牌；`/api/verify` 会拒绝它，所以预览不能冒充真实提交。
- 用量只有按天聚合的计数，没有逐次明细，这是刻意的产品约束，不是缺失。
- 控制台用 hash 路由，避免 Vercel 上额外的 SPA fallback rewrite；`api/` 是唯一的路由规则。
- 最小可用版本没有团队/多成员、计费、配额告警和用量图表页。
- 数据库只存必要数据；`secret` 用 AES-256-GCM 加密保存以便在控制台「显示」，密钥来自 `CONSOLE_ENC_KEY`，丢了无法解密旧 secret（轮换即可）。
