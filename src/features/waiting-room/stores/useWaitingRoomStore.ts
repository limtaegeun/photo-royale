import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type ParticipantTeam = 'red' | 'blue' | 'green' | 'orange'

export interface Participant {
  id: string
  name: string
  team: ParticipantTeam
  isReady: boolean
}

/**
 * P02 대기실 상태 — 서버 연동 전까지 목 데이터로 동작한다.
 * myId는 이 클라이언트의 참가자(입장 직후라 아직 대기 상태)를 가리킨다.
 */
export const useWaitingRoomStore = defineStore('waitingRoom', () => {
  const roomCode = ref('7K2')
  const myId = ref('p18')

  const participants = ref<Participant[]>([
    { id: 'p01', name: '하린', team: 'red', isReady: true },
    { id: 'p02', name: '도윤', team: 'blue', isReady: true },
    { id: 'p03', name: '서연', team: 'red', isReady: true },
    { id: 'p04', name: '민우', team: 'blue', isReady: true },
    { id: 'p05', name: '지아', team: 'red', isReady: true },
    { id: 'p06', name: '태준', team: 'blue', isReady: true },
    { id: 'p07', name: '유나', team: 'red', isReady: true },
    { id: 'p08', name: '현우', team: 'blue', isReady: true },
    { id: 'p09', name: '가은', team: 'red', isReady: true },
    { id: 'p10', name: '준호', team: 'blue', isReady: true },
    { id: 'p11', name: '소라', team: 'red', isReady: true },
    { id: 'p12', name: '시온', team: 'blue', isReady: true },
    { id: 'p13', name: '나연', team: 'red', isReady: true },
    { id: 'p14', name: '재윤', team: 'blue', isReady: true },
    { id: 'p15', name: '로아', team: 'red', isReady: false },
    { id: 'p16', name: '건우', team: 'blue', isReady: false },
    { id: 'p17', name: '예린', team: 'red', isReady: false },
    { id: 'p18', name: '지후', team: 'blue', isReady: false },
  ])

  const participantCount = computed(() => participants.value.length)
  const readyCount = computed(() => participants.value.filter((p) => p.isReady).length)
  const isReadyConfirmed = computed(
    () => participants.value.find((p) => p.id === myId.value)?.isReady ?? false,
  )

  /** 안전 수칙 동의 + 내 준비 완료 처리 */
  function confirmReady() {
    const me = participants.value.find((p) => p.id === myId.value)
    if (me) {
      me.isReady = true
    }
  }

  return {
    roomCode,
    myId,
    participants,
    participantCount,
    readyCount,
    isReadyConfirmed,
    confirmReady,
  }
})
