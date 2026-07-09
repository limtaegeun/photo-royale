import { createRouter, createWebHistory } from 'vue-router'
import { CameraPage } from '@/features/camera'
import { EntryPage } from '@/features/entry'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'entry',
      component: EntryPage,
    },
    {
      path: '/camera',
      name: 'camera',
      component: CameraPage,
    },
  ],
})

export default router
