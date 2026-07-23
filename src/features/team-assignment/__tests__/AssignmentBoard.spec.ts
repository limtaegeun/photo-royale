import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Gender } from '@/features/auth'

// api/assignment은 firebase를 끌어오므로 통째로 모킹한다 — 컴포넌트·스토어 상호작용만 검증한다
const confirmAssignmentMock =
  vi.fn<(code: string, nextRound: number, gameMode: string, teams: unknown) => Promise<void>>()
vi.mock('../api/assignment', () => ({
  confirmAssignment: (code: string, nextRound: number, gameMode: string, teams: unknown) =>
    confirmAssignmentMock(code, nextRound, gameMode, teams),
}))

import AssignmentBoard from '../components/AssignmentBoard.vue'
import {
  useTeamAssignmentStore,
  REROLL_FEEDBACK_MS,
  type DraftMember,
} from '../stores/useTeamAssignmentStore'

/** 항등 셔플 rng — 배정 순서가 입력 순서와 같아지고, pickXTeams는 그룹별 마지막 후보를 고른다 */
const identityRandom = () => 0.999999

function member(id: string, name: string, gender: Gender | null): DraftMember {
  return { id, name, gender, sameGenderStreak: 0, previousPartnerIds: [] }
}

/** 남2 여2 — 항등 셔플이면 A[m1,f1](blue) · B[m2,f2](orange)로 편성된다 */
function mixedFour(): DraftMember[] {
  return [
    member('m1', '지후', 'male'),
    member('m2', '도윤', 'male'),
    member('f1', '하린', 'female'),
    member('f2', '오리', 'female'),
  ]
}

function mountBoard() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(AssignmentBoard, {
    props: { roomCode: 'AB2C' },
    global: { plugins: [pinia] },
  })
  return { wrapper, store: useTeamAssignmentStore() }
}

