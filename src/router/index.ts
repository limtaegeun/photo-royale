import { createRouter, createWebHistory } from 'vue-router'
import { EntryPage } from '@/features/entry'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'entry',
      component: EntryPage,
    },
  ],
})

export default router
