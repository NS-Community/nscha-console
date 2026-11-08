<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  theme: string
  size: string
  label: string
  link: string
  trigger: string
  domain?: string
}>()

const state = ref<'idle' | 'verifying' | 'done'>('idle')
const STATES: { key: 'idle' | 'verifying' | 'done'; label: string }[] = [
  { key: 'idle', label: '未完成' },
  { key: 'verifying', label: '验证中' },
  { key: 'done', label: '● 已通过' },
]
</script>

<template>
  <div class="card preview">
    <h3>实时预览</h3>
    <p class="muted intro">这段盒子就是访客在 {{ domain || '你的网站' }} 上看到的样子。改设置，右侧立即跟着变。</p>

    <div class="site">
      <div class="site-title">登录 · {{ domain || 'example.com' }}</div>
      <div class="fake-input"></div>
      <div class="fake-input"></div>

      <div class="box" :class="[`theme-${props.theme === 'light' ? 'light' : 'dark'}`, `size-${props.size === 'compact' ? 'compact' : 'standard'}`]" :data-state="state">
        <div class="check">
          <svg v-if="state === 'verifying'" class="ring" viewBox="0 0 32 32">
            <circle class="track" cx="16" cy="16" r="13" />
            <circle class="arc" cx="16" cy="16" r="13" />
          </svg>
          <svg v-else-if="state === 'done'" class="tick" viewBox="0 0 32 32">
            <path d="M9 16.6l4.8 4.8L23.4 11" />
          </svg>
        </div>
        <div class="copy">
          <div class="title">{{ state === 'done' ? '验证通过' : state === 'verifying' ? '正在验证…' : '我是人类' }}</div>
          <div class="sub">{{ state === 'done' ? '未追踪 · 由你的设备完成' : 'NSCHA · 无追踪验证' }}</div>
        </div>
        <div class="box-brand mono">{{ props.label || 'NSCHA' }}</div>
      </div>

      <div class="fake-button"></div>
    </div>

    <div class="states">
      <button
        v-for="s in STATES"
        :key="s.key"
        :class="{ on: state === s.key }"
        @click="state = s.key"
      >{{ s.label }}</button>
    </div>

    <p class="faint note">
      {{ props.trigger === 'click' ? '当前为「点击后验证」：访客点击方框才开始求解。' : '当前为「自动求解」：页面加载后在本机后台完成。' }}
      <a :href="props.link || 'https://nscha.nsbbs.eu.cc'" target="_blank" rel="noopener">组件说明 ↗</a>
    </p>
  </div>

  <div class="card privacy">
    <div class="brand title">预览说明</div>
    <p>
      改主题、改文案、改难度，右侧立即跟着变。<br />
      访客的求解过程留在本机，平台只收到答案。
    </p>
  </div>
</template>

<style scoped>
.preview { padding: 18px; margin-bottom: 16px; }
h3 { font-size: 14px; font-weight: 700; }
.intro { font-size: 11px; line-height: 1.6; margin: 6px 0 14px; }
.site { padding: 22px; background: #f2f2f0; border-radius: 6px; }
.site-title { font-size: 12px; font-weight: 700; color: #1a1a1a; margin-bottom: 10px; }
.fake-input { height: 30px; background: #fff; border: 1px solid #d9d9d6; border-radius: 4px; margin-bottom: 8px; }
.fake-button { height: 30px; background: #272726; border-radius: 4px; margin-top: 10px; }

.box {
  display: flex; align-items: center; gap: 12px;
  width: 304px; max-width: 100%; height: 76px; padding: 0 14px;
  background: #303030; border-radius: 6px; margin-top: 6px;
}
.box.size-compact { width: 280px; height: 64px; }
.box.theme-light { background: #fff; border: 1px solid #d9d9d6; }
.check {
  position: relative; flex: 0 0 28px; width: 28px; height: 28px;
  border: 1px solid #5a5a58; border-radius: 4px; background: #1e1e1e;
}
.theme-light .check { background: #fff; border-color: #c4c4c0; }
.box[data-state='done'] .check { background: #95b806; border-color: #95b806; }
.box[data-state='verifying'] .check { background: transparent; border-color: transparent; }
.ring { width: 100%; height: 100%; animation: spin .9s linear infinite; }
.ring circle { fill: none; stroke-width: 2.5; }
.ring .track { stroke: #4a4a48; }
.ring .arc { stroke: #95b806; stroke-linecap: round; stroke-dasharray: 26 56; }
.tick { width: 100%; height: 100%; }
.tick path { fill: none; stroke: #111; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
@keyframes spin { to { transform: rotate(360deg); } }
.copy { flex: 1; min-width: 0; }
.title { font-size: 13px; color: #eaeaea; }
.sub { font-size: 10px; color: #8a8a86; margin-top: 3px; }
.theme-light .title { color: #1a1a1a; }
.theme-light .sub { color: #6b6b68; }
.box-brand { font-size: 11px; font-weight: 700; color: #95b806; }

.states { display: flex; gap: 8px; margin-top: 12px; }
.states button {
  flex: 1; height: 30px; border: 1px solid var(--border); border-radius: 6px;
  background: var(--input); color: var(--text-3); font-size: 11px; cursor: pointer;
}
.states button.on { color: var(--brand); border-color: #46591a; background: var(--brand-dim); font-weight: 700; }
.note { font-size: 11px; line-height: 1.7; margin-top: 12px; }
.note a { margin-left: 6px; }

.privacy { padding: 18px; background: var(--brand-dim); }
.privacy .title { font-size: 12px; font-weight: 700; margin-bottom: 8px; }
.privacy p { font-size: 11px; line-height: 1.8; color: var(--text); }
</style>
