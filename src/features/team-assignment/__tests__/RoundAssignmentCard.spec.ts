import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoundAssignmentCard from '../components/RoundAssignmentCard.vue'

type Props = InstanceType<typeof RoundAssignmentCard>['$props']

function mountCard(overrides: Partial<Props> = {}) {
  const props: Props = {
    armband: 'A', // A는 blue 그룹
    members: [
      { id: 'me', name: '오리' },
      { id: 'u2', name: '하린' },
    ],
    myId: 'me',
    isXTeam: false,
    gameMode: 'normal',
    ...overrides,
  }
  return mount(RoundAssignmentCard, { props })
}

describe('RoundAssignmentCard', () => {
  // 페이지 타이틀('라운드 N 배정')은 앱 셸 헤더(AppHeader)가 담당하므로 카드는 자체 h1을 두지 않는다.
  // 헤더 오버라이드 검증은 WaitingRoomPage 테스트가 담당한다.

  it('완장 알파벳과 그룹 라벨(한글·영문)을 그룹 색으로 표기한다', () => {
    const wrapper = mountCard({ armband: 'A' })

    expect(wrapper.text()).toContain('파랑 완장 A')
    expect(wrapper.text()).toContain('그룹 BLUE · 2인 1조')
    // 완장 타일 알파벳이 그룹 색(text-team-blue)으로 크게 렌더된다
    expect(wrapper.find('.text-display.text-team-blue').text()).toBe('A')
  })

  it('본인 멤버는 이름 뒤에 (나)를 붙여 강조한다', () => {
    const wrapper = mountCard()

    expect(wrapper.text()).toContain('오리(나)')
    expect(wrapper.text()).toContain('하린')
    expect(wrapper.find('[data-me="true"]').exists()).toBe(true)
  })

  it('1인 팀이면 목숨·포인트 2배 문구를 표시한다', () => {
    const wrapper = mountCard({ members: [{ id: 'me', name: '오리' }] })

    expect(wrapper.text()).toContain('1인 팀 · 목숨과 포인트 2배')
    expect(wrapper.text()).toContain('1인 팀입니다.')
    expect(wrapper.text()).toContain('목숨과 포인트가 2배입니다.')
  })

  it('X 팀이면 특수 완장 X 안내와 규칙을 추가로 표시한다', () => {
    const wrapper = mountCard({ isXTeam: true })

    expect(wrapper.text()).toContain('특수 완장 X')
    expect(wrapper.text()).toContain('X끼리만 서로 사냥할 수 있어요')
    expect(wrapper.text()).toContain('X끼리만 서로 사냥할 수 있습니다.')
  })

  // 모드별 규칙서 내용(꼬리잡기·스태프 추격전·X 번호 매김 등)은 game-mode 기능의
  // GameModeRulebook.spec.ts가 직접 검증한다. 여기서는 카드가 배정 컨텍스트(모드·팀 구성·
  // 그룹 색)를 규칙서에 올바르게 연결하는지만 통합 수준으로 확인한다.
  it('규칙서(헤더·모드 배지·배정 컨텍스트 규칙)를 렌더한다', () => {
    const wrapper = mountCard({ armband: 'A' })

    expect(wrapper.text()).toContain('이번 게임 규칙서')
    expect(wrapper.text()).toContain('일반전')
    expect(wrapper.text()).toContain('팀은 2인 1조입니다.')
    expect(wrapper.text()).toContain('그룹은 완장 색깔입니다.')
    // 완장(A=파랑)에서 파생한 그룹 컨텍스트가 규칙서 문구·색으로 이어진다
    expect(wrapper.text()).toContain('이번 라운드는 파랑 그룹입니다.')
    expect(wrapper.find('ol .text-team-blue').exists()).toBe(true)
  })

  it('X 팀이 아니면 X 규칙을 노출하지 않는다', () => {
    const wrapper = mountCard({ isXTeam: false })
    expect(wrapper.text()).not.toContain('특수 완장 X')
  })
})
