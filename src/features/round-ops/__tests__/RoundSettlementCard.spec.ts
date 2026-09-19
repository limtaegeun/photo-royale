import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoundSettlementCard from '../components/RoundSettlementCard.vue'

describe('RoundSettlementCard', () => {
  it('등급별 포인트와 이름을 1등급부터 보여 주고 0점은 마지막에 둔다', () => {
    const wrapper = mount(RoundSettlementCard, {
      props: {
        groups: [
          { tier: 1, points: 10, uids: ['u1', 'u2'], names: ['서연', '도윤'] },
          { tier: 2, points: 7, uids: ['u3'], names: ['하늘'] },
          { tier: 0, points: 1, uids: ['u4', 'u5'], names: ['준호', '나간 참가자'] },
        ],
      },
    })

    const items = wrapper.findAll('li')
    expect(items).toHaveLength(3)
    expect(items[0]!.text()).toContain('1등급 · 10P')
    expect(items[0]!.text()).toContain('서연, 도윤')
    expect(items[1]!.text()).toContain('2등급 · 7P')
    expect(items[2]!.text()).toContain('0점 이하 · 1P')
    expect(items[2]!.text()).toContain('준호, 나간 참가자')
    expect(wrapper.text()).toContain('종료하면 확정돼요')
  })
})