function findButton(wrapper: ReturnType<typeof mountBoard>['wrapper'], text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

describe('AssignmentBoard', () => {
  beforeEach(() => {
    confirmAssignmentMock.mockReset().mockResolvedValue(undefined)
  })

  // BaseBottomSheet는 포털(document.body)로 렌더되므로 케이스 간 잔여 DOM을 비운다
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('팀 카드에 완장과 그룹(영문) 표기를 렌더한다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    const teamA = wrapper.find('[data-team="A"]')
    const teamB = wrapper.find('[data-team="B"]')
    expect(teamA.exists()).toBe(true)
    expect(teamA.text()).toContain('팀A')
    expect(teamA.text()).toContain('BLUE A')
    expect(teamB.text()).toContain('ORANGE B')
    // 완장 그룹 색 텍스트(리터럴 맵)가 적용된다
    expect(teamA.find('.text-team-blue').exists()).toBe(true)
    expect(teamB.find('.text-team-orange').exists()).toBe(true)
  })

  it('1인 팀에는 목숨·포인트 2배(×2) 배지를 표시한다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft([member('solo', '혼자', 'male')], 1, 'normal', identityRandom)
    await flushPromises()

    expect(wrapper.text()).toContain('×2')
  })

  it('X 모듈이 켜진 팀 카드 헤더에 X 배지를 병기한다', async () => {
    const { wrapper, store } = mountBoard()
    store.setXModule(true, identityRandom)
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    // A·B 모두 서로 다른 그룹의 유일 후보라 둘 다 X로 선정된다
    const teamA = wrapper.find('[data-team="A"]')
    expect(teamA.text()).toContain('X')
  })

  it('칩을 선택한 뒤 팀 카드를 터치하면 해당 팀으로 이동한다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    await wrapper.find('[data-member="m1"]').trigger('click')
    expect(store.selectedMemberId).toBe('m1')

    await wrapper.find('[data-team="B"]').trigger('click')

    const teamA = store.draftTeams.find((team) => team.armband === 'A')!
    const teamB = store.draftTeams.find((team) => team.armband === 'B')!
    expect(teamA.members.map((m) => m.id)).toEqual(['f1'])
    expect(teamB.members.map((m) => m.id)).toEqual(['m2', 'f2', 'm1'])
    expect(store.selectedMemberId).toBeNull()
  })

  it('미배정 대기자 섹션을 표시하고, 선택 칩을 대기열로 보낸다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    store.addToWaitingPool(member('w1', '대기자', 'male'))
    await flushPromises()

    const pool = wrapper.find('[data-waiting-pool]')
    expect(pool.exists()).toBe(true)
    expect(pool.text()).toContain('미배정 대기자 1명')

    // 팀 멤버를 선택해 대기열로 이동
    await wrapper.find('[data-member="m1"]').trigger('click')
    await wrapper.find('[data-waiting-pool]').trigger('click')

    expect(store.waitingPool.map((m) => m.id)).toEqual(['w1', 'm1'])
  })

  it('대기자가 없으면 미배정 대기자 섹션을 숨긴다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    expect(wrapper.find('[data-waiting-pool]').exists()).toBe(false)
  })

  it('배정 확정 버튼은 편성 전 비활성화되고, 성공 시 confirmed를 emit한다', async () => {
    const { wrapper, store } = mountBoard()

    // 빈 보드 → 확정 불가
    expect(findButton(wrapper, '배정 확정')!.attributes('disabled')).toBeDefined()

    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()
    expect(findButton(wrapper, '배정 확정')!.attributes('disabled')).toBeUndefined()

    await findButton(wrapper, '배정 확정')!.trigger('click')
    await flushPromises()

    expect(confirmAssignmentMock).toHaveBeenCalledTimes(1)
    expect(confirmAssignmentMock.mock.calls[0]![0]).toBe('AB2C')
    expect(confirmAssignmentMock.mock.calls[0]![1]).toBe(1)
    expect(wrapper.emitted('confirmed')).toHaveLength(1)
  })

  it('확정 실패 시 안내를 role=alert로 노출하고 confirmed를 emit하지 않는다', async () => {
    confirmAssignmentMock.mockRejectedValueOnce(new Error('permission denied'))
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    await findButton(wrapper, '배정 확정')!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('confirmed')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('랜덤 재배정 버튼은 스토어 reroll을 호출한다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()
    const rerollSpy = vi.spyOn(store, 'reroll')

    await findButton(wrapper, '랜덤 재배정')!.trigger('click')

    expect(rerollSpy).toHaveBeenCalledTimes(1)
  })

  it('재배정 중(isRerolling)에는 랜덤 재배정 버튼이 loading 상태로 바뀐다', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper, store } = mountBoard()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      await flushPromises()

      const rerollButton = findButton(wrapper, '랜덤 재배정')!
      expect(rerollButton.attributes('aria-busy')).toBeUndefined()

      await rerollButton.trigger('click')
      await flushPromises()

      // isRerolling이 true인 동안 BaseButton의 loading prop이 반영된다
      expect(wrapper.find('[data-loading="true"]').exists()).toBe(true)

      await vi.advanceTimersByTimeAsync(REROLL_FEEDBACK_MS)
      await flushPromises()

      expect(wrapper.find('[data-loading="true"]').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('게임 모드 행은 현재 모드를 보여준다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    // 기본 모드(일반전) 표기
    expect(wrapper.text()).toContain('게임 모드')
    expect(wrapper.text()).toContain('일반전')
  })

  it('미구현 모드는 선택 시트에서 비활성화되고, "준비 중" 배지가 붙으며, 클릭해도 스토어가 바뀌지 않는다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    // '변경'을 눌러 시트를 연다 — 콘텐츠는 포털(document.body)로 렌더된다
    await findButton(wrapper, '변경')!.trigger('click')
    await flushPromises()

    // 게임플레이가 구현된 일반전만 활성 — 나머지 7종은 disabled + '준비 중' 배지
    const normalOption = document.body.querySelector<HTMLButtonElement>('[data-mode="normal"]')
    const tailChaseOption =
      document.body.querySelector<HTMLButtonElement>('[data-mode="tail-chase"]')
    expect(normalOption).not.toBeNull()
    expect(tailChaseOption).not.toBeNull()
    expect(normalOption!.disabled).toBe(false)
    expect(tailChaseOption!.disabled).toBe(true)
    expect(tailChaseOption!.getAttribute('aria-disabled')).toBe('true')
    expect(tailChaseOption!.textContent).toContain('준비 중')
    expect(normalOption!.textContent).not.toContain('준비 중')

    // 비활성 옵션은 클릭해도(native disabled라 클릭 이벤트가 발생하지 않음) 스토어가 그대로다
    tailChaseOption!.click()
    await flushPromises()
    expect(store.draftGameMode).toBe('normal')
  })

  it('팀 추가 버튼은 사용 중이지 않은 완장으로 빈 팀을 추가한다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom) // A·B 사용 중
    await flushPromises()

    await findButton(wrapper, '+ 팀 추가')!.trigger('click')

    expect(store.draftTeams.map((team) => team.armband)).toEqual(['A', 'B', 'C'])
  })
})
