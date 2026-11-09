import { describe, it, expect, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import EliminationNoticeDialog from '../components/EliminationNoticeDialog.vue'
import type { EliminationNotice } from '../eliminationNotice'

function notice(overrides: Partial<EliminationNotice> = {}): EliminationNotice {
  return {
    submissionId: 'h1',
    kind: 'out',
    attackerTeam: 'E',
    photo: 'data:image/jpeg;base64,hit',
    judgedAtMs: new Date(2026, 10, 8, 14, 32).getTime(),
    isTripleKill: false,
    livesLeft: 0,
    ...overrides,
  }
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function mountDialog(value: EliminationNotice | null) {
  // 다이얼로그는 body로 포털되므로 attachTo로 붙이고 document에서 읽는다
  wrapper = mount(EliminationNoticeDialog, { props: { notice: value }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

function dialogText() {
  return document.querySelector('[role="dialog"]')?.textContent ?? ''
}

describe('EliminationNoticeDialog (P22)', () => {
  it('안내가 없으면 열리지 않는다', async () => {
    await mountDialog(null)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('탈락 — 잡은 팀·판정 시각·판정 사진·할 일을 보인다', async () => {
    await mountDialog(notice())

    expect(dialogText()).toContain('우리 팀이 탈락했어요')
    expect(dialogText()).toContain('14:32에 팀 E의 킬샷으로 판정됐어요.')
    expect(dialogText()).toContain('진행자 안내에 따라 베이스캠프로 이동해 주세요.')
    const photo = document.querySelector<HTMLImageElement>('[role="dialog"] img')!
    expect(photo.getAttribute('src')).toBe('data:image/jpeg;base64,hit')
    expect(photo.getAttribute('alt')).toBe('우리 팀이 찍힌 판정 사진')
    expect(dialogText()).not.toContain('3배')
  })

  it('판정 시각을 아직 모르면 시각 없이 잡은 팀만 적는다', async () => {
    await mountDialog(notice({ judgedAtMs: null }))
    expect(dialogText()).toContain('팀 E의 킬샷으로 판정됐어요.')
    expect(dialogText()).not.toContain('에 팀 E')
  })

  it('낙오 포착 3배면 그 이유를 한 줄 더한다', async () => {
    await mountDialog(notice({ isTripleKill: true }))
    expect(dialogText()).toContain('팀원과 떨어진 채 찍혀 상대 팀이 3배 점수를 받았어요.')
  })

  it('1인 팀 첫 피격 — 탈락이 아니라 남은 목숨을 알린다', async () => {
    await mountDialog(notice({ kind: 'hit', livesLeft: 1 }))
    expect(dialogText()).toContain('한 번 찍혔어요')
    expect(dialogText()).toContain('목숨 1개 남음')
    expect(dialogText()).toContain('한 번 더 찍히면 탈락해요.')
    expect(dialogText()).not.toContain('베이스캠프')
  })

  it('확인을 누르면 acknowledge를 알린다', async () => {
    const mounted = await mountDialog(notice())
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (button) => button.textContent?.trim() === '확인',
    )!
    confirm.click()
    await flushPromises()
    expect(mounted.emitted('acknowledge')).toHaveLength(1)
  })

  it('닫기 버튼으로 닫아도 확인한 것으로 본다', async () => {
    const mounted = await mountDialog(notice())
    document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="닫기"]')!.click()
    await flushPromises()
    expect(mounted.emitted('acknowledge')).toHaveLength(1)
  })
})
