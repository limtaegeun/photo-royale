import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StandingsCard, { type StandingRow } from '../components/StandingsCard.vue'

function row(rank: number, uid: string, points: number, overrides: Partial<StandingRow> = {}): StandingRow {
  return {
    uid,
    rank,
    points,
    rawScore: points * 3,
    firstTierCount: 0,
    rounds: [{ roundNo: 1, tier: 1, points }],
    name: uid,
    isMe: false,
    ...overrides,
  }
}

const EIGHT = [
  row(1, '가', 17),
  row(2, '나', 15),
  row(3, '다', 11),
  row(4, '라', 8),
  row(5, '마', 8),
  row(6, '바', 5),
  row(7, '사', 3, { isMe: true }),
  row(8, '아', 1),
]

describe('StandingsCard', () => {
  it('상위 5명만 카드에 보이고 전체는 시트 트리거 뒤로 강등된다', () => {
    const wrapper = mount(StandingsCard, {
      props: { rows: EIGHT, settledRoundCount: 2 },
    })

    const topList = wrapper.find('ol[aria-label="상위 순위"]')
    expect(topList.findAll('li')).toHaveLength(5)
    expect(topList.text()).toContain('가')
    expect(topList.text()).not.toContain('바')
    expect(wrapper.text()).toContain('2라운드 정산')
    expect(wrapper.text()).toContain('전체 보기 (8명)')
  })

  it('내가 상위권 밖이면 내 줄을 구분선 아래 따로 붙인다', () => {
    const wrapper = mount(StandingsCard, {
      props: { rows: EIGHT, settledRoundCount: 2 },
    })

    const mine = wrapper.find('[aria-current="true"]')
    expect(mine.text()).toContain('7')
    expect(mine.text()).toContain('사')
    expect(mine.text()).toContain('(나)')
    expect(mine.text()).toContain('3P')
  })

  it('내가 상위권 안이면 그 줄을 강조하고 따로 붙이지 않는다', () => {
    const rows = EIGHT.map((entry) =>
      entry.uid === '사' ? { ...entry, isMe: false } : entry.uid === '나' ? { ...entry, isMe: true } : entry,
    )
    const wrapper = mount(StandingsCard, { props: { rows, settledRoundCount: 2 } })

    const current = wrapper.findAll('[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0]!.element.tagName).toBe('LI')
    expect(current[0]!.text()).toContain('나 (나)')
  })

  it('5명 이하이고 라운드가 하나면 전체 보기 시트를 두지 않는다', () => {
    const wrapper = mount(StandingsCard, {
      props: { rows: EIGHT.slice(0, 3), settledRoundCount: 1 },
    })

    expect(wrapper.text()).not.toContain('전체 보기')
  })
})
