<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleShell from '../components/ConsoleShell.vue'
import { api, copyText, type InstallResponse } from '../api'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const data = ref<InstallResponse | null>(null)
const error = ref('')
const copied = ref('')
const showSecret = ref(false)
const rotating = ref(false)

async function load() {
  try {
    data.value = await api<InstallResponse>(`/widgets/${id}/install`)
    localStorage.setItem('nscha_last_widget', id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}
onMounted(load)

async function copy(key: string, text: string) {
  await copyText(text)
  copied.value = key
  setTimeout(() => {
    if (copied.value === key) copied.value = ''
  }, 1800)
}

async function rotate() {
  if (rotating.value || !data.value) return
  if (!confirm('轮换后旧 secret 立即失效，你的服务端需要同步更新。继续？')) return
  rotating.value = true
  try {
    const r = await api<{ secret: string }>(`/widgets/${id}/rotate-secret`, { method: 'POST' })
    data.value.secret = r.secret
    showSecret.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '轮换失败'
  } finally {
    rotating.value = false
  }
}
</script>

<template>
  <ConsoleShell title="安装到你的网站" subtitle="第 3 步 / 共 3 步" active="keys">
    <template #actions>
      <router-link :to="`/widgets/${id}`" class="back">←&nbsp;&nbsp;返回小组件</router-link>
      <a :href="data?.docsUrl || 'https://nscha.nsbbs.eu.cc'" target="_blank" rel="noopener" class="docs">查看接入文档 →</a>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="!data && !error" class="muted"><span class="spin"></span>&nbsp;&nbsp;正在生成接入代码…</div>

    <template v-if="data">
      <div class="page-head">
        <h1>安装到你的网站</h1>
        <p class="mono muted">{{ data.widget.name }} &nbsp;·&nbsp; {{ data.widget.domains[0] }} &nbsp;·&nbsp; scope {{ data.scope }}</p>
      </div>

      <div class="cols">
        <div class="left">
          <section class="card panel">
            <h2>1&nbsp;&nbsp;前端嵌入</h2>
            <pre class="codeblock">{{ data.embedCode }}</pre>
            <button class="btn sm" @click="copy('embed', data.embedCode)">
              {{ copied === 'embed' ? '✓ 已复制' : '复制嵌入代码' }}
            </button>
            <p class="muted note">
              贴到需要验证的表单里即可。sitekey 与 {{ data.widget.domains[0] }} 绑定，别的域名用不了。
            </p>
          </section>

          <section class="card panel">
            <h2>2&nbsp;&nbsp;后端校验&nbsp; · &nbsp;别跳过这一步</h2>
            <pre class="codeblock">{{ data.verifySnippet }}</pre>
            <button class="btn sm ghost" @click="copy('verify', data.verifySnippet)">
              {{ copied === 'verify' ? '✓ 已复制' : '复制后端代码' }}
            </button>
            <p class="muted note">
              secret 只在你的服务端使用，绝不能放进前端。前端成功事件可以伪造，这一步不能省。
            </p>
          </section>

          <section class="card panel after">
            <h2>接入后会发生什么</h2>
            <p>
              访客打开表单 → 组件在本机完成求解 → 平台只收到答案并签发短时效令牌 → 你的后端调 /verify 确认。<br />
              平台不记录访客 IP、设备指纹或行为轨迹。
            </p>
          </section>
        </div>

        <div class="right">
          <section class="card panel keys">
            <h2 class="plain">密钥</h2>
            <div class="key-label muted">sitekey&nbsp; · &nbsp;可以放在前端</div>
            <div class="key-value mono brand">{{ data.sitekey }}</div>
            <button class="mini" @click="copy('sitekey', data.sitekey)">{{ copied === 'sitekey' ? '✓ 已复制' : '复制' }}</button>

            <div class="key-label muted">secret&nbsp; · &nbsp;只在服务端使用</div>
            <div class="key-value mono">{{ showSecret ? data.secret : 'ns_sec_••••••••••••••••' }}</div>
            <div class="key-actions">
              <button class="mini" @click="showSecret = !showSecret">{{ showSecret ? '隐藏' : '显示' }}</button>
              <button class="mini" @click="copy('secret', data.secret)">{{ copied === 'secret' ? '✓ 已复制' : '复制' }}</button>
            </div>
            <button class="rotate" :disabled="rotating" @click="rotate">
              {{ rotating ? '轮换中…' : '轮换 secret  →  旧密钥立即失效' }}
            </button>
          </section>

          <section class="card panel status-card">
            <h2>3&nbsp;&nbsp;验证接入</h2>
            <div class="step">✓&nbsp;&nbsp;已创建小组件</div>
            <div class="step">✓&nbsp;&nbsp;已保存设置</div>
            <div class="step" :class="{ on: data.widget.status === 'active' }">
              {{ data.widget.status === 'active' ? '✓' : '○' }}&nbsp;&nbsp;{{
                data.widget.status === 'active' ? '已收到真实验证' : '等待第一次验证'
              }}
            </div>
            <button class="btn sm" @click="router.push(`/widgets/${id}/demo`)">在预览里测试一次</button>
            <p class="faint note">预览令牌只用于演示，不能用于真实表单提交。</p>
          </section>
        </div>
      </div>
    </template>
  </ConsoleShell>
</template>

<style scoped>
.back, .docs { font-size: 12px; margin-left: 12px; }
.back { color: var(--text-2); }
.back:hover { color: var(--text); text-decoration: none; }
.page-head { margin-bottom: 18px; }
h1 { font-size: 24px; font-weight: 700; }
.page-head p { font-size: 12px; margin-top: 6px; }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
.left, .right { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.panel { padding: 20px; }
.panel h2 { font-size: 14px; font-weight: 700; color: var(--brand); margin-bottom: 14px; }
.panel h2.plain { color: var(--text); }
.codeblock { margin-bottom: 14px; }
.note { font-size: 11px; line-height: 1.7; margin-top: 12px; }
.after { background: var(--surface); }
.after h2 { color: var(--brand); }
.after p { font-size: 12px; line-height: 1.9; }
.key-label { font-size: 11px; margin: 12px 0 4px; }
.key-value { font-size: 12px; word-break: break-all; }
.mini {
  margin-top: 6px; margin-right: 8px; padding: 4px 10px; border: 1px solid var(--border);
  border-radius: 6px; background: var(--input); color: var(--text-2); font-size: 11px; cursor: pointer;
}
.mini:hover { color: var(--brand); border-color: #46591a; }
.key-actions { display: flex; }
.rotate {
  margin-top: 16px; padding: 0; border: 0; background: none;
  color: var(--text-2); font-size: 11px; cursor: pointer;
}
.rotate:hover { color: var(--text); }
.status-card { background: var(--brand-dim); }
.status-card h2 { color: var(--brand); }
.step { font-size: 12px; line-height: 2.1; color: var(--text); }
.step.on { color: var(--brand); }
.status-card .btn { margin-top: 14px; }
.status-card .faint { color: var(--text-2); }
@media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
</style>
