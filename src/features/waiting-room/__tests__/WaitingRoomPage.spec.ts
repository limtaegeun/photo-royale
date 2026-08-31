import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useTeamAssignmentStore } from '@/features/team-assignment'
import type { Participant, RoomInfo } from '../api/rooms'

/**
 * 로그인 사용자 — 화면이 세션 상실(로그아웃·만료)에 반응하는지 보려면 반응형이어야 한다.
 * 기존 테스트가 쓰는 `authState.user = …` 대입을 그대로 유지하려고 getter/setter로 감쌌다.
 */
const authUser = ref<{ uid: string; displayName: string } | null>(null)
const authState = {
  get user() {
    return authUser.value
  },
  set user(next: { uid: string; displayName: string } | null) {
    authUser.value = next
  },
}
const fetchMyGenderMock = vi.fn<(uid: string) => Promise<'male' | 'female' | null>>()
vi.mock('@/features/auth', () => ({
  useAuthStore: () => ({
    get user() {
      return authState.user
    },
  }),
  fetchMyGender: (uid: string) => fetchMyGenderMock(uid),
}))

const getRoomMock = vi.fn<(code: string) => Promise<RoomInfo | null>>()
const joinRoomMock =
  vi.fn<(code: string, member: { uid: string; nickname: string }) => Promise<void>>()
const setReadyMock = vi.fn<(code: string, uid: string) => Promise<void>>()
const startGameMock = vi.fn<(code: string) => Promise<void>>()
const unsubscribeParticipantsMock = vi.fn<() => void>()
const unsubscribeRoomMock = vi.fn<() => void>()
const subscribeParticipantsMock =
  vi.fn<(code: string, onChange: (participants: Participant[]) => void) => () => void>()
const subscribeRoomMock =
  vi.fn<(code: string, onChange: (room: RoomInfo | null) => void) => () => void>()

vi.mock('../api/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/rooms')>()
  return {
    normalizeRoomCode: actual.normalizeRoomCode,
    RoomNotFoundError: actual.RoomNotFoundError,
    // 이번 라운드 배정 판정은 순수 함수라 실제 구현을 그대로 쓴다(명단·배정 카드의 단일 기준)
    isAssignedInRound: actual.isAssignedInRound,
    getRoom: (code: string) => getRoomMock(code),
    joinRoom: (code: string, member: { uid: string; nickname: string }) =>
      joinRoomMock(code, member),
    setReady: (code: string, uid: string) => setReadyMock(code, uid),
    startGame: (code: string) => startGameMock(code),
    subscribeToParticipants: (code: string, onChange: (participants: Participant[]) => void) =>
      subscribeParticipantsMock(code, onChange),
    subscribeToRoom: (code: string, onChange: (room: RoomInfo | null) => void) =>
      subscribeRoomMock(code, onChange),
  }
})

const toastMock = vi.fn<(options: { title: string; tone?: string }) => number>()
const dismissAllMock = vi.fn<() => void>()
vi.mock('@/shared/composables/useToast', () => ({
  useToast: () => ({ toast: toastMock, dismissAll: dismissAllMock }),
}))

const replaceMock = vi.fn<() => void>()
const pushMock = vi.fn<() => void>()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { roomCode: 'ab2c' }, fullPath: '/waiting-room/ab2c' }),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}))

import { RoomNotFoundError } from '../api/rooms'
import WaitingRoomPage from '../WaitingRoomPage.vue'
import { markRoundPlayed } from '../roundPlayMarker'
import PlayerChip from '@/shared/components/PlayerChip.vue'
import { useAppHeader } from '@/shared/composables/useAppHeader'

/** 구독 콜백들을 붙잡아 테스트가 스냅샷 도착을 흉내 낼 수 있게 한다 */
function captureSnapshotCallbacks() {
  let deliverParticipants: (participants: Participant[]) => void = () => {}
  let deliverRoom: (room: RoomInfo | null) => void = () => {}
  subscribeParticipantsMock.mockImplementation((_code, onChange) => {
    deliverParticipants = onChange
    return unsubscribeParticipantsMock
  })
  subscribeRoomMock.mockImplementation((_code, onChange) => {
    deliverRoom = onChange
    return unsubscribeRoomMock
  })
  return {
    participants: (participants: Participant[]) => deliverParticipants(participants),
    room: (room: RoomInfo | null) => deliverRoom(room),
  }
}

