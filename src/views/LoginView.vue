<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, setToken } from '../api'

const route = useRoute()
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

async function submit() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    const r = await api<{ token: string }>(`/auth/${mode.value}`, {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    setToken(r.token)
    router.push(String(route.query.next || '/widgets'))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败，请重试'
  } finally {
    busy.value = false
  }
}

function toggle() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = ''
}
</script>

<template>
  <div class="auth">
    <section class="brand-side">
      <div class="kicker mono">NSCHA&nbsp; / &nbsp;CONSOLE</div>
      <h1>把验证放在<br />访客自己的设备上</h1>
      <p class="sub">
        添加一个小组件，配置一次，你的网站就拥有不追踪的人机验证。<br />
        不需要懂密码学，也不需要自己维护服务。
      </p>
      <div class="promise">
        <div>· 不采集访客行为</div>
        <div>· 不写持久标识</div>
        <div>· 不向其他第三方请求</div>
      </div>
      <div class="foot mono">NSCHA · Non-Surveillance CAPTCHA for Human Authentication</div>
    </section>

    <section class="form-side">
      <div class="form-card card">
        <h2>{{ mode === 'login' ? '登录控制台' : '创建控制台账号' }}</h2>
        <p class="muted form-sub">独立邮箱账号 · 与 gamesense 论坛账号分开</p>

        <label class="field">
          <span>邮箱</span>
          <input v-model="email" class="input mono" type="email" placeholder="owner@example.com" autocomplete="email" @keyup.enter="submit" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="password" class="input" type="password" placeholder="至少 8 位" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" @keyup.enter="submit" />
        </label>

        <p class="error">{{ error }}</p>
        <button class="btn full" :disabled="busy" @click="submit">
          <span v-if="busy" class="spin"></span>
          {{ busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录' }}
        </button>

        <p class="switch">
          {{ mode === 'login' ? '还没有账号？' : '已经有账号了？' }}
          <a href="#" @click.prevent="toggle">{{ mode === 'login' ? '注册一个 →' : '去登录 →' }}</a>
        </p>
        <p class="legal faint">
          登录即表示你已知悉：平台只保存站点配置与密钥，不保存访客记录。
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.auth { display: flex; min-height: 100vh; }
.brand-side {
  flex: 1; padding: 96px; display: flex; flex-direction: column; gap: 28px;
  background: var(--bg);
}
.kicker { font-size: 13px; letter-spacing: 1px; color: var(--brand); }
h1 { font-size: 42px; line-height: 1.25; font-weight: 700; max-width: 520px; }
.sub { font-size: 16px; line-height: 1.7; color: var(--text-2); max-width: 500px; }
.promise { font-size: 14px; line-height: 2; }
.foot { margin-top: auto; font-size: 11px; color: var(--text-3); }
.form-side {
  flex: 1; display: grid; place-items: center; padding: 60px;
  background: var(--surface);
}
.form-card { width: 420px; max-width: 100%; padding: 32px; }
h2 { font-size: 24px; font-weight: 700; }
.form-sub { font-size: 12px; margin: 6px 0 26px; }
.full { width: 100%; }
.switch { margin-top: 18px; font-size: 12px; color: var(--text-2); text-align: center; }
.legal { margin-top: 24px; font-size: 11px; line-height: 1.6; text-align: center; }
@media (max-width: 900px) {
  .auth { flex-direction: column; }
  .brand-side { padding: 48px 28px; gap: 18px; }
  h1 { font-size: 30px; }
  .form-side { padding: 40px 20px; }
}
</style>
