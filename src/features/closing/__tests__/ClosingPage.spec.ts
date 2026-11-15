import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const pushMock = vi.fn<(to: unknown) => void>()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { roomCode: 'AB2C' } }),
  useRouter: () => ({ push: pushMock }),
}))

const shareTagMock = vi.fn<() => Promise<void>>()
vi.mock('../composables/useInstagramTag', () => ({
  INSTAGRAM_HANDLE: 'photoroyales',
  useInstagramTag: () => ({ shareTag: shareTagMock }),
}))

import ClosingPage from '../ClosingPage.vue'

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  if (!button) throw new Error(`"${text}" 버튼을 찾지 못했다`)
  return button
}

describe('ClosingPage', () => {
  beforeEach(() => {
    pushMock.mockReset()
    shareTagMock.mockReset().mockResolvedValue(undefined)
  })

  it('인사·친구들과 하기·맺음 문구를 기획서 그대로 보여 준다', () => {
    const text = mount(ClosingPage).text()

    expect(text).toContain('오늘 같이 뛰어주셔서 감사합니다')
    expect(text).toContain('어른이 되고 이렇게 뛰어본 거, 얼마 만인가요?')
    expect(text).toContain('낯선 사람과 생기는 우정이었어요.')
    expect(text).toContain('이 게임, 친구들이랑도 할 수 있어요')
    expect(text).toContain('다음엔 여러분이 방장이 되어보세요.')
    expect(text).toContain('응원해주시는 만큼 더 다듬어서 더 재밌는 게임으로 돌아올게요.')
    expect(text).toContain('저희가 꼭 찾아볼게요.')
  })

  it('이용 요금 두 가지를 버튼 아래에 보이고, 아직 없는 로고·배경 기능 안내는 넣지 않는다', () => {
    const wrapper = mount(ClosingPage)
    const pricing = wrapper.get('dl[aria-label="pricing"]')

    expect(pricing.text()).toContain('일반 이용')
    expect(pricing.text()).toContain('3,000원')
    expect(pricing.text()).toContain('상업용')
    expect(pricing.text()).toContain('30,000원')
    expect(wrapper.text()).not.toContain('로고와 배경')
  })

  it('내 방 열어보기는 방을 만들 수 있는 입장 화면으로 보낸다', async () => {
    const wrapper = mount(ClosingPage)

    await findButton(wrapper, '내 방 열어보기').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'entry' })
  })

  it('태그 셔터는 태그 문구를 이름으로 갖고, 누르면 복사하고 인스타그램을 연다', async () => {
    const wrapper = mount(ClosingPage)
    const shutter = wrapper.get('button[aria-labelledby="closing-tag-label"]')

    expect(wrapper.get('#closing-tag-label').text()).toBe('#포토로얄 @photoroyales')
    await shutter.trigger('click')

    expect(shareTagMock).toHaveBeenCalledTimes(1)
  })

  it('내 방 열어보기와 요금은 맺음·태그 뒤, 대기실 버튼 바로 앞 맨 끝에 둔다', () => {
    const wrapper = mount(ClosingPage)
    const buttons = wrapper.findAll('button')
    const order = (button: { element: Element }) =>
      buttons.findIndex((b) => b.element === button.element)

    const shutter = wrapper.get('button[aria-labelledby="closing-tag-label"]')
    const openRoom = findButton(wrapper, '내 방 열어보기')
    const back = findButton(wrapper, '대기실로 돌아가기')

    expect(order(shutter)).toBeLessThan(order(openRoom))
    expect(order(openRoom)).toBe(buttons.length - 2)
    expect(order(back)).toBe(buttons.length - 1)
  })

  it('대기실로 돌아가기는 같은 방의 대기실로 보낸다', async () => {
    const wrapper = mount(ClosingPage)

    await findButton(wrapper, '대기실로 돌아가기').trigger('click')

    expect(pushMock).toHaveBeenCalledWith({ name: 'waiting-room', params: { roomCode: 'AB2C' } })
  })
})