/**
 * 마운트한 화면은 afterEach에서 언마운트한다 — 게임 시작 재실행 확인 다이얼로그(BaseDialog)가
 * Teleport로 document.body에 렌더되므로, 언마운트하지 않으면 이전 테스트의 다이얼로그 DOM이
 * 다음 테스트의 document.body.textContent 검사에 그대로 남아 섞인다.
 */
const mounted: ReturnType<typeof mount>[] = []
function mountPage() {
  const wrapper = mount(WaitingRoomPage, {
    global: { plugins: [createPinia()] },
  })
  mounted.push(wrapper)
  return wrapper
}

function findButton(wrapper: ReturnType<typeof mountPage>, text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

const GUEST_ROOM: RoomInfo = {
  hostUid: 'host9',
  status: 'waiting',
  assignmentRound: 0,
  gameMode: 'normal',
  roundModes: {},
  round: null,
}
const MY_ROOM: RoomInfo = {
  hostUid: 'me',
  status: 'waiting',
  assignmentRound: 0,
  gameMode: 'normal',
  roundModes: {},
  round: null,
}

const ROSTER: Participant[] = [
  {
    id: 'me',
    name: '오리',
    team: null,
    assignedRound: 0,
    gender: 'male',
    isXTeam: false,
    sameGenderStreak: 0,
    previousPartnerIds: [],
    isReady: false,
  },
  {
    id: 'u2',
    name: '하린',
    team: 'D',
    assignedRound: 0,
    gender: 'female',
    isXTeam: false,
    sameGenderStreak: 0,
    previousPartnerIds: [],
    isReady: true,
  },
  {
    id: 'u3',
    name: '도윤',
    team: null,
    assignedRound: 0,
    gender: 'male',
    isXTeam: false,
    sameGenderStreak: 0,
    previousPartnerIds: [],
    isReady: true,
  },
]

describe('WaitingRoomPage', () => {
  beforeEach(() => {
    authState.user = { uid: 'me', displayName: '오리' }
    fetchMyGenderMock.mockReset().mockResolvedValue('male')
    getRoomMock.mockReset().mockResolvedValue(GUEST_ROOM)
    joinRoomMock.mockReset().mockResolvedValue(undefined)
    setReadyMock.mockReset().mockResolvedValue(undefined)
    startGameMock.mockReset().mockResolvedValue(undefined)
    subscribeParticipantsMock.mockReset().mockReturnValue(unsubscribeParticipantsMock)
    subscribeRoomMock.mockReset().mockReturnValue(unsubscribeRoomMock)
    unsubscribeParticipantsMock.mockReset()
    unsubscribeRoomMock.mockReset()
    replaceMock.mockReset()
    pushMock.mockReset()
    toastMock.mockReset()
    dismissAllMock.mockReset()
    // 앱 셸 헤더 오버라이드는 모듈 싱글턴이라 케이스 간 누수를 막기 위해 매번 비운다
    useAppHeader().clearHeader()
    // 라운드 재실행 마커는 세션 스토리지에 쌓이므로 케이스 간 누수를 막기 위해 매번 비운다
    sessionStorage.clear()
  })

  afterEach(() => {
    while (mounted.length > 0) mounted.pop()!.unmount()
  })

  it('라우트의 초대 코드를 정규화해 입장하고 룸 카드와 명단을 렌더한다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    expect(joinRoomMock).toHaveBeenCalledWith('AB2C', {
      uid: 'me',
      nickname: '오리',
      gender: 'male',
    })
    expect(wrapper.text()).toContain('ROOM AB2C')
    expect(wrapper.text()).toContain('대기 중')

    deliver.participants(ROSTER)
    await flushPromises()

    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(3)
    // 인원 수는 명단 헤더 한 곳에서만 노출한다(룸 카드의 중복 캡션 제거) — 용어도 '준비'로 통일
    expect(wrapper.text()).toContain('3명 입장 · 2명 준비')
    expect(wrapper.text()).not.toContain('참가자 3명')
  })

  /**
   * 배정 확정 전에는 room.gameMode가 기본값('일반전')으로 채워져 있어도 표시하지 않는다 —
   * 진행자가 고르지 않은 모드를 확정된 것처럼 알리는 것이기 때문이다.
   */
  it('배정 확정 전에는 룸 카드에 차수·모드를 표시하지 않는다', async () => {
    captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('ROOM AB2C')
    expect(wrapper.text()).not.toContain('차 라운드')
    expect(wrapper.text()).not.toContain('일반전')
  })

  /** '게임 시작'이 무슨 모드를 켜는지 대기실에서 확인할 수 있어야 한다(호스트·게스트 공통) */
  it('배정 확정 후에는 룸 카드에 차수와 게임 모드를 표시한다', async () => {
    getRoomMock.mockResolvedValue(MY_ROOM)
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    deliver.room({
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 3,
      gameMode: 'group',
      roundModes: {},
      round: null,
    })
    await flushPromises()

    expect(wrapper.text()).toContain('3차 라운드')
    expect(wrapper.text()).toContain('그룹전')
  })

  it('참가자가 없으면 명단 대신 초대 안내 문구를 보여준다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants([])
    await flushPromises()

    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(0)
    expect(wrapper.text()).toContain('아직 입장한 참가자가 없어요. 초대 링크를 공유해 보세요.')
  })

  it('초대 링크 복사 버튼은 ?code= 링크를 클립보드에 복사하고 토스트를 띄운다', async () => {
    const writeTextMock = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    })
    captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    await findButton(wrapper, '초대 링크 복사')!.trigger('click')
    await flushPromises()

    expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/?code=AB2C`)
    expect(toastMock).toHaveBeenCalledWith({ title: '초대 링크를 복사했어요.', tone: 'success' })
  })

  it('입장 처리가 끝나기 전에는 로딩 상태를 보여준다', async () => {
    getRoomMock.mockReturnValue(new Promise(() => {}))
    const wrapper = mountPage()

    expect(wrapper.text()).toContain('대기실에 입장하는 중')
    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(0)
  })

  it('방이 없으면 안내 문구와 입장 화면으로 버튼을 보여준다', async () => {
    getRoomMock.mockResolvedValue(null)
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('방을 찾을 수 없어요')

    await findButton(wrapper, '입장 화면으로')!.trigger('click')
    expect(replaceMock).toHaveBeenCalledWith({ name: 'entry' })
  })

  it('입장 도중 방이 사라진 레이스도 방 없음 안내로 수렴한다', async () => {
    joinRoomMock.mockRejectedValue(new RoomNotFoundError('사라진 방'))
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('방을 찾을 수 없어요')
  })

  it('게스트는 안전 수칙 동의 CTA를 보고 팀 배정 시작 버튼은 없다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants(ROSTER)
    await flushPromises()

    expect(findButton(wrapper, '확인하고 준비 완료')).toBeDefined()
    expect(findButton(wrapper, '팀 배정 시작')).toBeUndefined()
    expect(wrapper.text()).toContain('아래 확인 버튼을 누르면 안전 수칙과 개인 책임에 동의합니다.')
  })

  it('CTA 클릭 시 레디를 요청하고 스냅샷 갱신으로 버튼이 비활성화된다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants(ROSTER)
    await flushPromises()

    const cta = findButton(wrapper, '확인하고 준비 완료')!
    await cta.trigger('click')
    await flushPromises()

    expect(setReadyMock).toHaveBeenCalledExactlyOnceWith('AB2C', 'me')

    deliver.participants([{ ...ROSTER[0]!, isReady: true }, ...ROSTER.slice(1)])
    await flushPromises()

    expect(wrapper.text()).toContain('3명 입장 · 3명 준비')
    expect(cta.text()).toBe('준비 완료')
    expect(cta.attributes('disabled')).toBeDefined()
  })

  it('호스트(진행자)는 팀 배정 시작 버튼만 보고, 준비 CTA·동의 안내문·명단의 자신이 없다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const wrapper = mountPage()
    await flushPromises()
    // 진행자 모델 이전에 남은 호스트('me') 참가자 문서가 있어도 명단에서 걸러진다
    deliver.participants(ROSTER)
    await flushPromises()

    expect(joinRoomMock).not.toHaveBeenCalled()
    expect(findButton(wrapper, '팀 배정 시작')).toBeDefined()
    expect(findButton(wrapper, '확인하고 준비 완료')).toBeUndefined()
    expect(findButton(wrapper, '게임 시작')).toBeUndefined()
    expect(wrapper.text()).not.toContain('아래 확인 버튼을 누르면')
    expect(wrapper.findAllComponents(PlayerChip)).toHaveLength(2)
    expect(wrapper.text()).toContain('2명 입장 · 2명 준비')
    expect(wrapper.text()).not.toContain('오리')
  })

  /** 진행자가 인원을 세고 공지하는 동안 플레이어가 켜진 뷰파인더만 보게 두지 않는다 */
  it('게스트: playing 전이만으로는 카메라로 가지 않고 배정 카드에 머문다', async () => {
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    deliver.room({
      hostUid: 'host9',
      status: 'playing',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    })
    deliver.participants([{ ...ROSTER[0]!, team: 'A', assignedRound: 1, isReady: true }])
    await flushPromises()

    expect(replaceMock).not.toHaveBeenCalled()
    // 아직 시작도 안 한 라운드를 끝났다고 알리지 않는다 — 진행자가 인원을 세고 공지하는 구간이라
    // 종료 안내가 뜨면 게스트는 게임이 끝난 줄 안다(I-22)
    expect(wrapper.text()).not.toContain('라운드 종료')
    expect(wrapper.text()).not.toContain('진행자가 게임을 마칠 때까지')
    // 라운드 배정 카드가 그대로 보인다
    expect(wrapper.text()).toContain('완장')
  })

  it('게스트: 호스트가 라운드를 시작하면 그때 방 코드를 담아 카메라로 이동한다', async () => {
    const deliver = captureSnapshotCallbacks()
    mountPage()
    await flushPromises()

    const playing = {
      hostUid: 'host9',
      status: 'playing' as const,
      assignmentRound: 1,
      gameMode: 'normal' as const,
      roundModes: {},
      round: null,
    }
    deliver.room(playing)
    await flushPromises()
    expect(replaceMock).not.toHaveBeenCalled()

    deliver.room({
      ...playing,
      round: { status: 'running', startedAtMs: Date.now(), durationMs: 1_200_000, pausedRemainingMs: null },
    })
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({ name: 'camera', params: { roomCode: 'AB2C' } })
  })

  it('게스트: 타이머가 0에 닿은 라운드로는 콕핏으로 되밀어 내지 않는다(A-4)', async () => {
    // 호스트가 게임을 종료하기 전까지 round 필드는 남아 있다. '시작됐다'만 보면 콕핏에서
    // 나온 게스트가 즉시 되돌려 보내져 나갈 방법이 없어진다.
    const deliver = captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    deliver.room({
      hostUid: 'host9',
      status: 'playing',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: {
        status: 'running',
        startedAtMs: Date.now() - 1_200_000,
        durationMs: 1_200_000,
        pausedRemainingMs: null,
      },
    })
    deliver.participants([{ ...ROSTER[0]!, team: 'A', assignedRound: 1, isReady: true }])
    await flushPromises()

    expect(replaceMock).not.toHaveBeenCalledWith({ name: 'camera', params: { roomCode: 'AB2C' } })
    expect(wrapper.text()).toContain('라운드 종료')
    expect(wrapper.text()).toContain('다음 라운드가 시작되면 촬영 화면이 자동으로 열려요')
  })

  it('게스트: 진행자가 시간을 더하면 콕핏으로 자동 재진입한다', async () => {
    const deliver = captureSnapshotCallbacks()
    mountPage()
    await flushPromises()

    const startedAtMs = Date.now() - 1_200_000
    const expired = {
      hostUid: 'host9',
      status: 'playing' as const,
      assignmentRound: 1,
      gameMode: 'normal' as const,
      roundModes: {},
      round: { status: 'running' as const, startedAtMs, durationMs: 1_200_000, pausedRemainingMs: null },
    }
    deliver.room(expired)
    await flushPromises()
    expect(replaceMock).not.toHaveBeenCalledWith({ name: 'camera', params: { roomCode: 'AB2C' } })

    // 진행자가 +5분 — 총량이 늘면 남은 시간이 다시 생긴다
    deliver.room({
      ...expired,
      round: { ...expired.round, durationMs: 1_500_000 },
    })
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({ name: 'camera', params: { roomCode: 'AB2C' } })
  })

  /**
   * 세션이 끊기면 방·참가자 구독이 권한 오류로 죽는데 화면에는 마지막 스냅샷이 그대로 남는다.
   * 그대로 두면 참가자가 멀쩡해 보이는 화면에서 준비를 눌러도 아무 일이 일어나지 않고,
   * 진행자 명단에는 계속 미준비로 남아 양쪽 다 원인을 모른다(2026-08-31 실측).
   */
  it('머무는 동안 로그인이 사라지면 로그인 화면으로 보내고 목적지를 보존한다', async () => {
    const deliver = captureSnapshotCallbacks()
    mountPage()
    await flushPromises()
    deliver.room({ hostUid: 'host9', status: 'waiting', assignmentRound: 0, gameMode: 'normal', roundModes: {}, round: null })
    await flushPromises()
    replaceMock.mockClear()

    // 다른 기기·탭에서 로그아웃 → 이 화면의 세션도 함께 사라진다
    authState.user = null
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({
      name: 'login',
      query: { redirect: '/waiting-room/ab2c' },
    })
  })

  it('세션이 살아 있는 동안에는 로그인 화면으로 보내지 않는다', async () => {
    const deliver = captureSnapshotCallbacks()
    mountPage()
    await flushPromises()
    deliver.room({ hostUid: 'host9', status: 'waiting', assignmentRound: 0, gameMode: 'normal', roundModes: {}, round: null })
    deliver.participants([{ id: 'me', name: '나', gender: null, isReady: false, team: null, assignedRound: 0, isXTeam: false, sameGenderStreak: 0, previousPartnerIds: [] }])
    await flushPromises()

    expect(replaceMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'login' }),
    )
  })

  it('게스트: 올스탑(정지) 중에는 콕핏에 그대로 둔다', async () => {
    // 정지는 진행자가 곧 푸는 일시 상태라 남은 시간이 보존된다 — 대기실로 내보낼 이유가 없다
    const deliver = captureSnapshotCallbacks()
    mountPage()
    await flushPromises()

    deliver.room({
      hostUid: 'host9',
      status: 'playing',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: {
        status: 'paused',
        startedAtMs: Date.now() - 600_000,
        durationMs: 1_200_000,
        pausedRemainingMs: 600_000,
      },
    })
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({ name: 'camera', params: { roomCode: 'AB2C' } })
  })

  it('호스트(진행자): playing 전이 시 카메라가 아니라 라운드 운영 화면으로 replace 이동한다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    mountPage()
    await flushPromises()

    deliver.room({ hostUid: 'me', status: 'playing', assignmentRound: 1, gameMode: 'normal', roundModes: {}, round: null })
    await flushPromises()

    expect(replaceMock).toHaveBeenCalledWith({
      name: 'round-ops',
      params: { roomCode: 'AB2C' },
    })
    expect(replaceMock).not.toHaveBeenCalledWith({
      name: 'camera',
      params: { roomCode: 'AB2C' },
    })
  })

  it('화면을 떠나면 방·명단 구독을 해제한다', async () => {
    captureSnapshotCallbacks()
    const wrapper = mountPage()
    await flushPromises()

    wrapper.unmount()

    expect(unsubscribeParticipantsMock).toHaveBeenCalledTimes(1)
    expect(unsubscribeRoomMock).toHaveBeenCalledTimes(1)
  })

  it('호스트: 참가자가 없으면 팀 배정 시작이 토스트로 막힌다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants([])
    await flushPromises()

    await findButton(wrapper, '팀 배정 시작')!.trigger('click')

    expect(toastMock).toHaveBeenCalledWith({ title: '참가자가 없어요.', tone: 'danger' })
    expect(wrapper.text()).not.toContain('터치 배정 보드')
  })

  it('호스트: 준비가 덜 됐으면 팀 배정 시작이 토스트로 막힌다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants([
      { ...ROSTER[1]! }, // u2 ready
      { ...ROSTER[2]!, isReady: false }, // u3 not ready
    ])
    await flushPromises()

    await findButton(wrapper, '팀 배정 시작')!.trigger('click')

    expect(toastMock).toHaveBeenCalledWith({
      title: '모든 참가자가 준비를 완료해야 시작할 수 있어요.',
      tone: 'danger',
    })
    expect(wrapper.text()).not.toContain('팀 편성')
  })

  it('호스트: 전원 준비 완료면 팀 배정 시작이 배정 보드로 전환한다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants([{ ...ROSTER[1]! }, { ...ROSTER[2]! }]) // u2·u3 모두 ready
    await flushPromises()

    await findButton(wrapper, '팀 배정 시작')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('팀 편성')
    // 페이지 타이틀은 앱 셸 헤더가 담당한다 — 보드 전환 시 '배정 편집'으로 오버라이드된다
    expect(useAppHeader().title.value).toBe('배정 편집')
    expect(findButton(wrapper, '팀 배정 시작')).toBeUndefined()
  })

  it('호스트: 가드 실패로 토스트가 쌓인 뒤 전원 레디로 재클릭하면 보드 전환 시 토스트 큐가 비워진다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants([{ ...ROSTER[1]!, isReady: false }, { ...ROSTER[2]! }]) // u2 아직 준비 안 됨
    await flushPromises()

    // 1차 클릭 — 가드 실패로 에러 토스트가 쌓인다(dismissAll은 호출되지 않는다)
    await findButton(wrapper, '팀 배정 시작')!.trigger('click')
    expect(toastMock).toHaveBeenCalledWith({
      title: '모든 참가자가 준비를 완료해야 시작할 수 있어요.',
      tone: 'danger',
    })
    expect(dismissAllMock).not.toHaveBeenCalled()

    // 전원 레디로 스냅샷 갱신 후 재클릭 — 가드를 모두 통과해 보드로 전환된다
    deliver.participants([{ ...ROSTER[1]! }, { ...ROSTER[2]! }])
    await flushPromises()
    await findButton(wrapper, '팀 배정 시작')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('팀 편성')
    expect(dismissAllMock).toHaveBeenCalledTimes(1)
  })

  it('게스트: 배정 확정 후(assignmentRound>0·완장 있음) 라운드 배정 카드로 전환한다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue({
      hostUid: 'host9',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    })
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants([
      { ...ROSTER[0]!, team: 'A', assignedRound: 1, isReady: false }, // me, 완장 A
      { ...ROSTER[1]!, team: 'A', assignedRound: 1 }, // 같은 팀
      { ...ROSTER[2]!, team: 'B', assignedRound: 1 }, // 다른 팀
    ])
    await flushPromises()

    expect(wrapper.text()).toContain('이번 게임 규칙서')
    expect(wrapper.text()).toContain('오리(나)')
    expect(wrapper.text()).toContain('하린')
    expect(wrapper.text()).not.toContain('ROOM AB2C')
    // 카드는 자체 h1을 두지 않는다 — 페이지 타이틀('라운드 N 배정')은 앱 셸 헤더가 담당하므로
    // 페이지 본문에는 '대기실'도 '라운드 1 배정'도 직접 렌더되지 않고, 헤더 오버라이드로만 노출된다
    expect(wrapper.text()).not.toContain('대기실')
    expect(useAppHeader().title.value).toBe('라운드 1 배정')
    // 배정 카드 뷰의 준비 CTA — 아직 확정 전이라 행동 문구다(확정되면 '준비 완료'로 바뀐다)
    expect(findButton(wrapper, '라운드 준비 완료')).toBeDefined()
  })

  it('호스트: 보드 진입 후 room 스냅샷 라운드가 올라가도 드래프트 차수는 고정된다(QA N-02)', async () => {
    // 진입 시점 assignmentRound=2 → 이번 드래프트가 확정할 차수는 3으로 고정되어야 한다
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue({
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 2,
      gameMode: 'group',
      roundModes: {},
      round: null,
    })
    // mountPage 대신 명시적 pinia로 마운트해 같은 인스턴스의 팀 배정 스토어를 조회한다
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(WaitingRoomPage, { global: { plugins: [pinia] } })
    const taStore = useTeamAssignmentStore()
    await flushPromises()
    deliver.participants([{ ...ROSTER[1]! }, { ...ROSTER[2]! }]) // u2·u3 모두 ready
    await flushPromises()

    // 2차까지 확정된 방이라 배정 CTA는 다음 차수를 표기한다(주 액션은 '게임 시작')
    await findButton(wrapper, '3차 팀 배정')!.trigger('click')
    await flushPromises()
    expect(taStore.draftRound).toBe(3) // 진입 시점 2 + 1로 고정
    // 직전 확정 모드(room.gameMode)가 다음 드래프트 기본값으로 세팅된다
    expect(taStore.draftGameMode).toBe('group')

    // 다른 탭이 확정해 room 스냅샷의 assignmentRound가 올라가도(3) 드래프트 차수는 그대로 3
    deliver.room({ hostUid: 'me', status: 'waiting', assignmentRound: 3, gameMode: 'group', roundModes: {}, round: null })
    await flushPromises()
    expect(taStore.draftRound).toBe(3)
  })
  it('호스트: 배정 가능 인원(완장 25개 × 2인)을 넘으면 토스트로 막고 보드를 열지 않는다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM)
    const wrapper = mountPage()
    await flushPromises()
    // 51명 전원 레디 — 26팀이 되어 완장이 부족하다(가드가 없으면 완장 부여가 throw한다)
    deliver.participants(
      Array.from({ length: 51 }, (_, i) => ({
        ...ROSTER[2]!,
        id: `p${i}`,
        name: `이름${i}`,
        isReady: true,
      })),
    )
    await flushPromises()

    await findButton(wrapper, '팀 배정 시작')!.trigger('click')
    await flushPromises()

    expect(toastMock).toHaveBeenCalledWith({
      title: '배정 가능한 인원은 최대 50명이에요.',
      tone: 'danger',
    })
    expect(wrapper.text()).not.toContain('팀 편성')
  })

  it('호스트: 배정 확정 후 게임 시작 CTA가 노출되고 클릭하면 status를 playing으로 전이한다', async () => {
    const deliver = captureSnapshotCallbacks()
    const hostRound1: RoomInfo = {
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    }
    getRoomMock.mockResolvedValue(hostRound1)
    const wrapper = mountPage()
    await flushPromises()
    deliver.room(hostRound1)
    deliver.participants([{ ...ROSTER[1]!, team: 'A', assignedRound: 1 }])
    await flushPromises()

    // 확정 후에는 게임 시작이 주 액션이고, 배정은 다음 차수로 강등된다
    expect(findButton(wrapper, '2차 팀 배정')).toBeDefined()
    expect(findButton(wrapper, '게임 시작')!.attributes('disabled')).toBeUndefined()

    await findButton(wrapper, '게임 시작')!.trigger('click')
    await flushPromises()

    expect(startGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
  })

  it('호스트: 배정 이력이 남아 있어도 전원이 대기 상태면 게임 시작을 비활성화한다', async () => {
    const deliver = captureSnapshotCallbacks()
    const hostRound1: RoomInfo = {
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    }
    getRoomMock.mockResolvedValue(hostRound1)
    const wrapper = mountPage()
    await flushPromises()
    deliver.room(hostRound1)
    deliver.participants([{ ...ROSTER[1]!, team: 'A', assignedRound: 1, isReady: false }])
    await flushPromises()

    const startButton = findButton(wrapper, '게임 시작')!
    expect(startButton.attributes('disabled')).toBeDefined()
    await startButton.trigger('click')
    await flushPromises()

    expect(startGameMock).not.toHaveBeenCalled()
  })

  /**
   * 라운드 종료는 status만 waiting으로 되돌리고 assignmentRound·전원 레디는 보존한다 — 그대로
   * '게임 시작'을 다시 누르면 같은 차수가 재실행되어 직전 라운드의 미판정 킬샷이 판정 큐에
   * 부활한다. 세션 로컬 마커(roundPlayMarker)가 있을 때만 확인 다이얼로그로 막는다.
   */
  it('호스트: 이 차수를 이미 플레이한 마커가 있으면 게임 시작이 즉시 실행되지 않고 재실행 확인 다이얼로그가 뜬다', async () => {
    markRoundPlayed('AB2C', 1)
    const deliver = captureSnapshotCallbacks()
    const hostRound1: RoomInfo = {
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    }
    getRoomMock.mockResolvedValue(hostRound1)
    const wrapper = mountPage()
    await flushPromises()
    deliver.room(hostRound1)
    deliver.participants([{ ...ROSTER[1]!, team: 'A', assignedRound: 1 }])
    await flushPromises()

    await findButton(wrapper, '게임 시작')!.trigger('click')
    await flushPromises()

    // BaseDialog는 Teleport로 document.body에 렌더되어 wrapper.text()에 잡히지 않는다
    expect(document.body.textContent).toContain('이번 차수는 이미 진행했어요')
    expect(startGameMock).not.toHaveBeenCalled()
  })

  it('호스트: 재실행 확인 다이얼로그에서 "그대로 다시 시작"을 누르면 게임 시작이 호출된다', async () => {
    markRoundPlayed('AB2C', 1)
    const deliver = captureSnapshotCallbacks()
    const hostRound1: RoomInfo = {
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    }
    getRoomMock.mockResolvedValue(hostRound1)
    const wrapper = mountPage()
    await flushPromises()
    deliver.room(hostRound1)
    deliver.participants([{ ...ROSTER[1]!, team: 'A', assignedRound: 1 }])
    await flushPromises()

    await findButton(wrapper, '게임 시작')!.trigger('click')
    await flushPromises()
    // 다이얼로그 본문 버튼도 Teleport 대상(document.body)에서 찾아 네이티브로 클릭한다
    const restartButton = [...document.body.querySelectorAll<HTMLElement>('button')].find(
      (button) => button.textContent?.trim() === '그대로 다시 시작',
    )!
    restartButton.click()
    await flushPromises()

    expect(startGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
  })

  it('호스트: 재실행 확인 다이얼로그에서 "다음 팀 배정하기"를 누르면 배정 보드가 열린다', async () => {
    markRoundPlayed('AB2C', 1)
    const deliver = captureSnapshotCallbacks()
    const hostRound1: RoomInfo = {
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    }
    getRoomMock.mockResolvedValue(hostRound1)
    const wrapper = mountPage()
    await flushPromises()
    deliver.room(hostRound1)
    deliver.participants([{ ...ROSTER[1]!, team: 'A', assignedRound: 1 }])
    await flushPromises()

    await findButton(wrapper, '게임 시작')!.trigger('click')
    await flushPromises()
    // 다이얼로그 본문 버튼도 Teleport 대상(document.body)에서 찾아 네이티브로 클릭한다
    const nextAssignmentButton = [...document.body.querySelectorAll<HTMLElement>('button')].find(
      (button) => button.textContent?.trim() === '다음 팀 배정하기',
    )!
    nextAssignmentButton.click()
    await flushPromises()

    // 보드 전환은 일반 컴포넌트 트리라 wrapper.text()로 확인할 수 있다(Teleport 대상이 아니다)
    expect(wrapper.text()).toContain('팀 편성')
    expect(startGameMock).not.toHaveBeenCalled()
  })

  it('호스트: 이 차수를 플레이한 마커가 없으면 다이얼로그 없이 기존처럼 게임 시작이 즉시 호출된다', async () => {
    const deliver = captureSnapshotCallbacks()
    const hostRound1: RoomInfo = {
      hostUid: 'me',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    }
    getRoomMock.mockResolvedValue(hostRound1)
    const wrapper = mountPage()
    await flushPromises()
    deliver.room(hostRound1)
    deliver.participants([{ ...ROSTER[1]!, team: 'A', assignedRound: 1 }])
    await flushPromises()

    await findButton(wrapper, '게임 시작')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('이번 차수는 이미 진행했어요')
    expect(startGameMock).toHaveBeenCalledExactlyOnceWith('AB2C')
  })

  /** 라운드 종료 후 기록을 확인할 유일한 경로 — 최소 한 번 배정된 방에서 호스트에게만 보인다 */
  it('호스트: 배정 확정 전에는 "지난 라운드 기록 보기"가 보이지 않고, 확정 후에는 기록 탭 쿼리로 이동한다', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue(MY_ROOM) // assignmentRound: 0
    const wrapper = mountPage()
    await flushPromises()

    expect(findButton(wrapper, '지난 라운드 기록 보기')).toBeUndefined()

    deliver.room({ ...MY_ROOM, assignmentRound: 2 })
    await flushPromises()

    const recordButton = findButton(wrapper, '지난 라운드 기록 보기')
    expect(recordButton).toBeDefined()
    await recordButton!.trigger('click')

    expect(pushMock).toHaveBeenCalledWith({
      name: 'round-ops',
      params: { roomCode: 'AB2C' },
      query: { tab: 'log' },
    })
  })

  it('게스트: 배정이 확정돼도 "지난 라운드 기록 보기"는 보이지 않는다(호스트 전용)', async () => {
    const deliver = captureSnapshotCallbacks()
    getRoomMock.mockResolvedValue({
      hostUid: 'host9',
      status: 'waiting',
      assignmentRound: 1,
      gameMode: 'normal',
      roundModes: {},
      round: null,
    })
    const wrapper = mountPage()
    await flushPromises()
    deliver.participants(ROSTER)
    await flushPromises()

    expect(findButton(wrapper, '지난 라운드 기록 보기')).toBeUndefined()
  })
})
