import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export type CameraStreamStatus =
  | 'idle' // 아직 시작 안 함 (놓은 뒤 포함)
  | 'requesting' // 권한 요청/스트림 여는 중
  | 'active' // 스트림 재생 가능
  | 'denied' // 사용자가 권한 거부
  | 'unavailable' // 카메라 하드웨어 없음 또는 API 미지원
  | 'error' // 그 외 실패 (예: 다른 앱이 카메라 점유)

/**
 * 콕핏 화질 — 제약이 없으면 iOS Safari 등이 기본 저해상도(640×480)를 줘서 뷰파인더·킬샷이 모두 흐려진다.
 * ideal이라 미지원 기기에서도 실패 없이 가장 가까운 해상도로 폴백된다.
 */
const COCKPIT_VIDEO: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } }
/**
 * 쥐고 있던 트랙을 콕핏 화질로 되돌릴 때 — 프레임률을 적지 않으면 iOS 사파리가 낮춰 둔 프레임률을 그대로 둬서
 * 뷰파인더가 끊긴다(11/15 iOS 27.2 시뮬레이터 실측). 처음 요청은 기기 기본값을 받으므로 되돌릴 때만 적는다.
 */
const COCKPIT_RESTORE_VIDEO: MediaTrackConstraints = { ...COCKPIT_VIDEO, frameRate: { ideal: 30 } }
/**
 * 콕핏 밖(대기실)에서 쥐고만 있을 때 — 화면에 그리지 않으니 기기가 허용하는 가장 낮은 해상도·프레임률로 내린다.
 * ideal 이라 기기가 못 맞추면 가장 가까운 값으로 내려간다(실패하지 않는다).
 */
const PARKED_VIDEO: MediaTrackConstraints = {
  width: { ideal: 320 },
  height: { ideal: 240 },
  frameRate: { ideal: 1 },
}
/** 콕핏 밖에서 카메라를 쥐고 있는 최대 시간 — 지나면 놓는다(다음 진입은 권한을 다시 물을 수 있다) */
export const CAMERA_PARK_LIMIT_MS = 30 * 60 * 1000

function isLive(media: MediaStream) {
  return media.getVideoTracks().some((track) => track.readyState !== 'ended')
}

/**
 * 쥐고만 있는 동안은 트랙을 꺼서(enabled=false) 프레임을 내보내지 않는다. 스트림은 끝나지 않아서 iOS 가 권한을
 * 다시 묻지 않는다(11/15 iOS 27.2 시뮬레이터 실측: 75초·11분·홈 4분 뒤 재진입 모두 권한 창 없음).
 */
function setVideoEnabled(media: MediaStream, enabled: boolean) {
  media.getVideoTracks().forEach((track) => {
    track.enabled = enabled
  })
}

function applyVideo(media: MediaStream, constraints: MediaTrackConstraints) {
  // 화질 조정은 최선 노력이다 — 실패해도 스트림은 그대로 쓸 수 있다
  return media
    .getVideoTracks()[0]
    ?.applyConstraints?.(constraints)
    .catch(() => {})
}

/**
 * 후면 카메라 스트림을 방 단위로 쥐고 있는 스토어.
 *
 * 콕핏을 나갈 때 트랙을 끄면 다음 라운드 진입에서 권한 창이 다시 뜬다. iOS WebKit은 카메라를 끈 지
 * 1분이 지나면 탭 없는 getUserMedia를 다시 묻고(대기실 → 콕핏 전환은 방 스냅샷이 일으켜 탭이 없다),
 * 10분이 지나면 탭이 있어도 다시 묻는다. 그래서 콕핏을 나가도 같은 방에 있는 동안은 끄지 않고
 * 최저 화질로 낮추고 트랙을 꺼 둔 채(enabled=false) 쥐고 있다가, 다음 진입에서 그대로 다시 쓴다.
 *
 * - 놓는 때: 방을 벗어날 때(`releaseCameraOutsideRoom`), 콕핏 밖에서 30분이 지날 때
 * - 트랙이 외부 요인(OS 회수 등)으로 끝나면 버리고, 콕핏 안이면 error로 재시도 UI를 띄운다
 */
