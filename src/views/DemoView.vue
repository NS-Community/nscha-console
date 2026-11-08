<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import ConsoleShell from '../components/ConsoleShell.vue'
import { api, type InstallResponse } from '../api'

const route = useRoute()
const id = String(route.params.id)
const data = ref<InstallResponse | null>(null)
const result = ref('')
const failed = ref('')

function onSuccess(ev: Event) {
  const d = (ev as CustomEvent).detail as { token: string; scope: string; elapsedMs: number }
  result.value = `求解完成 · ${d.elapsedMs} ms · 令牌 ${d.token.slice(0, 14)}…`
  failed.value = ''
}
function onError(ev: Event) {
  const d = (ev as CustomEvent).detail as { message: string }
  failed.value = d.message
  result.value = ''
}

function start() {
  const el = document.querySelector('nscha-widget') as (HTMLElement & { start?: () => void }) | null
  if (el && typeof el.start === 'function') el.start()
}

onMounted(async () => {
  document.addEventListener('nscha:success', onSuccess)
  document.addEventListener('nscha:error', onError)
  // The console itself does not ship widget.js globally. Load it only on the
  // preview screen, before the custom element is rendered, so the element is
  // upgraded as soon as Vue inserts it.
  if (!customElements.get('nscha-widget')) {
    try {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = '/widget.js'
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('widget.js 加载失败'))
        document.head.appendChild(script)
      })
    } catch (e) {
      failed.value = e instanceof Error ? e.message : '组件加载失败'
    }
  }
  try {
    data.value = await api<InstallResponse>(`/widgets/${id}/install`)
  } catch (e) {
    failed.value = e instanceof Error ? e.message : '加载失败'
  }
})
onUnmounted(() => {
  document.removeEventListener('nscha:success', onSuccess)
  document.removeEventListener('nscha:error', onError)
})
</script>

<template>
  <ConsoleShell title="预览测试" subtitle="控制台通道 · 预览令牌不可用于真实提交" active="settings">
    <template #actions>
      <router-link :to="`/widgets/${id}/install`" class="back">←&nbsp;&nbsp;返回接入代码</router-link>
    </template>

    <div class="page-head">
      <h1>在预览里测试一次</h1>
      <p class="muted">这里跑的是真实求解器与真实 WASM，只是来源被标记成预览通道。</p>
    </div>

    <div class="card panel">
      <div class="fake-form">
        <div class="fake-title">模拟表单 · {{ data?.widget.name || '…' }}</div>
        <div class="fake-input">用户名</div>
        <div class="fake-input">密码</div>

        <div class="widget-slot">
          <nscha-widget
            v-if="data"
            :sitekey="data.sitekey"
            :action="data.scope"
            name="nschaToken"
            preview="1"
            auto="off"
          ></nscha-widget>
          <div v-else class="muted"><span class="spin"></span>&nbsp;&nbsp;正在准备…</div>
        </div>

        <button class="btn sm" @click="start">开始验证</button>
      </div>

      <p v-if="result" class="ok">{{ result }}</p>
      <p v-if="failed" class="error">{{ failed }}</p>
      <div class="notice">
        预览令牌带 preview 标记，中央 /verify 会拒绝它。真实访客从你绑定的域名发起的请求才会签发可用令牌。
      </div>
    </div>
  </ConsoleShell>
</template>

<style scoped>
.back { font-size: 12px; color: var(--text-2); }
.back:hover { color: var(--text); text-decoration: none; }
.page-head { margin-bottom: 20px; }
h1 { font-size: 24px; font-weight: 700; }
.page-head p { font-size: 12px; margin-top: 6px; }
.panel { padding: 24px; max-width: 720px; }
.fake-form { padding: 24px; border-radius: 6px; background: #f2f2f0; margin-bottom: 18px; }
.fake-title { font-weight: 700; color: #1a1a1a; margin-bottom: 12px; font-size: 13px; }
.fake-input {
  height: 34px; display: flex; align-items: center; padding: 0 12px; margin-bottom: 8px;
  border: 1px solid #d9d9d6; border-radius: 4px; background: #fff;
  color: #9a9a96; font-size: 12px;
}
.widget-slot { margin: 14px 0 12px; min-height: 96px; }
.notice { margin-top: 18px; }
</style>
