<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleShell from '../components/ConsoleShell.vue'
import { api, type WidgetItem } from '../api'

const router = useRouter()
const name = ref('论坛登录')
const domain = ref('https://example.com')
const scope = ref('login')
const trigger = ref('auto')
const busy = ref(false)
const error = ref('')

async function create() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const r = await api<{ widget: WidgetItem }>('/widgets', {
      method: 'POST',
      body: { name: name.value, domain: domain.value, scope: scope.value, trigger: trigger.value },
    })
    localStorage.setItem('nscha_last_widget', r.widget.id)
    router.push(`/widgets/${r.widget.id}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ConsoleShell title="添加小组件" subtitle="第 1 步 / 共 3 步" active="widgets">
    <template #actions>
      <router-link to="/widgets" class="link-back">←&nbsp;&nbsp;站点与小组件</router-link>
    </template>

    <div class="page-head">
      <h1>添加小组件</h1>
      <p class="muted">填一次，之后随时可以改；保存后立即对所有访客生效。</p>
    </div>

    <div class="card steps">
      <span class="on">●&nbsp;&nbsp;01&nbsp;&nbsp;站点信息</span>
      <span>○&nbsp;&nbsp;02&nbsp;&nbsp;小组件设置</span>
      <span>○&nbsp;&nbsp;03&nbsp;&nbsp;复制嵌入码</span>
    </div>

    <div class="form-row">
      <div class="card form">
        <h2>站点信息</h2>

        <label class="field">
          <span>小组件名称</span>
          <input v-model="name" class="input" placeholder="论坛登录" maxlength="60" />
        </label>

        <label class="field">
          <span>网站域名&nbsp; <em class="hint">· 只有这个域名能使用该 sitekey</em></span>
          <input v-model="domain" class="input mono" placeholder="https://example.com" />
        </label>

        <label class="field">
          <span>用途 scope&nbsp; <em class="hint">· 站长后端校验时要带上同一个值</em></span>
          <select v-model="scope" class="input">
            <option value="login">login</option>
            <option value="register">register</option>
            <option value="reset">reset</option>
          </select>
        </label>

        <label class="field">
          <span>触发方式</span>
          <div class="segmented">
            <button type="button" :class="{ on: trigger === 'auto' }" @click="trigger = 'auto'">●&nbsp;&nbsp;自动求解</button>
            <button type="button" :class="{ on: trigger === 'click' }" @click="trigger = 'click'">○&nbsp;&nbsp;点击后验证</button>
          </div>
        </label>

        <p class="error">{{ error }}</p>
      </div>

      <aside class="card side">
        <div class="side-title brand">创建后你会得到</div>
        <ul>
          <li>一对 sitekey / secret</li>
          <li>一行可复制的嵌入代码</li>
          <li>中央 /verify 校验端点</li>
          <li>实时聚合用量</li>
        </ul>
        <p class="faint">数据库只存站点配置与密钥，不产生访客级记录。</p>
      </aside>
    </div>

    <div class="bottom">
      <router-link to="/widgets" class="cancel">取消</router-link>
      <span class="spacer"></span>
      <button class="btn" :disabled="busy" @click="create">
        <span v-if="busy" class="spin"></span>
        创建并继续设置&nbsp;&nbsp;→
      </button>
    </div>
  </ConsoleShell>
</template>

<style scoped>
.link-back { font-size: 12px; color: var(--text-2); }
.link-back:hover { color: var(--text); text-decoration: none; }
.page-head { margin-bottom: 20px; }
h1 { font-size: 24px; font-weight: 700; }
.page-head p { font-size: 12px; margin-top: 6px; }
.steps { display: flex; gap: 12px; padding: 16px; margin-bottom: 20px; font-size: 12px; }
.steps span { flex: 1; color: var(--text-2); }
.steps .on { color: var(--brand); font-weight: 700; }
.form-row { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
.form { padding: 24px; }
h2 { font-size: 16px; font-weight: 700; margin-bottom: 20px; }
.hint { font-style: normal; color: var(--text-2); font-weight: 400; }
.side { padding: 20px; }
.side-title { font-size: 14px; font-weight: 700; margin-bottom: 14px; }
.side ul { margin: 0 0 14px; padding-left: 18px; line-height: 2; font-size: 12px; }
.side .faint { font-size: 11px; line-height: 1.6; }
.bottom { display: flex; align-items: center; gap: 16px; margin-top: 22px; }
.cancel { color: var(--text-2); font-size: 12px; }
.spacer { flex: 1; }
@media (max-width: 980px) { .form-row { grid-template-columns: 1fr; } }
</style>
