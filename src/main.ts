import '@/shared/styles/index.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/features/auth'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 세션 유지: 새로고침·재방문 시 Firebase가 복원한 로그인 상태를 스토어에 반영한다
useAuthStore().init()

app.mount('#app')
