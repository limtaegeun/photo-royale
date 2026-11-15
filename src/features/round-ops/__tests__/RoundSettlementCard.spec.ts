import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RoundSettlementCard from '../components/RoundSettlementCard.vue'

describe('RoundSettlementCard', () => {
  it('점수와 이름을 높은 점수부터 보여 준다 — 이 점수가 그대로 누적 순위에 더해진다', () => {
    const wrapper = mount(RoundSettlementCard, {
      props: {
        groups: [
          { score: 40, uids: ['u1', 'u2'], names: ['서연', '도윤'] },
          { score: 10, uids: ['u3'], names: ['하늘'] },
          { score: 0, uids: ['u4', 'u5'], names: ['준호', '나간 참가자'] },
        ],
      },
    })

    const items = wrapper.findAll('li')
    expect(items).toHaveLength(3)
    expect(items[0]!.text()).toContain('40점')
    expect(items[0]!.text()).toContain('서연, 도윤')
    expect(items[1]!.text()).toContain('10점')
    expect(items[2]!.text()).toContain('0점')
    expect(items[2]!.text()).toContain('준호, 나간 참가자')
    expect(wrapper.text()).not.toContain('등급')
    expect(wrapper.text()).not.toContain('P')
    expect(wrapper.text()).toContain('종료하면 확정돼요')
  })
})
