<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConsoleShell from '../components/ConsoleShell.vue'
import WidgetPreview from '../components/WidgetPreview.vue'
import { api, type WidgetItem } from '../api'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const loaded = ref(false)
const busy = ref(false)
const error = ref('')
const saved = ref('')
const domainText = ref('')

const form = reactive({
  name: '',
  theme: 'dark',
  size: 'standard',
  label: 'NSCHA',
  link: 'https://nscha.nsbbs.eu.cc',
  difficulty: 'medium',
  timeoutSec: 30,
  autoRetry: true,
  trigger: 'auto',
  scope: 'login',
  scopes: ['login'] as string[],
})
const original = ref('')

const KNOWN_SCOPES = ['login', 'register', 'reset']

function snapshot() {
  return JSON.stringify({ ...form, domains: domainText.value })
}

async function load() {
  try {
    const r = await api<{ widget: WidgetItem }>(`/widgets/${id}`)
    const w = r.widget
    form.name = w.name
    form.theme = w.theme
    form.size = w.size
    form.label = w.label
    form.link = w.link
    form.difficulty = w.difficulty
    form.timeoutSec = w.timeoutSec
    form.autoRetry = w.autoRetry
    form.trigger = w.trigger
    form.scope = w.scope
    form.scopes = [...w.scopes]
    domainText.value = w.domains.join(', ')
    original.value = snapshot()
    loaded.value = true
    localStorage.setItem('nscha_last_widget', id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

onMounted(load)

function toggleScope(s: string) {
  const i = form.scopes.indexOf(s)
  if (i >= 0) {
    if (form.scopes.length === 1) return
    form.scopes.splice(i, 1)
    if (form.scope === s) form.scope = form.scopes[0]
  } else {
    form.scopes.push(s)
  }
}

async function save(goNext = false) {
  if (busy.value) return
  error.value = ''
  saved.value = ''
  busy.value = true
  try {
    const r = await api<{ widget: WidgetItem }>(`/widgets/${id}`, {
      method: 'PATCH',
      body: {
        name: form.name,
        theme: form.theme,
        size: form.size,
        label: form.label,
        link: form.link,
        difficulty: form.difficulty,
        timeoutSec: form.timeoutSec,
        autoRetry: form.autoRetry,
        trigger: form.trigger,
        scope: form.scope,
        scopes: form.scopes,
        domains: domainText.value,
      },
    })
    const w = r.widget
    form.scopes = [...w.scopes]
    form.scope = w.scope
    domainText.value = w.domains.join(', ')
    original.value = snapshot()
    saved.value = '已保存 · 对所有访客立即生效，无需重新复制嵌入代码'
    if (goNext) router.push(`/widgets/${id}/install`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    busy.value = false
  }
}

function reset() {
  if (!original.value) return
  const o = JSON.parse(original.value) as Record<string, unknown>
  for (const key of Object.keys(form)) {
    if (key === 'scopes') form.scopes = [...(o.scopes as string[])]
    else (form as unknown as Record<string, unknown>)[key] = o[key]
  }
  domainText.value = String(o.domains || '')
  saved.value = ''
  error.value = ''
}
</script>

<template>
  <ConsoleShell title="编辑小组件设置" :subtitle="form.name || '…'" active="settings">
    <template #actions>
      <button class="reset-link" @click="reset">重置</button>
      <button class="btn sm" :disabled="busy" @click="save(false)">
        <span v-if="busy" class="spin"></span> 保存更改
      </button>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="saved" class="ok">{{ saved }}</p>
    <div v-if="!loaded && !error" class="muted"><span class="spin"></span>&nbsp;&nbsp;正在读取设置…</div>

    <template v-if="loaded">
      <div class="cols">
        <div class="left">
          <section class="card group">
            <h2>外观</h2>
            <div class="line"><span class="key">主题</span>
              <div class="segmented">
                <button :class="{ on: form.theme === 'dark' }" @click="form.theme = 'dark'">深色</button>
                <button :class="{ on: form.theme === 'light' }" @click="form.theme = 'light'">浅色</button>
                <button :class="{ on: form.theme === 'auto' }" @click="form.theme = 'auto'">跟随系统</button>
              </div>
            </div>
            <div class="line"><span class="key">尺寸</span>
              <div class="segmented">
                <button :class="{ on: form.size === 'standard' }" @click="form.size = 'standard'">标准 304×76</button>
                <button :class="{ on: form.size === 'compact' }" @click="form.size = 'compact'">紧凑</button>
              </div>
            </div>
            <div class="line"><span class="key">盒上标识</span>
              <input v-model="form.label" class="input compact" maxlength="24" />
            </div>
            <div class="line"><span class="key">标识链接</span>
              <input v-model="form.link" class="input compact mono" maxlength="120" />
            </div>
          </section>

          <section class="card group">
            <h2>验证</h2>
            <div class="line"><span class="key">难度</span>
              <div class="segmented">
                <button :class="{ on: form.difficulty === 'low' }" @click="form.difficulty = 'low'">低</button>
                <button :class="{ on: form.difficulty === 'medium' }" @click="form.difficulty = 'medium'">中</button>
                <button :class="{ on: form.difficulty === 'high' }" @click="form.difficulty = 'high'">高</button>
              </div>
            </div>
            <div class="line"><span class="key">超时</span>
              <span class="mono value">{{ form.timeoutSec }}s</span>
              <input v-model.number="form.timeoutSec" class="slider" type="range" min="10" max="120" step="5" />
              <label class="check-line"><input v-model="form.autoRetry" type="checkbox" /> 失败自动重试</label>
            </div>
            <div class="line"><span class="key">触发</span>
              <div class="segmented">
                <button :class="{ on: form.trigger === 'auto' }" @click="form.trigger = 'auto'">自动求解</button>
                <button :class="{ on: form.trigger === 'click' }" @click="form.trigger = 'click'">点击后验证</button>
              </div>
            </div>
          </section>

          <section class="card group">
            <h2>允许的用途</h2>
            <div class="scope-list">
              <button v-for="s in KNOWN_SCOPES" :key="s" class="scope" :class="{ on: form.scopes.includes(s) }" @click="toggleScope(s)">
                {{ form.scopes.includes(s) ? '✓' : '☐' }}&nbsp;&nbsp;<span class="mono">{{ s }}</span>
              </button>
            </div>
            <label class="field inline">
              <span>主用途</span>
              <select v-model="form.scope" class="input compact">
                <option v-for="s in form.scopes" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <p class="faint">新增表单前先在这里登记，服务端会拒绝未登记的用途。</p>
          </section>

          <section class="card group">
            <h2>绑定域名</h2>
            <div class="domain-row" v-for="d in domainText.split(',').map(v => v.trim()).filter(Boolean)" :key="d">
              <span class="mono">{{ d }}</span><span class="tag on">✓ 已验证</span>
            </div>
            <input v-model="domainText" class="input compact mono" placeholder="多个域名用逗号分隔" />
            <p class="faint">只有这些域名能使用该 sitekey；预览与测试走控制台自身的通道。</p>
          </section>

          <p class="muted hint-bottom">保存后立即对所有访客生效，无需重新复制嵌入代码。</p>
          <button class="btn" @click="save(true)">保存并查看接入代码&nbsp;&nbsp;→</button>
        </div>

        <div class="right">
          <WidgetPreview
            :theme="form.theme"
            :size="form.size"
            :label="form.label"
            :link="form.link"
            :trigger="form.trigger"
            :domain="domainText.split(',')[0].trim()"
          />
        </div>
      </div>
    </template>
  </ConsoleShell>
</template>

<style scoped>
.reset-link { font-size: 12px; color: var(--text-2); background: none; border: 0; cursor: pointer; }
.reset-link:hover { color: var(--text); }
.cols { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 16px; align-items: start; }
.left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.group { padding: 18px; }
.group h2 { font-size: 13px; font-weight: 700; color: var(--brand); margin-bottom: 12px; }
.line { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.line:last-child { margin-bottom: 0; }
.key { min-width: 72px; font-size: 12px; }
.value { font-size: 12px; color: var(--text-2); min-width: 32px; }
.slider { flex: 1; min-width: 90px; accent-color: var(--brand); }
.check-line { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-2); }
.check-line input { accent-color: var(--brand); }
.input.compact { height: 34px; flex: 1; min-width: 140px; font-size: 12px; }
.scope-list { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.scope {
  height: 30px; padding: 0 12px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--input); color: var(--text-2); font-size: 12px; cursor: pointer;
}
.scope.on { color: var(--brand); border-color: #46591a; background: var(--brand-dim); }
.field.inline { display: flex; align-items: center; gap: 12px; margin: 0 0 10px; }
.field.inline > span { margin: 0; min-width: 72px; font-size: 12px; }
.faint { font-size: 11px; line-height: 1.6; margin-top: 8px; }
.domain-row { display: flex; align-items: center; gap: 10px; font-size: 12px; margin-bottom: 8px; }
.hint-bottom { font-size: 11px; margin: 4px 0 0; }
.right { min-width: 0; }
@media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
</style>
