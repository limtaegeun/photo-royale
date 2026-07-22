import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoundAssignmentCard from '../components/RoundAssignmentCard.vue'

type Props = InstanceType<typeof RoundAssignmentCard>['$props']

function mountCard(overrides: Partial<Props> = {}) {
  const props: Props = {
    round: 1,
    armband: 'A', // A는 blue 그룹
    members: [
      { id: 'me', name: '오리' },
      { id: 'u2', name: '하린' },
    ],
    myId: 'me',
    isXTeam: false,
    ...overrides,
  }
  return mount(RoundAssignmentCard, { props })
}

describe('RoundAssignmentCard', () => {
  it('라운드 제목을 렌더한다', () => {
    const wrapper = mountCard({ round: 2 })
    expect(wrapper.text()).toContain('라운드 2 배정')
  })

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
})
