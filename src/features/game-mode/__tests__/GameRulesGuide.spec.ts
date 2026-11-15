import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GameRulesGuide from '../components/GameRulesGuide.vue'
import { GAME_MODES } from '../registry'
import type { GameModeId } from '../types'

function mountGuide(gameMode: GameModeId = 'normal') {
  return mount(GameRulesGuide, { props: { gameMode } })
}

/** 기본 규칙 칸 제목 버튼 — 번호 순 */
function basicRuleTriggers(wrapper: ReturnType<typeof mountGuide>) {
  return wrapper.find('[data-rules-basic]').findAll('button')
}

describe('GameRulesGuide (노션 ② 규칙 설명서 화면)', () => {
  it('처음 열면 한 줄 요약과 이번 라운드 모드 카드가 먼저 보인다', () => {
    const wrapper = mountGuide('normal')

    expect(wrapper.find('h2').text()).toBe('규칙 설명서')
    expect(wrapper.text()).toContain('다른 팀을 찍으면 킬! 나는 찍히지 않게!')
    const card = wrapper.find('[data-rules-mode-card]')
    // 시안 ModeCard — 머리 띠에 아이콘 칸과 "이번 라운드 모드", 모드 이름
    expect(card.find('[data-rules-mode-icon]').attributes('data-rules-mode-icon')).toBe('target')
    expect(card.find('h3').text()).toBe('일반전')
    expect(card.text()).toContain('이번 라운드 모드')
    expect(card.find('[data-rules-mode-headline]').text()).toBe('개인전: 모든 팀을 전멸시키세요')
    expect(card.text()).toContain('우리 팀 말고는 모두 적이에요.')
    expect(card.text()).toContain('마지막까지 살아남고 많이 잡으세요.')
    expect(card.text()).toContain('X 완장은 특별해요. X끼리만 서로 잡을 수 있어요.')
  })

  it.each(['normal', 'tail-chase', 'group', 'king-hunt', 'staff-chase'] as const)(
    '%s 모드 카드는 그 모드의 노션 원문 줄을 빠짐없이 순서대로 보인다',
    (id) => {
      const card = mountGuide(id).find('[data-rules-mode-card]')
      const { ruleCard, label } = GAME_MODES[id]

      expect(card.text()).toContain(label)
      expect(card.findAll('li').map((li) => li.text())).toEqual([...ruleCard.lines])
      expect(card.find('[data-rules-mode-headline]').exists()).toBe(ruleCard.headline !== undefined)
    },
  )

  it('굵은 첫 줄은 노션에 있는 모드(일반전·스태프 추격전)만 보인다', () => {
    expect(mountGuide('staff-chase').find('[data-rules-mode-headline]').text()).toBe(
      '추격전: 3분동안 헌터로부터 살아남으세요',
    )
    expect(mountGuide('king-hunt').find('[data-rules-mode-headline]').exists()).toBe(false)
  })

  it('기본 규칙 5개는 제목만 보이고 접혀 있다 — 노션 원문 제목 그대로', () => {
    const wrapper = mountGuide()

    const triggers = basicRuleTriggers(wrapper)
    expect(triggers.map((trigger) => trigger.text())).toEqual([
      '1짝꿍과 2인 1조예요',
      '2완장을 찍으면 킬이에요',
      '3이럴 땐 인정되지 않아요',
      '4체력은 하트 1개예요',
      '5점수는 이렇게 쌓여요',
    ])
    for (const trigger of triggers) expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).not.toContain('짝꿍과 같이 움직여요.')
  })

  it('기본 규칙을 누르면 노션 원문 본문이 펼쳐진다', async () => {
    const wrapper = mountGuide()
    const triggers = basicRuleTriggers(wrapper)

    for (const trigger of triggers) await trigger.trigger('click')

    const text = wrapper.find('[data-rules-basic]').text()
    for (const line of [
      '짝꿍과 같이 움직여요.',
      '다른 팀 완장의 색과 알파벳이 또렷하게 보이게 찍어요.',
      '찍은 다음 어느 팀을 찍었는지 고르고 제출해요.',
      'GM이 사진을 보고 인정하면 킬이 돼요.',
      '미식별',
      '흔들리거나 가려서 누군지 안 보여요.',
      '불일치',
      '킬할 수 없는 팀의 완장이에요.',
      '한발늦음',
      '다른 팀이 먼저 잡았어요.',
      '킬샷을 맞으면 DEAD예요. 바로 베이스캠프로 돌아가요.',
      'DEAD가 된 라운드에서는 사진을 더 낼 수 없어요.',
      '베이스캠프에서는 마음껏 구경해도 됩니다.',
      '킬샷 1번에 +10점이에요.',
      '한 판은 20분, 모두 3판을 해요. 세 판 점수를 더해 우승자를 정해요.',
      '짝꿍이 오지 않아 혼자 남은 팀은 체력과 점수가 2배예요.',
    ]) {
      expect(text).toContain(line)
    }
  })

  it('시안대로 4번은 하트 줄, 5번은 숫자 칸을 본문 위에 보인다 — 노션 본문 줄은 그대로 남긴다', async () => {
    const wrapper = mountGuide()
    const triggers = basicRuleTriggers(wrapper)
    await triggers[3]!.trigger('click')
    await triggers[4]!.trigger('click')

    const hearts = wrapper.find('[data-rules-hearts]')
    expect(hearts.findAll('svg')).toHaveLength(1)
    expect(hearts.text()).toBe('하트 1개')
    const stats = wrapper.find('[data-rules-stats]')
    expect(stats.findAll('dd').map((dd) => dd.text())).toEqual(['+10', '20분', '3판'])
    expect(stats.findAll('dt').map((dt) => dt.text())).toEqual(['킬샷 1번', '한 판', '점수 합산'])
    expect(wrapper.text()).toContain('킬샷 1번에 +10점이에요.')
  })

  it('모드마다 시안의 선 아이콘을 그린다', () => {
    const icons = (['normal', 'tail-chase', 'group', 'king-hunt', 'staff-chase'] as const).map((id) =>
      mountGuide(id).find('[data-rules-mode-icon]').attributes('data-rules-mode-icon'),
    )
    expect(icons).toEqual(['target', 'tail', 'group', 'crown', 'timer'])
  })

  it('노션에 없는 규칙(킬샷 과열)은 넣지 않는다', async () => {
    const wrapper = mountGuide()
    for (const trigger of basicRuleTriggers(wrapper)) await trigger.trigger('click')

    expect(wrapper.text()).not.toContain('과열')
  })

  it('금지 행동 6개는 접지 않고 항상 보인다', () => {
    const section = mountGuide().find('[data-rules-forbidden]')

    expect(section.text()).toContain('이것만은 하지 말아요')
    expect(section.text()).toContain('이 게임은 서로를 믿어야 돌아가요.')
    expect(section.findAll('li svg')).toHaveLength(6)
    expect(section.findAll('li').map((li) => li.text().trim())).toEqual([
      '카메라 렌즈 가리기',
      '완장 숨기고 걷기',
      '벽에 딱 붙어서 완장 막기',
      '영상으로 찍고 캡처해서 내기',
      '몰래 다른 수단으로 연락하기',
      '드론 띄우기',
    ])
  })
})
