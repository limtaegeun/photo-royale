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

  it('규칙서(헤더·모드 배지·기본 규칙)를 렌더한다', () => {
    const wrapper = mountCard({ armband: 'A' })

    expect(wrapper.text()).toContain('이번 게임 규칙서')
    expect(wrapper.text()).toContain('일반전')
    expect(wrapper.text()).toContain('팀은 2인 1조입니다.')
    expect(wrapper.text()).toContain('팀원과 2m 안에서 함께 이동하세요.')
    expect(wrapper.text()).toContain('그룹은 완장 색깔입니다.')
    expect(wrapper.text()).toContain('이번 라운드는 파랑 그룹입니다.')
    expect(wrapper.text()).toContain('상대 완장 알파벳을 찍어 제출하세요.')
  })

  it('X 팀이 아니면 X 규칙을 노출하지 않는다', () => {
    const wrapper = mountCard({ isXTeam: false })
    expect(wrapper.text()).not.toContain('특수 완장 X')
  })

  it('꼬리잡기 모드는 모드 배지·구성·정적 규칙(캡션 포함)을 렌더한다', () => {
    const wrapper = mountCard({ gameMode: 'tail-chase' })

    // 모드 배지가 꼬리잡기로 바뀐다(일반전이 아니다)
    expect(wrapper.text()).toContain('꼬리잡기')
    expect(wrapper.text()).not.toContain('일반전')
    // composition 항목은 그대로 재현된다
    expect(wrapper.text()).toContain('팀은 2인 1조입니다.')
    // static + caption
    expect(wrapper.text()).toContain('바로 다음 알파벳만 사냥할 수 있습니다.')
    expect(wrapper.text()).toContain('A는 B만, Z는 A를 사냥합니다.')
    expect(wrapper.text()).toContain('잡히면 완장을 떼고 잡은 팀의 꼬리로 편입됩니다.')
    // 꼬리잡기는 group 규칙이 없으므로 그룹 문구가 없다
    expect(wrapper.text()).not.toContain('그룹은 완장 색깔입니다.')
  })

  it('스태프 추격전 모드는 composition 없이 정적 2항목만 렌더한다', () => {
    const wrapper = mountCard({ gameMode: 'staff-chase' })

    expect(wrapper.text()).toContain('스태프 추격전')
    expect(wrapper.text()).toContain('모든 참가자는 동맹입니다. 사냥꾼(스태프)을 피해 생존하세요.')
    expect(wrapper.text()).toContain('제한 시간까지 생존한 인원에 비례해 전체 점수를 얻습니다.')
    // composition·group 규칙이 없다
    expect(wrapper.text()).not.toContain('팀은 2인 1조입니다.')
    expect(wrapper.text()).not.toContain('그룹은 완장 색깔입니다.')

    // 규칙서 목록은 정확히 2개다
    const items = wrapper.findAll('ol > li')
    expect(items).toHaveLength(2)
  })

  it('X 모듈 규칙은 모드 규칙 뒤에 이어지는 번호로 붙는다', () => {
    // normal은 규칙 3개 → X가 켜지면 4번째로 붙는다
    const wrapper = mountCard({ gameMode: 'normal', isXTeam: true })

    const items = wrapper.findAll('ol > li')
    expect(items).toHaveLength(4)
    const xItem = items[3]!
    expect(xItem.find('span').text()).toBe('4')
    expect(xItem.text()).toContain('특수 완장 X — X끼리만 서로 사냥할 수 있습니다.')
  })
})
