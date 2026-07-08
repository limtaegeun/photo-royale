import { createRouter, createWebHistory } from 'vue-router'
import { EntryPage } from '@/features/entry'
import { SignupPage } from '@/features/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'entry',
      component: EntryPage,
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupPage,
    },
  ],
})

export default router
