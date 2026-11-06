import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/shared/api/firebase', () => ({ db: {}, auth: {} }))

import TailChaseObjectiveCard from '../components/TailChaseObjectiveCard.vue'
import type { TailChaseObjective } from '../tailChaseObjective'

const HUNTING: TailChaseObjective = {
  role: 'hunter',
  team: 'B',
  chaser: 'A',
  prey: 'C',
  preyLivesLeft: null,
  tailCount: 0,
}

function mountCard(
  objective: TailChaseObjective = HUNTING,
  overrides: Partial<InstanceType<typeof TailChaseObjectiveCard>['$props']> = {},
) {
  return mount(TailChaseObjectiveCard, {
    props: {
      objective,
      modeLabel: '꼬리잡기',
      teamCountLabel: '생존 5 / 5팀',
      teammateLabel: '팀원 민준',
      remainingTime: '12:34',
      isTimerWarning: false,
      isRoundEnded: false,
      ...overrides,
    },
  })
}

describe('TailChaseObjectiveCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('기본 — 쫓는 팀, 우리 팀, 잡을 팀을 색 이름과 함께 보여 준다', () => {
    const text = mountCard().text()
    expect(text).toContain('목표')
    expect(text).toContain('꼬리잡기 · 생존 5 / 5팀')
    expect(text).toContain('12:34')
    expect(text).toContain('쫓는 팀파랑')
    expect(text).toContain('우리 팀팀원 민준')
    expect(text).toContain('잡을 팀초록')
    expect(text).not.toContain('꼬리 0명')
  })

  it('잡을 팀 타일만 한 단계 크게 그린다', () => {
    const wrapper = mountCard()
    const tile = (armband: string) =>
      wrapper.findAll('span').find((node) => node.text() === armband && node.classes('rounded-md'))
    expect(tile('A')!.classes()).toContain('size-10')
    expect(tile('B')!.classes()).toContain('size-10')
    expect(tile('C')!.classes()).toContain('size-12')
  })

  it('쫓는 팀은 테두리, 우리 팀과 잡을 팀은 채운 타일이다', () => {
    const wrapper = mountCard()
    const tile = (armband: string) =>
      wrapper.findAll('span').find((node) => node.text() === armband && node.classes('rounded-md'))
    expect(tile('A')!.classes()).toEqual(expect.arrayContaining(['border-2', 'border-team-blue', 'text-team-blue']))
    expect(tile('B')!.classes()).toEqual(expect.arrayContaining(['bg-team-orange-solid', 'text-on-team-orange']))
    expect(tile('C')!.classes()).toEqual(expect.arrayContaining(['bg-team-green-solid', 'text-on-team-green']))
  })

  it('꼬리가 있으면 머리줄에 인원을 붙인다', () => {
    const text = mountCard({ ...HUNTING, tailCount: 2 }).text()
    expect(text).toContain('꼬리잡기 · 생존 5 / 5팀 · 꼬리 2명')
  })

  it('잡을 팀이 바뀌면 새 목표 배지를 보여 주고 30초 뒤 목표로 돌아간다', async () => {
    const wrapper = mountCard()
    await wrapper.setProps({ objective: { ...HUNTING, prey: 'D' } })
    expect(wrapper.text()).toContain('새 목표')
    vi.advanceTimersByTime(29_999)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('새 목표')
    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('새 목표')
    expect(wrapper.text()).toContain('목표')
  })

  it('잡을 팀이 그대로면 원장이 갱신돼도 새 목표 시간을 건드리지 않는다', async () => {
    const wrapper = mountCard()
    await wrapper.setProps({ objective: { ...HUNTING, prey: 'D' } })
    vi.advanceTimersByTime(20_000)
    await wrapper.setProps({ objective: { ...HUNTING, prey: 'D', tailCount: 2 } })
    expect(wrapper.text()).toContain('새 목표')
    vi.advanceTimersByTime(10_000)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('새 목표')
  })

  it('처음 그릴 때는 새 목표가 아니다', () => {
    expect(mountCard().text()).not.toContain('새 목표')
  })

  it('1인 팀이 한 번 잡히면 색 이름 대신 남은 목숨을 보여 준다', () => {
    const text = mountCard({ ...HUNTING, preyLivesLeft: 1 }).text()
    expect(text).toContain('잡을 팀목숨 1')
    expect(text).not.toContain('초록')
  })

  it('둘만 남으면 쫓는 팀 칸 없이 맞대결로 보여 준다', () => {
    const text = mountCard({ ...HUNTING, chaser: 'D', prey: 'D', tailCount: 2 }).text()
    expect(text).toContain('맞대결')
    expect(text).toContain('우리 팀팀원 민준')
    expect(text).toContain('잡을 팀빨강')
    expect(text).not.toContain('쫓는 팀')
  })

  it('마지막 생존이면 사슬 대신 마지막 생존 팀이라고 적는다', () => {
    const text = mountCard({ ...HUNTING, chaser: null, prey: null, tailCount: 8 }).text()
    expect(text).toContain('꼬리 8명')
    expect(text).toContain('마지막 생존 팀')
    expect(text).toContain('잡을 팀 없음')
    expect(text).not.toContain('쫓는 팀')
  })

  it('잡힌 뒤에는 꼬리 배지와 합류한 팀 기준 사슬, 촬영 불가 안내를 보여 준다', () => {
    const wrapper = mountCard({ role: 'tail', team: 'B', chaser: 'A', prey: 'D', preyLivesLeft: null, tailCount: 0 })
    const text = wrapper.text()
    expect(text).toContain('꼬리')
    expect(text).toContain('합류한 팀주황')
    expect(text).toContain('B팀 목표빨강')
    expect(wrapper.find('[role="status"]').text()).toBe('촬영 불가 · B팀이 잡으면 점수 공유')
    expect(text).not.toContain('우리 팀')
    expect(text).not.toContain('팀원 민준')
  })

  it('잡혀서 꼬리가 된 순간은 새 목표로 치지 않는다', async () => {
    const wrapper = mountCard()
    await wrapper.setProps({
      objective: { role: 'tail', team: 'A', chaser: 'E', prey: 'C', preyLivesLeft: null, tailCount: 0 },
    })
    expect(wrapper.text()).not.toContain('새 목표')
  })

  it('합류한 팀이 마지막이면 점수 공유 문구 없이 촬영 불가만 남긴다', () => {
    const wrapper = mountCard({ role: 'tail', team: 'B', chaser: null, prey: null, preyLivesLeft: null, tailCount: 0 })
    expect(wrapper.text()).toContain('마지막 생존 팀')
    expect(wrapper.find('[role="status"]').text()).toBe('촬영 불가')
  })

  it('라운드가 끝나면 사슬을 치우고 안내를 보여 준다', () => {
    const wrapper = mountCard(HUNTING, { isRoundEnded: true, isTimerWarning: true, remainingTime: '00:00' })
    const text = wrapper.text()
    expect(text).toContain('라운드가 종료됐어요. 진행자 안내를 기다려 주세요.')
    expect(text).not.toContain('잡을 팀')
    expect(wrapper.find('[aria-label="게임 남은 시간"]').classes()).toContain('text-warning')
  })
})
