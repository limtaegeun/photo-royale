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

// jsdom에선 실제 포인터 드래그를 재현할 수 없으므로 Sortable.create를 모킹해, 어떤 컨테이너에
// 어떤 옵션으로 붙었는지와 onEnd 콜백 배선만 검증한다(실드래그는 별도 실기기 QA).
vi.mock('sortablejs', () => ({
  default: {
    create: vi.fn<(...args: unknown[]) => { destroy: () => void }>(() => ({
      destroy: vi.fn<() => void>(),
    })),
  },
}))

import Sortable from 'sortablejs'
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
    vi.mocked(Sortable.create).mockClear().mockReturnValue({ destroy: vi.fn<() => void>() } as never)
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

  it('멤버 칩을 PlayerChip으로 렌더한다 — 성별에 따른 이름 색이 적용된다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    // 남성(m1)은 파랑, 여성(f1)은 빨강 이름 색 — PlayerChip이 렌더됐다는 증거
    const male = wrapper.find('[data-member="m1"]')
    const female = wrapper.find('[data-member="f1"]')
    expect(male.find('.text-gender-male').exists()).toBe(true)
    expect(female.find('.text-gender-female').exists()).toBe(true)
    // 보드 맥락에선 레디 상태 점·라벨이 없다(isReady 미전달)
    expect(male.find('.bg-success-solid').exists()).toBe(false)
    expect(male.find('.bg-warning-solid').exists()).toBe(false)
  })

  it('멤버 칩을 선택하면 래퍼 버튼에 선택 ring을 적용한다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    const m1 = wrapper.find('[data-member="m1"]')
    expect(m1.classes()).not.toContain('ring-accent')

    await m1.trigger('click')

    const selected = wrapper.find('[data-member="m1"]')
    expect(selected.classes()).toContain('ring-accent')
    expect(selected.attributes('data-selected')).toBe('true')
  })

  it('이동 힌트 영역은 선택 여부와 무관하게 항상 존재하고, 내용만 전환된다(레이아웃 시프트 방지)', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    // 비선택 상태에도 힌트 영역 자체는 렌더돼 있어야 한다(v-if로 사라지지 않음)
    const hint = wrapper.find('[role="status"]')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toBe('칩을 길게 눌러 끌면 이동할 수 있어요')

    await wrapper.find('[data-member="m1"]').trigger('click')

    const selectedHint = wrapper.find('[role="status"]')
    expect(selectedHint.exists()).toBe(true)
    expect(selectedHint.text()).toBe('이동할 팀 카드를 터치하세요')
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

  it('특수 완장 X 컨트롤은 스위치(role=switch)이며, 토글하면 스토어 xModuleEnabled가 켜진다', async () => {
    const { wrapper, store } = mountBoard()
    store.startDraft(mixedFour(), 1, 'normal', identityRandom)
    await flushPromises()

    const toggle = wrapper.get('[role="switch"]')
    expect(toggle.attributes('aria-checked')).toBe('false')
    expect(store.xModuleEnabled).toBe(false)

    // 스위치를 켜면 v-model(computed) → store.setXModule로 boolean이 그대로 전달된다
    await toggle.trigger('click')

    expect(store.xModuleEnabled).toBe(true)
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
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

  describe('드래그 앤 드롭(sortablejs)', () => {
    /** onEnd 수동 호출용 evt — jsdom 실제 엘리먼트를 담아 되돌리기·이동 배선을 검증한다 */
    function dragEvent(
      item: Element,
      from: Element,
      to: Element,
      oldIndex = 0,
    ): Sortable.SortableEvent {
      return { item, from, to, oldIndex } as unknown as Sortable.SortableEvent
    }

    it('각 팀 칩 컨테이너에 group/draggable 옵션으로 Sortable을 붙인다', async () => {
      const { store } = mountBoard()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      await flushPromises()

      const createMock = vi.mocked(Sortable.create)
      // 재초기화가 결정적으로 1회 일어나도록, 안정된 뒤 mock을 비우고 구조 변경(팀 추가)을 준다
      createMock.mockClear()
      store.addTeam() // A|B → A|B|C
      await flushPromises()

      // 팀 A·B·C 컨테이너 3개(대기자 없음)에 붙는다
      expect(createMock).toHaveBeenCalledTimes(3)
      for (const call of createMock.mock.calls) {
        expect(call[1]!.group).toBe('assignment-members')
        expect(call[1]!.draggable).toBe('[data-member]')
        expect(call[1]!.delay).toBe(150)
        expect(call[1]!.delayOnTouchOnly).toBe(true)
      }
    })

    it('미배정 대기자 컨테이너도 드롭 대상으로 포함한다', async () => {
      const { store } = mountBoard()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      await flushPromises()

      const createMock = vi.mocked(Sortable.create)
      createMock.mockClear()
      store.addToWaitingPool(member('w1', '대기자', 'male')) // 대기자 등장 → 재초기화
      await flushPromises()

      const targets = createMock.mock.calls.map((call) =>
        (call[0] as HTMLElement).getAttribute('data-drop-target'),
      )
      expect(targets).toEqual(expect.arrayContaining(['A', 'B', 'waiting']))
    })

    it('onEnd cross-container 드롭: revert 없이 store.moveMember를 대상 완장으로 호출한다', async () => {
      const { wrapper, store } = mountBoard()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      store.addToWaitingPool(member('w1', '대기자', 'male'))
      await flushPromises()

      // 실제 이동은 스토어 스펙에서 검증하므로 여기선 배선만 본다 — moveMember를 막아 DOM을 고정
      const moveSpy = vi.spyOn(store, 'moveMember').mockImplementation(() => {})
      const onEnd = vi.mocked(Sortable.create).mock.calls[0]![1]!.onEnd!

      const teamA = wrapper.find('[data-drop-target="A"]').element
      const teamB = wrapper.find('[data-drop-target="B"]').element
      const waiting = wrapper.find('[data-drop-target="waiting"]').element
      const m1 = wrapper.find('[data-member="m1"]').element

      // 팀 A → 팀 B: Sortable이 m1을 B로 옮겨 놓은 상태를 흉내낸다
      teamB.appendChild(m1)
      onEnd(dragEvent(m1, teamA, teamB))
      expect(moveSpy).toHaveBeenLastCalledWith('m1', 'B')
      // revert하지 않으므로 m1은 B에 그대로 남는다(membership key 재마운트가 최종 화면을 만든다)
      expect(teamB.contains(m1)).toBe(true)
      expect(teamA.contains(m1)).toBe(false)

      // 팀 → 대기열('waiting' → null)
      onEnd(dragEvent(m1, teamA, waiting))
      expect(moveSpy).toHaveBeenLastCalledWith('m1', null)
    })

    it('같은 컨테이너 내 재정렬(onEnd from===to)은 moveMember 없이 DOM을 원위치로 되돌린다', async () => {
      const { wrapper, store } = mountBoard()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom) // A[m1,f1]
      await flushPromises()

      const moveSpy = vi.spyOn(store, 'moveMember').mockImplementation(() => {})
      const onEnd = vi.mocked(Sortable.create).mock.calls[0]![1]!.onEnd!
      const teamA = wrapper.find('[data-drop-target="A"]').element
      const m1 = wrapper.find('[data-member="m1"]').element

      // Sortable이 m1을 컨테이너 끝으로 재정렬해 놓은 상태를 흉내낸다(oldIndex=0에서 출발)
      teamA.appendChild(m1)
      onEnd(dragEvent(m1, teamA, teamA, 0))

      expect(moveSpy).not.toHaveBeenCalled()
      // 상태 변화가 없으므로 oldIndex(0) 위치로 되돌린다
      expect(teamA.children[0]).toBe(m1)
    })

    it('onStart는 탭 선택을 해제하지 않는다(드래그 도중 힌트 배너가 사라져 레이아웃이 시프트하는 것을 방지)', async () => {
      const { store } = mountBoard()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      await flushPromises()

      store.selectMember('m1')
      expect(store.selectedMemberId).toBe('m1')

      // onStart 옵션 자체가 배선돼 있지 않아야 한다 — 선택 해제는 onEnd(handleDragEnd)의 몫이다
      expect(vi.mocked(Sortable.create).mock.calls[0]![1]!.onStart).toBeUndefined()
      expect(store.selectedMemberId).toBe('m1')
    })

    it('onEnd(handleDragEnd)는 처리 종류와 무관하게 항상 탭 선택을 해제한다', async () => {
      const { wrapper, store } = mountBoard()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom)
      await flushPromises()

      vi.spyOn(store, 'moveMember').mockImplementation(() => {})
      const onEnd = vi.mocked(Sortable.create).mock.calls[0]![1]!.onEnd!
      const teamA = wrapper.find('[data-drop-target="A"]').element
      const m1 = wrapper.find('[data-member="m1"]').element

      // cross-container 드롭이어도
      store.selectMember('m1')
      teamA.appendChild(m1)
      onEnd(dragEvent(m1, teamA, teamA, 0))
      expect(store.selectedMemberId).toBeNull()

      // 같은 컨테이너 내 되돌리기 케이스여도 선택은 해제된다
      store.selectMember('f1')
      onEnd(dragEvent(m1, teamA, teamA, 0))
      expect(store.selectedMemberId).toBeNull()
    })

    it('×2 배지·"비어 있음"은 드롭 컨테이너 밖에 렌더된다(컨테이너 자식은 칩 버튼뿐)', async () => {
      const { wrapper, store } = mountBoard()
      store.startDraft([member('solo', '혼자', 'male')], 1, 'normal', identityRandom) // A[solo]
      store.addTeam() // B 빈 팀
      await flushPromises()

      // 1인 팀 A: 드롭 컨테이너 자식은 칩 버튼 1개뿐, ×2는 컨테이너 밖(카드 안)
      const dropA = wrapper.find('[data-drop-target="A"]')
      const childrenA = Array.from(dropA.element.children)
      expect(childrenA).toHaveLength(1)
      expect(childrenA.every((el) => el.hasAttribute('data-member'))).toBe(true)
      expect(dropA.text()).not.toContain('×2')
      expect(wrapper.find('[data-team="A"]').text()).toContain('×2')

      // 빈 팀 B: 드롭 컨테이너 자식 0개, "비어 있음"은 컨테이너 밖
      const dropB = wrapper.find('[data-drop-target="B"]')
      expect(dropB.element.children).toHaveLength(0)
      expect(dropB.text()).not.toContain('비어 있음')
      expect(wrapper.find('[data-team="B"]').text()).toContain('비어 있음')
    })

    it('멤버 이동 시 드롭 컨테이너가 재마운트되어 유령 없이 자식 수가 정합한다', async () => {
      const { wrapper, store } = mountBoard()
      store.startDraft(mixedFour(), 1, 'normal', identityRandom) // A[m1,f1] B[m2,f2]
      await flushPromises()
      expect(wrapper.find('[data-drop-target="A"]').element.children).toHaveLength(2)

      // m1을 A→B로 이동 → A는 1인, B는 3인. 재마운트로 옛 노드가 유령으로 남지 않아야 한다
      store.moveMember('m1', 'B')
      await flushPromises()

      const dropA = wrapper.find('[data-drop-target="A"]')
      const dropB = wrapper.find('[data-drop-target="B"]')
      expect(dropA.element.children).toHaveLength(1)
      expect(dropB.element.children).toHaveLength(3)
      expect(dropA.find('[data-member="m1"]').exists()).toBe(false)
      expect(dropB.find('[data-member="m1"]').exists()).toBe(true)
    })
  })
})
