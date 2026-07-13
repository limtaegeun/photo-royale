import { createRouter, createWebHistory } from 'vue-router'
import { EntryPage } from '@/features/entry'
import { LoginPage, SignupPage, authGuard } from '@/features/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'entry',
      component: EntryPage,
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { guestOnly: true },
    },
    {
      path: '/signup',
      name: 'signup',
      component: SignupPage,
      meta: { guestOnly: true },
    },
  ],
})

router.beforeEach(authGuard)

export default router
