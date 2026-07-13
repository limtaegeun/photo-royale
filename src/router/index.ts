import { createRouter, createWebHistory } from 'vue-router'
import { EntryPage } from '@/features/entry'
import { WaitingRoomPage } from '@/features/waiting-room'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'entry',
      component: EntryPage,
    },
    {
      path: '/waiting-room',
      name: 'waiting-room',
      component: WaitingRoomPage,
    },
  ],
})

export default router
