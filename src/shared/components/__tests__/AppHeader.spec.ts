import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import AppHeader from '../AppHeader.vue'

function mountHeader(props: { showProfileLink?: boolean } = {}) {
  return mount(AppHeader, {
    props,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('AppHeader', () => {
  it('워드마크를 렌더하고 랜딩(entry)으로 링크한다', () => {
    const wrapper = mountHeader()

    const wordmark = wrapper.findAllComponents(RouterLinkStub)[0]!
    expect(wordmark.text()).toBe('포토로얄')
    expect(wordmark.props('to')).toEqual({ name: 'entry' })
  })

  it('showProfileLink가 없으면 프로필 진입 링크를 렌더하지 않는다', () => {
    const wrapper = mountHeader()

    expect(wrapper.find('[aria-label="프로필 관리"]').exists()).toBe(false)
  })

  it('showProfileLink면 profile로 가는 프로필 진입 링크를 렌더한다', () => {
    const wrapper = mountHeader({ showProfileLink: true })

    const profileLink = wrapper
      .findAllComponents(RouterLinkStub)
      .find((link) => link.attributes('aria-label') === '프로필 관리')!
    expect(profileLink).toBeDefined()
    expect(profileLink.props('to')).toEqual({ name: 'profile' })
  })
})
