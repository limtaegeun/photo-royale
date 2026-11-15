import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoundAssignmentCard from '../components/RoundAssignmentCard.vue'

type Props = InstanceType<typeof RoundAssignmentCard>['$props']

function mountCard(overrides: Partial<Props> = {}) {
  const props: Props = {
    armband: 'A', // A는 blue 그룹
    members: [
      { id: 'me', name: '오리', isReady: false },
      { id: 'u2', name: '하린', isReady: false },
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

  it('멤버마다 준비 상태를 색과 글자로 함께 보인다', () => {
    const wrapper = mountCard({
      members: [
        { id: 'me', name: '오리', isReady: false },
        { id: 'u2', name: '하린', isReady: true },
      ],
    })

    const [me, teammate] = wrapper.findAll('li[data-me]')
    expect(me!.find('[data-ready]').text()).toBe('대기 중')
    expect(me!.find('[data-ready]').attributes('data-tone')).toBe('neutral')
    expect(teammate!.find('[data-ready]').text()).toBe('준비 완료')
    expect(teammate!.find('[data-ready]').attributes('data-tone')).toBe('success')
  })

  it('긴 닉네임은 이름만 줄이고 (나)는 줄임 대상에서 뺀다', () => {
    const wrapper = mountCard({
      members: [{ id: 'me', name: '바람부는날에사진찍는사람', isReady: false }],
    })

    const nameParts = wrapper.findAll('[data-me="true"] .truncate')
    expect(nameParts.map((part) => part.text())).toEqual(['바람부는날에사진찍는사람'])
    expect(wrapper.text()).toContain('바람부는날에사진찍는사람(나)')
  })

  it('1인 팀이면 체력·점수 2배 문구를 표시한다 — 노션 ② 기본 규칙 5와 같은 말', () => {
    const wrapper = mountCard({ members: [{ id: 'me', name: '오리', isReady: false }] })

    expect(wrapper.text()).toContain('1인 팀 · 체력과 점수 2배')
  })

  it('X 팀이면 특수 완장 X 안내를 표시한다', () => {
    const wrapper = mountCard({ isXTeam: true })

    expect(wrapper.text()).toContain('특수 완장 X')
    expect(wrapper.text()).toContain('X끼리만 서로 사냥할 수 있어요')
  })

  it('왕잡기의 왕 팀은 X 완장 대신 비밀 왕 안내를 보인다 — 노션 ② "그룹마다 몰래 왕을 1명 정해요"', () => {
    const wrapper = mountCard({ isXTeam: true, gameMode: 'king-hunt' })

    expect(wrapper.text()).toContain('비밀 왕')
    expect(wrapper.text()).toContain('우리 팀이 그룹의 왕이에요. 다른 그룹에는 비밀이에요.')
    expect(wrapper.text()).toContain('잡히면 그룹 전체가 즉시 아웃돼요.')
    expect(wrapper.text()).not.toContain('특수 완장 X')
    expect(wrapper.text()).not.toContain('X끼리만')
  })

  it('왕잡기에서 왕이 아닌 팀은 우리 그룹 왕을 안내받는다 — 같은 그룹에만 알린다', () => {
    const wrapper = mountCard({ gameMode: 'king-hunt', groupKingArmband: 'E' })

    const notice = wrapper.find('[data-group-king]')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('우리 그룹 왕 · 팀 E')
    expect(notice.text()).toContain('다른 그룹에는 비밀이에요.')
    expect(notice.text()).toContain('왕을 꼭 지키세요.')
  })

  it('왕 안내가 없으면(다른 모드·왕 팀) 그룹 왕 줄을 그리지 않는다', () => {
    expect(mountCard().find('[data-group-king]').exists()).toBe(false)
    expect(
      mountCard({ isXTeam: true, gameMode: 'king-hunt', groupKingArmband: 'E' }).find('[data-group-king]').exists(),
    ).toBe(false)
  })

  it('규칙 설명서는 카드에 넣지 않는다 — 페이지가 지도와 함께 카드 아래에 붙인다', () => {
    const wrapper = mountCard({ armband: 'A' })

    expect(wrapper.text()).not.toContain('규칙 설명서')
    expect(wrapper.text()).not.toContain('이번 게임 규칙서')
  })

  it('X 팀이 아니면 X 안내를 노출하지 않는다', () => {
    const wrapper = mountCard({ isXTeam: false })
    expect(wrapper.text()).not.toContain('특수 완장 X')
  })

  it('1인 팀이 X를 겸직해도 1인 팀 문구와 X 안내가 함께 표시된다(1인 팀도 X 겸직 가능 — 2026-07-24 결정)', () => {
    const wrapper = mountCard({
      members: [{ id: 'me', name: '오리', isReady: false }],
      isXTeam: true,
    })

    expect(wrapper.text()).toContain('1인 팀 · 체력과 점수 2배')
    expect(wrapper.text()).toContain('특수 완장 X')
    expect(wrapper.text()).toContain('X끼리만 서로 사냥할 수 있어요')
  })
  it('수동 편집으로 3인 팀이 되면 인원수를 그대로 표기한다(2인 1조로 오표기하지 않는다)', () => {
    const wrapper = mountCard({
      members: [
        { id: 'me', name: '오리', isReady: false },
        { id: 'u2', name: '하린', isReady: false },
        { id: 'u3', name: '도윤', isReady: false },
      ],
    })

    // 구성 요약 줄이 '3인 팀'이다
    expect(wrapper.text()).toContain('· 3인 팀')
    expect(wrapper.text()).not.toContain('· 2인 1조')
    expect(wrapper.text()).not.toContain('1인 팀 · 체력과 점수 2배')
  })
})
