<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ConsoleShell from '../components/ConsoleShell.vue'
import { api, fmtDate, type WidgetsResponse } from '../api'

const router = useRouter()
const data = ref<WidgetsResponse | null>(null)
const error = ref('')
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    data.value = await api<WidgetsResponse>('/widgets')
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function open(id: string) {
  localStorage.setItem('nscha_last_widget', id)
  router.push(`/widgets/${id}`)
}
</script>

<template>
  <ConsoleShell title="NSCHA Console" subtitle="guard.nsbbs.eu.cc" active="widgets">
    <template #actions>
      <router-link to="/widgets/new" class="btn sm">+&nbsp;&nbsp;添加小组件</router-link>
    </template>

    <div class="page-head">
      <h1>站点与小组件</h1>
      <p class="muted">
        <template v-if="data">{{ data.items.length }} 个小组件 · 所有计数均为聚合值</template>
        <template v-else>管理你的验证组件</template>
      </p>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <div v-if="loading" class="muted loading"><span class="spin"></span>&nbsp;&nbsp;正在读取…</div>

    <template v-if="data">
      <div class="kpi-row">
        <div class="card kpi"><div class="value">{{ data.kpi.todayVerified.toLocaleString() }}</div><div class="label">今日验证</div></div>
        <div class="card kpi"><div class="value brand">{{ data.kpi.passRate }}%</div><div class="label">通过率</div></div>
        <div class="card kpi"><div class="value">{{ data.kpi.active }}</div><div class="label">活跃小组件</div></div>
        <div class="card kpi"><div class="value">{{ data.kpi.monthRequests.toLocaleString() }}</div><div class="label">本月请求</div></div>
      </div>

      <div class="card table">
        <div class="row head">
          <span>小组件</span><span>绑定域名</span><span>状态</span><span>今日验证</span>
        </div>
        <div v-if="!data.items.length" class="row empty muted">
          还没有小组件。点击右上角「添加小组件」开始。
        </div>
        <button v-for="w in data.items" :key="w.id" class="row item" @click="open(w.id)">
          <span class="name">{{ w.name }}</span>
          <span class="mono dim">{{ w.domains[0] }}</span>
          <span :class="w.status === 'active' ? 'brand' : 'muted'">
            {{ w.status === 'active' ? '●  已接入' : '○  草稿 · 待接入' }}
          </span>
          <span class="mono">{{ (w.today ?? 0).toLocaleString() }}</span>
        </button>
      </div>

      <div class="notice">平台只保存站点配置与密钥 · 所有用量均为聚合计数，不产生访客级记录</div>

      <div class="card activity">
        <div class="card-title brand">最近动态&nbsp; · &nbsp;仅配置事件，无访客明细</div>
        <div class="events">
          <div v-for="e in data.events" :key="e.id" class="event">
            <span class="mono dim">{{ fmtDate(e.createdAt) }}</span>
            <span>{{ e.detail }}</span>
          </div>
          <div v-if="!data.events.length" class="muted">暂无动态</div>
        </div>
      </div>
    </template>
  </ConsoleShell>
</template>

<style scoped>
.page-head { margin-bottom: 22px; }
h1 { font-size: 24px; font-weight: 700; }
.page-head p { font-size: 12px; margin-top: 6px; }
.loading { padding: 20px 0; }
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.kpi { padding: 20px; }
.value { font-size: 26px; font-weight: 700; line-height: 1.1; }
.label { font-size: 11px; color: var(--text-2); margin-top: 8px; }
.table { overflow: hidden; margin-bottom: 16px; }
.row {
  display: grid; grid-template-columns: 1.2fr 1.4fr 1fr .7fr; gap: 12px;
  align-items: center; padding: 0 16px; height: 52px; width: 100%;
  border-bottom: 1px solid var(--border); text-align: left; font-size: 13px;
}
.row:last-child { border-bottom: 0; }
.row.head { height: 44px; background: var(--group); font-size: 11px; color: var(--text-2); }
.item { background: var(--surface); color: var(--text); border-left: 0; border-right: 0; border-top: 0; cursor: pointer; }
.item:hover { background: #262627; }
.name { font-weight: 500; }
.dim { color: var(--text-2); font-size: 12px; }
.empty { grid-column: 1 / -1; }
.activity { padding: 20px; margin-top: 16px; }
.card-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
.event { display: flex; gap: 18px; font-size: 12px; line-height: 2; }
.event .mono { min-width: 92px; }
@media (max-width: 900px) {
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .row { grid-template-columns: 1fr 1fr; }
  .row span:nth-child(3), .row span:nth-child(4) { display: none; }
}
</style>
