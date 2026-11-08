import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConnectionStatusBadge from '../ConnectionStatusBadge.vue'
import { useFirestoreConnectionStatus } from '@/shared/composables/useFirestoreConnectionStatus'

enableAutoUnmount(afterEach)

describe('ConnectionStatusBadge', () => {
  beforeEach(() => {
    useFirestoreConnectionStatus().setReconnecting(false)
  })

  it('다시 연결하는 동안만 연결 중을 띄운다', async () => {
    const wrapper = mount(ConnectionStatusBadge)
    expect(wrapper.text()).not.toContain('연결 중')

    useFirestoreConnectionStatus().setReconnecting(true)
    await nextTick()
    expect(wrapper.get('[data-testid="connection-status-badge"]').text()).toContain('연결 중')

    useFirestoreConnectionStatus().setReconnecting(false)
    await nextTick()
    expect(wrapper.find('[data-testid="connection-status-badge"]').exists()).toBe(false)
  })

  it('라이브 영역은 늘 있고 클릭을 통과시킨다', () => {
    const wrapper = mount(ConnectionStatusBadge)
    const region = wrapper.get('[role="status"]')

    expect(region.classes()).toContain('pointer-events-none')
  })
})
