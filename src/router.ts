import { createRouter, createWebHashHistory } from 'vue-router'
import { token } from './api'
import LoginView from './views/LoginView.vue'
import WidgetsView from './views/WidgetsView.vue'
import NewWidgetView from './views/NewWidgetView.vue'
import SettingsView from './views/SettingsView.vue'
import InstallView from './views/InstallView.vue'
import DemoView from './views/DemoView.vue'

// Hash routing keeps Vercel free of SPA fallback rewrites: the console,
// widget.js and the WASM payloads are all plain static assets on one origin.
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/widgets' },
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/widgets', component: WidgetsView },
    { path: '/widgets/new', component: NewWidgetView },
    { path: '/widgets/:id', component: SettingsView },
    { path: '/widgets/:id/install', component: InstallView },
    { path: '/widgets/:id/demo', component: DemoView },
  ],
})

router.beforeEach((to) => {
  const authed = Boolean(token())
  if (!to.meta.public && !authed) return { path: '/login', query: { next: to.fullPath } }
  if (to.path === '/login' && authed) return '/widgets'
  return true
})
