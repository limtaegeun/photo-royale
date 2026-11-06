import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TeamDial from '../components/TeamDial.vue'
import type { DialTeam } from '../teamSections'

const WHEEL_HEIGHT = 220
const ROW_HEIGHT = 44

function team(armband: string, mark: string | null = null): DialTeam {
  return {
    armband,
    members: [`${armband}1`, `${armband}2`],
    memberNames: `${armband}1 · ${armband}2`,
    participantUid: `${armband}1`,
    mark,
  }
}

const mounted: VueWrapper[] = []

function mountDial(teams: DialTeam[], picked: string | null = null): VueWrapper {
  const wrapper = mount(TeamDial, {
    props: { teams, hint: '돌려서 팀 고르기', density: 'compact' as const, modelValue: picked },
  })
  mounted.push(wrapper)
  return wrapper
}

function lastEmit(wrapper: VueWrapper, name: string) {
  return wrapper.emitted(name)?.slice(-1)[0]
}

describe('TeamDial', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // jsdom에는 레이아웃이 없다 — 시안의 390×844 값을 준다
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'listbox' ? WHEEL_HEIGHT : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ROW_HEIGHT)
    Element.prototype.scrollTo = vi.fn<(options?: ScrollToOptions) => void>() as unknown as Element['scrollTo']
  })

  afterEach(() => {
    for (const wrapper of mounted.splice(0)) wrapper.unmount()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** 스크롤해서 그 줄이 가운데 띠에 온 상태를 만든다 */
  async function scrollToRowIndex(wrapper: VueWrapper, rowIndex: number) {
    const wheel = wrapper.get('[role="listbox"]').element
    wheel.scrollTop = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2 - WHEEL_HEIGHT / 2 + padOf(wrapper)
    await wrapper.get('[role="listbox"]').trigger('scroll')
  }

  function padOf(wrapper: VueWrapper) {
    const pad = wrapper.find<HTMLElement>('[role="listbox"] > [aria-hidden="true"]:not([data-dial-row])')
    return pad.exists() ? Number.parseFloat(pad.element.style.height) : 0
  }

  it('화면에 다 들어가면 한 벌만 깔고 위아래를 비워 첫 줄과 끝 줄도 가운데 올 수 있게 한다', async () => {
    const wrapper = mountDial([team('A'), team('B')])
    await flushPromises()

    expect(wrapper.findAll('[data-dial-row]')).toHaveLength(3)
    expect(padOf(wrapper)).toBe((WHEEL_HEIGHT - ROW_HEIGHT) / 2)
  })

  it('화면보다 줄이 많으면 원통으로 다섯 벌 깔고 가운데 묶음만 낭독기에 알린다', async () => {
    const wrapper = mountDial(['A', 'B', 'C', 'D', 'E', 'F'].map((armband) => team(armband)))
    await flushPromises()

    expect(wrapper.findAll('[data-dial-row]')).toHaveLength(35)
    expect(wrapper.findAll('[data-dial-row]:not([aria-hidden])')).toHaveLength(7)
    expect(padOf(wrapper)).toBe(0)
  })

  it('돌리는 동안에는 고른 값이 없고 멈춰야 고른다', async () => {
    const wrapper = mountDial([team('A'), team('B')])
    await flushPromises()

    await scrollToRowIndex(wrapper, 2)
    expect(lastEmit(wrapper, 'update:moving')).toEqual([true])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    vi.advanceTimersByTime(129)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    vi.advanceTimersByTime(1)
    expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['B'])
    expect(lastEmit(wrapper, 'update:moving')).toEqual([false])
  })

  it('손가락이 닿아 있으면 스크롤이 멎어도 고르지 않고, 떼야 고른다', async () => {
    const wrapper = mountDial([team('A'), team('B')])
    await flushPromises()
    const wheel = wrapper.get('[role="listbox"]')

    await wheel.trigger('touchstart')
    await scrollToRowIndex(wrapper, 1)
    vi.advanceTimersByTime(500)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wheel.trigger('touchend')
    vi.advanceTimersByTime(130)
    expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['A'])
  })

  it('안내 줄에 멈추면 선택이 풀린다', async () => {
    const wrapper = mountDial([team('A')], 'A')
    await flushPromises()

    await scrollToRowIndex(wrapper, 0)
    vi.advanceTimersByTime(130)

    expect(lastEmit(wrapper, 'update:modelValue')).toEqual([null])
  })

  it('고른 값이 있으면 그 줄이 가운데 오도록 열린다', async () => {
    const wrapper = mountDial([team('A'), team('B')], 'B')
    await flushPromises()

    const wheel = wrapper.get('[role="listbox"]').element
    expect(wheel.scrollTop).toBe(padOf(wrapper) + 2 * ROW_HEIGHT + ROW_HEIGHT / 2 - WHEEL_HEIGHT / 2)
  })

  it('원통의 다른 묶음에서 멈추면 고른 값은 그대로 두고 가운데 묶음의 같은 줄로 옮긴다', async () => {
    const wrapper = mountDial(['A', 'B', 'C', 'D', 'E', 'F'].map((armband) => team(armband)))
    await flushPromises()

    // 첫 묶음의 A(줄 번호 1)
    await scrollToRowIndex(wrapper, 1)
    vi.advanceTimersByTime(130)

    expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['A'])
    const wheel = wrapper.get('[role="listbox"]').element
    // 가운데 묶음(셋째)의 A = 2×7 + 1번째 줄
    expect(wheel.scrollTop).toBe(15 * ROW_HEIGHT + ROW_HEIGHT / 2 - WHEEL_HEIGHT / 2)
  })

  it('줄을 누르면 바로 고르고 그 줄로 돌아간다', async () => {
    const wrapper = mountDial([team('A'), team('B')])
    await flushPromises()

    await wrapper.get('[data-team="B"]').trigger('click')

    expect(lastEmit(wrapper, 'update:modelValue')).toEqual(['B'])
    expect(lastEmit(wrapper, 'update:moving')).toEqual([true])
    expect(Element.prototype.scrollTo).toHaveBeenCalledWith({
      top: padOf(wrapper) + 2 * ROW_HEIGHT + ROW_HEIGHT / 2 - WHEEL_HEIGHT / 2,
      behavior: 'smooth',
    })
  })

  it('잠겨 있으면 눌러도 고르지 않는다', async () => {
    const wrapper = mountDial([team('A')])
    await wrapper.setProps({ locked: true })
    await flushPromises()

    await wrapper.get('[data-team="A"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('[role="listbox"]').attributes('aria-disabled')).toBe('true')
  })

  it('고른 팀이 호출부에서 풀리면 안내 줄로 돌아간다', async () => {
    const wrapper = mountDial([team('A'), team('B')], 'B')
    await flushPromises()

    await wrapper.setProps({ teams: [team('A')], modelValue: null })
    await flushPromises()

    const wheel = wrapper.get('[role="listbox"]').element
    expect(wheel.scrollTop).toBe(padOf(wrapper) + ROW_HEIGHT / 2 - WHEEL_HEIGHT / 2)
    expect(wrapper.find('[data-team="B"]').exists()).toBe(false)
  })

  it('멈춘 줄에 팀 색을 입히고, 돌리는 중에는 입히지 않는다', async () => {
    const wrapper = mountDial([team('A')], 'A')
    await flushPromises()
    expect(wrapper.get('[data-dial-band]').classes()).toContain('bg-team-blue-solid')

    await wrapper.setProps({ moving: true })
    expect(wrapper.get('[data-dial-band]').classes()).toContain('bg-surface')
  })

  it('표시가 있는 팀은 줄과 낭독기에 함께 알린다', async () => {
    const wrapper = mountDial([team('A', '왕')])
    await flushPromises()

    expect(wrapper.get('[data-team="A"]').text()).toContain('왕')
    expect(wrapper.get('[data-team="A"]').attributes('aria-label')).toBe('team A A1, A2, 왕')
  })
})
