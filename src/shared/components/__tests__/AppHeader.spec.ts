import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import type { RouteLocationRaw } from 'vue-router'
import AppHeader from '../AppHeader.vue'

function mountHeader(
  props: {
    title?: string
    description?: string
    backTo?: RouteLocationRaw
    backLabel?: string
    showBackButton?: boolean
    showProfileLink?: boolean
  } = {},
) {
  return mount(AppHeader, {
    props,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('AppHeader', () => {
  it('title이 없으면 기본 워드마크(포토로얄)를 h1으로 렌더한다', () => {
    const wrapper = mountHeader()

    expect(wrapper.find('h1').text()).toBe('포토로얄')
  })

  it('title이 있으면 페이지 타이틀을 h1으로 렌더한다', () => {
    const wrapper = mountHeader({ title: '대기실' })

    expect(wrapper.find('h1').text()).toBe('대기실')
  })

  it('description이 없으면 설명 문단을 렌더하지 않는다', () => {
    const wrapper = mountHeader()

    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('description이 있으면 타이틀 아래 설명을 렌더한다', () => {
    const wrapper = mountHeader({ description: '카메라로 즐기는 실시간 팀 서바이벌' })

    expect(wrapper.find('p').text()).toBe('카메라로 즐기는 실시간 팀 서바이벌')
  })

  it('backTo가 없으면 이탈 링크를 렌더하지 않는다', () => {
    const wrapper = mountHeader()

    expect(wrapper.find('[aria-label="뒤로"]').exists()).toBe(false)
  })

  it('backTo가 있으면 그 목적지로 가는 이탈 링크를 렌더한다', () => {
    const wrapper = mountHeader({ backTo: { name: 'entry' }, backLabel: '홈으로' })

    const backLink = wrapper
      .findAllComponents(RouterLinkStub)
      .find((link) => link.attributes('aria-label') === '홈으로')!
    expect(backLink).toBeDefined()
    expect(backLink.props('to')).toEqual({ name: 'entry' })
  })

  it('backLabel이 없으면 이탈 링크의 접근성 라벨은 기본값(뒤로)이다', () => {
    const wrapper = mountHeader({ backTo: { name: 'entry' } })

    expect(wrapper.find('[aria-label="뒤로"]').exists()).toBe(true)
  })

  it('showBackButton이면 이탈 링크 대신 같은 자리에 뒤로 버튼을 렌더하고 누르면 back을 알린다', async () => {
    const wrapper = mountHeader({
      backTo: { name: 'entry' },
      backLabel: '대기실로',
      showBackButton: true,
    })

    // 페이지 안 하위 화면을 닫는 버튼이 우선한다 — 라우트로 가는 링크는 함께 뜨지 않는다
    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(0)
    const backButton = wrapper.find('button[aria-label="대기실로"]')
    expect(backButton.exists()).toBe(true)

    await backButton.trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
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
