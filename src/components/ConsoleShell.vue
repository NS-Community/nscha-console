<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, setToken } from '../api'

defineProps<{ title: string; subtitle?: string; active?: string }>()

const router = useRouter()
const email = ref('')
const lastId = ref('')

const NAV = [
  { key: 'overview', label: '概览', to: '/widgets' },
  { key: 'widgets', label: '站点与小组件', to: '/widgets' },
  { key: 'usage', label: '用量', to: '/widgets' },
  { key: 'keys', label: '密钥', to: '/widgets' },
  { key: 'settings', label: '设置', to: '/widgets' },
]

function target(item: { key: string; to: string }) {
  if (item.key === 'keys' && lastId.value) return `/widgets/${lastId.value}/install`
  if (item.key === 'settings' && lastId.value) return `/widgets/${lastId.value}`
  return item.to
}

onMounted(async () => {
  lastId.value = localStorage.getItem('nscha_last_widget') || ''
  try {
    const r = await api<{ user: { email: string } }>('/auth/me')
    email.value = r.user.email
  } catch {
    /* the page will surface its own 401 */
  }
})

function logout() {
  setToken('')
  router.push('/login')
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="logo mono">NSCHA&nbsp;&nbsp;Console</div>
      <nav class="nav">
        <router-link
          v-for="item in NAV"
          :key="item.key"
          :to="target(item)"
          class="nav-item"
          :class="{ on: active === item.key }"
        >
          <span class="mark">{{ active === item.key ? '▸' : '&nbsp;&nbsp;' }}</span>{{ item.label }}
        </router-link>
      </nav>
      <div class="side-spacer"></div>
      <div class="account card">
        <div class="mono acct-email">{{ email || '…' }}</div>
        <div class="faint">个人空间 · 独立账号</div>
      </div>
      <button class="logout" @click="logout">退出登录 →</button>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="top-left">
          <div class="page-title">{{ title }}</div>
          <div v-if="subtitle" class="page-sub mono">{{ subtitle }}</div>
        </div>
        <div class="top-actions"><slot name="actions" /></div>
        <div class="avatar mono">OE</div>
      </header>
      <div class="content"><slot /></div>
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100vh; }
.sidebar {
  position: sticky; top: 0; flex: 0 0 240px; width: 240px; height: 100vh;
  display: flex; flex-direction: column; gap: 6px; padding: 20px;
  background: var(--surface); border-right: 1px solid var(--border);
}
.logo { font-size: 15px; font-weight: 700; color: var(--brand); padding: 4px 0 18px; }
.nav { display: flex; flex-direction: column; gap: 4px; }
.nav-item {
  display: block; padding: 9px 10px; border-radius: var(--radius-ctrl);
  color: var(--text-2); font-size: 13px;
}
.nav-item:hover { background: var(--group); color: var(--text); text-decoration: none; }
.nav-item.on { color: var(--brand); font-weight: 700; background: #242a1a; }
.mark { display: inline-block; width: 18px; }
.side-spacer { flex: 1; }
.account { padding: 14px; }
.acct-email { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account .faint { font-size: 11px; margin-top: 4px; }
.logout {
  margin-top: 4px; padding: 8px 10px; border: 0; background: transparent;
  color: var(--text-3); font-size: 11px; text-align: left; cursor: pointer;
}
.logout:hover { color: var(--text); }

.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  height: 64px; flex: 0 0 64px; display: flex; align-items: center; gap: 16px;
  padding: 0 24px; border-bottom: 1px solid var(--border); background: var(--bg);
}
.top-left { min-width: 0; }
.page-title { font-size: 14px; font-weight: 700; }
.page-sub { font-size: 11px; color: var(--text-2); margin-top: 2px; }
.top-actions { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.avatar {
  width: 30px; height: 30px; display: grid; place-items: center;
  border-radius: 50%; background: var(--group); color: var(--text-2);
  font-size: 11px; font-weight: 700;
}
.content { flex: 1; padding: 28px 32px 40px; }

@media (max-width: 860px) {
  .sidebar { flex-basis: 64px; width: 64px; padding: 16px 8px; }
  .logo, .account, .logout, .nav-item { font-size: 0; }
  .nav-item { height: 34px; padding: 0; text-align: center; }
  .mark { width: 0; }
  .content { padding: 20px; }
}
</style>