export const useCameraStreamStore = defineStore('cameraStream', () => {
  const status = ref<CameraStreamStatus>('idle')
  const stream = shallowRef<MediaStream | null>(null)
  /** 스트림을 연 방 — 다른 방·방 밖으로 가면 놓는다 */
  const roomCode = ref<string | null>(null)

  /** 콕핏이 지금 스트림을 쓰고 있는가 — 권한 응답 전에 콕핏이 닫히면 도착한 스트림을 바로 낮춘다 */
  let inCockpit = false
  let parkTimer: ReturnType<typeof setTimeout> | null = null
  /** 놓을 때마다 올린다 — 놓은 뒤 늦게 도착한 스트림을 알아보고 끈다 */
  let generation = 0

  function clearParkTimer() {
    if (parkTimer === null) return
    clearTimeout(parkTimer)
    parkTimer = null
  }

  function holdOutsideCockpit(media: MediaStream) {
    void applyVideo(media, PARKED_VIDEO)
    setVideoEnabled(media, false)
    clearParkTimer()
    parkTimer = setTimeout(release, CAMERA_PARK_LIMIT_MS)
  }

  /** 콕핏 진입 — 같은 방에서 쥐고 있던 스트림이 살아 있으면 권한 요청 없이 콕핏 화질로 되돌려 쓴다 */
  async function acquire(room: string) {
    inCockpit = true
    clearParkTimer()

    const current = stream.value
    if (current !== null && roomCode.value === room && isLive(current)) {
      status.value = 'active'
      setVideoEnabled(current, true)
      await applyVideo(current, COCKPIT_RESTORE_VIDEO)
      return
    }
    if (status.value === 'requesting' && roomCode.value === room) return
    if (current !== null || roomCode.value !== null) release()

    if (!navigator.mediaDevices?.getUserMedia) {
      status.value = 'unavailable'
      return
    }

    roomCode.value = room
    status.value = 'requesting'
    const requestGeneration = generation
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', ...COCKPIT_VIDEO },
        audio: false,
      })

      // 권한 응답을 기다리는 사이 방을 벗어났으면 즉시 끈다
      if (requestGeneration !== generation) {
        media.getTracks().forEach((track) => track.stop())
        return
      }

      // OS 회수·다른 앱 점유 등 외부 요인으로 트랙이 끝나면 버린다
      // (track.stop()으로 직접 정지한 경우엔 ended가 발생하지 않는다)
      media.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (stream.value !== media) return
        const wasInCockpit = inCockpit
        release()
        if (wasInCockpit) status.value = 'error'
      })

      stream.value = media
      status.value = 'active'
      if (!inCockpit) holdOutsideCockpit(media)
    } catch (cause) {
      if (requestGeneration !== generation) return
      roomCode.value = null
      const name = cause instanceof DOMException ? cause.name : ''

      if (name === 'NotAllowedError' || name === 'SecurityError') {
        status.value = 'denied'
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        status.value = 'unavailable'
      } else {
        status.value = 'error'
      }
    }
  }

  /** 콕핏 이탈 — 같은 방에 남는 동안 끄지 않고 저화질로 쥐고 있는다 */
  function park() {
    inCockpit = false
    if (stream.value !== null) holdOutsideCockpit(stream.value)
  }

  /** 카메라를 완전히 끈다 */
  function release() {
    generation += 1
    inCockpit = false
    clearParkTimer()
    stream.value?.getTracks().forEach((track) => track.stop())
    stream.value = null
    roomCode.value = null
    status.value = 'idle'
  }

  return { status, stream, roomCode, acquire, park, release }
})
